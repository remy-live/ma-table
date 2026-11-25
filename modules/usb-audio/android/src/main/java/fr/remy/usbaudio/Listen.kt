package fr.remy.usbaudio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

/** Les crêtes d'un fichier (1 octet toutes les 9600 images) : pour dessiner l'onde sans relire le son. */
object Peaks {
  const val PKN = 9600

  fun sidecar(ctx: Context, wav: File): File {
    val d = File(ctx.filesDir, "rec-peaks/" + (wav.parentFile?.name ?: "x"))
    d.mkdirs()
    return File(d, wav.name + ".pk")
  }

  private fun byteOf(m: Float): Int = if (m >= 0.999f) 255 else (sqrt(m) * 254f).toInt().coerceIn(0, 254)

  /** Lit le fichier d'à côté s'il existe et colle au son, sinon le calcule (une lecture complète du fichier). */
  fun get(ctx: Context, wav: File, progress: (Double) -> Unit): ByteArray {
    val w = Mixer.Wav(wav)
    val want = ((w.frames + PKN - 1) / PKN).toInt()
    val side = sidecar(ctx, wav)
    if (side.exists() && abs(side.length() - want) <= 2 && side.lastModified() >= wav.lastModified() - 5000) return side.readBytes()
    val out = ByteArray(want)
    val fb = w.fb
    val raw = ByteArray(PKN * fb)
    BufferedInputStream(FileInputStream(wav), 1 shl 16).use { inp ->
      var left = 44L
      while (left > 0) { val s = inp.skip(left); if (s <= 0) break; left -= s }
      for (i in 0 until want) {
        var got = 0
        while (got < raw.size) { val r = inp.read(raw, got, raw.size - got); if (r < 0) break; got += r }
        val n = got / w.bps
        var m = 0f
        for (j in 0 until n) { val v = abs(MixEngine.sample(raw, j * w.bps, w.bps)); if (v > m) m = v }
        out[i] = byteOf(m).toByte()
        if (i % 200 == 0) progress(i.toDouble() / want)
        if (got < raw.size) break
      }
    }
    try { side.writeBytes(out) } catch (e: Throwable) {}
    return out
  }
}

/** Fabrique le mix à la volée : niveaux, panoramiques, passages coupés, niveaux et fondus par passage. Sert à l'écoute ET à l'export. */
class MixEngine(paths: List<String>) {
  class Src(val f: File) {
    val w = Mixer.Wav(f)
    val raf = RandomAccessFile(f, "r")
    var at = -1L
    val buf = ByteArray(BLOCK * w.fb)
    /** Lit n images à partir de pos ; rend le nombre lu. */
    fun read(pos: Long, n: Int): Int {
      if (pos >= w.frames) return 0
      if (at != pos) raf.seek(44 + pos * w.fb)
      val want = min(n.toLong(), w.frames - pos).toInt() * w.fb
      var got = 0
      while (got < want) { val r = raf.read(buf, got, want - got); if (r < 0) break; got += r }
      at = pos + got / w.fb
      return got / w.fb
    }
    fun close() { try { raf.close() } catch (e: Throwable) {} }
  }

  class Reg(val a: Double, val b: Double, val g: Float, val k: Int)   // niveau sur un passage (k = -1 : toutes les pistes)
  class Fade(val a: Double, val b: Double, val rising: Boolean)
  class Params(
    val gains: FloatArray = FloatArray(0), val pans: FloatArray = FloatArray(0), val master: Float = 1f,
    val kept: DoubleArray = DoubleArray(0), // paires début/fin (secondes) de ce qu'on garde ; vide = tout
    val regs: List<Reg> = emptyList(), val fades: List<Fade> = emptyList(),
    // nettoyage par piste : coupe-bas (Hz, 0 = non), compression (seuil linéaire, 0 = non ; pente = 1/taux − 1 ; rattrapage), anti-repisse (seuil, 0 = non)
    val hp: FloatArray = FloatArray(0), val thr: FloatArray = FloatArray(0), val slope: FloatArray = FloatArray(0), val makeup: FloatArray = FloatArray(0), val gate: FloatArray = FloatArray(0),
    // finition : équilibre (creux à 300 Hz, air à 8 kHz), colle d'ensemble, limiteur
    val eq: Boolean = false, val glue: Boolean = false, val limit: Boolean = false,
    // égalisation sur mesure de chaque piste : suites de (type 0 plateau grave / 1 cloche / 2 plateau aigu, Hz, dB, Q)
    val teq: List<FloatArray> = emptyList(),
    // réverbération : part de chaque piste envoyée
    val rev: FloatArray = FloatArray(0),
    // la voix devant : pistes « clé » (voix), pistes qui s'effacent un peu quand ça chante
    val key: FloatArray = FloatArray(0), val duck: FloatArray = FloatArray(0), val duckThr: Float = 0f, val duckGain: Float = 1f,
  )

