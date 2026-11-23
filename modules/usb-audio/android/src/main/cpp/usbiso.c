// Lecture directe d'une carte son USB (classe audio 2) par usbfs, sans passer par
// le son d'Android. Android donne le descripteur de fichier (UsbDeviceConnection),
// le côté Kotlin réclame l'interface et choisit le réglage « alt 1 » ; ici on
// envoie des requêtes isochrones en continu, on écrit les échantillons bruts
// (entrelacés, tels qu'ils arrivent) dans un fichier, et on tient des vumètres.
#include <jni.h>
#include <linux/usbdevice_fs.h>
#include <sys/ioctl.h>
#include <sys/resource.h>
#include <sys/syscall.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <unistd.h>
#include <android/log.h>

#define TAG "usbiso"
#define NURB 16
#define NPK 32
#define MAXCH 64

static int g_fd = -1, g_ep = 0, g_maxp = 0, g_fb = 0, g_nch = 0, g_bps = 0;
static volatile int g_run = 0;
static int g_outstanding = 0;
static pthread_t g_th;
static struct usbdevfs_urb *g_urbs[NURB];
static FILE *g_out = NULL;
static char *g_fbuf = NULL;
static float g_win[MAXCH], g_peak[MAXCH];
static double g_sum[MAXCH];
static long long g_clip[MAXCH];
static long long g_frames = 0, g_pkterr = 0, g_urberr = 0, g_zero = 0, g_reaped = 0, g_odd = 0, g_submiterr = 0;
static int g_lasterr = 0;

// Sorties « concert » : un WAV par voie choisie (ou par paire stéréo), écrit au fil de l'eau.
#define MAXOUT 40
typedef struct { FILE *f; char *buf; int a, b; long long bytes; } Out;
static Out g_outs[MAXOUT];
static int g_nout = 0;
static volatile int g_rate = 48000;
static volatile int g_alive = 0;
static long long g_werr = 0, g_lasthdr = 0;

static void put32(unsigned char *p, unsigned int v) { p[0] = v & 255; p[1] = (v >> 8) & 255; p[2] = (v >> 16) & 255; p[3] = (v >> 24) & 255; }
static void put16(unsigned char *p, unsigned int v) { p[0] = v & 255; p[1] = (v >> 8) & 255; }

/** (Ré)écrit l'en-tête WAV avec la taille actuelle : le fichier reste lisible même si l'appli s'arrête net. */
static void header(Out *o) {
  unsigned char h[44];
  int nc = o->b >= 0 ? 2 : 1;
  unsigned int data = o->bytes > 0xFFFFF000LL ? 0xFFFFF000u : (unsigned int)o->bytes;
  memcpy(h, "RIFF", 4); put32(h + 4, 36 + data); memcpy(h + 8, "WAVEfmt ", 8);
  put32(h + 16, 16); put16(h + 20, 1); put16(h + 22, (unsigned)nc);
  put32(h + 24, (unsigned)g_rate); put32(h + 28, (unsigned)(g_rate * nc * g_bps));
  put16(h + 32, (unsigned)(nc * g_bps)); put16(h + 34, (unsigned)(g_bps * 8));
  memcpy(h + 36, "data", 4); put32(h + 40, data);
  fflush(o->f);
  long pos = ftell(o->f);
  fseek(o->f, 0, SEEK_SET);
  if (fwrite(h, 1, 44, o->f) != 44) g_werr++;
  fflush(o->f);
  if (pos > 44) fseek(o->f, pos, SEEK_SET);
}

static void headers(void) { for (int k = 0; k < g_nout; k++) if (g_outs[k].f) header(&g_outs[k]); }

static void closeouts(void) {
  for (int k = 0; k < g_nout; k++) {
    Out *o = &g_outs[k];
    if (o->f) { header(o); fclose(o->f); o->f = NULL; }
    free(o->buf); o->buf = NULL;
  }
  g_nout = 0;
}

static struct usbdevfs_urb *mkurb(void) {
  size_t sz = sizeof(struct usbdevfs_urb) + NPK * sizeof(struct usbdevfs_iso_packet_desc);
  struct usbdevfs_urb *u = (struct usbdevfs_urb *)calloc(1, sz);
  if (!u) return NULL;
  u->buffer = malloc((size_t)NPK * g_maxp);
  if (!u->buffer) { free(u); return NULL; }
  return u;
}

