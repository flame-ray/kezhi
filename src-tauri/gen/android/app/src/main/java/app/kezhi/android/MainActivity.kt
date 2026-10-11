package app.kezhi.android

import android.os.Bundle
import android.content.Intent
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var appWebView: WebView? = null
  override fun onWebViewCreate(webView: WebView) { super.onWebViewCreate(webView); appWebView = webView }
  override fun onCreate(savedInstanceState: Bundle?) {
    if (savedInstanceState == null) WidgetNavigation.capture(this, intent)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (WidgetNavigation.capture(this, intent)) appWebView?.post {
      appWebView?.evaluateJavascript("window.dispatchEvent(new Event('kezhi-widget-open'))", null)
    }
  }
}
