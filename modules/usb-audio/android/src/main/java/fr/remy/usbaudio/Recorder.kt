package fr.remy.usbaudio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Environment
import android.os.IBinder
import android.os.PowerManager
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Garde l'appli en vie pendant un enregistrement de concert (écran éteint, appli derrière une autre). */
class RecService : Service() {
  override fun onBind(i: Intent?): IBinder? = null

  override fun onStartCommand(i: Intent?, flags: Int, id: Int): Int {
    try {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val b = if (Build.VERSION.SDK_INT >= 26) {
        nm.createNotificationChannel(NotificationChannel("rec", "Enregistrement", NotificationManager.IMPORTANCE_LOW))
        Notification.Builder(this, "rec")
      } else {
        @Suppress("DEPRECATION") Notification.Builder(this)
      }
      val n = b.setContentTitle("Ma table enregistre").setContentText("Enregistrement du concert en cours")
        .setSmallIcon(android.R.drawable.ic_btn_speak_now).setOngoing(true).build()
      if (Build.VERSION.SDK_INT >= 29) startForeground(71, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE) else startForeground(71, n)
    } catch (e: Throwable) {
      // pas de premier plan possible : l'enregistrement continue quand même tant que l'appli est devant
    }
    return START_NOT_STICKY
  }
}

/** Où ranger les concerts, et les outils autour (liste, notes, place libre). */
object RecFiles {
  fun publicRoot(): File = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "Ma table")
  fun privateRoot(ctx: Context): File = File(ctx.getExternalFilesDir(null) ?: ctx.filesDir, "Enregistrements")
  fun metaDir(ctx: Context): File = File(ctx.filesDir, "rec-meta").apply { mkdirs() }

  fun clean(name: String): String = name.replace(Regex("[\\\\/:*?\"<>|\\n\\r\\t]"), " ").replace(Regex("\\s+"), " ").trim().take(60).ifEmpty { "Concert" }

  /** Le dossier du concert : dans Musique/Ma table si la tablette l'accepte, sinon dans le dossier de l'appli. */
  fun sessionDir(ctx: Context, name: String): Pair<File, Boolean> {
    val n = clean(name)
    try {
      val d = File(publicRoot(), n)
      d.mkdirs()
      val t = File(d, "essai.wav")
      FileOutputStream(t).use { it.write(ByteArray(4)) }
      t.delete()
      return Pair(d, true)
    } catch (e: Throwable) {
      val d = File(privateRoot(ctx), n)
      d.mkdirs()
      return Pair(d, false)
    }
  }

  fun find(ctx: Context, id: String): File? = listOf(File(publicRoot(), id), File(privateRoot(ctx), id)).firstOrNull { it.isDirectory }

  fun list(ctx: Context): List<Map<String, Any?>> {
    val out = ArrayList<Map<String, Any?>>()
    for ((root, pub) in listOf(Pair(publicRoot(), true), Pair(privateRoot(ctx), false))) {
      val dirs = try { root.listFiles { f -> f.isDirectory } } catch (e: Throwable) { null } ?: continue
      for (d in dirs) {
        val wavs = (d.listFiles { f -> f.isFile && (f.name.endsWith(".wav") || f.name.endsWith(".m4a") || f.name.endsWith(".mp3")) } ?: emptyArray()).sortedBy { it.name }
        if (wavs.isEmpty()) continue
        val meta = File(metaDir(ctx), d.name + ".json")
        out.add(mapOf(
          "id" to d.name, "dir" to d.absolutePath, "public" to pub, "modified" to d.lastModified().toDouble(),
          "meta" to (try { if (meta.exists()) meta.readText() else "" } catch (e: Throwable) { "" }),
          "files" to wavs.map { mapOf("name" to it.name, "path" to it.absolutePath, "size" to it.length().toDouble()) },
        ))
      }
    }
    return out.sortedByDescending { it["modified"] as Double }
  }

  fun wakeLock(ctx: Context): PowerManager.WakeLock? = try {
    (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "matable:rec").apply { setReferenceCounted(false); acquire(8 * 3600 * 1000L) }
  } catch (e: Throwable) { null }
}