static int submit(struct usbdevfs_urb *u) {
  u->type = USBDEVFS_URB_TYPE_ISO;
  u->endpoint = (unsigned char)g_ep;
  u->flags = USBDEVFS_URB_ISO_ASAP;
  u->buffer_length = NPK * g_maxp;
  u->number_of_packets = NPK;
  u->status = 0;
  u->actual_length = 0;
  u->error_count = 0;
  u->start_frame = 0;
  for (int i = 0; i < NPK; i++) {
    u->iso_frame_desc[i].length = (unsigned int)g_maxp;
    u->iso_frame_desc[i].actual_length = 0;
    u->iso_frame_desc[i].status = 0;
  }
  int r = ioctl(g_fd, USBDEVFS_SUBMITURB, u);
  if (r < 0) { g_submiterr++; g_lasterr = errno; return -errno; }
  g_outstanding++;
  return 0;
}

static inline float sample(const unsigned char *d) {
  if (g_bps == 3) {
    int s = d[0] | (d[1] << 8) | (d[2] << 16);
    if (s & 0x800000) s |= ~0xFFFFFF;
    return (float)s / 8388608.0f;
  }
  if (g_bps == 4) {
    int s = d[0] | (d[1] << 8) | (d[2] << 16) | ((int)d[3] << 24);
    return (float)s / 2147483648.0f;
  }
  short s = (short)(d[0] | (d[1] << 8));
  return (float)s / 32768.0f;
}

static void process(struct usbdevfs_urb *u) {
  const unsigned char *base = (const unsigned char *)u->buffer;
  for (int i = 0; i < u->number_of_packets; i++) {
    struct usbdevfs_iso_packet_desc *p = &u->iso_frame_desc[i];
    if (p->status != 0) g_pkterr++;
    int al = (int)p->actual_length;
    if (al <= 0) { g_zero++; continue; }
    if (al % g_fb) g_odd++;
    int nfr = al / g_fb;
    const unsigned char *d = base + (size_t)i * g_maxp;
    if (g_out) fwrite(d, 1, (size_t)nfr * g_fb, g_out);
    for (int k = 0; k < g_nout; k++) {
      Out *o = &g_outs[k];
      if (!o->f) continue;
      unsigned char tmp[1024];
      int n = 0;
      for (int f = 0; f < nfr && n + 2 * g_bps <= (int)sizeof tmp; f++) {
        const unsigned char *fr = d + (size_t)f * g_fb;
        memcpy(tmp + n, fr + o->a * g_bps, (size_t)g_bps); n += g_bps;
        if (o->b >= 0) { memcpy(tmp + n, fr + o->b * g_bps, (size_t)g_bps); n += g_bps; }
      }
      if (fwrite(tmp, 1, (size_t)n, o->f) != (size_t)n) g_werr++;
      o->bytes += n;
    }
    for (int f = 0; f < nfr; f++) {
      const unsigned char *fr = d + (size_t)f * g_fb;
      for (int c = 0; c < g_nch; c++) {
        float v = sample(fr + c * g_bps);
        float a = v < 0 ? -v : v;
        if (a > g_win[c]) g_win[c] = a;
        if (a > g_peak[c]) g_peak[c] = a;
        if (a >= 0.999f) g_clip[c]++;
        g_sum[c] += (double)v * v;
      }
    }
    g_frames += nfr;
  }
}

static void *loop(void *arg) {
  (void)arg;
  // priorité « audio » pour ce fil (si Android le permet)
  setpriority(PRIO_PROCESS, (id_t)syscall(SYS_gettid), -19);
  while (g_outstanding > 0) {
    struct usbdevfs_urb *r = NULL;
    if (ioctl(g_fd, USBDEVFS_REAPURB, &r) < 0) {
      if (errno == EINTR) continue;
      g_urberr++;
      g_lasterr = errno;
      if (errno == ENODEV || errno == EBADF) break; // table débranchée
      usleep(1000);
      continue;
    }
    if (!r) continue;
    g_outstanding--;
    g_reaped++;
    if (!g_run) continue; // on arrête : on ne relance pas
    if (r->status != 0 && r->status != -EXDEV) g_urberr++;
    process(r);
    submit(r);
    // toutes les ~10 s : en-têtes à jour (fichiers lisibles même après un arrêt brutal)
    if (g_nout && g_frames - g_lasthdr > 10LL * g_rate) { g_lasthdr = g_frames; headers(); }
  }
  if (g_nout) headers();
  g_alive = 0;
  return NULL;
}

