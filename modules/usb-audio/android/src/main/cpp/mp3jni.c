// Vrai MP3 : l'encodeur « shine » (virgule fixe, LGPL, voir shine/COPYING), piloté depuis Kotlin.
// On lui donne du son 16 bits stéréo entrelacé, par morceaux de n'importe quelle taille.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "shine/layer3.h"

typedef struct { shine_t s; FILE *f; int spp; int16_t *buf; int fill; int bad; } Mp3;

static Mp3 *mp3_open(const char *path, int rate, int kbps) {
  if (shine_check_config(rate, kbps) < 0) return NULL;
  shine_config_t c;
  shine_set_config_mpeg_defaults(&c.mpeg);
  c.wave.channels = 2;
  c.wave.samplerate = rate;
  c.mpeg.mode = SHINE_JOINT_STEREO;
  c.mpeg.bitrate = kbps;
  Mp3 *m = calloc(1, sizeof(Mp3));
  if (!m) return NULL;
  m->s = shine_initialise(&c);
  if (!m->s) { free(m); return NULL; }
  m->spp = shine_samples_per_pass(m->s);
  m->buf = malloc(sizeof(int16_t) * 2 * m->spp);
  m->f = fopen(path, "wb");
  if (!m->f || !m->buf) { if (m->f) fclose(m->f); free(m->buf); shine_close(m->s); free(m); return NULL; }
  return m;
}

// frames = nombre d'images stéréo
static void mp3_write(Mp3 *m, const int16_t *pcm, int frames) {
  while (frames > 0) {
    int n = m->spp - m->fill;
    if (n > frames) n = frames;
    memcpy(m->buf + 2 * m->fill, pcm, sizeof(int16_t) * 2 * n);
    m->fill += n; pcm += 2 * n; frames -= n;
    if (m->fill == m->spp) {
      int w = 0;
      unsigned char *d = shine_encode_buffer_interleaved(m->s, m->buf, &w);
      if (w > 0 && fwrite(d, 1, w, m->f) != (size_t)w) m->bad = 1;
      m->fill = 0;
    }
  }
}

static int mp3_close(Mp3 *m) {
  int w = 0;
  if (m->fill > 0) { // la dernière passe, complétée par du silence
    memset(m->buf + 2 * m->fill, 0, sizeof(int16_t) * 2 * (m->spp - m->fill));
    unsigned char *d = shine_encode_buffer_interleaved(m->s, m->buf, &w);
    if (w > 0 && fwrite(d, 1, w, m->f) != (size_t)w) m->bad = 1;
  }
  unsigned char *d = shine_flush(m->s, &w);
  if (w > 0 && fwrite(d, 1, w, m->f) != (size_t)w) m->bad = 1;
  if (fclose(m->f) != 0) m->bad = 1;
  int bad = m->bad;
  shine_close(m->s); free(m->buf); free(m);
  return bad ? -1 : 0;
}

#ifdef MP3_TEST
#include <math.h>
int main(void) {
  Mp3 *m = mp3_open("/tmp/t.mp3", 48000, 192);
  if (!m) return 1;
  static int16_t b[1000 * 2];
  long t = 0;
  for (int k = 0; k < 240; k++) { // 5 s, par blocs de 1000 images (exprès : pas un multiple de 1152)
    for (int i = 0; i < 1000; i++, t++) { b[2 * i] = (int16_t)(12000 * sin(t * 2 * M_PI * 440 / 48000)); b[2 * i + 1] = (int16_t)(12000 * sin(t * 2 * M_PI * 660 / 48000)); }
    mp3_write(m, b, 1000);
  }
  return mp3_close(m);
}
#else
#include <jni.h>
JNIEXPORT jlong JNICALL Java_fr_remy_usbaudio_Mp3_open(JNIEnv *env, jclass cls, jstring path, jint rate, jint kbps) {
  const char *p = (*env)->GetStringUTFChars(env, path, NULL);
  Mp3 *m = mp3_open(p, rate, kbps);
  (*env)->ReleaseStringUTFChars(env, path, p);
  return (jlong)(intptr_t)m;
}
// pcm : octets 16 bits petit-boutistes, stéréo entrelacé ; len en octets
JNIEXPORT void JNICALL Java_fr_remy_usbaudio_Mp3_write(JNIEnv *env, jclass cls, jlong h, jbyteArray pcm, jint len) {
  Mp3 *m = (Mp3 *)(intptr_t)h;
  if (!m || len < 4) return;
  jbyte *b = (*env)->GetByteArrayElements(env, pcm, NULL);
  mp3_write(m, (const int16_t *)b, len / 4);
  (*env)->ReleaseByteArrayElements(env, pcm, b, JNI_ABORT);
}
JNIEXPORT jint JNICALL Java_fr_remy_usbaudio_Mp3_close(JNIEnv *env, jclass cls, jlong h) {
  Mp3 *m = (Mp3 *)(intptr_t)h;
  return m ? mp3_close(m) : -1;
}
#endif
