package fr.remy.usbaudio

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Le petit pilote en C (usbiso.c). */
object UsbIso {
  init { System.loadLibrary("usbiso") }
  @JvmStatic external fun start(fd: Int, ep: Int, maxp: Int, nch: Int, bps: Int, path: String): Int
  @JvmStatic external fun stop(): LongArray
  @JvmStatic external fun window(): FloatArray
  @JvmStatic external fun totals(): DoubleArray
  @JvmStatic external fun frames(): Long
}

/** Ce qu'on lit dans les descripteurs de la carte son. */
data class Stream(
  val ifNum: Int, val alt: Int, val ep: Int, val maxPacket: Int,
  val channels: Int, val subslot: Int, val bits: Int,
  val acIf: Int, val clockId: Int, val uac: Int,
)

/** Lecture directe d'une carte son USB (sans le son d'Android). */
class UsbDirect(private val ctx: Context) {
  private val um = ctx.getSystemService(Context.USB_SERVICE) as UsbManager

  fun findDevice(): UsbDevice? = um.deviceList.values.firstOrNull { d ->
    (0 until d.interfaceCount).any { k ->
      val i = d.getInterface(k)
      i.interfaceClass == UsbConstants.USB_CLASS_AUDIO && i.interfaceSubclass == 2 &&
        (0 until i.endpointCount).any { e -> i.getEndpoint(e).direction == UsbConstants.USB_DIR_IN && i.getEndpoint(e).type == UsbConstants.USB_ENDPOINT_XFER_ISOC }
    }
  }