  /** Un filtre du second ordre (formules classiques « RBJ »). */
  class Biquad {
    var b0 = 1f; var b1 = 0f; var b2 = 0f; var a1 = 0f; var a2 = 0f
    var x1 = 0f; var x2 = 0f; var y1 = 0f; var y2 = 0f
    fun run(x: Float): Float { val y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = if (abs(y) < 1e-20f) 0f else y; return y1 }
    private fun set(nb0: Double, nb1: Double, nb2: Double, a0: Double, na1: Double, na2: Double) { b0 = (nb0 / a0).toFloat(); b1 = (nb1 / a0).toFloat(); b2 = (nb2 / a0).toFloat(); a1 = (na1 / a0).toFloat(); a2 = (na2 / a0).toFloat() }
    fun highPass(f: Double, rate: Int) { val w = 2 * Math.PI * f / rate; val c = cos(w); val al = sin(w) / 1.414; set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al) }
    fun peak(f: Double, db: Double, q: Double, rate: Int) { val a = Math.pow(10.0, db / 40); val w = 2 * Math.PI * f / rate; val c = cos(w); val al = sin(w) / (2 * q); set(1 + al * a, -2 * c, 1 - al * a, 1 + al / a, -2 * c, 1 - al / a) }
    fun lowShelf(f: Double, db: Double, rate: Int) {
      val a = Math.pow(10.0, db / 40); val w = 2 * Math.PI * f / rate; val c = cos(w); val al = sin(w) / 2 * 1.414; val r = 2 * sqrt(a) * al
      set(a * ((a + 1) - (a - 1) * c + r), 2 * a * ((a - 1) - (a + 1) * c), a * ((a + 1) - (a - 1) * c - r), (a + 1) + (a - 1) * c + r, -2 * ((a - 1) + (a + 1) * c), (a + 1) + (a - 1) * c - r)
    }
    fun highShelf(f: Double, db: Double, rate: Int) {
      val a = Math.pow(10.0, db / 40); val w = 2 * Math.PI * f / rate; val c = cos(w); val al = sin(w) / 2 * 1.414; val r = 2 * sqrt(a) * al
      set(a * ((a + 1) + (a - 1) * c + r), -2 * a * ((a - 1) + (a + 1) * c), a * ((a + 1) + (a - 1) * c - r), (a + 1) - (a - 1) * c + r, 2 * ((a - 1) - (a + 1) * c), (a + 1) - (a - 1) * c - r)
    }
  }
  /** Mémoire du traitement d'une piste. */
  class Dyn {
    val hp = Biquad(); var hpF = -1f; var env = 0f; var g = 1f
    // égalisation sur mesure
    val eq = Array(12) { Biquad() }; var eqN = 0; var eqSig: FloatArray? = null
    // petit retard (5 ms) : le traitement « voit venir » les attaques et s'ouvre avant elles
    val delay = FloatArray(LOOK); var di = 0
    // anti-repisse : tenue après une frappe, puis fermeture douce
    var gateG = 1f; var hold = 0
  }

  /** Une réverbération simple (peignes + passe-tout, façon Freeverb), ajoutée en stéréo. */
  class Reverb(rate: Int) {
    private val k = rate / 44100.0
    private fun len(n: Int) = max(8, (n * k).toInt())
    private val combL = intArrayOf(1116, 1188, 1277, 1356, 1422, 1491).map { FloatArray(len(it)) }
    private val combR = intArrayOf(1139, 1211, 1300, 1379, 1445, 1514).map { FloatArray(len(it)) }
    private val apL = intArrayOf(556, 441, 341).map { FloatArray(len(it)) }
    private val apR = intArrayOf(579, 464, 364).map { FloatArray(len(it)) }
    private val ci = IntArray(12); private val ai = IntArray(6); private val lp = FloatArray(12)
    private val fb = 0.80f; private val damp = 0.35f
    private fun side(x: Float, combs: List<FloatArray>, aps: List<FloatArray>, o: Int, ao: Int): Float {
      var acc = 0f
      for (c in combs.indices) {
        val b = combs[c]; val i = ci[o + c]; val y = b[i]
        lp[o + c] = y * (1f - damp) + lp[o + c] * damp
        b[i] = x + lp[o + c] * fb
        ci[o + c] = if (i + 1 >= b.size) 0 else i + 1
        acc += y
      }
      var v = acc * 0.16f
      for (a in aps.indices) {
        val b = aps[a]; val i = ai[ao + a]; val y = b[i]
        b[i] = v + y * 0.5f
        ai[ao + a] = if (i + 1 >= b.size) 0 else i + 1
        v = y - v * 0.5f
      }
      return if (abs(v) < 1e-20f) 0f else v
    }
    fun run(inp: FloatArray, n: Int, outL: FloatArray, outR: FloatArray) {
      for (i in 0 until n) { val x = inp[i]; outL[i] += side(x, combL, apL, 0, 0); outR[i] += side(x, combR, apR, 6, 3) }
    }
  }

  val srcs = paths.map { Src(File(it)) }
  val rate: Int = srcs.firstOrNull()?.w?.rate ?: 48000
  val total: Long = srcs.maxOfOrNull { it.w.frames } ?: 0L
  @Volatile var params = Params()
  private val prev = FloatArray(srcs.size) { -1f }
  private val dyn = Array(srcs.size) { Dyn() }
  private val eqL = arrayOf(Biquad(), Biquad()); private val eqR = arrayOf(Biquad(), Biquad())
  private var eqReady = false
  private var glueEnv = 0f; private var glueG = 1f; private var limEnv = 0f
  private val reverb = Reverb(rate)
  private val revIn = FloatArray(BLOCK)
  private var keyPeak = 0f; private var duckG = 1f
  private val holdN = (0.14 * rate / 8).toInt()
  private val attC = Math.exp(-1.0 / (0.004 * rate)).toFloat()
  private val relC = Math.exp(-1.0 / (0.14 * rate)).toFloat()
  private var lastEnd = -1L
  val outL = FloatArray(BLOCK)
  val outR = FloatArray(BLOCK)

  fun close() { srcs.forEach { it.close() } }

  private fun regionGain(p: Params, k: Int, t: Double): Float {
    var g = 1f
    for (r in p.regs) if (t >= r.a && t < r.b && (r.k < 0 || r.k == k)) g *= r.g
    for (f in p.fades) if (t >= f.a && t < f.b) { val x = ((t - f.a) / (f.b - f.a)).toFloat(); g *= if (f.rising) x else 1f - x }
    return g
  }

  /**
   * Fabrique jusqu'à `n` images à partir de l'image `pos` du concert, dans outL / outR.
   * Rend (nouvelle position, images fabriquées). 0 image = c'est fini (ou plus rien à garder après).
   */
  fun render(pos0: Long, n: Int, until: Long = Long.MAX_VALUE): LongArray {
    val p = params
    var pos = pos0
    val end = min(total, until)
    var limit = min(n, BLOCK)
    var fadeOut = false
    if (p.kept.isNotEmpty()) {
      var found = false
      var i = 0
      while (i + 1 < p.kept.size) {
        val a = (p.kept[i] * rate).toLong(); val b = (p.kept[i + 1] * rate).toLong()
        if (pos < b) {
          if (pos < a) pos = a
          if (b - pos < limit) { limit = (b - pos).toInt(); fadeOut = i + 2 < p.kept.size }
          found = true
          break
        }
        i += 2
      }
      if (!found) return longArrayOf(end, 0)
    }
    if (pos >= end) return longArrayOf(end, 0)
    if (end - pos < limit) limit = (end - pos).toInt()
    if (limit <= 0) return longArrayOf(pos, 0)
    val jumped = pos != lastEnd
    java.util.Arrays.fill(outL, 0, limit, 0f); java.util.Arrays.fill(outR, 0, limit, 0f)
    val t = pos.toDouble() / rate
    java.util.Arrays.fill(revIn, 0, limit, 0f)
    // la voix devant : si ça chantait à l'instant, les pistes désignées s'effacent un peu
    duckG += 0.25f * ((if (p.duckThr > 0f && keyPeak > p.duckThr) p.duckGain else 1f) - duckG)
    var keyNext = 0f
    for (k in srcs.indices) {
      val base = if (k < p.gains.size) p.gains[k] else 1f
      val ducked = k < p.duck.size && p.duck[k] > 0f
      val g1 = base * regionGain(p, k, t) * p.master * (if (ducked) duckG else 1f)
      val g0 = if (jumped || prev[k] < 0f) g1 else prev[k]
      prev[k] = g1
      if (g1 <= 0f && g0 <= 0f) continue
      val s = srcs[k]
      val got = s.read(pos, limit)
      val bps = s.w.bps; val fb = s.w.fb
      val step = (g1 - g0) / max(1, got)
      if (s.w.channels >= 2) {
        var g = g0
        for (i in 0 until got) { outL[i] += sample(s.buf, i * fb, bps) * g; outR[i] += sample(s.buf, i * fb + bps, bps) * g; g += step }
      } else {
        val pan = if (k < p.pans.size) p.pans[k].coerceIn(-1f, 1f) else 0f
        val l = cos((pan + 1) * Math.PI / 4).toFloat() * 1.4142f; val r = sin((pan + 1) * Math.PI / 4).toFloat() * 1.4142f
        var g = g0
        // la piste : coupe-bas, égalisation sur mesure, puis compression et anti-repisse (gain recalculé toutes les 8 images)
        val d = dyn[k]
        val hpF = if (k < p.hp.size) p.hp[k] else 0f
        if (hpF != d.hpF) { d.hpF = hpF; if (hpF > 0f) d.hp.highPass(hpF.toDouble(), rate) }
        val te = if (k < p.teq.size) p.teq[k] else null
        if (te !== d.eqSig) {
          d.eqSig = te
          d.eqN = 0
          if (te != null) {
            var j = 0
            while (j + 3 < te.size && d.eqN < d.eq.size) {
              val b = d.eq[d.eqN]; val f = te[j + 1].toDouble().coerceIn(20.0, rate * 0.45); val db = te[j + 2].toDouble().coerceIn(-12.0, 9.0); val q = te[j + 3].toDouble().coerceIn(0.3, 8.0)
              when (te[j].toInt()) { 0 -> b.lowShelf(f, db, rate); 2 -> b.highShelf(f, db, rate); else -> b.peak(f, db, q, rate) }
              d.eqN++
              j += 4
            }
          }
        }
        val eqN = d.eqN
        val thr = if (k < p.thr.size) p.thr[k] else 0f
        val slope = if (k < p.slope.size) p.slope[k] else 0f
        val mk = if (k < p.makeup.size && thr > 0f) p.makeup[k] else 1f
        val gt = if (k < p.gate.size) p.gate[k] else 0f
        val send = if (k < p.rev.size) p.rev[k] else 0f
        val isKey = k < p.key.size && p.key[k] > 0f
        var env = d.env; var dg = d.g; var gg = d.gateG; var hold = d.hold; var di = d.di
        val dl = d.delay
        for (i in 0 until got) {
          var x = sample(s.buf, i * fb, bps)
          if (isKey) { val a0 = abs(x); if (a0 > keyNext) keyNext = a0 }
          if (hpF > 0f) x = d.hp.run(x)
          for (e in 0 until eqN) x = d.eq[e].run(x)
          val a = abs(x)
          env = if (a > env) a + attC * (env - a) else a + relC * (env - a)
          if (i and 7 == 0) {
            val target = if (thr > 0f && env > thr) Math.pow((env / thr).toDouble(), slope.toDouble()).toFloat() else 1f
            dg += 0.35f * (target - dg)
            if (gt > 0f) {
              // ouvert dès que ça frappe, tenu un instant, puis refermé doucement (jamais coupé net)
              if (a > gt || env > gt) hold = holdN else if (hold > 0) hold--
              gg += if (hold > 0) 0.3f * (1f - gg) else 0.0012f * (GATE_FLOOR - gg)
            } else gg = 1f
          }
          // le son sort 5 ms plus tard que ce qui est mesuré : le gain est prêt avant l'attaque
          val xd = dl[di]; dl[di] = x; di = if (di + 1 >= LOOK) 0 else di + 1
          val v = xd * dg * mk * gg * g
          outL[i] += v * l; outR[i] += v * r
          if (send > 0f) revIn[i] += v * send
          g += step
        }
        d.env = env; d.g = dg; d.gateG = gg; d.hold = hold; d.di = di
      }
    }
    keyPeak = max(keyNext, keyPeak * 0.8f)
    if (p.rev.isNotEmpty()) reverb.run(revIn, limit, outL, outR)
    // finition : équilibre, colle d'ensemble, limiteur
    if (p.eq) {
      if (!eqReady) { for (e in arrayOf(eqL, eqR)) { e[0].peak(300.0, -2.0, 0.9, rate); e[1].highShelf(8000.0, 2.0, rate) }; eqReady = true }
      for (i in 0 until limit) { outL[i] = eqL[1].run(eqL[0].run(outL[i])); outR[i] = eqR[1].run(eqR[0].run(outR[i])) }
    }
    if (p.glue) {
      // compression douce (2:1 au-dessus de −16 dB), rattrapée de 2 dB
      for (i in 0 until limit) {
        val a = max(abs(outL[i]), abs(outR[i]))
        glueEnv = if (a > glueEnv) a + attC * (glueEnv - a) else a + relC * (glueEnv - a)
        if (i and 7 == 0) { val t = if (glueEnv > 0.158f) Math.pow((glueEnv / 0.158f).toDouble(), -0.5).toFloat() else 1f; glueG += 0.35f * (t - glueG) }
        outL[i] *= glueG * 1.26f; outR[i] *= glueG * 1.26f
      }
    }
    if (p.limit) {
      // limiteur : dès que ça dépasse −1 dB, on baisse aussitôt et on relâche doucement
      for (i in 0 until limit) {
        val a = max(abs(outL[i]), abs(outR[i]))
        limEnv = if (a > limEnv) a else a + relC * (limEnv - a)
        if (limEnv > 0.89f) { val gl = 0.89f / limEnv; outL[i] *= gl; outR[i] *= gl }
      }
    }
    // jamais d'écrêtage dur : au-dessus de 0,8 la courbe s'arrondit
    for (i in 0 until limit) { outL[i] = soft(outL[i]); outR[i] = soft(outR[i]) }
    // petits fondus aux raccords (après une coupe ou un déplacement) : pas de clic
    val ramp = min(240, limit)
    if (jumped) for (i in 0 until ramp) { val x = i.toFloat() / ramp; outL[i] *= x; outR[i] *= x }
    if (fadeOut) for (i in 0 until ramp) { val x = i.toFloat() / ramp; outL[limit - 1 - i] *= x; outR[limit - 1 - i] *= x }
    lastEnd = if (fadeOut) -1L else pos + limit
    return longArrayOf(pos + limit, limit.toLong())
  }

  companion object {
    const val BLOCK = 1024
    const val LOOK = 240          // 5 ms à 48 kHz
    const val GATE_FLOOR = 0.14f  // l'anti-repisse baisse de 17 dB, il ne coupe pas
    fun soft(x: Float): Float { val a = abs(x); return if (a <= 0.8f) x else (if (x < 0) -1f else 1f) * (0.8f + 0.2f * tanh((a - 0.8f) / 0.2f)) }
    fun sample(raw: ByteArray, o: Int, bps: Int): Float = when (bps) {
      3 -> ((raw[o].toInt() and 0xFF) or ((raw[o + 1].toInt() and 0xFF) shl 8) or (raw[o + 2].toInt() shl 16)) / 8388608f
      4 -> ((raw[o].toInt() and 0xFF) or ((raw[o + 1].toInt() and 0xFF) shl 8) or ((raw[o + 2].toInt() and 0xFF) shl 16) or (raw[o + 3].toInt() shl 24)) / 2147483648f
      else -> ((raw[o].toInt() and 0xFF) or (raw[o + 1].toInt() shl 8)) / 32768f
    }
    fun toPcm(l: FloatArray, r: FloatArray, n: Int, out: ByteArray) {
      var p = 0
      for (i in 0 until n) {
        val a = (l[i] * 32767f).toInt().coerceIn(-32768, 32767); val b = (r[i] * 32767f).toInt().coerceIn(-32768, 32767)
        out[p++] = a.toByte(); out[p++] = (a shr 8).toByte(); out[p++] = b.toByte(); out[p++] = (b shr 8).toByte()
      }
    }
  }
}

