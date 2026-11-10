package fr.remy.immersive

import android.os.Handler
import android.os.Looper
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Barre de navigation Android :
//  - set(true)   essaie de la cacher (mode immersif ; certains constructeurs refusent)
//  - bottomInset() dit la place qu'elle prend VRAIMENT en bas, pour que l'appli
//    remonte son contenu au-dessus quand elle reste affichée.
class ImmersiveModule : Module() {
  private var wanted = false
  private val handler = Handler(Looper.getMainLooper())

  private fun apply(on: Boolean, attempt: Int = 0) {
    val activity = appContext.currentActivity
    if (activity == null) {
      if (attempt < 20) handler.postDelayed({ apply(on, attempt + 1) }, 250)
      return
    }
    activity.runOnUiThread {
      try {
        val window = activity.window
        val c = WindowCompat.getInsetsController(window, window.decorView)
        if (on) {
          c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
          c.hide(WindowInsetsCompat.Type.navigationBars())
        } else {
          c.show(WindowInsetsCompat.Type.navigationBars())
        }
      } catch (e: Exception) {
      }
    }
  }

  /** Hauteur (en dp) de ce qui recouvre le bas de l'appli : barre de navigation visible, sinon 0. */
  private fun inset(): Double {
    val activity = appContext.currentActivity ?: return 0.0
    return try {
      val decor = activity.window.decorView
      val insets = ViewCompat.getRootWindowInsets(decor) ?: return 0.0
      if (!insets.isVisible(WindowInsetsCompat.Type.navigationBars())) return 0.0
      val px = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
      // si la fenêtre de l'appli s'arrête déjà au-dessus de la barre, rien à ajouter
      val content = activity.findViewById<android.view.View>(android.R.id.content)
      val loc = IntArray(2)
      content.getLocationOnScreen(loc)
      val overlap = (loc[1] + content.height) - (decor.height - px)
      val need = if (overlap > 0) minOf(px, overlap) else 0
      need / activity.resources.displayMetrics.density.toDouble()
    } catch (e: Exception) {
      0.0
    }
  }

  override fun definition() = ModuleDefinition {
    Name("Immersive")
    Function("set") { on: Boolean -> wanted = on; apply(on) }
    Function("bottomInset") { inset() }
    OnActivityEntersForeground { if (wanted) handler.postDelayed({ apply(true) }, 300) }
  }
}
