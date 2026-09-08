package app.kezhi.android

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Dialog
import android.content.res.ColorStateList
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.net.http.SslError
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.Locale
import org.json.JSONTokener

@InvokeArg
class SchoolLoginOpenArgs {
  lateinit var url: String
  lateinit var allowedHost: String
  lateinit var accountId: String
  lateinit var mode: String
}

@TauriPlugin
class SchoolLoginPlugin(private val activity: Activity) : Plugin(activity) {
  private var dialog: Dialog? = null
  private var loginWebView: WebView? = null
  private var importButton: Button? = null
  private var statusText: TextView? = null
  private var allowedHost = ""
  private var currentAccountId = ""
  private var currentMode = "schedule"
  private var confirmed = false
  private var confirmedCookieHeader = ""
  private var confirmedCurrentUrl = ""
  private var confirmedUserAgent = ""
  private var confirmedPageSnapshot = ""

  @Command
  fun open(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(SchoolLoginOpenArgs::class.java)
    } catch (error: Exception) {
      invoke.reject("登录参数无效", error)
      return
    }
    val uri = Uri.parse(args.url)
    val host = uri.host?.lowercase(Locale.ROOT)
    if (uri.scheme != "https" || host != args.allowedHost.lowercase(Locale.ROOT)) {
      invoke.reject("学校登录网址未通过安全校验")
      return
    }

