package fr.remy.usbaudio

import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbManager
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaPlayer
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

// Enregistrement par la prise USB d'une table de mixage (carte son USB).
// Tout est fait pour TESTER ce que la tablette accepte : appareils vus, nombre de
// voies possible, enregistrement de quelques secondes avec un fichier WAV par voie.
class UsbAudioModule : Module() {
  private fun ctx(): Context = appContext.reactContext?.applicationContext ?: throw IllegalStateException("pas de contexte")
  private fun am(): AudioManager = ctx().getSystemService(Context.AUDIO_SERVICE) as AudioManager

  @Volatile private var stopFlag = false
  @Volatile private var running = false
  private var player: MediaPlayer? = null

  private fun typeName(t: Int): String = when (t) {
    AudioDeviceInfo.TYPE_USB_DEVICE -> "usb"
    AudioDeviceInfo.TYPE_USB_HEADSET -> "usb-casque"
    AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usb-accessoire"
    AudioDeviceInfo.TYPE_BUILTIN_MIC -> "micro-interne"
    AudioDeviceInfo.TYPE_WIRED_HEADSET -> "prise-casque"
    AudioDeviceInfo.TYPE_TELEPHONY -> "telephonie"
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth"
    else -> "type-$t"
  }

  private fun findDevice(id: Int): AudioDeviceInfo? = am().getDevices(AudioManager.GET_DEVICES_INPUTS).firstOrNull { it.id == id }

  private fun encOf(float: Boolean) = if (float) AudioFormat.ENCODING_PCM_FLOAT else AudioFormat.ENCODING_PCM_16BIT

