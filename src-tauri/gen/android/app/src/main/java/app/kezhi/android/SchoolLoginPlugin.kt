package app.kezhi.android

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Dialog
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.net.Uri
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import android.webkit.WebView
import android.webkit.WebViewClient
import android.net.http.SslError
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.LinearLayout
import android.widget.TextView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyStore
import java.security.MessageDigest
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject
import org.json.JSONTokener

@InvokeArg
class SchoolLoginOpenArgs {
  lateinit var url: String
  lateinit var allowedHost: String
  lateinit var schoolId: String
  lateinit var accountId: String
  lateinit var mode: String
}

@InvokeArg
class CredentialKeyArgs {
  lateinit var schoolId: String
  lateinit var accountId: String
}

@InvokeArg
class SaveCredentialArgs {
  lateinit var schoolId: String
  lateinit var accountId: String
  lateinit var username: String
  lateinit var password: String
}

@TauriPlugin
class SchoolLoginPlugin(private val activity: Activity) : Plugin(activity) {
  private val credentialPreferences by lazy { activity.getSharedPreferences("kezhi_secure_credentials_v1", Activity.MODE_PRIVATE) }
  private var dialog: Dialog? = null
  private var loginWebView: WebView? = null
  private var importButton: Button? = null
  private var statusText: TextView? = null
  private var allowedHost = ""
  private var currentSchoolId = ""
  private var currentAccountId = ""
  private var currentMode = "schedule"
  private var confirmed = false
  private var confirmedCookieHeader = ""
  private var confirmedCurrentUrl = ""
  private var confirmedUserAgent = ""
  private var confirmedPageSnapshot = ""
  private var pageLoadFailed = false
  private val approvedLoginHosts = mutableSetOf<String>()
  private var pendingNavigation: android.app.AlertDialog? = null

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
      currentSchoolId = args.schoolId
      currentAccountId = args.accountId
      currentMode = when (args.mode) { "selection" -> "selection"; "schedule-page" -> "schedule-page"; else -> "schedule" }
      allowedHost = args.allowedHost.lowercase(Locale.ROOT)
      approvedLoginHosts.clear()
      approvedLoginHosts.add(allowedHost)
      pendingNavigation?.dismiss()
      pendingNavigation = null
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
        put("authenticated", confirmed && (currentMode == "selection" || currentMode == "schedule-page" || cookieHeader.isNotEmpty()))
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

  @Command
  fun saveCredential(invoke: Invoke) {
    val args = try { invoke.parseArgs(SaveCredentialArgs::class.java) } catch (error: Exception) {
      invoke.reject("凭据参数无效", error)
      return
    }
    if (!validIdentifier(args.schoolId) || !validIdentifier(args.accountId) || args.username.isBlank() || args.username.length > 80 || args.password.isEmpty() || args.password.length > 256) {
      invoke.reject("账号或密码长度无效")
      return
    }
    try {
      val key = credentialStorageKey(args.schoolId, args.accountId)
      val payload = JSONObject().put("username", args.username.trim()).put("password", args.password).toString()
      if (payload.toByteArray(Charsets.UTF_8).size > 480) {
        invoke.reject("账号密码过长，无法写入系统保险库")
        return
      }
      credentialPreferences.edit().putString(key, encryptCredential(key, payload)).apply()
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject("无法写入 Android 系统保险库", error)
    }
  }

  @Command
  fun credentialStatus(invoke: Invoke) {
    val args = try { invoke.parseArgs(CredentialKeyArgs::class.java) } catch (error: Exception) {
      invoke.reject("凭据参数无效", error)
      return
    }
    if (!validIdentifier(args.schoolId) || !validIdentifier(args.accountId)) {
      invoke.reject("学校或账号标识无效")
      return
    }
    val saved = try { loadCredential(args.schoolId, args.accountId) != null } catch (_: Exception) { false }
    invoke.resolve(JSObject().apply { put("saved", saved) })
  }

