package app.kezhi.android

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Dialog
import android.content.res.ColorStateList
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
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
        userAgentString = "$userAgentString Kezhi/0.4.3"
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
        const requests = (window.__kezhiRequests || []).slice();
        return JSON.stringify({ pageUrl: location.href, title: clean(document.title, 160), headings, forms, links, resources, requests });
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

  private fun autoFillSavedCredential(webView: WebView) {
    val credential = try { loadCredential(currentSchoolId, currentAccountId) } catch (_: Exception) { null } ?: return
    val username = JSONObject.quote(credential.first)
    val password = JSONObject.quote(credential.second)
    val script = """
      (() => {
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