  /** Construit un enregistreur ; renvoie (enregistreur, erreur). */
  private fun build(dev: AudioDeviceInfo?, ch: Int, float: Boolean, rate: Int, src: Int, positional: Boolean): Pair<AudioRecord?, String?> {
    return try {
      val fb = AudioFormat.Builder().setEncoding(encOf(float)).setSampleRate(rate)
      if (positional) fb.setChannelMask(if (ch == 1) AudioFormat.CHANNEL_IN_MONO else AudioFormat.CHANNEL_IN_STEREO)
      else fb.setChannelIndexMask((1 shl ch) - 1)
      val bpf = ch * (if (float) 4 else 2)
      val rec = AudioRecord.Builder().setAudioSource(src).setAudioFormat(fb.build()).setBufferSizeInBytes(max(bpf * rate / 2, 8192)).build()
      if (rec.state != AudioRecord.STATE_INITIALIZED) {
        rec.release()
        Pair(null, "pas initialisé")
      } else {
        if (dev != null) rec.setPreferredDevice(dev)
        Pair(rec, null)
      }
    } catch (e: SecurityException) {
      Pair(null, "permission micro refusée")
    } catch (e: Throwable) {
      Pair(null, (e.javaClass.simpleName + ": " + (e.message ?: "")).take(120))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("UsbAudio")
    Events("onLevels")

    Function("info") {
      mapOf(
        "model" to Build.MODEL,
        "maker" to Build.MANUFACTURER,
        "android" to Build.VERSION.RELEASE,
        "sdk" to Build.VERSION.SDK_INT,
        "outRate" to (am().getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE) ?: ""),
        "dir" to File(ctx().filesDir, "usb-test").absolutePath,
      )
    }

    // Les entrées audio que voit Android (la table doit apparaître en « usb »).
    Function("devices") {
      am().getDevices(AudioManager.GET_DEVICES_INPUTS).map { d ->
        mapOf(
          "id" to d.id,
          "type" to typeName(d.type),
          "product" to (d.productName?.toString() ?: ""),
          "address" to (if (Build.VERSION.SDK_INT >= 28) d.address else ""),
          "channelCounts" to d.channelCounts.toList(),
          "indexMasks" to d.channelIndexMasks.toList(),
          "sampleRates" to d.sampleRates.toList(),
          "encodings" to d.encodings.toList(),
        )
      }
    }

    // Ce que voit le port USB lui-même (descripteurs), sans passer par le son d'Android.
    Function("usbHost") {
      val um = ctx().getSystemService(Context.USB_SERVICE) as? UsbManager
      (um?.deviceList?.values ?: emptyList()).map { d ->
        val ifs = (0 until d.interfaceCount).map { k ->
          val itf = d.getInterface(k)
          mapOf(
            "id" to itf.id,
            "alt" to itf.alternateSetting,
            "cls" to itf.interfaceClass,
            "sub" to itf.interfaceSubclass,
            "proto" to itf.interfaceProtocol,
            "eps" to (0 until itf.endpointCount).map { e ->
              val ep = itf.getEndpoint(e)
              mapOf(
                "addr" to ep.address,
                "in" to (ep.direction == UsbConstants.USB_DIR_IN),
                "type" to ep.type,
                "max" to ep.maxPacketSize,
              )
            },
          )
        }
        val product = try { d.productName ?: "" } catch (e: Throwable) { "" }
        val maker = try { d.manufacturerName ?: "" } catch (e: Throwable) { "" }
        mapOf(
          "name" to d.deviceName,
          "vendor" to d.vendorId,
          "productId" to d.productId,
          "product" to product,
          "maker" to maker,
          "interfaces" to ifs,
        )
      }
    }

    // Essaie d'ouvrir l'entrée avec un nombre de voies donné ; lit 0,3 s pour vérifier.
    AsyncFunction("probe") { o: Map<String, Any?> ->
      val deviceId = num(o, "deviceId", -1); val ch = num(o, "ch", 2); val float = o["float"] == true
      val rate = num(o, "rate", 48000); val src = num(o, "src", 1); val positional = o["positional"] == true
      val dev = findDevice(deviceId)
      val (rec, err) = build(dev, ch, float, rate, src, positional)
      if (rec == null) return@AsyncFunction mapOf("ok" to false, "error" to (err ?: ""))
      var frames = 0
      var routed = ""
      var gotCh = 0
      var gotRate = 0
      var peak = 0f
      var error = ""
      try {
        rec.startRecording()
        if (rec.recordingState != AudioRecord.RECORDSTATE_RECORDING) error = "ne démarre pas"
        val chunk = rate / 20
        val t0 = System.currentTimeMillis()
        if (float) {
          val buf = FloatArray(chunk * ch)
          while (System.currentTimeMillis() - t0 < 300) {
            val n = rec.read(buf, 0, buf.size, AudioRecord.READ_BLOCKING)
            if (n < 0) { error = "lecture $n"; break }
            frames += n / ch
            for (i in 0 until n) peak = max(peak, abs(buf[i]))
          }
        } else {
          val buf = ShortArray(chunk * ch)
          while (System.currentTimeMillis() - t0 < 300) {
            val n = rec.read(buf, 0, buf.size)
            if (n < 0) { error = "lecture $n"; break }
            frames += n / ch
            for (i in 0 until n) peak = max(peak, abs(buf[i].toInt()) / 32768f)
          }
        }
        val rd = rec.routedDevice
        routed = if (rd != null) "${typeName(rd.type)} · ${rd.productName}" else "?"
        gotCh = rec.format.channelCount
        gotRate = rec.sampleRate
        rec.stop()
      } catch (e: Throwable) {
        error = (e.javaClass.simpleName + ": " + (e.message ?: "")).take(120)
      } finally {
        rec.release()
      }
      mapOf("ok" to (error.isEmpty() && frames > 0), "error" to error, "frames" to frames, "routed" to routed, "channels" to gotCh, "rate" to gotRate, "peakDb" to db(peak))
    }

    // Enregistre `seconds` secondes : un WAV 16 bits par voie, et des vumètres en direct.
    AsyncFunction("record") { o: Map<String, Any?>, promise: Promise ->
      val deviceId = num(o, "deviceId", -1); val ch = num(o, "ch", 2); val float = o["float"] == true
      val rate = num(o, "rate", 48000); val src = num(o, "src", 1); val positional = o["positional"] == true
      val seconds = (o["seconds"] as? Number)?.toDouble() ?: 10.0
      if (running) { promise.reject("BUSY", "Un enregistrement est déjà en cours", null); return@AsyncFunction }
      running = true
      stopFlag = false
      Thread {
        try {
          promise.resolve(doRecord(deviceId, ch, float, rate, src, positional, seconds))
        } catch (e: Throwable) {
          promise.reject("ERR", (e.javaClass.simpleName + ": " + (e.message ?: "")).take(200), e)
        } finally {
          running = false
        }
      }.start()
    }

    Function("stop") { stopFlag = true }

    Function("play") { path: String ->
      player?.release()
      player = MediaPlayer().apply {
        setDataSource(path)
        prepare()
        start()
      }
      true
    }

    Function("stopPlay") {
      player?.release()
      player = null
    }

    // Efface les anciens essais (la place sur la tablette).
    Function("clear") {
      File(ctx().filesDir, "usb-test").deleteRecursively()
    }
  }

  private fun num(o: Map<String, Any?>, k: String, d: Int): Int = (o[k] as? Number)?.toInt() ?: d

  private fun db(x: Float): Double = if (x <= 0f) -120.0 else 20.0 * log10(x.toDouble())