/** Lecteur multipiste : on entend les réglages tout de suite. */
class LivePlayer(private val engine: MixEngine, private val onTick: (Double, Boolean, Boolean) -> Unit) {
  @Volatile var playing = false
  @Volatile private var alive = true
  @Volatile private var seekTo = -1L
  @Volatile var pos = 0L
  private val th: Thread

  init {
    val minBuf = AudioTrack.getMinBufferSize(engine.rate, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT)
    val track = AudioTrack.Builder()
      .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
      .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(engine.rate).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).build())
      .setBufferSizeInBytes(max(minBuf, MixEngine.BLOCK * 4 * 3))
      .setTransferMode(AudioTrack.MODE_STREAM)
      .setSessionId(AudioManager.AUDIO_SESSION_ID_GENERATE)
      .build()
    th = Thread {
      val pcm = ByteArray(MixEngine.BLOCK * 4)
      var wasPlaying = false
      var lastTick = 0L
      try {
        while (alive) {
          val sk = seekTo
          if (sk >= 0) { seekTo = -1; pos = sk; try { track.pause(); track.flush() } catch (e: Throwable) {}; wasPlaying = false }
          if (!playing) {
            if (wasPlaying) { try { track.pause() } catch (e: Throwable) {}; wasPlaying = false; onTick(pos.toDouble() / engine.rate, false, false) }
            Thread.sleep(20)
            continue
          }
          if (!wasPlaying) { track.play(); wasPlaying = true }
          val r = engine.render(pos, MixEngine.BLOCK)
          val n = r[1].toInt()
          if (n <= 0) { playing = false; pos = r[0]; onTick(pos.toDouble() / engine.rate, false, true); continue }
          MixEngine.toPcm(engine.outL, engine.outR, n, pcm)
          track.write(pcm, 0, n * 4)
          pos = r[0]
          val now = System.currentTimeMillis()
          if (now - lastTick > 90) { lastTick = now; onTick(pos.toDouble() / engine.rate, true, false) }
        }
      } catch (e: Throwable) {
        playing = false
      } finally {
        try { track.stop() } catch (e: Throwable) {}
        try { track.release() } catch (e: Throwable) {}
        engine.close()
      }
    }
    th.start()
  }

  fun seek(sec: Double) { seekTo = (sec * engine.rate).toLong().coerceIn(0, max(0, engine.total - 1)) }
  fun close() { alive = false; playing = false }
}

