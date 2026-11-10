package fr.remy.wifiscan

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.LocationManager
import android.net.wifi.ScanResult
import android.net.wifi.WifiManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

// Liste des réseaux Wi-Fi vus par le téléphone (Android seulement).
// On lance une recherche et on attend sa fin (jusqu'à 6 s) avant de lire les résultats.
class WifiScanModule : Module() {
  private fun ctx(): Context? = appContext.reactContext?.applicationContext
  private fun wifi(): WifiManager? = ctx()?.getSystemService(Context.WIFI_SERVICE) as? WifiManager

  private fun locationOn(c: Context): Boolean {
    val lm = c.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return true
    return if (Build.VERSION.SDK_INT >= 28) lm.isLocationEnabled else true
  }

  override fun definition() = ModuleDefinition {
    Name("WifiScan")

    AsyncFunction("scanFull") {
      val c = ctx()
      val wm = wifi()
      val nets = mutableListOf<Map<String, Any>>()
      var started = false
      var fresh = false
      var locOn = true
      if (c != null && wm != null) {
        locOn = locationOn(c)
        val latch = CountDownLatch(1)
        val rx = object : BroadcastReceiver() {
          override fun onReceive(context: Context?, intent: Intent?) {
            fresh = intent?.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, false) ?: false
            latch.countDown()
          }
        }
        val filter = IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
        try {
          if (Build.VERSION.SDK_INT >= 33) c.registerReceiver(rx, filter, Context.RECEIVER_EXPORTED) else c.registerReceiver(rx, filter)
          @Suppress("DEPRECATION")
          started = wm.startScan()
          if (started) latch.await(6, TimeUnit.SECONDS)
        } catch (e: Exception) {
        } finally {
          try { c.unregisterReceiver(rx) } catch (e: Exception) {}
        }
        val res: List<ScanResult> = try {
          wm.scanResults ?: emptyList()
        } catch (e: SecurityException) {
          emptyList()
        }
        for (r in res) {
          @Suppress("DEPRECATION")
          val name = r.SSID ?: ""
          nets.add(mapOf("ssid" to name, "level" to r.level, "freq" to r.frequency))
        }
      }
      mapOf("nets" to nets, "started" to started, "fresh" to fresh, "locationOn" to locOn, "wifiOn" to (wm?.isWifiEnabled ?: false))
    }

    AsyncFunction("scan") {
      val wm = wifi()
      val out = mutableListOf<Map<String, Any>>()
      if (wm != null) {
        val res: List<ScanResult> = try { wm.scanResults ?: emptyList() } catch (e: SecurityException) { emptyList() }
        for (r in res) {
          @Suppress("DEPRECATION")
          out.add(mapOf("ssid" to (r.SSID ?: ""), "level" to r.level, "freq" to r.frequency))
        }
      }
      out
    }

    Function("current") {
      val wm = wifi()
      var name = ""
      try {
        @Suppress("DEPRECATION")
        name = wm?.connectionInfo?.ssid ?: ""
      } catch (e: Exception) {
      }
      name.trim('"').let { if (it == "<unknown ssid>") "" else it }
    }
  }
}