  private fun doRecord(deviceId: Int, ch: Int, float: Boolean, rate: Int, src: Int, positional: Boolean, seconds: Double): Map<String, Any?> {
    val dev = findDevice(deviceId)
    val (rec, err) = build(dev, ch, float, rate, src, positional)
    if (rec == null) throw IllegalStateException(err ?: "impossible d'ouvrir l'entrée")
    val stamp = SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.FRANCE).format(Date())
    val dir = File(ctx().filesDir, "usb-test/$stamp").apply { mkdirs() }
    val raw = File(dir, "raw.pcm")
    val out = BufferedOutputStream(FileOutputStream(raw), 1 shl 16)
    val peak = FloatArray(ch)
    val winPeak = FloatArray(ch)
    val sumSq = DoubleArray(ch)
    val clips = IntArray(ch)
    var frames = 0L
    var shortReads = 0
    var readErrors = 0
    val chunk = rate / 50 // 20 ms
    val bytes = ByteBuffer.allocate(chunk * ch * 2).order(ByteOrder.LITTLE_ENDIAN)
    var routed = ""
    var t0 = 0L
    var lastEmit = 0L
    try {
      rec.startRecording()
      t0 = System.currentTimeMillis()
      val fbuf = if (float) FloatArray(chunk * ch) else null
      val sbuf = if (!float) ShortArray(chunk * ch) else null
      while (!stopFlag && System.currentTimeMillis() - t0 < (seconds * 1000).toLong()) {
        val n = if (float) rec.read(fbuf!!, 0, fbuf.size, AudioRecord.READ_BLOCKING) else rec.read(sbuf!!, 0, sbuf.size)
        if (n < 0) { readErrors++; if (readErrors > 20) break; continue }
        if (n < chunk * ch) shortReads++
        val nf = n / ch
        bytes.clear()
        for (f in 0 until nf) {
          for (c in 0 until ch) {
            val i = f * ch + c
            val v: Float = if (float) fbuf!![i] else sbuf!![i] / 32768f
            val a = abs(v)
            if (a > peak[c]) peak[c] = a
            if (a > winPeak[c]) winPeak[c] = a
            if (a >= 0.999f) clips[c]++
            sumSq[c] += (v * v).toDouble()
            val s = (v.coerceIn(-1f, 1f) * 32767f).toInt().toShort()
            bytes.putShort(s)
          }
        }
        out.write(bytes.array(), 0, nf * ch * 2)
        frames += nf
        val now = System.currentTimeMillis()
        if (now - lastEmit >= 100) {
          lastEmit = now
          sendEvent("onLevels", mapOf("peaks" to winPeak.map { db(it) }, "t" to (now - t0)))
          for (c in 0 until ch) winPeak[c] = 0f
        }
      }
      val rd = rec.routedDevice
      routed = if (rd != null) "${typeName(rd.type)} · ${rd.productName}" else "?"
      rec.stop()
    } finally {
      rec.release()
      out.close()
    }
    val elapsed = (System.currentTimeMillis() - t0) / 1000.0
    // un fichier par voie
    val files = (0 until ch).map { c -> File(dir, String.format(Locale.FRANCE, "piste-%02d.wav", c + 1)) }
    val outs = files.map { BufferedOutputStream(FileOutputStream(it), 1 shl 15) }
    try {
      val dataBytes = frames * 2
      for (o in outs) o.write(wavHeader(dataBytes, rate))
      val inp = BufferedInputStream(FileInputStream(raw), 1 shl 16)
      val frame = ByteArray(ch * 2)
      inp.use {
        var k = 0L
        while (k < frames) {
          var got = 0
          while (got < frame.size) {
            val r = it.read(frame, got, frame.size - got)
            if (r < 0) break
            got += r
          }
          if (got < frame.size) break
          for (c in 0 until ch) outs[c].write(frame, c * 2, 2)
          k++
        }
      }
    } finally {
      outs.forEach { it.close() }
      raw.delete()
    }
    return mapOf(
      "dir" to dir.absolutePath,
      "files" to files.map { it.absolutePath },
      "frames" to frames,
      "expected" to (elapsed * rate).toLong(),
      "seconds" to elapsed,
      "rate" to rate,
      "channels" to ch,
      "routed" to routed,
      "shortReads" to shortReads,
      "readErrors" to readErrors,
      "peakDb" to peak.map { db(it) },
      "rmsDb" to (0 until ch).map { c -> if (frames > 0) db(sqrt(sumSq[c] / frames).toFloat()) else -120.0 },
      "clips" to clips.toList(),
    )
  }

  private fun wavHeader(dataBytes: Long, rate: Int): ByteArray {
    val b = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    b.put("RIFF".toByteArray()); b.putInt((36 + dataBytes).toInt()); b.put("WAVE".toByteArray())
    b.put("fmt ".toByteArray()); b.putInt(16); b.putShort(1); b.putShort(1)
    b.putInt(rate); b.putInt(rate * 2); b.putShort(2); b.putShort(16)
    b.put("data".toByteArray()); b.putInt(dataBytes.toInt())
    return b.array()
  }
}