/** Écrit un fichier .m4a (AAC), bien plus léger qu'un WAV. */
class AacWriter(out: File, private val rate: Int) : Sink {
  private val codec = MediaCodec.createEncoderByType("audio/mp4a-latm")
  private val muxer = MediaMuxer(out.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
  private val info = MediaCodec.BufferInfo()
  private var track = -1
  private var started = false
  private var frames = 0L

  init {
    val f = MediaFormat.createAudioFormat("audio/mp4a-latm", rate, 2)
    f.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
    f.setInteger(MediaFormat.KEY_BIT_RATE, 192000)
    f.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384)
    codec.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    codec.start()
  }

  override fun write(pcm: ByteArray, len: Int) {
    var off = 0
    var spins = 0
    while (off < len) {
      val i = codec.dequeueInputBuffer(10000)
      if (i >= 0) {
        val b = codec.getInputBuffer(i) ?: throw IllegalStateException("encodeur sans tampon")
        b.clear()
        val n = min(b.remaining(), len - off) / 4 * 4
        b.put(pcm, off, n)
        codec.queueInputBuffer(i, 0, n, frames * 1000000L / rate, 0)
        frames += n / 4
        off += n
        spins = 0
      } else if (++spins > 500) throw IllegalStateException("l’encodeur ne répond plus")
      drain(false)
    }
  }

