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

  // ---- enregistrement de concert ----
  @Volatile private var recStopFlag = false
  @Volatile private var recOn = false
  @Volatile private var recInfo: Map<String, Any?> = emptyMap()
  @Volatile private var recStopPromise: Promise? = null
  @Volatile private var mixing = false
  private var live: LivePlayer? = null
  private var liveEngine: MixEngine? = null

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
    Events("onLevels", "onRec", "onMix", "onPlay")

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

    // ---- Lecture directe (quand Android ne propose pas la table comme entrée son) ----

    // Permission USB, descripteurs, fréquence, et 1 s de lecture pour voir si le son arrive.
    AsyncFunction("directProbe") { promise: Promise ->
      if (running) { promise.reject("BUSY", "Un enregistrement est déjà en cours", null); return@AsyncFunction }
      running = true
      Thread {
        try {
          val ud = UsbDirect(ctx())
          val d = ud.findDevice()
          if (d == null) { promise.resolve(mapOf("ok" to false, "error" to "aucune carte son USB vue")); return@Thread }
          if (!ud.ensurePermission(d)) { promise.resolve(mapOf("ok" to false, "error" to "permission USB refusée")); return@Thread }
          val dir = File(ctx().filesDir, "usb-test").apply { mkdirs() }
          val raw = File(dir, "probe.raw")
          val se = ud.open(d, raw)
          val t0 = System.currentTimeMillis()
          Thread.sleep(1000)
          val win = UsbIso.window()
          val st = ud.close(se)
          val el = (System.currentTimeMillis() - t0) / 1000.0
          raw.delete()
          promise.resolve(mapOf(
            "ok" to (st[0] > 0),
            "error" to (if (st[0] > 0) "" else "aucun son reçu (erreur ${st[7]})"),
            "product" to (d.productName ?: ""),
            "ifNum" to se.s.ifNum, "alt" to se.s.alt, "ep" to se.s.ep, "maxPacket" to se.s.maxPacket,
            "channels" to se.s.channels, "subslot" to se.s.subslot, "bits" to se.s.bits, "uac" to se.s.uac,
            "rate" to se.rate, "frames" to st[0], "expected" to (el * (if (se.rate > 0) se.rate else 48000)).toLong(),
            "pktErrors" to st[1], "urbErrors" to st[2], "empty" to st[3], "reaped" to st[4], "odd" to st[5], "submitErrors" to st[6], "lastErrno" to st[7],
            "peakDb" to win.map { db(it) },
          ))
        } catch (e: Throwable) {
          promise.resolve(mapOf("ok" to false, "error" to (e.javaClass.simpleName + ": " + (e.message ?: "")).take(200)))
        } finally {
          running = false
        }
      }.start()
    }

    // Enregistre en direct : un WAV par voie, à la résolution de la table (24 bits).
    AsyncFunction("directRecord") { o: Map<String, Any?>, promise: Promise ->
      if (running) { promise.reject("BUSY", "Un enregistrement est déjà en cours", null); return@AsyncFunction }
      val seconds = (o["seconds"] as? Number)?.toDouble() ?: 10.0
      running = true
      stopFlag = false
      Thread {
        try {
          val ud = UsbDirect(ctx())
          val d = ud.findDevice() ?: throw IllegalStateException("aucune carte son USB vue")
          if (!ud.ensurePermission(d)) throw IllegalStateException("permission USB refusée")
          val stamp = SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.FRANCE).format(Date())
          val dir = File(ctx().filesDir, "usb-test/$stamp").apply { mkdirs() }
          val raw = File(dir, "raw.bin")
          val se = ud.open(d, raw)
          val t0 = System.currentTimeMillis()
          while (!stopFlag && System.currentTimeMillis() - t0 < (seconds * 1000).toLong()) {
            Thread.sleep(100)
            sendEvent("onLevels", mapOf("peaks" to UsbIso.window().map { db(it) }, "t" to (System.currentTimeMillis() - t0)))
          }
          val st = ud.close(se)
          val tot = UsbIso.totals()
          val el = (System.currentTimeMillis() - t0) / 1000.0
          val n = se.s.channels
          val rate = if (se.rate > 0) se.rate else 48000
          val files = ud.split(raw, dir, n, se.s.subslot, rate, st[0])
          raw.delete()
          promise.resolve(mapOf(
            "dir" to dir.absolutePath,
            "files" to files.map { it.absolutePath },
            "frames" to st[0],
            "expected" to (el * rate).toLong(),
            "seconds" to el,
            "rate" to rate,
            "channels" to n,
            "bits" to se.s.subslot * 8,
            "routed" to "direct · ${d.productName ?: "USB"}",
            "shortReads" to st[3],
            "readErrors" to (st[1] + st[2] + st[6]),
            "peakDb" to (0 until n).map { db(tot[it].toFloat()) },
            "rmsDb" to (0 until n).map { db(kotlin.math.sqrt(tot[n + it]).toFloat()) },
            "clips" to (0 until n).map { tot[2 * n + it].toInt() },
          ))
        } catch (e: Throwable) {
          promise.reject("ERR", (e.javaClass.simpleName + ": " + (e.message ?: "")).take(200), e)
        } finally {
          running = false
        }
      }.start()
    }


    // ---- Enregistrement de concert : un fichier par voie choisie, écrit au fil de l'eau ----

    AsyncFunction("recStart") { o: Map<String, Any?>, promise: Promise ->
      if (running || recOn) { promise.resolve(mapOf("ok" to false, "error" to "un enregistrement est déjà en cours")); return@AsyncFunction }
      val name = (o["name"] as? String) ?: "Concert"
      @Suppress("UNCHECKED_CAST")
      val tracks = (o["tracks"] as? List<Map<String, Any?>>) ?: emptyList()
      running = true; recOn = true; recStopFlag = false; recStopPromise = null
      Thread {
        var se: UsbDirect.Session? = null
        val ud = UsbDirect(ctx())
        var wl: android.os.PowerManager.WakeLock? = null
        try {
          val d = ud.findDevice() ?: throw IllegalStateException("la table n’est pas vue sur l’USB")
          if (!ud.ensurePermission(d)) throw IllegalStateException("permission USB refusée")
          val (dir, pub) = RecFiles.sessionDir(ctx(), name)
          val files = ArrayList<String>()
          se = ud.open(d, null, { wav -> Peaks.sidecar(ctx(), File(wav)).absolutePath }) { s ->
            tracks.mapNotNull { t ->
              val a = num(t, "a", -1); val b = num(t, "b", -1)
              if (a < 0 || a >= s.channels || b >= s.channels) null else {
                val f = File(dir, RecFiles.clean((t["file"] as? String) ?: "piste ${a + 1}") + ".wav")
                files.add(f.absolutePath)
                Triple(f.absolutePath, a, b)
              }
            }
          }
          val s0 = se!!
          wl = RecFiles.wakeLock(ctx())
          try { ctx().startService(android.content.Intent(ctx(), RecService::class.java)) } catch (e: Throwable) {}
          val nch = s0.s.channels
          var rate = if (s0.rate > 0) s0.rate else 48000
          var rateKnown = s0.rate > 0
          recInfo = mapOf("dir" to dir.absolutePath, "id" to dir.name)
          promise.resolve(mapOf("ok" to true, "error" to "", "id" to dir.name, "dir" to dir.absolutePath, "public" to pub, "channels" to nch, "bits" to s0.s.subslot * 8, "rate" to rate, "files" to files))
          val t0 = System.currentTimeMillis()
          var alive = true
          while (!recStopFlag && alive) {
            Thread.sleep(250)
            val st = UsbIso.stats()
            val el = (System.currentTimeMillis() - t0) / 1000.0
            if (!rateKnown && el > 3) {
              // la table n'a pas dit sa fréquence : on la mesure (44,1 ou 48 kHz)
              val m = st[0] / el
              rate = if (m < 46000) 44100 else if (m < 68000) 48000 else if (m < 92000) 88200 else 96000
              UsbIso.setRate(rate); rateKnown = true
            }
            alive = st[4] != 0L
            val tot = UsbIso.totals()
            sendEvent("onRec", mapOf(
              "t" to st[0].toDouble() / rate, "peaks" to UsbIso.window().map { db(it) },
              "clips" to (0 until nch).map { tot[2 * nch + it] },
              "usbErrors" to st[1].toDouble(), "writeErrors" to st[3].toDouble(), "holes" to st[6].toDouble(), "alive" to alive, "free" to dir.usableSpace.toDouble(),
            ))
          }
          val asked = recStopFlag
          val st = ud.close(s0)
          se = null
          val tot = UsbIso.totals()
          val sum = mapOf(
            "id" to dir.name, "dir" to dir.absolutePath, "frames" to st[0].toDouble(), "seconds" to st[0].toDouble() / rate, "rate" to rate,
            "channels" to nch, "bits" to s0.s.subslot * 8,
            "peakDb" to (0 until nch).map { db(tot[it].toFloat()) },
            "rmsDb" to (0 until nch).map { db(sqrt(tot[nch + it]).toFloat()) },
            "clips" to (0 until nch).map { tot[2 * nch + it] },
            "usbErrors" to (st[1] + st[2] + st[6]).toDouble(), "writeErrors" to st[8].toDouble(), "lastErrno" to st[7].toDouble(),
            "holes" to (st[9] + st[10]).toDouble(), "maxGapMs" to st[11].toDouble(), "emptyPackets" to st[3].toDouble(),
            "files" to files, "reason" to (if (asked) "" else if (st[8] > 0) "plus de place ou écriture impossible" else "la table ne répond plus sur l’USB (câble ?)"),
          )
          try { android.media.MediaScannerConnection.scanFile(ctx(), files.toTypedArray(), null, null) } catch (e: Throwable) {}
          val p = recStopPromise
          if (p != null) p.resolve(sum)
          sendEvent("onRec", mapOf("ended" to true, "summary" to sum))
        } catch (e: Throwable) {
          val msg = (e.message ?: e.javaClass.simpleName).take(200)
          try { se?.let { ud.close(it) } } catch (e2: Throwable) {}
          try { promise.resolve(mapOf("ok" to false, "error" to msg)) } catch (e2: Throwable) {}
          try { recStopPromise?.resolve(null) } catch (e2: Throwable) {}
          sendEvent("onRec", mapOf("ended" to true, "error" to msg))
        } finally {
          try { wl?.release() } catch (e: Throwable) {}
          try { ctx().stopService(android.content.Intent(ctx(), RecService::class.java)) } catch (e: Throwable) {}
          recStopPromise = null
          recOn = false; running = false
        }
      }.start()
    }

    AsyncFunction("recStop") { promise: Promise ->
      if (!recOn) { promise.resolve(null); return@AsyncFunction }
      recStopPromise = promise
      recStopFlag = true
    }

    Function("recState") { mapOf("on" to recOn, "id" to (recInfo["id"] ?: ""), "dir" to (recInfo["dir"] ?: "")) }

    Function("recFree") {
      val (d, pub) = try { Pair(RecFiles.publicRoot().apply { mkdirs() }, true) } catch (e: Throwable) { Pair(RecFiles.privateRoot(ctx()), false) }
      val dir = if (d.isDirectory) d else RecFiles.privateRoot(ctx()).apply { mkdirs() }
      mapOf("free" to dir.usableSpace.toDouble(), "public" to (pub && d.isDirectory))
    }

    Function("sessList") { RecFiles.list(ctx()) }

    Function("metaSave") { id: String, json: String ->
      try { File(RecFiles.metaDir(ctx()), RecFiles.clean(id) + ".json").writeText(json); true } catch (e: Throwable) { false }
    }

    Function("sessDelete") { id: String ->
      val d = RecFiles.find(ctx(), id)
      val ok = d?.deleteRecursively() ?: false
      File(RecFiles.metaDir(ctx()), id + ".json").delete()
      ok
    }

    Function("fileDelete") { path: String -> try { File(path).delete() } catch (e: Throwable) { false } }

    // Mixage après coup : les pistes séparées → un fichier stéréo.
    AsyncFunction("mix") { o: Map<String, Any?>, promise: Promise ->
      if (mixing) { promise.resolve(mapOf("ok" to false, "error" to "un mixage est déjà en cours")); return@AsyncFunction }
      @Suppress("UNCHECKED_CAST")
      val tracks = (o["tracks"] as? List<Map<String, Any?>>) ?: emptyList()
      val out = File((o["out"] as? String) ?: "")
      val from = (o["from"] as? Number)?.toDouble() ?: 0.0
      val to = (o["to"] as? Number)?.toDouble() ?: 0.0
      mixing = true
      Thread {
        try {
          var last = 0L
          val r = Mixer.mix(
            tracks.map { (it["path"] as? String) ?: "" },
            tracks.map { (it["trim"] as? Number)?.toDouble() ?: 0.0 },
            tracks.map { (it["pan"] as? Number)?.toDouble() ?: 0.0 },
            tracks.map { it["auto"] != false },
            out, from, to, -20.0,
          ) { p ->
            val now = System.currentTimeMillis()
            if (now - last > 200 || p >= 1.0) { last = now; sendEvent("onMix", mapOf("p" to p)) }
          }
          try { android.media.MediaScannerConnection.scanFile(ctx(), arrayOf(out.absolutePath), null, null) } catch (e: Throwable) {}
          promise.resolve(r)
        } catch (e: Throwable) {
          try { out.delete() } catch (e2: Throwable) {}
          promise.resolve(mapOf("ok" to false, "error" to (e.message ?: e.javaClass.simpleName).take(200)))
        } finally {
          mixing = false
        }
      }.start()
    }

    Function("mixCancel") { Mixer.cancel = true; Exporter.cancel = true }

    // ---- Écoute : ondes, lecteur multipiste en direct, export avec les retouches ----

    // L'onde d'un fichier : une crête toutes les 0,2 s, en base64 (255 = a saturé).
    AsyncFunction("peaks") { path: String, promise: Promise ->
      Thread {
        try {
          val f = File(path)
          var last = 0L
          val data = Peaks.get(ctx(), f) { p ->
            val now = System.currentTimeMillis()
            if (now - last > 300) { last = now; sendEvent("onMix", mapOf("p" to p, "peaks" to path)) }
          }
          val w = Mixer.Wav(f)
          promise.resolve(mapOf("ok" to true, "data" to android.util.Base64.encodeToString(data, android.util.Base64.NO_WRAP), "bucket" to Peaks.PKN.toDouble() / w.rate, "seconds" to w.frames.toDouble() / w.rate, "channels" to w.channels))
        } catch (e: Throwable) {
          promise.resolve(mapOf("ok" to false, "error" to (e.message ?: e.javaClass.simpleName).take(200)))
        }
      }.start()
    }

    Function("playerOpen") { paths: List<String> ->
      try {
        player?.release(); player = null
        live?.close(); live = null
        val e = MixEngine(paths)
        liveEngine = e
        live = LivePlayer(e) { t, playing, ended -> sendEvent("onPlay", mapOf("t" to t, "playing" to playing, "ended" to ended)) }
        mapOf("ok" to true, "rate" to e.rate, "seconds" to e.total.toDouble() / e.rate)
      } catch (e: Throwable) {
        mapOf("ok" to false, "error" to (e.message ?: e.javaClass.simpleName).take(200))
      }
    }

    Function("playerSet") { o: Map<String, Any?> -> liveEngine?.params = mixParams(o); true }
    Function("playerPlay") { on: Boolean -> live?.playing = on; true }
    Function("playerSeek") { sec: Double -> live?.seek(sec); true }
    Function("playerClose") { live?.close(); live = null; liveEngine = null; true }

    // Le mix tel qu'on l'entend (ou un passage) → fichier WAV ou M4A.
    AsyncFunction("mixExport") { o: Map<String, Any?>, promise: Promise ->
      if (mixing) { promise.resolve(mapOf("ok" to false, "error" to "un export est déjà en cours")); return@AsyncFunction }
      @Suppress("UNCHECKED_CAST")
      val paths = (o["paths"] as? List<String>) ?: emptyList()
      val out = File((o["out"] as? String) ?: "")
      val m4a = o["m4a"] == true
      val from = (o["from"] as? Number)?.toDouble() ?: 0.0
      val to = (o["to"] as? Number)?.toDouble() ?: 0.0
      mixing = true
      Thread {
        try {
          val e = MixEngine(paths)
          e.params = mixParams(o)
          var last = 0L
          val r = Exporter.run(e, out, m4a, from, to) { p ->
            val now = System.currentTimeMillis()
            if (now - last > 200 || p >= 1.0) { last = now; sendEvent("onMix", mapOf("p" to p)) }
          }
          try { android.media.MediaScannerConnection.scanFile(ctx(), arrayOf(out.absolutePath), null, null) } catch (e2: Throwable) {}
          promise.resolve(r)
        } catch (e: Throwable) {
          try { out.delete() } catch (e2: Throwable) {}
          promise.resolve(mapOf("ok" to false, "error" to (e.message ?: e.javaClass.simpleName).take(200)))
        } finally {
          mixing = false
        }
      }.start()
    }

    Function("playAt") { path: String, ms: Int ->
      player?.release()
      player = MediaPlayer().apply {
        setDataSource(path)
        prepare()
        if (ms > 0) seekTo(ms)
        start()
      }
      true
    }

    // Partager un fichier (par le catalogue de musique d'Android).
    AsyncFunction("share") { path: String, promise: Promise ->
      try {
        val mime = if (path.endsWith(".m4a")) "audio/mp4" else "audio/x-wav"
        android.media.MediaScannerConnection.scanFile(ctx(), arrayOf(path), arrayOf(mime)) { _, uri ->
          try {
            if (uri == null) { promise.resolve(false) } else {
              val send = android.content.Intent(android.content.Intent.ACTION_SEND).setType(mime)
                .putExtra(android.content.Intent.EXTRA_STREAM, uri).addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
              val ch = android.content.Intent.createChooser(send, "Partager").addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
              ctx().startActivity(ch)
              promise.resolve(true)
            }
          } catch (e: Throwable) { promise.resolve(false) }
        }
      } catch (e: Throwable) { promise.resolve(false) }
    }

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

  private fun dbl(x: Any?, d: Double = 0.0): Double = (x as? Number)?.toDouble() ?: d

  @Suppress("UNCHECKED_CAST")
  private fun mixParams(o: Map<String, Any?>): MixEngine.Params {
    val gains = ((o["gains"] as? List<Any?>) ?: emptyList()).map { dbl(it, 1.0).toFloat() }.toFloatArray()
    val pans = ((o["pans"] as? List<Any?>) ?: emptyList()).map { dbl(it).toFloat() }.toFloatArray()
    val kept = ((o["kept"] as? List<Any?>) ?: emptyList()).map { dbl(it) }.toDoubleArray()
    val regs = ((o["regs"] as? List<Map<String, Any?>>) ?: emptyList()).map { MixEngine.Reg(dbl(it["a"]), dbl(it["b"]), dbl(it["g"], 1.0).toFloat(), dbl(it["k"], -1.0).toInt()) }
    val fades = ((o["fades"] as? List<Map<String, Any?>>) ?: emptyList()).map { MixEngine.Fade(dbl(it["a"]), dbl(it["b"]), it["rising"] == true) }
    fun fa(k: String) = ((o[k] as? List<Any?>) ?: emptyList()).map { dbl(it).toFloat() }.toFloatArray()
    return MixEngine.Params(gains, pans, dbl(o["master"], 1.0).toFloat(), kept, regs, fades, fa("hp"), fa("thr"), fa("slope"), fa("makeup"), fa("gate"), o["eq"] == true, o["glue"] == true, o["limit"] == true)
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
