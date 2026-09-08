#[cfg(target_os = "android")]
mod android_login;
mod database;

#[cfg(target_os = "android")]
use android_login::{AndroidSchoolLogin, OpenRequest as AndroidLoginOpenRequest};
use database::{LocalAccountProfile, ScheduleSnapshot as StoredScheduleSnapshot, ScheduleStore};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::Manager;
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[derive(Clone, Deserialize)]
#[cfg_attr(mobile, allow(dead_code))]
#[serde(rename_all = "camelCase")]
struct SchoolLoginRequest {
    school_id: String,
    account_id: String,
    #[serde(default)]
    login_url: Option<String>,
    #[serde(default)]
    purpose: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginWindowInfo {
    window_label: String,
    reused: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginStatus {
    window_open: bool,
    authenticated: bool,
    session_cookie_count: usize,
    current_url: Option<String>,
    page_snapshot: Option<String>,
}

#[derive(Clone, Deserialize)]
#[cfg_attr(mobile, allow(dead_code))]
#[serde(rename_all = "camelCase")]
struct ScheduleFetchRequest {
    school_id: String,
    account_id: String,
    academic_year: u16,
    semester: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SchedulePayload {
    rows: serde_json::Value,
}

#[derive(Clone, Deserialize)]
#[cfg_attr(target_os = "ios", allow(dead_code))]
#[serde(rename_all = "camelCase")]
struct PortalResourceRequest {
    school_id: String,
    account_id: String,
    login_url: Option<String>,
    purpose: Option<String>,
    endpoint_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PortalResourcePayload {
    body: String,
    content_type: String,
    status: u16,
    source_url: String,
}

#[tauri::command]
fn load_schedule_snapshot(
    store: tauri::State<'_, ScheduleStore>,
) -> Result<Option<StoredScheduleSnapshot>, String> {
    store.load()
}

#[tauri::command]
fn save_schedule_snapshot(
    store: tauri::State<'_, ScheduleStore>,
    snapshot: StoredScheduleSnapshot,
) -> Result<(), String> {
    store.save(&snapshot)
}

#[tauri::command]
fn load_local_accounts(
    store: tauri::State<'_, ScheduleStore>,
) -> Result<Vec<LocalAccountProfile>, String> {
    store.load_accounts()
}

#[tauri::command]
fn save_local_account(
    store: tauri::State<'_, ScheduleStore>,
    account: LocalAccountProfile,
) -> Result<(), String> {
    store.save_account(&account)
}

struct SchoolSite {
    id: &'static str,
    name: &'static str,
    login_url: &'static str,
    allowed_host: &'static str,
}

#[derive(Clone)]
struct LoginSite {
    id: String,
    name: String,
    login_url: String,
    allowed_host: String,
}

const NDNU: SchoolSite = SchoolSite {
    id: "ndnu",
    name: "宁德师范学院",
    login_url: "https://jwgl.ndnu.edu.cn/jwglxt/xtgl/login_slogin.html",
    allowed_host: "jwgl.ndnu.edu.cn",
};

fn school_site(school_id: &str) -> Result<&'static SchoolSite, String> {
    match school_id {
        "ndnu" => Ok(&NDNU),
        _ => Err("该学校暂未提供原生登录适配器".into()),
    }
}

fn resolve_login_site(request: &SchoolLoginRequest) -> Result<LoginSite, String> {
    if let Ok(site) = school_site(&request.school_id) {
        return Ok(LoginSite {
            id: site.id.into(),
            name: site.name.into(),
            login_url: site.login_url.into(),
            allowed_host: site.allowed_host.into(),
        });
    }
    let _ = checked_identifier(&request.school_id, "学校")?;
    let raw_url = request
        .login_url
        .as_deref()
        .ok_or_else(|| "自定义学校需要提供登录网址".to_string())?;
    if raw_url.len() > 2_048 {
        return Err("学校登录网址过长".into());
    }
    let url = raw_url
        .parse::<tauri::Url>()
        .map_err(|_| "学校登录地址无效".to_string())?;
    let host = url
        .host_str()
        .filter(|host| host.contains('.'))
        .ok_or_else(|| "学校登录地址缺少有效域名".to_string())?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err("学校登录地址必须使用不含账号信息的 HTTPS 网址".into());
    }
    Ok(LoginSite {
        id: request.school_id.clone(),
        name: host.to_string(),
        login_url: url.to_string(),
        allowed_host: host.to_ascii_lowercase(),
    })
}

fn checked_identifier(value: &str, label: &str) -> Result<String, String> {
    if value.is_empty()
        || value.len() > 64
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(format!("{label}标识无效"));
    }
    Ok(value.to_owned())
}

fn checked_login_url(site: &SchoolSite) -> Result<tauri::Url, String> {
    let url = site
        .login_url
        .parse::<tauri::Url>()
        .map_err(|_| "学校登录地址无效".to_string())?;
    if url.scheme() != "https" || url.host_str() != Some(site.allowed_host) {
        return Err("学校登录地址未通过安全校验".into());
    }
    Ok(url)
}

fn checked_login_site_url(site: &LoginSite) -> Result<tauri::Url, String> {
    let url = site
        .login_url
        .parse::<tauri::Url>()
        .map_err(|_| "学校登录地址无效".to_string())?;
    if url.scheme() != "https" || url.host_str() != Some(site.allowed_host.as_str()) {
        return Err("学校登录地址未通过安全校验".into());
    }
    Ok(url)
}

#[cfg(desktop)]
fn window_label(request: &SchoolLoginRequest) -> Result<String, String> {
    let school_id = checked_identifier(&request.school_id, "学校")?;
    let account_id = checked_identifier(&request.account_id, "账号")?;
    Ok(format!("school-login-{school_id}-{account_id}"))
}

#[cfg(desktop)]
#[tauri::command]
async fn open_school_login(
    app: tauri::AppHandle,
    request: SchoolLoginRequest,
) -> Result<LoginWindowInfo, String> {
    create_login_window(&app, &request, true)
}

#[cfg(desktop)]
#[tauri::command]
async fn prepare_school_session(
    app: tauri::AppHandle,
    request: SchoolLoginRequest,
) -> Result<LoginWindowInfo, String> {
    create_login_window(&app, &request, false)
}

#[cfg(desktop)]
fn create_login_window(
    app: &tauri::AppHandle,
    request: &SchoolLoginRequest,
    interactive: bool,
) -> Result<LoginWindowInfo, String> {
    let site = resolve_login_site(request)?;
    let url = if interactive {
        checked_login_site_url(&site)?
    } else if site.id == "ndnu" && request.purpose.as_deref() != Some("selection") {
        format!(
            "https://{}/jwglxt/xtgl/index_initMenu.html",
            site.allowed_host
        )
        .parse::<tauri::Url>()
        .map_err(|_| "学校会话检查地址无效".to_string())?
    } else {
        checked_login_site_url(&site)?
    };
    let label = window_label(&request)?;

    if let Some(window) = app.get_webview_window(&label) {
        if interactive {
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
        }
        return Ok(LoginWindowInfo {
            window_label: label,
            reused: true,
        });
    }

    let account_id = checked_identifier(&request.account_id, "账号")?;
    let allowed_host = site.allowed_host.clone();
    let session_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("webview-sessions")
        .join(&site.id)
        .join(account_id);
    std::fs::create_dir_all(&session_directory).map_err(|error| error.to_string())?;

    WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        .title(format!(
            "课织 · {}{}",
            site.name,
            if request.purpose.as_deref() == Some("selection") {
                "选课学习"
            } else {
                "官方登录"
            }
        ))
        .inner_size(1120.0, 760.0)
        .min_inner_size(860.0, 620.0)
        .center()
        .visible(interactive)
        .data_directory(session_directory)
        .on_navigation(move |next_url| {
            next_url.scheme() == "https" && next_url.host_str() == Some(allowed_host.as_str())
        })
        .build()
        .map_err(|error| error.to_string())?;

    Ok(LoginWindowInfo {
        window_label: label,
        reused: false,
    })
}

#[cfg(desktop)]
#[tauri::command]
async fn school_login_status(
    app: tauri::AppHandle,
    request: SchoolLoginRequest,
) -> Result<LoginStatus, String> {
    let site = resolve_login_site(&request)?;
    let url = checked_login_site_url(&site)?;
    let label = window_label(&request)?;
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(LoginStatus {
            window_open: false,
            authenticated: false,
            session_cookie_count: 0,
            current_url: None,
            page_snapshot: None,
        });
    };