  private fun drain(end: Boolean) {
    var waits = 0
    while (true) {
      val o = codec.dequeueOutputBuffer(info, if (end) 10000 else 0)
      if (o == MediaCodec.INFO_TRY_AGAIN_LATER) { if (!end || ++waits > 300) return }
      else if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) { track = muxer.addTrack(codec.outputFormat); muxer.start(); started = true }
      else if (o >= 0) {
        val b = codec.getOutputBuffer(o)
        if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
        if (b != null && info.size > 0 && started) { b.position(info.offset); b.limit(info.offset + info.size); muxer.writeSampleData(track, b, info) }
        codec.releaseOutputBuffer(o, false)
        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
      }
    }
  }

  override fun finish() {
    var spins = 0
    while (spins++ < 500) {
      val i = codec.dequeueInputBuffer(10000)
      if (i >= 0) { codec.queueInputBuffer(i, 0, 0, frames * 1000000L / rate, MediaCodec.BUFFER_FLAG_END_OF_STREAM); break }
      drain(false)
    }
    drain(true)
    abort()
  }

  override fun abort() {
    try { codec.stop() } catch (e: Throwable) {}
    try { codec.release() } catch (e: Throwable) {}
    try { if (started) muxer.stop() } catch (e: Throwable) {}
    try { muxer.release() } catch (e: Throwable) {}
  }
}

/** Là où part le son fini : 16 bits stéréo entrelacé. */
interface Sink { fun write(pcm: ByteArray, len: Int); fun finish(); fun abort() }