  @Command
  fun deleteCredential(invoke: Invoke) {
    val args = try { invoke.parseArgs(CredentialKeyArgs::class.java) } catch (error: Exception) {
      invoke.reject("凭据参数无效", error)
      return
    }
    if (!validIdentifier(args.schoolId) || !validIdentifier(args.accountId)) {
      invoke.reject("学校或账号标识无效")
      return
    }
    credentialPreferences.edit().remove(credentialStorageKey(args.schoolId, args.accountId)).apply()
    invoke.resolve()
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun createLoginDialog(url: String, invoke: Invoke) {
    try {
      val density = activity.resources.displayMetrics.density
      fun dp(value: Int) = (value * density).toInt()

      val nextDialog = Dialog(activity, android.R.style.Theme_Material_Light_NoActionBar)
      val timetableMode = currentMode != "selection"
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
        text = when (currentMode) { "selection" -> "已进入选课页，完成学习"; "schedule-page" -> "导入当前课表"; else -> "导入课表" }
        isAllCaps = false
        textSize = 14f
        setTextColor(Color.WHITE)
        backgroundTintList = ColorStateList.valueOf(Color.rgb(74, 94, 224))
        visibility = if (timetableMode) View.VISIBLE else View.GONE
        isEnabled = false
        elevation = dp(5).toFloat()
        if (timetableMode) {
          textSize = 16f
          minHeight = dp(56)
          setPadding(dp(20), dp(12), dp(20), dp(12))
          backgroundTintList = null
          val fill = GradientDrawable().apply {
            cornerRadius = dp(20).toFloat()
            setColor(ColorStateList(
              arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()),
              intArrayOf(Color.rgb(225, 228, 239), Color.rgb(74, 94, 224)),
            ))
          }
          background = RippleDrawable(ColorStateList.valueOf(Color.argb(40, 255, 255, 255)), fill, null)
          setTextColor(ColorStateList(
            arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()),
            intArrayOf(Color.rgb(113, 118, 132), Color.WHITE),
          ))
          elevation = 0f
        }
      }
      toolbar.addView(closeButton, LinearLayout.LayoutParams(dp(72), dp(48)))
      toolbar.addView(labels, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
      if (!timetableMode) toolbar.addView(nextImportButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(48)))
      val bottomActions = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(12), dp(16), dp(16))
        setBackgroundColor(Color.rgb(246, 247, 251))
        if (timetableMode) addView(nextImportButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
      }

      val webView = WebView(activity)
      var pageLoading = false
      var lastAttemptUrl = url
      val loadProgress = ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal).apply {
        max = 100
        progressTintList = ColorStateList.valueOf(Color.rgb(74, 94, 224))
        visibility = View.GONE
        contentDescription = "网页加载进度"
      }
      fun browserButton(label: String) = Button(activity).apply {
        text = label
        textSize = 13f
        isAllCaps = false
        minWidth = 0
        minimumWidth = 0
        setPadding(dp(4), 0, dp(4), 0)
        setTextColor(Color.rgb(62, 71, 108))
        backgroundTintList = ColorStateList.valueOf(Color.rgb(233, 236, 247))
      }
      val backButton = browserButton("返回")
      val forwardButton = browserButton("前进")
      val refreshButton = browserButton("刷新")
      val addressButton = browserButton("网址")
      fun updateBrowserControls() {
        if (!timetableMode) return
        backButton.isEnabled = webView.canGoBack()
        forwardButton.isEnabled = webView.canGoForward()
        refreshButton.text = if (pageLoading) "停止" else if (pageLoadFailed) "重试" else "刷新"
        refreshButton.contentDescription = if (pageLoading) "停止加载网页" else if (pageLoadFailed) "重新加载失败页面" else "刷新当前网页"
      }
      if (timetableMode) {
        val navigation = LinearLayout(activity).apply {
          orientation = LinearLayout.HORIZONTAL
          setPadding(0, 0, 0, dp(8))
        }
        listOf(backButton, forwardButton, refreshButton, addressButton).forEach { button ->
          navigation.addView(button, LinearLayout.LayoutParams(0, dp(48), 1f).apply { marginEnd = dp(4) })
        }
        bottomActions.addView(navigation, 0)
        backButton.setOnClickListener { if (webView.canGoBack()) webView.goBack() }
        forwardButton.setOnClickListener { if (webView.canGoForward()) webView.goForward() }
        refreshButton.setOnClickListener {
          if (pageLoading) {
            webView.stopLoading()
            pageLoading = false
            pageLoadFailed = true
            loadProgress.visibility = View.GONE
            nextImportButton.isEnabled = false
            nextStatusText.text = "已停止加载，点击重试可重新打开页面"
            updateBrowserControls()
          } else if (pageLoadFailed) {
            val target = Uri.parse(lastAttemptUrl)
            if (!handleNavigation(webView, target)) webView.loadUrl(lastAttemptUrl)
          } else webView.reload()
        }
        addressButton.setOnClickListener {
          val input = EditText(activity).apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
            setText(webView.url?.takeUnless { it == "about:blank" } ?: lastAttemptUrl)
            setSelectAllOnFocus(true)
            hint = "https://学校教务网址"
            contentDescription = "学校网页地址"
          }
          val addressContainer = LinearLayout(activity).apply {
            setPadding(dp(20), dp(8), dp(20), dp(8))
            addView(input, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
          }
          val editor = android.app.AlertDialog.Builder(activity)
            .setTitle("修改当前网页地址")
            .setMessage("仅支持 HTTPS；更换认证域名需确认。此处不修改账号所属学校。")
            .setView(addressContainer).setNegativeButton("取消", null).setPositiveButton("打开", null).create()
          editor.setOnShowListener {
            editor.getButton(android.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
              val raw = input.text.toString().trim()
              val candidate = if (raw.contains("://")) raw else "https://$raw"
              val target = Uri.parse(candidate)
              if (raw.isBlank() || raw.length > 2048 || target.scheme != "https" || target.host.isNullOrBlank() || target.userInfo != null || raw.any { it.isWhitespace() }) {
                input.error = "请输入有效且不含账号密码的 HTTPS 网址"
              } else if (currentMode != "schedule-page" && target.host?.lowercase(Locale.ROOT) != allowedHost) {
                input.error = "更换学校请关闭浏览器并回到导入向导"
              } else {
                editor.dismiss()
                if (!handleNavigation(webView, target)) webView.loadUrl(candidate)
              }
            }
          }
          editor.show()
        }
        updateBrowserControls()
      }
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
        userAgentString = "$userAgentString Kezhi/0.4.3"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
      }
      val cookies = CookieManager.getInstance()
      cookies.setAcceptCookie(true)
      cookies.setAcceptThirdPartyCookies(webView, false)
      webView.webChromeClient = object : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
          super.onProgressChanged(view, newProgress)
          if (!timetableMode) return
          loadProgress.progress = newProgress
          loadProgress.contentDescription = "网页加载进度 $newProgress%"
          loadProgress.visibility = if (pageLoading && !pageLoadFailed && newProgress < 100) View.VISIBLE else View.GONE
        }
      }
      webView.webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
          val next = request.url
          return handleNavigation(view, next)
        }

        @Suppress("DEPRECATION")
        override fun shouldOverrideUrlLoading(view: WebView, nextUrl: String): Boolean {
          val next = Uri.parse(nextUrl)
          return handleNavigation(view, next)
        }

        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
          super.onPageStarted(view, url, favicon)
          pageLoadFailed = false
          pageLoading = true
          lastAttemptUrl = url
          if (timetableMode) { loadProgress.progress = 0; loadProgress.visibility = View.VISIBLE }
          nextStatusText.text = "正在加载 ${Uri.parse(url).host.orEmpty()}"
          nextImportButton.isEnabled = false
          updateBrowserControls()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
          super.onReceivedError(view, request, error)
          if (request.isForMainFrame) {
            pageLoadFailed = true
            pageLoading = false
            loadProgress.visibility = View.GONE
            nextStatusText.text = "加载失败（${error.errorCode}），请检查网址、网络或校园 VPN"
            nextStatusText.setTextColor(Color.rgb(183, 69, 50))
            nextImportButton.isEnabled = false
            updateBrowserControls()
          }
        }

        override fun onPageFinished(view: WebView, finishedUrl: String) {
          super.onPageFinished(view, finishedUrl)
          pageLoading = false
          loadProgress.visibility = View.GONE
          updateBrowserControls()
          if (pageLoadFailed) return
          nextImportButton.isEnabled = true
          // 选课学习模式需要挂钩 fetch / XHR 才能捕获用户实际发出的提交请求。
          if (currentMode == "selection" && isLearnablePage(finishedUrl)) {
            view.evaluateJavascript(requestLoggerScript, null)
          }
          CookieManager.getInstance().flush()
          updateLoginState(finishedUrl)
          autoFillSavedCredential(view)
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
          handler.cancel()
          pageLoadFailed = true
          pageLoading = false
          loadProgress.visibility = View.GONE
          nextImportButton.isEnabled = false
          updateBrowserControls()
          nextStatusText.text = "证书校验失败，已停止加载"
          nextStatusText.setTextColor(Color.rgb(183, 69, 50))
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: android.webkit.WebResourceResponse) {
          super.onReceivedHttpError(view, request, response)
          if (timetableMode && request.isForMainFrame) {
            pageLoadFailed = true
            pageLoading = false
            loadProgress.visibility = View.GONE
            nextImportButton.isEnabled = false
            nextStatusText.text = "学校网站返回 HTTP ${response.statusCode}，可在底部重试或修改网址"
            nextStatusText.setTextColor(Color.rgb(183, 69, 50))
            updateBrowserControls()
          }
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
          super.doUpdateVisitedHistory(view, url, isReload)
          updateBrowserControls()
        }

        override fun onFormResubmission(view: WebView, dontResend: android.os.Message, resend: android.os.Message) {
          if (!timetableMode) { super.onFormResubmission(view, dontResend, resend); return }
          android.app.AlertDialog.Builder(activity)
            .setTitle("是否重新提交页面表单？")
            .setMessage("刷新此页面需要再次提交先前的表单，请确认不会重复执行不需要的操作。")
            .setNegativeButton("取消") { _, _ -> dontResend.sendToTarget() }
            .setPositiveButton("确认刷新") { _, _ -> resend.sendToTarget() }
            .setOnCancelListener { dontResend.sendToTarget() }.show()
        }
      }

      closeButton.setOnClickListener { nextDialog.dismiss() }
      nextImportButton.setOnClickListener {
        val currentUrl = webView.url ?: ""
        val cookieHeader = readCookies(currentUrl)
        if (currentMode == "schedule-page") {
          if (pageLoadFailed || !isApprovedPage(Uri.parse(currentUrl))) return@setOnClickListener
          nextImportButton.isEnabled = false
          captureScheduleSnapshot(webView) { snapshot ->
            nextImportButton.isEnabled = true
            val parsed = try { JSONObject(snapshot) } catch (_: Exception) { null }
            if ((parsed?.optJSONArray("tables")?.length() ?: 0) == 0) {
              nextStatusText.text = parsed?.optJSONArray("warnings")?.optString(0)?.takeIf { it.isNotBlank() }
                ?: "当前页没有可读取的课表，请登录并打开课表页后重试"
              nextStatusText.setTextColor(Color.rgb(183, 69, 50))
            } else {
              confirmedCookieHeader = cookieHeader
              confirmedCurrentUrl = currentUrl
              confirmedUserAgent = webView.settings.userAgentString
              confirmedPageSnapshot = snapshot
              confirmed = true
              CookieManager.getInstance().flush()
              nextDialog.dismiss()
            }
          }
        } else if (currentMode == "selection") {
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
          capturePageSnapshot(webView) { snapshot ->
            confirmedCookieHeader = cookieHeader
            confirmedCurrentUrl = currentUrl
            confirmedUserAgent = webView.settings.userAgentString
            confirmedPageSnapshot = snapshot
            confirmed = true
            CookieManager.getInstance().flush()
            nextDialog.dismiss()
          }
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
      if (timetableMode) root.addView(loadProgress, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)))
      root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
      if (timetableMode) {
        root.addView(bottomActions, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        // Reserve bars/cutouts and the keyboard in the layout, rather than covering the webpage.
        nextDialog.window?.let { window ->
          WindowCompat.setDecorFitsSystemWindows(window, false)
          window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
          val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
          view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
          WindowInsetsCompat.CONSUMED
        }
      }
      nextDialog.setContentView(root)
      nextDialog.show()
      nextDialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
      if (timetableMode) ViewCompat.requestApplyInsets(root)

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
    val ready = when (currentMode) { "selection" -> isLearnablePage(url); "schedule-page" -> isApprovedPage(Uri.parse(url)); else -> isLoggedIn(url, readCookies(url)) }
    importButton?.visibility = if (currentMode != "selection" || ready) View.VISIBLE else View.GONE
    importButton?.isEnabled = ready && !pageLoadFailed
    statusText?.apply {
      text = if (currentMode == "selection") {
        if (ready) "请完成一次课程查询，再点击右侧按钮" else "请在下方登录并进入选课页"
      } else if (currentMode == "schedule-page") "请登录并打开课表页，再点底部导入 · ${Uri.parse(url).host.orEmpty()}"
      else if (ready) "已检测到登录，请点底部导入课表" else "请在下方完成登录，底部按钮将在登录后启用"
      setTextColor(if (ready) Color.rgb(42, 127, 105) else Color.rgb(113, 118, 132))
    }
  }

  private fun isLearnablePage(url: String): Boolean {
    val uri = Uri.parse(url)
    return uri.scheme == "https" && uri.host?.lowercase(Locale.ROOT) == allowedHost
  }

  private fun isApprovedPage(uri: Uri): Boolean =
    uri.scheme == "https" && uri.userInfo == null && uri.port in listOf(-1, 443) &&
      uri.host?.lowercase(Locale.ROOT) in approvedLoginHosts

  private fun handleNavigation(view: WebView, uri: Uri): Boolean {
    if (currentMode != "schedule-page") return uri.scheme != "https" || uri.host?.lowercase(Locale.ROOT) != allowedHost
    if (isApprovedPage(uri)) return false
    val host = uri.host?.lowercase(Locale.ROOT)
    if (uri.scheme != "https" || host.isNullOrBlank() || uri.userInfo != null || uri.port !in listOf(-1, 443)) {
      statusText?.text = "已拦截不安全的跳转，请使用标准 HTTPS 登录网址"
      return true
    }
    if (pendingNavigation?.isShowing == true) return true
    pendingNavigation = android.app.AlertDialog.Builder(activity)
      .setTitle("确认学校登录跳转")
      .setMessage("学校页面希望跳转到：\n\n$host\n\n请核对这是学校的统一认证或教务域名。本次只允许这个域名，不会向它自动填充已保存的密码。")
      .setNegativeButton("取消") { _, _ -> statusText?.text = "已取消跳转到 $host" }
      .setPositiveButton("确认并继续") { _, _ ->
        approvedLoginHosts.add(host)
        view.loadUrl(uri.toString())
      }
      .create()
    pendingNavigation?.show()
    return true
  }

  private fun captureScheduleSnapshot(webView: WebView, complete: (String) -> Unit) {
    val script = try { activity.assets.open("kezhi-schedule-snapshot.js").bufferedReader().use { it.readText() } }
      catch (_: Exception) { complete(""); return }
    webView.evaluateJavascript(script) { result ->
      val decoded = try { JSONTokener(result).nextValue() as? String ?: "" } catch (_: Exception) { "" }
      complete(if (decoded.toByteArray(Charsets.UTF_8).size <= 200_000) decoded else "")
    }
  }

  private val requestLoggerScript = """
    (() => {
      if (window.__kezhiHooked) return;
      window.__kezhiHooked = true;
      window.__kezhiRequests = [];
      const clean = (value, max) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 120);
      const sameOrigin = (value) => {
        try {
          const url = new URL(value || location.href, location.href);
          return url.protocol === 'https:' && url.origin === location.origin ? url.href : '';
        } catch (_) { return ''; }
      };
      const record = (url, method, body, contentType) => {
        const safe = sameOrigin(url);
        const rawBody = String(body == null ? '' : body);
        const path = (() => { try { return new URL(safe).pathname.toLowerCase(); } catch (_) { return ''; } })();
        const hasPasswordField = Boolean(document.querySelector('input[type="password"]'));
        const looksLikeLogin = /(login|signin|slogin|authenticate|passport)/.test(path);
        const containsSecret = /(^|[&{,\s"'])(password|passwd|pwd|userpassword|mm)(["']?\s*[:=])/i.test(rawBody);
        if (!safe || window.__kezhiRequests.length >= 80 || hasPasswordField || looksLikeLogin || containsSecret) return;
        window.__kezhiRequests.push({ url: safe, method: clean(method || 'GET', 10).toUpperCase(), body: rawBody.slice(0, 4000), contentType: clean(contentType || '', 160) });
      };
      const originalFetch = window.fetch;
      if (typeof originalFetch === 'function') {
        window.fetch = function (input, init) {
          try {
            const options = init || {};
            const method = clean(options.method || (input && input.method) || 'GET', 10).toUpperCase();
            if (method !== 'GET') {
              const headers = options.headers || {};
              const rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
              record(rawUrl, method, typeof options.body === 'string' ? options.body : '', headers['Content-Type'] || headers['content-type'] || '');
            }
          } catch (_) {}
          return originalFetch.apply(this, arguments);
        };
      }
      const OriginalXHR = window.XMLHttpRequest;
      if (typeof OriginalXHR === 'function' && !OriginalXHR.prototype.__kezhiHooked) {
        const open = OriginalXHR.prototype.open;
        const send = OriginalXHR.prototype.send;
        const setHeader = OriginalXHR.prototype.setRequestHeader;
        OriginalXHR.prototype.__kezhiHooked = true;
        OriginalXHR.prototype.open = function (method, url) {
          this.__kezhiMethod = method;
          this.__kezhiUrl = url;
          return open.apply(this, arguments);
        };
        OriginalXHR.prototype.setRequestHeader = function (name, value) {
          if (String(name).toLowerCase() === 'content-type') this.__kezhiContentType = value;
          return setHeader.apply(this, arguments);
        };
        OriginalXHR.prototype.send = function (body) {
          try {
            const method = clean(this.__kezhiMethod || 'GET', 10).toUpperCase();
            if (method !== 'GET') {
              record(this.__kezhiUrl, method, typeof body === 'string' ? body : '', this.__kezhiContentType || 'application/x-www-form-urlencoded;charset=UTF-8');
            }
          } catch (_) {}
          return send.apply(this, arguments);
        };
      }
    })();
  """.trimIndent()

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
        const tables = Array.from(document.querySelectorAll('table')).slice(0, 30).map((table) => {
          const rows = Array.from(table.querySelectorAll('tr')).slice(0, 80).map((row) => Array.from(row.querySelectorAll('th,td')).slice(0, 30).map((cell) => clean(cell.innerText || cell.textContent, 500)));
          return { caption: clean(table.querySelector('caption')?.textContent, 160), headers: rows[0] || [], rows };
        }).filter((table) => table.rows.length > 1);
        const requests = (window.__kezhiRequests || []).slice();
        return JSON.stringify({ pageUrl: location.href, title: clean(document.title, 160), headings, forms, links, resources, tables, requests });
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
      name == "jsessionid" || name == "session" || name == "sessionid" || name == "sid" || name == "token" || name == "authtoken" || name == "ticket"
    } || (currentSchoolId != "ndnu" && cookieHeader.isNotBlank())
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

  private fun autoFillSavedCredential(webView: WebView) {
    val uri = Uri.parse(webView.url ?: "")
    if (uri.scheme != "https" || uri.host?.lowercase(Locale.ROOT) != allowedHost || uri.port !in listOf(-1, 443)) return
    val credential = try { loadCredential(currentSchoolId, currentAccountId) } catch (_: Exception) { null } ?: return
    val username = JSONObject.quote(credential.first)
    val password = JSONObject.quote(credential.second)
    val credentialHost = JSONObject.quote(allowedHost)
    val script = """
      (() => {
        if (location.protocol !== 'https:' || location.hostname.toLowerCase() !== $credentialHost || location.port && location.port !== '443') return false;
        const username = $username;
        const password = $password;
        const setValue = (input, value) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, value); else input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const fill = () => {
          const passwordInput = document.querySelector('input[type="password"]');
          if (!passwordInput) return false;
          const scope = passwordInput.form || document;
          const usernameInput = scope.querySelector('input[autocomplete="username"], input[name*="user" i], input[name*="account" i], input[name*="login" i], input[id*="user" i], input[id*="account" i]') || Array.from(scope.querySelectorAll('input:not([type]), input[type="text"], input[type="email"], input[type="tel"]')).find((input) => {
            const hint = [input.name, input.id, input.placeholder].join(' ').toLowerCase();
            return !/(captcha|verify|yzm|code|验证码)/.test(hint);
          });
          if (!usernameInput) return false;
          if (!usernameInput.value) setValue(usernameInput, username);
          if (!passwordInput.value) setValue(passwordInput, password);
          return true;
        };
        if (fill()) return true;
        const observer = new MutationObserver(() => {
          if (fill()) observer.disconnect();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.setTimeout(() => observer.disconnect(), 15000);
        return false;
      })()
    """.trimIndent()
    webView.evaluateJavascript(script) { result ->
      if (result == "true" && !confirmed) {
        statusText?.text = "账号密码已从系统保险库填充，请在官网点击登录"
        statusText?.setTextColor(Color.rgb(42, 127, 105))
      }
    }
  }

  private fun credentialStorageKey(schoolId: String, accountId: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest("$schoolId|$accountId".toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(digest, Base64.NO_WRAP or Base64.URL_SAFE)
  }

  private fun validIdentifier(value: String): Boolean = value.matches(Regex("^[A-Za-z0-9_-]{1,64}$"))

  private fun getOrCreateVaultKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey("kezhi_login_vault_v1", null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder("kezhi_login_vault_v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build()
    )
    return generator.generateKey()
  }

  private fun encryptCredential(storageKey: String, plaintext: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateVaultKey())
    cipher.updateAAD(storageKey.toByteArray(Charsets.UTF_8))
    val encrypted = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP)
  }

  private fun loadCredential(schoolId: String, accountId: String): Pair<String, String>? {
    if (!validIdentifier(schoolId) || !validIdentifier(accountId)) return null
    val storageKey = credentialStorageKey(schoolId, accountId)
    val packed = credentialPreferences.getString(storageKey, null) ?: return null
    val parts = packed.split(':', limit = 2)
    if (parts.size != 2) return null
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, getOrCreateVaultKey(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
    cipher.updateAAD(storageKey.toByteArray(Charsets.UTF_8))
    val payload = JSONObject(String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8))
    val username = payload.optString("username")
    val password = payload.optString("password")
    return if (username.isNotEmpty() && password.isNotEmpty()) username to password else null
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