/** Mixage après coup : les pistes séparées → un fichier stéréo 16 bits. */
object Mixer {
  @Volatile var cancel = false

  class Wav(val f: File) {
    var channels = 1; var rate = 48000; var bps = 3; var frames = 0L
    init {
      val h = ByteArray(44)
      FileInputStream(f).use { it.read(h) }
      val b = ByteBuffer.wrap(h).order(ByteOrder.LITTLE_ENDIAN)
      channels = max(1, b.getShort(22).toInt())
      rate = b.getInt(24)
      bps = max(2, b.getShort(34).toInt() / 8)
      frames = max(0L, f.length() - 44) / (channels * bps) // la taille du fichier fait foi (en-tête parfois en retard)
    }
    val fb get() = channels * bps
  }

  /** Lit des blocs d'une piste, en mono (les deux côtés d'une piste stéréo sont moyennés). */
  class Reader(val w: Wav, from: Long) {
    private val inp = BufferedInputStream(FileInputStream(w.f), 1 shl 16)
    private val raw = ByteArray(BLOCK * w.fb)
    init { skipFully(44 + from * w.fb) }
    private fun skipFully(n: Long) { var left = n; while (left > 0) { val s = inp.skip(left); if (s <= 0) break; left -= s } }
    fun read(dst: FloatArray, want: Int): Int {
      var got = 0
      val need = want * w.fb
      while (got < need) { val r = inp.read(raw, got, need - got); if (r < 0) break; got += r }
      val nf = got / w.fb
      val bps = w.bps
      for (f in 0 until nf) {
        var acc = 0f
        for (c in 0 until w.channels) {
          val o = f * w.fb + c * bps
          acc += when (bps) {
            3 -> { var s = (raw[o].toInt() and 0xFF) or ((raw[o + 1].toInt() and 0xFF) shl 8) or (raw[o + 2].toInt() shl 16); s / 8388608f }
            4 -> { val s = (raw[o].toInt() and 0xFF) or ((raw[o + 1].toInt() and 0xFF) shl 8) or ((raw[o + 2].toInt() and 0xFF) shl 16) or (raw[o + 3].toInt() shl 24); s / 2147483648f }
            else -> { val s = (raw[o].toInt() and 0xFF) or (raw[o + 1].toInt() shl 8); s / 32768f }
          }
        }
        dst[f] = acc / w.channels
      }
      return nf
    }
    fun close() { try { inp.close() } catch (e: Throwable) {} }
  }

  const val BLOCK = 4800
  private fun db(x: Double): Double = if (x <= 0.0) -120.0 else 20.0 * log10(x)