class WavSink(out: File, private val rate: Int) : Sink {
  private val raf = RandomAccessFile(out, "rw").apply { setLength(0); write(ByteArray(44)) }
  private var bytes = 0L
  override fun write(pcm: ByteArray, len: Int) { raf.write(pcm, 0, len); bytes += len }
  override fun finish() {
    val h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    h.put("RIFF".toByteArray()); h.putInt((36 + bytes).toInt()); h.put("WAVEfmt ".toByteArray())
    h.putInt(16); h.putShort(1); h.putShort(2); h.putInt(rate); h.putInt(rate * 4); h.putShort(4); h.putShort(16)
    h.put("data".toByteArray()); h.putInt(bytes.toInt())
    raf.seek(0); raf.write(h.array()); raf.close()
  }
  override fun abort() { try { raf.close() } catch (e: Throwable) {} }
}

/** Vrai MP3 (192 kbit/s), par l'encodeur embarqué. */
object Mp3 {
  // l'encodeur (libshine.so, LGPL) est chargé à part, puis notre code qui l'appelle
  init { System.loadLibrary("shine"); System.loadLibrary("usbiso") }
  @JvmStatic external fun open(path: String, rate: Int, kbps: Int): Long
  @JvmStatic external fun write(h: Long, pcm: ByteArray, len: Int)
  @JvmStatic external fun close(h: Long): Int
}
class Mp3Sink(out: File, rate: Int) : Sink {
  private var h = Mp3.open(out.absolutePath, rate, 192)
  init { if (h == 0L) throw IllegalStateException("MP3 impossible à cette cadence ($rate Hz)") }
  override fun write(pcm: ByteArray, len: Int) { Mp3.write(h, pcm, len) }
  override fun finish() { val r = Mp3.close(h); h = 0L; if (r != 0) throw IllegalStateException("écriture du MP3 impossible (plus de place ?)") }
  override fun abort() { if (h != 0L) { try { Mp3.close(h) } catch (e: Throwable) {}; h = 0L } }
}

object Exporter {
  @Volatile var cancel = false

  /** Le format suit le nom du fichier : .mp3, .m4a, sinon WAV. */
  fun sink(out: File, rate: Int): Sink = when {
    out.name.endsWith(".mp3") -> Mp3Sink(out, rate)
    out.name.endsWith(".m4a") -> AacWriter(out, rate)
    else -> WavSink(out, rate)
  }

  /** Le mix (avec toutes les retouches) de `from` à `to` secondes → un fichier. */
  fun run(engine: MixEngine, out: File, fromSec: Double, toSec: Double, progress: (Double) -> Unit): Map<String, Any?> {
    val r = album(listOf(Song({ engine }, out, fromSec, toSec)), null, 0.0, progress)
    return mapOf("ok" to true, "path" to out.absolutePath, "seconds" to r)
  }

  class Song(val make: () -> MixEngine, val out: File?, val from: Double, val to: Double)

  /** Plusieurs morceaux à la suite : un fichier par morceau (si demandé) et/ou un seul fichier avec tout, séparés par un silence. Rend la durée totale. */
  fun album(songs: List<Song>, full: File?, gapSec: Double, progress: (Double) -> Unit): Double {
    cancel = false
    val pcm = ByteArray(MixEngine.BLOCK * 4)
    var all: Sink? = null
    var one: Sink? = null
    var engine: MixEngine? = null
    var total = 0L
    var rate = 48000
    val made = ArrayList<File>()
    try {
      for ((n, song) in songs.withIndex()) {
        val e = song.make(); engine = e
        if (n == 0) { rate = e.rate; if (full != null) { made.add(full); all = sink(full, rate) } }
        else if (e.rate != rate) throw IllegalStateException("les morceaux n’ont pas tous la même cadence")
        val from = max(0L, (song.from * e.rate).toLong())
        val to = if (song.to > 0) min(e.total, (song.to * e.rate).toLong()) else e.total
        if (to <= from) throw IllegalStateException("rien à exporter")
        if (song.out != null) { made.add(song.out); one = sink(song.out, rate) }
        var pos = from
        var written = 0L
        while (!cancel) {
          val r = e.render(pos, MixEngine.BLOCK, to)
          val got = r[1].toInt()
          if (got <= 0) break
          MixEngine.toPcm(e.outL, e.outR, got, pcm)
          one?.write(pcm, got * 4)
          all?.write(pcm, got * 4)
          written += got
          pos = r[0]
          if ((written / MixEngine.BLOCK) % 40 == 0L) progress((n + (pos - from).toDouble() / (to - from)) / songs.size)
        }
        if (cancel) throw IllegalStateException("annulé")
        if (written == 0L) throw IllegalStateException("rien à exporter (tout est coupé ?)")
        total += written
        one?.finish(); one = null
        e.close(); engine = null
        if (all != null && n < songs.size - 1 && gapSec > 0) {
          java.util.Arrays.fill(pcm, 0)
          var left = (gapSec * rate).toLong()
          while (left > 0) { val k = min(left, MixEngine.BLOCK.toLong()).toInt(); all.write(pcm, k * 4); left -= k }
        }
      }
      all?.finish(); all = null
    } catch (t: Throwable) {
      one?.abort(); all?.abort()
      for (f in made) try { f.delete() } catch (e2: Throwable) {}
      throw t
    } finally {
      engine?.close()
    }
    progress(1.0)
    return total.toDouble() / rate
  }
}

/** Un enregistrement complet (pistes séparées + notes) dans un seul fichier, pour quelqu'un qui a l'appli. */
object Pack {
  @Volatile var cancel = false