  /** Demande la permission USB (une fenêtre s'ouvre) ; attend la réponse jusqu'à 60 s. */
  fun ensurePermission(d: UsbDevice): Boolean {
    if (um.hasPermission(d)) return true
    val action = ctx.packageName + ".USB_PERMISSION"
    val latch = CountDownLatch(1)
    var granted = false
    val rx = object : BroadcastReceiver() {
      override fun onReceive(c: Context?, i: Intent?) {
        granted = i?.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false) ?: false
        latch.countDown()
      }
    }
    val filter = IntentFilter(action)
    if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(rx, filter, Context.RECEIVER_EXPORTED) else ctx.registerReceiver(rx, filter)
    try {
      val flags = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
      val pi = PendingIntent.getBroadcast(ctx, 0, Intent(action).setPackage(ctx.packageName), flags)
      um.requestPermission(d, pi)
      latch.await(60, TimeUnit.SECONDS)
    } finally {
      try { ctx.unregisterReceiver(rx) } catch (e: Exception) {}
    }
    return granted || um.hasPermission(d)
  }

  /** Lit les descripteurs bruts : interface d'entrée, voies, taille des échantillons, horloge. */
  fun parse(raw: ByteArray, d: UsbDevice): Stream? {
    var i = 0
    var curIf = -1; var curAlt = -1; var curCls = -1; var curSub = -1; var curProto = 0
    var configs = 0
    var acIf = 0; var clockId = -1
    val chans = HashMap<String, Int>()
    val sub = HashMap<String, Int>()
    val bits = HashMap<String, Int>()
    while (i + 1 < raw.size) {
      val len = raw[i].toInt() and 0xFF
      if (len < 2 || i + len > raw.size) break
      val type = raw[i + 1].toInt() and 0xFF
      fun b(k: Int) = raw[i + k].toInt() and 0xFF
      when (type) {
        2 -> { configs++; if (configs > 1) break } // on ne lit que la 1re configuration
        4 -> { curIf = b(2); curAlt = b(3); curCls = b(5); curSub = b(6); curProto = b(7); if (curCls == 1 && curSub == 1) acIf = curIf }
        0x24 -> {
          val st = b(2)
          val key = "$curIf/$curAlt"
          if (curCls == 1 && curSub == 1 && st == 0x0A && len >= 4 && clockId < 0) clockId = b(3) // source d'horloge (UAC2)
          if (curCls == 1 && curSub == 2) {
            if (st == 0x01 && curProto == 0x20 && len >= 11) chans[key] = b(10) // AS_GENERAL UAC2 : bNrChannels
            if (st == 0x01 && curProto != 0x20 && len >= 7) { /* UAC1 : voies dans FORMAT_TYPE */ }
            if (st == 0x02) {
              if (curProto == 0x20 && len >= 6) { sub[key] = b(4); bits[key] = b(5) }
              else if (len >= 7) { chans[key] = b(4); sub[key] = b(5); bits[key] = b(6) }
            }
          }
        }
      }
      i += len
    }
    // l'interface d'entrée : celle qui a un point d'arrivée isochrone IN
    for (k in 0 until d.interfaceCount) {
      val itf = d.getInterface(k)
      if (itf.interfaceClass != 1 || itf.interfaceSubclass != 2) continue
      for (e in 0 until itf.endpointCount) {
        val ep = itf.getEndpoint(e)
        if (ep.direction != UsbConstants.USB_DIR_IN || ep.type != UsbConstants.USB_ENDPOINT_XFER_ISOC) continue
        val key = "${itf.id}/${itf.alternateSetting}"
        // maxPacketSize : 11 bits de taille + 2 bits de « paquets en plus par micro-trame »
        val mp = ep.maxPacketSize and 0x7FF
        return Stream(itf.id, itf.alternateSetting, ep.address, mp, chans[key] ?: 0, sub[key] ?: 0, bits[key] ?: 0, acIf, clockId, if (itf.interfaceProtocol == 0x20) 2 else 1)
      }
    }
    return null
  }

  /** Fréquence en cours de la table (UAC2 : GET_CUR sur la source d'horloge). */
  fun rate(c: UsbDeviceConnection, s: Stream): Int {
    if (s.uac != 2 || s.clockId < 0) return 0
    val buf = ByteArray(4)
    val n = c.controlTransfer(0xA1, 0x01, 0x0100, (s.clockId shl 8) or s.acIf, buf, 4, 1000)
    if (n != 4) return 0
    return ByteBuffer.wrap(buf).order(ByteOrder.LITTLE_ENDIAN).int
  }

  private fun itf(d: UsbDevice, id: Int, alt: Int): UsbInterface? =
    (0 until d.interfaceCount).map { d.getInterface(it) }.firstOrNull { it.id == id && it.alternateSetting == alt }

  class Session(val conn: UsbDeviceConnection, val s: Stream, val rate: Int, val idle: UsbInterface?, val active: UsbInterface?, val raw: File)

  /** Ouvre, réclame l'interface (en écartant le pilote du système) et lance la lecture. */
  fun open(d: UsbDevice, raw: File): Session {
    val conn = um.openDevice(d) ?: throw IllegalStateException("impossible d’ouvrir la table (permission ?)")
    val s = parse(conn.rawDescriptors ?: ByteArray(0), d) ?: run { conn.close(); throw IllegalStateException("pas d’entrée son trouvée dans les descripteurs") }
    if (s.channels <= 0 || s.subslot !in 2..4) { conn.close(); throw IllegalStateException("format inattendu : ${s.channels} voies, ${s.subslot} octets") }
    val idle = itf(d, s.ifNum, 0)
    val active = itf(d, s.ifNum, s.alt)
    itf(d, s.acIf, 0)?.let { conn.claimInterface(it, true) }
    if (active == null || !conn.claimInterface(active, true)) { conn.close(); throw IllegalStateException("interface ${s.ifNum} occupée") }
    val r = rate(conn, s)
    if (!conn.setInterface(active)) { conn.releaseInterface(active); conn.close(); throw IllegalStateException("réglage alt ${s.alt} refusé") }
    val res = UsbIso.start(conn.fileDescriptor, s.ep, s.maxPacket, s.channels, s.subslot, raw.absolutePath)
    if (res < 0) {
      idle?.let { conn.setInterface(it) }
      conn.releaseInterface(active); conn.close()
      throw IllegalStateException("lecture refusée (erreur ${-res})")
    }
    return Session(conn, s, r, idle, active, raw)
  }

  fun close(se: Session): LongArray {
    val st = UsbIso.stop()
    try { se.idle?.let { se.conn.setInterface(it) } } catch (e: Exception) {}
    try { se.active?.let { se.conn.releaseInterface(it) } } catch (e: Exception) {}
    try { se.conn.close() } catch (e: Exception) {}
    return st
  }

  /** Le fichier brut (entrelacé) → un WAV par voie, à la résolution de la table (24 bits). */
  fun split(raw: File, dir: File, nch: Int, bps: Int, rate: Int, frames: Long): List<File> {
    val files = (0 until nch).map { File(dir, String.format(Locale.FRANCE, "piste-%02d.wav", it + 1)) }
    val outs = files.map { BufferedOutputStream(FileOutputStream(it), 1 shl 15) }
    try {
      for (o in outs) o.write(wavHeader(frames * bps, rate, bps * 8))
      val fb = nch * bps
      val block = ByteArray(fb * 1024)
      BufferedInputStream(FileInputStream(raw), 1 shl 16).use { inp ->
        var left = frames * fb
        while (left > 0) {
          val want = minOf(block.size.toLong(), left).toInt()
          var got = 0
          while (got < want) { val r = inp.read(block, got, want - got); if (r < 0) break; got += r }
          if (got <= 0) break
          val nf = got / fb
          for (f in 0 until nf) for (c in 0 until nch) outs[c].write(block, f * fb + c * bps, bps)
          left -= got
          if (got < want) break
        }
      }
    } finally {
      outs.forEach { it.close() }
    }
    return files
  }

  companion object {
    fun wavHeader(dataBytes: Long, rate: Int, bits: Int): ByteArray {
      val ba = bits / 8
      val b = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
      b.put("RIFF".toByteArray()); b.putInt((36 + dataBytes).toInt()); b.put("WAVE".toByteArray())
      b.put("fmt ".toByteArray()); b.putInt(16); b.putShort(1); b.putShort(1)
      b.putInt(rate); b.putInt(rate * ba); b.putShort(ba.toShort()); b.putShort(bits.toShort())
      b.put("data".toByteArray()); b.putInt(dataBytes.toInt())
      return b.array()
    }
  }
}
