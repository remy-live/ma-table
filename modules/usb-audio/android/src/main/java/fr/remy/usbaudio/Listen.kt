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
  )

  val srcs = paths.map { Src(File(it)) }
  val rate: Int = srcs.firstOrNull()?.w?.rate ?: 48000
  val total: Long = srcs.maxOfOrNull { it.w.frames } ?: 0L
  @Volatile var params = Params()
  private val prev = FloatArray(srcs.size) { -1f }
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
    for (k in srcs.indices) {
      val base = if (k < p.gains.size) p.gains[k] else 1f
      val g1 = base * regionGain(p, k, t) * p.master
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
        for (i in 0 until got) { val v = sample(s.buf, i * fb, bps) * g; outL[i] += v * l; outR[i] += v * r; g += step }
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
class AacWriter(out: File, private val rate: Int) {
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

  fun write(pcm: ByteArray, len: Int) {
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

  fun finish() {
    var spins = 0
    while (spins++ < 500) {
      val i = codec.dequeueInputBuffer(10000)
      if (i >= 0) { codec.queueInputBuffer(i, 0, 0, frames * 1000000L / rate, MediaCodec.BUFFER_FLAG_END_OF_STREAM); break }
      drain(false)
    }
    drain(true)
    abort()
  }

  fun abort() {
    try { codec.stop() } catch (e: Throwable) {}
    try { codec.release() } catch (e: Throwable) {}
    try { if (started) muxer.stop() } catch (e: Throwable) {}
    try { muxer.release() } catch (e: Throwable) {}
  }
}

object Exporter {
  @Volatile var cancel = false

  /** Le mix (avec toutes les retouches) de `from` à `to` secondes → fichier WAV 16 bits ou M4A. */
  fun run(engine: MixEngine, out: File, m4a: Boolean, fromSec: Double, toSec: Double, progress: (Double) -> Unit): Map<String, Any?> {
    cancel = false
    val from = max(0L, (fromSec * engine.rate).toLong())
    val to = if (toSec > 0) min(engine.total, (toSec * engine.rate).toLong()) else engine.total
    if (to <= from) throw IllegalStateException("rien à exporter")
    val pcm = ByteArray(MixEngine.BLOCK * 4)
    var pos = from
    var written = 0L
    var aac: AacWriter? = null
    var raf: RandomAccessFile? = null
    try {
      if (m4a) aac = AacWriter(out, engine.rate) else { raf = RandomAccessFile(out, "rw"); raf.setLength(0); raf.write(ByteArray(44)) }
      while (!cancel) {
        val r = engine.render(pos, MixEngine.BLOCK, to)
        val n = r[1].toInt()
        if (n <= 0) break
        MixEngine.toPcm(engine.outL, engine.outR, n, pcm)
        if (aac != null) aac.write(pcm, n * 4) else raf?.write(pcm, 0, n * 4)
        written += n
        pos = r[0]
        if ((written / MixEngine.BLOCK) % 40 == 0L) progress((pos - from).toDouble() / (to - from))
      }
      if (cancel) throw IllegalStateException("annulé")
      if (written == 0L) throw IllegalStateException("rien à exporter (tout est coupé ?)")
      if (aac != null) { aac.finish(); aac = null } else raf?.let {
        val bytes = written * 4
        val h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        h.put("RIFF".toByteArray()); h.putInt((36 + bytes).toInt()); h.put("WAVEfmt ".toByteArray())
        h.putInt(16); h.putShort(1); h.putShort(2); h.putInt(engine.rate); h.putInt(engine.rate * 4); h.putShort(4); h.putShort(16)
        h.put("data".toByteArray()); h.putInt(bytes.toInt())
        it.seek(0); it.write(h.array())
      }
    } finally {
      aac?.abort()
      try { raf?.close() } catch (e: Throwable) {}
      engine.close()
    }
    progress(1.0)
    return mapOf("ok" to true, "path" to out.absolutePath, "seconds" to written.toDouble() / engine.rate)
  }
}