  fun make(files: List<File>, notes: String, fromSec: Double, toSec: Double, out: File, progress: (Double) -> Unit) {
    cancel = false
    out.parentFile?.mkdirs()
    val buf = ByteArray(1 shl 16)
    var done = 0L
    val sizes = files.map { f -> val w = Mixer.Wav(f); val a = max(0L, (fromSec * w.rate).toLong()); val b = if (toSec > 0) min(w.frames, (toSec * w.rate).toLong()) else w.frames; Triple(w, a, max(a, b)) }
    val total = max(1L, sizes.sumOf { (it.third - it.second) * it.first.fb })
    try {
      java.util.zip.ZipOutputStream(java.io.BufferedOutputStream(java.io.FileOutputStream(out), 1 shl 16)).use { z ->
        z.setLevel(1)
        z.putNextEntry(java.util.zip.ZipEntry("notes.json")); z.write(notes.toByteArray()); z.closeEntry()
        for ((i, f) in files.withIndex()) {
          val (w, a, b) = sizes[i]
          val bytes = (b - a) * w.fb
          z.putNextEntry(java.util.zip.ZipEntry(f.name))
          val h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
          h.put("RIFF".toByteArray()); h.putInt((36 + bytes).toInt()); h.put("WAVEfmt ".toByteArray())
          h.putInt(16); h.putShort(1); h.putShort(w.channels.toShort()); h.putInt(w.rate); h.putInt(w.rate * w.fb); h.putShort(w.fb.toShort()); h.putShort((w.bps * 8).toShort())
          h.put("data".toByteArray()); h.putInt(bytes.toInt())
          z.write(h.array())
          RandomAccessFile(f, "r").use { raf ->
            raf.seek(44 + a * w.fb)
            var left = bytes
            while (left > 0) {
              if (cancel) throw IllegalStateException("annulé")
              val r = raf.read(buf, 0, min(left, buf.size.toLong()).toInt())
              if (r <= 0) break
              z.write(buf, 0, r); left -= r; done += r
              progress(done.toDouble() / total)
            }
          }
          z.closeEntry()
        }
      }
    } catch (t: Throwable) { try { out.delete() } catch (e: Throwable) {}; throw t }
  }

  /** Ouvrir un tel fichier : les pistes vont dans un nouveau dossier d'enregistrement. Rend son nom. */
  fun open(ctx: Context, zip: File, name: String, progress: (Double) -> Unit): String {
    cancel = false
    var n = RecFiles.clean(name)
    var k = 2
    while (RecFiles.find(ctx, n) != null) n = RecFiles.clean(name).take(54) + " ($k)".also { k++ }
    val dir = RecFiles.sessionDir(ctx, n).first
    val buf = ByteArray(1 shl 16)
    val total = max(1L, zip.length())
    var done = 0L
    var wavs = 0
    var notes = ""
    try {
      java.util.zip.ZipInputStream(BufferedInputStream(FileInputStream(zip), 1 shl 16)).use { z ->
        while (true) {
          val e = z.nextEntry ?: break
          val nm = File(e.name).name // jamais de chemin : seulement le nom
          if (nm == "notes.json") notes = z.readBytes().toString(Charsets.UTF_8)
          else if (nm.endsWith(".wav") && !e.isDirectory) {
            java.io.FileOutputStream(File(dir, nm)).use { o ->
              while (true) {
                if (cancel) throw IllegalStateException("annulé")
                val r = z.read(buf); if (r <= 0) break
                o.write(buf, 0, r); done += r
                progress(min(1.0, done.toDouble() / total))
              }
            }
            wavs++
          }
        }
      }
      if (wavs == 0) throw IllegalStateException("ce fichier ne contient pas d’enregistrement Ma table")
      if (notes.isNotEmpty()) File(RecFiles.metaDir(ctx), dir.name + ".json").writeText(notes)
    } catch (t: Throwable) { try { dir.deleteRecursively() } catch (e: Throwable) {}; throw t }
    return dir.name
  }
}


/** Étudier une piste : son spectre (27 bandes de tiers d'octave), sa dynamique, et la répartition de ses niveaux. */
object Analyzer {
  const val N = 8192
  const val BANDS = 27

  private fun fft(re: FloatArray, im: FloatArray) {
    val n = re.size
    var j = 0
    for (i in 1 until n) {
      var bit = n shr 1
      while (j and bit != 0) { j = j xor bit; bit = bit shr 1 }
      j = j xor bit
      if (i < j) { val tr = re[i]; re[i] = re[j]; re[j] = tr; val ti = im[i]; im[i] = im[j]; im[j] = ti }
    }
    var len = 2
    while (len <= n) {
      val ang = -2 * Math.PI / len
      val wr = cos(ang).toFloat(); val wi = sin(ang).toFloat()
      var i = 0
      while (i < n) {
        var cr = 1f; var cim = 0f
        for (k in 0 until len / 2) {
          val a = i + k; val b = a + len / 2
          val xr = re[b] * cr - im[b] * cim; val xi = re[b] * cim + im[b] * cr
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi
          val ncr = cr * wr - cim * wi; cim = cr * wi + cim * wr; cr = ncr
        }
        i += len
      }
      len = len shl 1
    }
  }