    activity.runOnUiThread {
      val accountChanged = currentAccountId.isNotEmpty() && currentAccountId != args.accountId
      currentAccountId = args.accountId
      currentMode = if (args.mode == "selection") "selection" else "schedule"
      allowedHost = args.allowedHost.lowercase(Locale.ROOT)
      confirmed = false
      confirmedCookieHeader = ""
      confirmedCurrentUrl = ""
      confirmedUserAgent = ""
      confirmedPageSnapshot = ""
      disposeDialog()

      if (accountChanged) {
        CookieManager.getInstance().removeAllCookies {
          CookieManager.getInstance().flush()
          activity.runOnUiThread { createLoginDialog(args.url, invoke) }
        }
      } else {
        createLoginDialog(args.url, invoke)
      }
    }
  }

  @Command
  fun status(invoke: Invoke) {
    activity.runOnUiThread {
      val currentUrl = confirmedCurrentUrl.ifEmpty { loginWebView?.url ?: "" }
      val cookieHeader = if (confirmedCookieHeader.isNotEmpty()) confirmedCookieHeader else readCookies(currentUrl)
      val response = JSObject().apply {
        put("windowOpen", dialog?.isShowing == true || confirmed)
        put("authenticated", confirmed && (currentMode == "selection" || cookieHeader.isNotEmpty()))
        put("cookieHeader", cookieHeader)
        put("currentUrl", currentUrl)
        put("userAgent", confirmedUserAgent.ifEmpty { loginWebView?.settings?.userAgentString ?: "Kezhi Android" })
        put("accountId", currentAccountId)
        put("pageSnapshot", confirmedPageSnapshot)
      }
      invoke.resolve(response)
    }
  }

  @Command
  fun close(invoke: Invoke) {
    activity.runOnUiThread {
      dialog?.dismiss()
      invoke.resolve()
    }
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun createLoginDialog(url: String, invoke: Invoke) {
    try {
      val density = activity.resources.displayMetrics.density
      fun dp(value: Int) = (value * density).toInt()

      val nextDialog = Dialog(activity, android.R.style.Theme_Material_Light_NoActionBar)
      val root = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(Color.WHITE)
      }
      val toolbar = LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(12), dp(8), dp(12), dp(8))
        setBackgroundColor(Color.rgb(246, 247, 251))
        elevation = dp(4).toFloat()
      }
      val closeButton = Button(activity).apply {
        text = "关闭"
        isAllCaps = false
        setTextColor(Color.rgb(78, 83, 96))
        backgroundTintList = ColorStateList.valueOf(Color.rgb(232, 234, 241))
      }
      val labels = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(10), 0, dp(8), 0)
      }
      val title = TextView(activity).apply {
        text = if (currentMode == "selection") "学校选课学习" else "学校官方登录"
        textSize = 16f
        setTextColor(Color.rgb(30, 33, 41))
      }
      val nextStatusText = TextView(activity).apply {
        text = if (currentMode == "selection") "登录后进入选课页并查询一次" else "登录成功后可直接导入"
        textSize = 11f
        setTextColor(Color.rgb(113, 118, 132))
      }
      labels.addView(title)
      labels.addView(nextStatusText)
      val nextImportButton = Button(activity).apply {
        text = if (currentMode == "selection") "已进入选课页，完成学习" else "登录完成，导入课表"
        isAllCaps = false
        textSize = 14f
        setTextColor(Color.WHITE)
        backgroundTintList = ColorStateList.valueOf(Color.rgb(74, 94, 224))
        visibility = View.GONE
        elevation = dp(5).toFloat()
      }
      toolbar.addView(closeButton, LinearLayout.LayoutParams(dp(72), dp(48)))
      toolbar.addView(labels, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
      toolbar.addView(nextImportButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(48)))

      val webView = WebView(activity)
      webView.settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        databaseEnabled = true
        allowFileAccess = false
        allowContentAccess = false
        allowFileAccessFromFileURLs = false
        allowUniversalAccessFromFileURLs = false
        javaScriptCanOpenWindowsAutomatically = false
        setSupportMultipleWindows(false)
        mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        userAgentString = "$userAgentString Kezhi/0.4.1"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
      }
      val cookies = CookieManager.getInstance()
      cookies.setAcceptCookie(true)
      cookies.setAcceptThirdPartyCookies(webView, false)
      webView.webChromeClient = WebChromeClient()
      webView.webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
          val next = request.url
          return next.scheme != "https" || next.host?.lowercase(Locale.ROOT) != allowedHost
        }

        @Suppress("DEPRECATION")
        override fun shouldOverrideUrlLoading(view: WebView, nextUrl: String): Boolean {
          val next = Uri.parse(nextUrl)
          return next.scheme != "https" || next.host?.lowercase(Locale.ROOT) != allowedHost
        }

        override fun onPageFinished(view: WebView, finishedUrl: String) {
          super.onPageFinished(view, finishedUrl)
          CookieManager.getInstance().flush()
          updateLoginState(finishedUrl)
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
          handler.cancel()
          nextStatusText.text = "证书校验失败，已停止加载"
          nextStatusText.setTextColor(Color.rgb(183, 69, 50))
        }
      }

      closeButton.setOnClickListener { nextDialog.dismiss() }
      nextImportButton.setOnClickListener {
        val currentUrl = webView.url ?: ""
        val cookieHeader = readCookies(currentUrl)
        if (currentMode == "selection") {
          if (!isLearnablePage(currentUrl)) return@setOnClickListener
          capturePageSnapshot(webView) { snapshot ->
            confirmedCookieHeader = cookieHeader
            confirmedCurrentUrl = currentUrl
            confirmedUserAgent = webView.settings.userAgentString
            confirmedPageSnapshot = snapshot
            confirmed = true
            CookieManager.getInstance().flush()
            nextDialog.dismiss()
          }
        } else {
          if (!isLoggedIn(currentUrl, cookieHeader)) return@setOnClickListener
          confirmedCookieHeader = cookieHeader
          confirmedCurrentUrl = currentUrl
          confirmedUserAgent = webView.settings.userAgentString
          confirmed = true
          CookieManager.getInstance().flush()
          nextDialog.dismiss()
        }
      }
      nextDialog.setOnKeyListener { _, keyCode, event ->
        if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP && webView.canGoBack()) {
          webView.goBack()
          true
        } else {
          false
        }
      }
      nextDialog.setOnDismissListener {
        if (!confirmed) {
          loginWebView?.stopLoading()
          loginWebView?.destroy()
          loginWebView = null
        }
      }
      root.addView(toolbar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(64)))
      root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
      nextDialog.setContentView(root)
      nextDialog.show()
      nextDialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)

      dialog = nextDialog
      loginWebView = webView
      importButton = nextImportButton
      statusText = nextStatusText
      webView.loadUrl(url)
      invoke.resolve()
    } catch (error: Exception) {
      disposeDialog()
      invoke.reject("无法打开学校登录页", error)
    }
  }

  private fun updateLoginState(url: String) {
    val ready = if (currentMode == "selection") isLearnablePage(url) else isLoggedIn(url, readCookies(url))
    importButton?.visibility = if (ready) View.VISIBLE else View.GONE
    statusText?.apply {
      text = if (currentMode == "selection") {
        if (ready) "请完成一次课程查询，再点击右侧按钮" else "请在下方登录并进入选课页"
      } else if (ready) "已检测到登录，可开始导入" else "请在下方完成登录"
      setTextColor(if (ready) Color.rgb(42, 127, 105) else Color.rgb(113, 118, 132))
    }
  }

  private fun isLearnablePage(url: String): Boolean {
    val uri = Uri.parse(url)
    return uri.scheme == "https" && uri.host?.lowercase(Locale.ROOT) == allowedHost
  }

  private fun capturePageSnapshot(webView: WebView, complete: (String) -> Unit) {
    val script = """
      (() => {
        const clean = (value, max = 120) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
        const sameOrigin = (value) => {
          try {
            const url = new URL(value || location.href, location.href);
            return url.protocol === 'https:' && url.origin === location.origin ? url.href : '';
          } catch (_) { return ''; }
        };
        const forms = Array.from(document.forms).slice(0, 40).map((form) => ({
          action: sameOrigin(form.action || location.href),
          method: clean(form.method || 'GET', 12).toUpperCase(),
          fields: Array.from(form.elements).map((field) => clean(field.name || field.id, 80)).filter(Boolean).slice(0, 40),
        })).filter((form) => form.action);
        const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 240).map((link) => ({
          url: sameOrigin(link.href), text: clean(link.innerText || link.getAttribute('aria-label'), 100),
        })).filter((link) => link.url);
        const resources = performance.getEntriesByType('resource').slice(-300).map((entry) => ({
          url: sameOrigin(entry.name), initiatorType: clean(entry.initiatorType, 30),
        })).filter((entry) => entry.url && ['fetch', 'xmlhttprequest', 'script', 'iframe'].includes(entry.initiatorType));
        const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"],nav button')).slice(0, 80).map((node) => clean(node.innerText || node.textContent, 120)).filter(Boolean);
        return JSON.stringify({ pageUrl: location.href, title: clean(document.title, 160), headings, forms, links, resources });
      })()
    """.trimIndent()
    webView.evaluateJavascript(script) { result ->
      val decoded = try { JSONTokener(result).nextValue() as? String ?: "" } catch (_: Exception) { "" }
      complete(decoded.take(200_000))
    }
  }

  private fun isLoggedIn(url: String, cookieHeader: String): Boolean {
    val uri = Uri.parse(url)
    val sameHost = uri.scheme == "https" && uri.host?.lowercase(Locale.ROOT) == allowedHost
    val leftLoginPage = !uri.path.orEmpty().lowercase(Locale.ROOT).contains("login")
    val hasSession = cookieHeader.split(';').any { part ->
      val name = part.substringBefore('=').trim().lowercase(Locale.ROOT)
      name == "jsessionid" || name == "session" || name == "sessionid"
    }
    return sameHost && leftLoginPage && hasSession
  }

  private fun readCookies(currentUrl: String? = loginWebView?.url): String {
    if (allowedHost.isEmpty()) return ""
    val candidate = Uri.parse(currentUrl.orEmpty())
    val safeUrl = if (
      candidate.scheme == "https" && candidate.host?.lowercase(Locale.ROOT) == allowedHost
    ) {
      currentUrl.orEmpty()
    } else {
      "https://$allowedHost/jwglxt/"
    }
    return CookieManager.getInstance().getCookie(safeUrl) ?: ""
  }

  private fun disposeDialog() {
    dialog?.dismiss()
    loginWebView?.stopLoading()
    loginWebView?.destroy()
    dialog = null
    loginWebView = null
    importButton = null
    statusText = null
  }
}