JNIEXPORT jint JNICALL Java_fr_remy_usbaudio_UsbIso_start(JNIEnv *env, jclass cls, jint fd, jint ep, jint maxp, jint nch, jint bps, jstring path, jint rate, jstring spec) {
  (void)cls;
  if (g_run) return -EBUSY;
  if (nch <= 0 || nch > MAXCH || bps < 2 || bps > 4 || maxp <= 0) return -EINVAL;
  g_fd = fd; g_ep = ep; g_maxp = maxp; g_nch = nch; g_bps = bps; g_fb = nch * bps;
  memset(g_win, 0, sizeof g_win); memset(g_peak, 0, sizeof g_peak);
  memset(g_sum, 0, sizeof g_sum); memset(g_clip, 0, sizeof g_clip);
  g_frames = g_pkterr = g_urberr = g_zero = g_reaped = g_odd = g_submiterr = 0;
  g_lasterr = 0;
  g_outstanding = 0;
  g_werr = 0; g_lasthdr = 0; g_nout = 0;
  g_rate = rate > 0 ? rate : 48000;
  g_out = NULL; g_fbuf = NULL;
  const char *p = (*env)->GetStringUTFChars(env, path, NULL);
  if (p && p[0]) {
    g_out = fopen(p, "wb");
    if (!g_out) { int e = errno; (*env)->ReleaseStringUTFChars(env, path, p); return -e; }
    g_fbuf = (char *)malloc(1 << 20);
    if (g_fbuf) setvbuf(g_out, g_fbuf, _IOFBF, 1 << 20);
  }
  (*env)->ReleaseStringUTFChars(env, path, p);
  // spec : une ligne par fichier « chemin \t voieA \t voieB » (voieB = -1 pour un fichier mono)
  const char *sp = (*env)->GetStringUTFChars(env, spec, NULL);
  char *copy = sp ? strdup(sp) : NULL;
  (*env)->ReleaseStringUTFChars(env, spec, sp);
  int operr = 0;
  if (copy) {
    char *save = NULL;
    for (char *line = strtok_r(copy, "\n", &save); line && g_nout < MAXOUT; line = strtok_r(NULL, "\n", &save)) {
      char *t1 = strchr(line, '\t');
      if (!t1) continue;
      *t1 = 0;
      char *t2 = strchr(t1 + 1, '\t');
      if (!t2) continue;
      *t2 = 0;
      int a = atoi(t1 + 1), b = atoi(t2 + 1);
      if (a < 0 || a >= nch || b >= nch) continue;
      Out *o = &g_outs[g_nout];
      o->f = fopen(line, "wb+");
      if (!o->f) { operr = errno; break; }
      o->buf = (char *)malloc(1 << 17);
      if (o->buf) setvbuf(o->f, o->buf, _IOFBF, 1 << 17);
      o->a = a; o->b = b; o->bytes = 0;
      g_nout++;
      header(o);
      fseek(o->f, 44, SEEK_SET);
    }
    free(copy);
  }
  if (operr) { closeouts(); if (g_out) { fclose(g_out); g_out = NULL; } free(g_fbuf); g_fbuf = NULL; return -operr; }
  for (int i = 0; i < NURB; i++) g_urbs[i] = mkurb();
  g_run = 1;
  int first = 0;
  for (int i = 0; i < NURB; i++) {
    if (!g_urbs[i]) continue;
    int r = submit(g_urbs[i]);
    if (r < 0 && !first) first = r;
  }
  if (g_outstanding == 0) {
    g_run = 0;
    if (g_out) { fclose(g_out); g_out = NULL; }
    closeouts();
    for (int i = 0; i < NURB; i++) if (g_urbs[i]) { free(g_urbs[i]->buffer); free(g_urbs[i]); g_urbs[i] = NULL; }
    free(g_fbuf); g_fbuf = NULL;
    return first ? first : -EIO;
  }
  g_alive = 1;
  pthread_create(&g_th, NULL, loop, NULL);
  __android_log_print(ANDROID_LOG_INFO, TAG, "départ : %d requêtes, %d voies, %d octets/éch., paquet %d", g_outstanding, nch, bps, maxp);
  return 0;
}