  /** Rend un petit texte JSON ; le résultat est gardé à côté des ondes pour ne pas refaire le calcul. */
  fun get(ctx: Context, wav: File): String {
    val side = File(Peaks.sidecar(ctx, wav).absolutePath.removeSuffix(".pk") + ".an.json")
    if (side.exists() && side.lastModified() >= wav.lastModified() - 5000) return side.readText()
    val w = Mixer.Wav(wav)
    val rate = w.rate
    val win = FloatArray(N) { (0.5 - 0.5 * cos(2 * Math.PI * it / (N - 1))).toFloat() }
    val re = FloatArray(N); val im = FloatArray(N)
    val raw = ByteArray(N * w.fb)
    val bands = DoubleArray(BANDS)
    val hist = IntArray(91)
    var active = 0; var windows = 0; var sumRms = 0.0; var sumCrest = 0.0; var peak = 0f
    val count = min(240L, max(1L, w.frames / N)).toInt()
    val seg = max(1, rate / 100)
    RandomAccessFile(wav, "r").use { raf ->
      for (n in 0 until count) {
        val pos = if (count <= 1) 0L else (w.frames - N) * n / (count - 1)
        if (pos < 0) break
        raf.seek(44 + pos * w.fb)
        var got = 0
        while (got < raw.size) { val r = raf.read(raw, got, raw.size - got); if (r < 0) break; got += r }
        val nf = got / w.fb
        if (nf < N) break
        windows++
        var ss = 0.0; var pk = 0f; var segMax = 0f
        for (i in 0 until N) {
          var x = MixEngine.sample(raw, i * w.fb, w.bps)
          if (w.channels >= 2) x = (x + MixEngine.sample(raw, i * w.fb + w.bps, w.bps)) * 0.5f
          val a = abs(x)
          ss += x.toDouble() * x; if (a > pk) pk = a; if (a > segMax) segMax = a
          if ((i + 1) % seg == 0) { val db = if (segMax <= 0f) -90.0 else 20 * Math.log10(segMax.toDouble()); hist[(db + 90).toInt().coerceIn(0, 90)]++; segMax = 0f }
          re[i] = x * win[i]; im[i] = 0f
        }
        if (pk > peak) peak = pk
        val rms = sqrt(ss / N)
        if (rms < 0.001) continue // sous −60 dB : rien ne joue ici
        active++
        sumRms += rms * rms
        sumCrest += 20 * Math.log10(pk / rms)
        fft(re, im)
        for (b in 0 until BANDS) {
          val fc = 40.0 * Math.pow(2.0, b / 3.0)
          val lo = max(1, (fc / 1.1225 * N / rate).toInt()); val hi = min(N / 2 - 1, (fc * 1.1225 * N / rate).toInt())
          var e = 0.0
          for (k in lo..max(lo, hi)) e += re[k].toDouble() * re[k] + im[k].toDouble() * im[k]
          bands[b] += e
        }
      }
    }
    fun db10(x: Double) = if (x <= 0) -120.0 else 10 * Math.log10(x)
    val sb = StringBuilder("{")
    sb.append("\"bands\":[").append((0 until BANDS).joinToString(",") { String.format(java.util.Locale.US, "%.1f", db10(if (active > 0) bands[it] / active else 0.0)) }).append("],")
    sb.append("\"hist\":[").append(hist.joinToString(",")).append("],")
    sb.append(String.format(java.util.Locale.US, "\"rmsDb\":%.1f,\"peakDb\":%.1f,\"crestDb\":%.1f,\"active\":%.3f,\"rate\":%d}",
      db10(if (active > 0) sumRms / active else 0.0), if (peak <= 0f) -120.0 else 20 * Math.log10(peak.toDouble()), if (active > 0) sumCrest / active else 0.0, if (windows > 0) active.toDouble() / windows else 0.0, rate))
    val json = sb.toString()
    try { side.writeText(json) } catch (e: Throwable) {}
    return json
  }

  /** Le volume moyen du mix tel qu'il sortirait (sur des extraits répartis), pour caler le volume final. */
  fun measure(engine: MixEngine, fromSec: Double = 0.0, toSec: Double = 0.0): Map<String, Any?> {
    val start = max(0L, (fromSec * engine.rate).toLong())
    val total = (if (toSec > 0) min(engine.total, (toSec * engine.rate).toLong()) else engine.total) - start
    val chunk = engine.rate * 3L
    val n = min(14L, max(1L, total / chunk)).toInt()
    var ss = 0.0; var cnt = 0L; var peak = 0f
    for (c in 0 until n) {
      var pos = start + (if (n <= 1) 0L else (total - chunk) * c / (n - 1))
      val end = min(pos + chunk, start + total)
      while (pos < end) {
        val r = engine.render(pos, MixEngine.BLOCK, end)
        val got = r[1].toInt()
        if (got <= 0) break
        var bs = 0.0
        for (i in 0 until got) { val l = engine.outL[i]; val rr = engine.outR[i]; bs += (l.toDouble() * l + rr.toDouble() * rr) * 0.5; val a = max(abs(l), abs(rr)); if (a > peak) peak = a }
        if (bs / got > 1e-5) { ss += bs; cnt += got } // on ne compte que quand ça joue
        pos = r[0]
      }
    }
    engine.close()
    return mapOf("ok" to true, "rmsDb" to (if (cnt > 0) 10 * Math.log10(ss / cnt) else -120.0), "peakDb" to (if (peak > 0f) 20 * Math.log10(peak.toDouble()) else -120.0))
  }
}