  /**
   * tracks : chemin, réglage en dB (ajouté au niveau automatique, ou seul si auto = false), panoramique −1..1.
   * Rend le fichier, les gains appliqués (null = piste vide) et la crête avant mise à niveau.
   */
  fun mix(paths: List<String>, trims: List<Double>, pans: List<Double>, autos: List<Boolean>, out: File, fromSec: Double, toSec: Double, target: Double, progress: (Double) -> Unit): Map<String, Any?> {
    cancel = false
    val wavs = paths.map { Wav(File(it)) }
    if (wavs.isEmpty()) throw IllegalStateException("aucune piste")
    val rate = wavs[0].rate
    val from = max(0L, (fromSec * rate).toLong())
    val maxFrames = wavs.maxOf { it.frames }
    val to = if (toSec > 0) min(maxFrames, (toSec * rate).toLong()) else maxFrames
    val total = max(0L, to - from)
    if (total <= 0) throw IllegalStateException("rien à mixer")
    val n = wavs.size
    val buf = FloatArray(BLOCK)

    // 1) le niveau « quand ça joue » de chaque piste (on ignore les silences)
    val gains = DoubleArray(n)
    val shown = arrayOfNulls<Double>(n)
    for (k in 0 until n) {
      if (cancel) throw IllegalStateException("annulé")
      var g = 10.0.pow(trims[k] / 20.0)
      if (autos[k]) {
        val r = Reader(wavs[k], from)
        var left = min(total, max(0L, wavs[k].frames - from)); var sum = 0.0; var cnt = 0L
        while (left > 0 && !cancel) {
          val got = r.read(buf, min(BLOCK.toLong(), left).toInt())
          if (got <= 0) break
          var s = 0.0
          for (i in 0 until got) s += buf[i].toDouble() * buf[i]
          if (s / got > 1e-5) { sum += s; cnt += got } // au-dessus de −50 dB : ça joue
          left -= got
        }
        r.close()
        if (cnt < rate / 2) { g = 0.0 } else {
          val level = db(sqrt(sum / cnt))
          g = 10.0.pow((min(40.0, target - level) + trims[k]) / 20.0)
        }
      }
      gains[k] = g
      shown[k] = if (g > 0) db(g) else null
      progress(0.3 * (k + 1) / n)
    }

    val gl = DoubleArray(n) { gains[it] * cos((pans[it].coerceIn(-1.0, 1.0) + 1) * PI / 4) }
    val gr = DoubleArray(n) { gains[it] * sin((pans[it].coerceIn(-1.0, 1.0) + 1) * PI / 4) }
    val L = FloatArray(BLOCK); val R = FloatArray(BLOCK)

    fun pass(write: ((FloatArray, FloatArray, Int) -> Unit)?, p0: Double, p1: Double): Double {
      val rs = wavs.map { Reader(it, from) }
      var peak = 0.0
      var done = 0L
      try {
        while (done < total && !cancel) {
          val want = min(BLOCK.toLong(), total - done).toInt()
          java.util.Arrays.fill(L, 0, want, 0f); java.util.Arrays.fill(R, 0, want, 0f)
          for (k in 0 until n) {
            if (gains[k] <= 0) continue
            val got = rs[k].read(buf, want)
            val a = gl[k].toFloat(); val b = gr[k].toFloat()
            for (i in 0 until got) { L[i] += buf[i] * a; R[i] += buf[i] * b }
          }
          if (write != null) write(L, R, want) else for (i in 0 until want) { val m = max(abs(L[i]), abs(R[i])).toDouble(); if (m > peak) peak = m }
          done += want
          if ((done / BLOCK) % 50 == 0L) progress(p0 + (p1 - p0) * done / total)
        }
      } finally { rs.forEach { it.close() } }
      if (cancel) throw IllegalStateException("annulé")
      return peak
    }

    // 2) la crête du mélange, 3) l'écriture, remise à −1 dB (sans jamais monter de plus de 12 dB)
    val peak = pass(null, 0.3, 0.65)
    val scale = if (peak > 0) min(4.0, 0.891 / peak).toFloat() else 1f
    val bytes = total * 4
    BufferedOutputStream(FileOutputStream(out), 1 shl 16).use { o ->
      val h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
      h.put("RIFF".toByteArray()); h.putInt((36 + bytes).toInt()); h.put("WAVEfmt ".toByteArray())
      h.putInt(16); h.putShort(1); h.putShort(2); h.putInt(rate); h.putInt(rate * 4); h.putShort(4); h.putShort(16)
      h.put("data".toByteArray()); h.putInt(bytes.toInt())
      o.write(h.array())
      val ob = ByteArray(BLOCK * 4)
      pass({ l, r, cnt ->
        var p = 0
        for (i in 0 until cnt) {
          val a = (l[i] * scale * 32767f).toInt().coerceIn(-32768, 32767)
          val b = (r[i] * scale * 32767f).toInt().coerceIn(-32768, 32767)
          ob[p++] = a.toByte(); ob[p++] = (a shr 8).toByte(); ob[p++] = b.toByte(); ob[p++] = (b shr 8).toByte()
        }
        o.write(ob, 0, p)
      }, 0.65, 1.0)
    }
    progress(1.0)
    return mapOf("ok" to true, "path" to out.absolutePath, "gains" to shown.toList(), "peakDb" to db(peak), "seconds" to total.toDouble() / rate)
  }
}