/** Arrête et rend [images, paquets en erreur, requêtes en erreur, paquets vides, requêtes reçues, paquets bancals, envois ratés, dernière erreur]. */
JNIEXPORT jlongArray JNICALL Java_fr_remy_usbaudio_UsbIso_stop(JNIEnv *env, jclass cls) {
  (void)cls;
  if (g_run) {
    g_run = 0;
    for (int i = 0; i < NURB; i++) if (g_urbs[i]) ioctl(g_fd, USBDEVFS_DISCARDURB, g_urbs[i]);
    pthread_join(g_th, NULL);
  }
  if (g_out) { fflush(g_out); fclose(g_out); g_out = NULL; }
  closeouts();
  for (int i = 0; i < NURB; i++) if (g_urbs[i]) { free(g_urbs[i]->buffer); free(g_urbs[i]); g_urbs[i] = NULL; }
  free(g_fbuf); g_fbuf = NULL;
  jlong v[9] = { g_frames, g_pkterr, g_urberr, g_zero, g_reaped, g_odd, g_submiterr, g_lasterr, g_werr };
  jlongArray a = (*env)->NewLongArray(env, 9);
  (*env)->SetLongArrayRegion(env, a, 0, 9, v);
  return a;
}

/** Pendant l'enregistrement : [images, erreurs USB, paquets vides, erreurs d'écriture, en vie, dernière erreur]. */
JNIEXPORT jlongArray JNICALL Java_fr_remy_usbaudio_UsbIso_stats(JNIEnv *env, jclass cls) {
  (void)cls;
  jlong v[6] = { g_frames, g_pkterr + g_urberr + g_submiterr, g_zero, g_werr, g_alive, g_lasterr };
  jlongArray a = (*env)->NewLongArray(env, 6);
  (*env)->SetLongArrayRegion(env, a, 0, 6, v);
  return a;
}

/** La vraie fréquence, une fois mesurée (elle part dans les en-têtes des fichiers). */
JNIEXPORT void JNICALL Java_fr_remy_usbaudio_UsbIso_setRate(JNIEnv *env, jclass cls, jint rate) {
  (void)env; (void)cls;
  if (rate > 0) g_rate = rate;
}

/** Crêtes depuis le dernier appel (0..1), puis remise à zéro. */
JNIEXPORT jfloatArray JNICALL Java_fr_remy_usbaudio_UsbIso_window(JNIEnv *env, jclass cls) {
  (void)cls;
  int n = g_nch > 0 ? g_nch : 1;
  jfloatArray a = (*env)->NewFloatArray(env, n);
  (*env)->SetFloatArrayRegion(env, a, 0, n, g_win);
  memset(g_win, 0, sizeof g_win);
  return a;
}

/** Après l'arrêt : crête, moyenne (RMS) et saturations de chaque voie. */
JNIEXPORT jdoubleArray JNICALL Java_fr_remy_usbaudio_UsbIso_totals(JNIEnv *env, jclass cls) {
  (void)cls;
  int n = g_nch > 0 ? g_nch : 1;
  double v[3 * MAXCH];
  for (int c = 0; c < n; c++) {
    v[c] = g_peak[c];
    v[n + c] = g_frames > 0 ? g_sum[c] / (double)g_frames : 0;
    v[2 * n + c] = (double)g_clip[c];
  }
  jdoubleArray a = (*env)->NewDoubleArray(env, 3 * n);
  (*env)->SetDoubleArrayRegion(env, a, 0, 3 * n, v);
  return a;
}

JNIEXPORT jlong JNICALL Java_fr_remy_usbaudio_UsbIso_frames(JNIEnv *env, jclass cls) {
  (void)env; (void)cls;
  return g_frames;
}