    // Cookie values never cross the native/frontend boundary. Only a count and
    // a conservative session marker are returned to the React UI.
    let cookies = window
        .cookies_for_url(url)
        .map_err(|error| error.to_string())?;
    let has_session_cookie = cookies.iter().any(|cookie| {
        matches!(
            cookie.name().to_ascii_lowercase().as_str(),
            "jsessionid" | "session" | "sessionid"
        )
    });
    let current_url = window.url().map_err(|error| error.to_string())?;
    let left_login_page = current_url.scheme() == "https"
        && current_url.host_str() == Some(site.allowed_host.as_str())
        && !current_url.path().to_ascii_lowercase().contains("login");
    let authenticated = has_session_cookie && left_login_page;

    Ok(LoginStatus {
        window_open: true,
        authenticated,
        session_cookie_count: cookies.len(),
        current_url: Some(current_url.to_string()),
        page_snapshot: None,
    })
}

#[cfg(desktop)]
#[tauri::command]
async fn hide_school_login(
    app: tauri::AppHandle,
    request: SchoolLoginRequest,
) -> Result<(), String> {
    let _ = resolve_login_site(&request)?;
    let label = window_label(&request)?;
    if let Some(window) = app.get_webview_window(&label) {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

async fn fetch_schedule_payload(
    site: &SchoolSite,
    request: &ScheduleFetchRequest,
    cookie_header: String,
    user_agent: &str,
) -> Result<SchedulePayload, String> {
    if !(2000..=2100).contains(&request.academic_year) || !matches!(request.semester, 1 | 2) {
        return Err("学年或学期无效".into());
    }

    let endpoint = format!(
        "https://{}/jwglxt/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151",
        site.allowed_host
    )
    .parse::<tauri::Url>()
    .map_err(|_| "课表接口地址无效".to_string())?;
    if cookie_header.is_empty() {
        return Err("没有检测到登录会话，请重新登录".into());
    }
    let referer = checked_login_url(site)?.to_string();
    let user_agent = if user_agent.trim().is_empty() {
        "Kezhi/0.4.1"
    } else {
        user_agent
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|error| error.to_string())?;
    let semester_code = if request.semester == 1 { "3" } else { "12" };
    let response = client
        .post(endpoint.as_str())
        .header(reqwest::header::COOKIE, cookie_header)
        .header(reqwest::header::REFERER, referer)
        .header(reqwest::header::USER_AGENT, user_agent)
        .form(&[
            ("xnm", request.academic_year.to_string()),
            ("xqm", semester_code.to_string()),
            ("kzlx", "ck".to_string()),
        ])
        .send()
        .await
        .map_err(|error| format!("连接教务系统失败：{error}"))?;

    if !response.status().is_success() {
        return Err(format!("教务系统返回 HTTP {}", response.status()));
    }
    let body = response
        .bytes()
        .await
        .map_err(|error| format!("读取课表响应失败：{error}"))?;
    if body.len() > 4 * 1024 * 1024 {
        return Err("教务系统返回的数据异常大，已停止读取".into());
    }
    let payload: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|_| "登录可能已过期，教务系统没有返回课表数据".to_string())?;
    let rows = payload
        .get("kbList")
        .filter(|value| value.is_array())
        .cloned()
        .ok_or_else(|| "课表响应缺少 kbList，学校接口可能已经变化".to_string())?;

    // Student profile fields in `xsxx` are deliberately discarded here.
    Ok(SchedulePayload { rows })
}

fn portal_login_request(request: &PortalResourceRequest) -> SchoolLoginRequest {
    SchoolLoginRequest {
        school_id: request.school_id.clone(),
        account_id: request.account_id.clone(),
        login_url: request.login_url.clone(),
        purpose: request.purpose.clone(),
    }
}

fn checked_portal_endpoint(site: &LoginSite, raw_url: &str) -> Result<tauri::Url, String> {
    if raw_url.len() > 2_048 {
        return Err("候选接口地址过长".into());
    }
    let endpoint = raw_url
        .parse::<tauri::Url>()
        .map_err(|_| "候选接口地址无效".to_string())?;
    if endpoint.scheme() != "https"
        || endpoint.host_str() != Some(site.allowed_host.as_str())
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
    {
        return Err("只允许检查学校同域的 HTTPS 接口".into());
    }
    let path = endpoint.path().to_ascii_lowercase();
    if ["logout", "delete", "drop", "submit", "confirm", "save"]
        .iter()
        .any(|word| path.contains(word))
    {
        return Err("该地址可能修改选课状态，已拒绝自动请求".into());
    }
    Ok(endpoint)
}

async fn fetch_portal_payload(
    site: &LoginSite,
    endpoint: tauri::Url,
    cookie_header: String,
    user_agent: &str,
) -> Result<PortalResourcePayload, String> {
    if cookie_header.is_empty() {
        return Err("学校登录会话不可用于只读检查，请重新登录学习".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(endpoint.as_str())
        .header(reqwest::header::COOKIE, cookie_header)
        .header(
            reqwest::header::REFERER,
            checked_login_site_url(site)?.as_str(),
        )
        .header(
            reqwest::header::USER_AGENT,
            if user_agent.trim().is_empty() {
                "Kezhi/0.4.1"
            } else {
                user_agent
            },
        )
        .send()
        .await
        .map_err(|error| format!("检查学校接口失败：{error}"))?;
    let status = response.status();
    if status.is_redirection() {
        return Err("学校接口发生跳转，登录可能已过期".into());
    }
    if !status.is_success() {
        return Err(format!("学校接口返回 HTTP {status}"));
    }
    let source_url = response.url().to_string();
    if response.url().host_str() != Some(site.allowed_host.as_str()) {
        return Err("学校接口跳转到了其他站点，已停止读取".into());
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response
        .bytes()
        .await
        .map_err(|error| format!("读取学校接口失败：{error}"))?;
    if body.len() > 2 * 1024 * 1024 {
        return Err("学校接口返回内容超过 2 MB，已停止读取".into());
    }
    Ok(PortalResourcePayload {
        body: String::from_utf8_lossy(&body).into_owned(),
        content_type,
        status: status.as_u16(),
        source_url,
    })
}

#[cfg(desktop)]
#[tauri::command]
async fn fetch_school_schedule(
    app: tauri::AppHandle,
    request: ScheduleFetchRequest,
) -> Result<SchedulePayload, String> {
    let site = school_site(&request.school_id)?;
    let login_request = SchoolLoginRequest {
        school_id: request.school_id.clone(),
        account_id: request.account_id.clone(),
        login_url: None,
        purpose: Some("schedule".into()),
    };
    let label = window_label(&login_request)?;
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "登录窗口已关闭，请重新打开并登录".to_string())?;
    let endpoint = format!(
        "https://{}/jwglxt/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151",
        site.allowed_host
    )
    .parse::<tauri::Url>()
    .map_err(|_| "课表接口地址无效".to_string())?;
    let cookies = window
        .cookies_for_url(endpoint)
        .map_err(|error| error.to_string())?;
    let cookie_header = cookies
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ");

    fetch_schedule_payload(site, &request, cookie_header, "Kezhi/0.4.1 WebView2").await
}

#[cfg(desktop)]
#[tauri::command]
async fn fetch_portal_resource(
    app: tauri::AppHandle,
    request: PortalResourceRequest,
) -> Result<PortalResourcePayload, String> {
    let login_request = portal_login_request(&request);
    let site = resolve_login_site(&login_request)?;
    let endpoint = checked_portal_endpoint(&site, &request.endpoint_url)?;
    let label = window_label(&login_request)?;
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "学校页面已关闭，请重新打开学习模式".to_string())?;
    let cookies = window
        .cookies_for_url(endpoint.clone())
        .map_err(|error| error.to_string())?;
    let cookie_header = cookies
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ");
    fetch_portal_payload(&site, endpoint, cookie_header, "Kezhi/0.4.1 WebView2").await
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn open_school_login(
    app: tauri::AppHandle,
    request: SchoolLoginRequest,
) -> Result<LoginWindowInfo, String> {
    let site = resolve_login_site(&request)?;
    let account_id = checked_identifier(&request.account_id, "账号")?;
    let url = checked_login_site_url(&site)?;
    app.state::<AndroidSchoolLogin<tauri::Wry>>()
        .open(AndroidLoginOpenRequest {
            url: url.as_str(),
            allowed_host: &site.allowed_host,
            account_id: &account_id,
            mode: request.purpose.as_deref().unwrap_or("schedule"),
        })?;
    Ok(LoginWindowInfo {
        window_label: "android-school-login".into(),
        reused: false,
    })
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn prepare_school_session(
    app: tauri::AppHandle,
    request: SchoolLoginRequest,
) -> Result<LoginWindowInfo, String> {
    let site = resolve_login_site(&request)?;
    let account_id = checked_identifier(&request.account_id, "账号")?;
    let login = app.state::<AndroidSchoolLogin<tauri::Wry>>();
    let status = login.status()?;
    let reused = status.account_id == account_id && status.authenticated;
    if !reused {
        let url = checked_login_site_url(&site)?;
        login.open(AndroidLoginOpenRequest {
            url: url.as_str(),
            allowed_host: &site.allowed_host,
            account_id: &account_id,
            mode: request.purpose.as_deref().unwrap_or("schedule"),
        })?;
    }
    Ok(LoginWindowInfo {
        window_label: "android-school-login".into(),
        reused,
    })
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn school_login_status(
    app: tauri::AppHandle,
    request: SchoolLoginRequest,
) -> Result<LoginStatus, String> {
    let _ = resolve_login_site(&request)?;
    let account_id = checked_identifier(&request.account_id, "账号")?;
    let status = app.state::<AndroidSchoolLogin<tauri::Wry>>().status()?;
    let same_account = status.account_id == account_id;
    Ok(LoginStatus {
        window_open: same_account && status.window_open,
        authenticated: same_account && status.authenticated && !status.cookie_header.is_empty(),
        session_cookie_count: if same_account && !status.cookie_header.is_empty() {
            1
        } else {
            0
        },
        current_url: same_account.then_some(status.current_url),
        page_snapshot: same_account
            .then_some(status.page_snapshot)
            .filter(|value| !value.is_empty()),
    })
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn hide_school_login(
    app: tauri::AppHandle,
    request: SchoolLoginRequest,
) -> Result<(), String> {
    let _ = resolve_login_site(&request)?;
    let _ = checked_identifier(&request.account_id, "账号")?;
    app.state::<AndroidSchoolLogin<tauri::Wry>>().close()
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn fetch_school_schedule(
    app: tauri::AppHandle,
    request: ScheduleFetchRequest,
) -> Result<SchedulePayload, String> {
    let site = school_site(&request.school_id)?;
    let account_id = checked_identifier(&request.account_id, "账号")?;
    let status = app.state::<AndroidSchoolLogin<tauri::Wry>>().status()?;
    if status.account_id != account_id || !status.authenticated || status.cookie_header.is_empty() {
        return Err("登录会话不可用，请重新打开学校登录页".into());
    }
    fetch_schedule_payload(site, &request, status.cookie_header, &status.user_agent).await
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn fetch_portal_resource(
    app: tauri::AppHandle,
    request: PortalResourceRequest,
) -> Result<PortalResourcePayload, String> {
    let login_request = portal_login_request(&request);
    let site = resolve_login_site(&login_request)?;
    let endpoint = checked_portal_endpoint(&site, &request.endpoint_url)?;
    let account_id = checked_identifier(&request.account_id, "账号")?;
    let status = app.state::<AndroidSchoolLogin<tauri::Wry>>().status()?;
    if status.account_id != account_id || !status.authenticated {
        return Err("学校登录会话不可用，请重新打开学习模式".into());
    }
    fetch_portal_payload(&site, endpoint, status.cookie_header, &status.user_agent).await
}

#[cfg(target_os = "ios")]
const MOBILE_LOGIN_UNAVAILABLE: &str = "iOS 版暂未接入学校登录";

#[cfg(target_os = "ios")]
#[tauri::command]
async fn open_school_login(
    _app: tauri::AppHandle,
    _request: SchoolLoginRequest,
) -> Result<LoginWindowInfo, String> {
    Err(MOBILE_LOGIN_UNAVAILABLE.into())
}

#[cfg(target_os = "ios")]
#[tauri::command]
async fn prepare_school_session(
    _app: tauri::AppHandle,
    _request: SchoolLoginRequest,
) -> Result<LoginWindowInfo, String> {
    Err(MOBILE_LOGIN_UNAVAILABLE.into())
}

#[cfg(target_os = "ios")]
#[tauri::command]
async fn school_login_status(
    _app: tauri::AppHandle,
    _request: SchoolLoginRequest,
) -> Result<LoginStatus, String> {
    Err(MOBILE_LOGIN_UNAVAILABLE.into())
}

#[cfg(target_os = "ios")]
#[tauri::command]
async fn hide_school_login(
    _app: tauri::AppHandle,
    _request: SchoolLoginRequest,
) -> Result<(), String> {
    Err(MOBILE_LOGIN_UNAVAILABLE.into())
}

#[cfg(target_os = "ios")]
#[tauri::command]
async fn fetch_school_schedule(
    _app: tauri::AppHandle,
    _request: ScheduleFetchRequest,
) -> Result<SchedulePayload, String> {
    Err(MOBILE_LOGIN_UNAVAILABLE.into())
}

#[cfg(target_os = "ios")]
#[tauri::command]
async fn fetch_portal_resource(
    _app: tauri::AppHandle,
    _request: PortalResourceRequest,
) -> Result<PortalResourcePayload, String> {
    Err(MOBILE_LOGIN_UNAVAILABLE.into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_notification::init());
    #[cfg(target_os = "android")]
    let builder = builder.plugin(android_login::init());

    builder
        .setup(|app| {
            let data_directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_directory)?;
            let store = ScheduleStore::open(&data_directory.join("kezhi.sqlite3"))
                .map_err(std::io::Error::other)?;
            app.manage(store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_schedule_snapshot,
            save_schedule_snapshot,
            load_local_accounts,
            save_local_account,
            open_school_login,
            prepare_school_session,
            school_login_status,
            hide_school_login,
            fetch_school_schedule,
            fetch_portal_resource
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kezhi");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_identifiers_cannot_escape_the_session_directory() {
        assert!(checked_identifier("account-1_a", "账号").is_ok());
        assert!(checked_identifier("../other-account", "账号").is_err());
        assert!(checked_identifier("account\\other", "账号").is_err());
    }

    #[test]
    fn only_catalogued_schools_can_open_a_login_window() {
        assert_eq!(
            school_site("ndnu").unwrap().allowed_host,
            "jwgl.ndnu.edu.cn"
        );
        assert!(school_site("untrusted-school").is_err());
    }

    #[test]
    fn the_catalogued_login_url_is_https_and_host_locked() {
        let url = checked_login_url(&NDNU).unwrap();
        assert_eq!(url.scheme(), "https");
        assert_eq!(url.host_str(), Some("jwgl.ndnu.edu.cn"));
    }

    #[test]
    fn custom_portals_require_a_safe_https_url() {
        let request = SchoolLoginRequest {
            school_id: "custom-example-edu-cn".into(),
            account_id: "selection-default".into(),
            login_url: Some("https://jw.example.edu.cn/login".into()),
            purpose: Some("selection".into()),
        };
        assert_eq!(
            resolve_login_site(&request).unwrap().allowed_host,
            "jw.example.edu.cn"
        );
        assert!(resolve_login_site(&SchoolLoginRequest {
            login_url: Some("http://jw.example.edu.cn/login".into()),
            ..request
        })
        .is_err());
    }

    #[test]
    fn portal_polling_is_same_host_and_read_only() {
        let site = LoginSite {
            id: "custom-example".into(),
            name: "example".into(),
            login_url: "https://jw.example.edu.cn/login".into(),
            allowed_host: "jw.example.edu.cn".into(),
        };
        assert!(checked_portal_endpoint(&site, "https://jw.example.edu.cn/xk/list").is_ok());
        assert!(checked_portal_endpoint(&site, "https://evil.example/xk/list").is_err());
        assert!(checked_portal_endpoint(&site, "https://jw.example.edu.cn/xk/submit").is_err());
    }
}
