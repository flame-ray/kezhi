mod database;

use database::{LocalAccountProfile, ScheduleSnapshot as StoredScheduleSnapshot, ScheduleStore};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SchoolLoginRequest {
    school_id: String,
    account_id: String,
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
}

#[derive(Clone, Deserialize)]
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

fn window_label(request: &SchoolLoginRequest) -> Result<String, String> {
    let school_id = checked_identifier(&request.school_id, "学校")?;
    let account_id = checked_identifier(&request.account_id, "账号")?;
    Ok(format!("school-login-{school_id}-{account_id}"))
}

#[tauri::command]
async fn open_school_login(
    app: tauri::AppHandle,
    request: SchoolLoginRequest,
) -> Result<LoginWindowInfo, String> {
    create_login_window(&app, &request, true)
}

#[tauri::command]
async fn prepare_school_session(
    app: tauri::AppHandle,
    request: SchoolLoginRequest,
) -> Result<LoginWindowInfo, String> {
    create_login_window(&app, &request, false)
}

fn create_login_window(
    app: &tauri::AppHandle,
    request: &SchoolLoginRequest,
    interactive: bool,
) -> Result<LoginWindowInfo, String> {
    let site = school_site(&request.school_id)?;
    let url = if interactive {
        checked_login_url(site)?
    } else {
        format!("https://{}/jwglxt/xtgl/index_initMenu.html", site.allowed_host)
            .parse::<tauri::Url>()
            .map_err(|_| "学校会话检查地址无效".to_string())?
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
    let allowed_host = site.allowed_host;
    let session_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("webview-sessions")
        .join(site.id)
        .join(account_id);
    std::fs::create_dir_all(&session_directory).map_err(|error| error.to_string())?;

    WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        .title(format!("课织 · {}官方登录", site.name))
        .inner_size(1120.0, 760.0)
        .min_inner_size(860.0, 620.0)
        .center()
        .visible(interactive)
        .data_directory(session_directory)
        .on_navigation(move |next_url| {
            next_url.scheme() == "https" && next_url.host_str() == Some(allowed_host)
        })
        .build()
        .map_err(|error| error.to_string())?;

    Ok(LoginWindowInfo {
        window_label: label,
        reused: false,
    })
}

#[tauri::command]
async fn school_login_status(
    app: tauri::AppHandle,
    request: SchoolLoginRequest,
) -> Result<LoginStatus, String> {
    let site = school_site(&request.school_id)?;
    let url = checked_login_url(site)?;
    let label = window_label(&request)?;
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(LoginStatus {
            window_open: false,
            authenticated: false,
            session_cookie_count: 0,
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
        && current_url.host_str() == Some(site.allowed_host)
        && !current_url.path().to_ascii_lowercase().contains("login");
    let authenticated = has_session_cookie && left_login_page;

    Ok(LoginStatus {
        window_open: true,
        authenticated,
        session_cookie_count: cookies.len(),
    })
}

#[tauri::command]
async fn hide_school_login(
    app: tauri::AppHandle,
    request: SchoolLoginRequest,
) -> Result<(), String> {
    let _ = school_site(&request.school_id)?;
    let label = window_label(&request)?;
    if let Some(window) = app.get_webview_window(&label) {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn fetch_school_schedule(
    app: tauri::AppHandle,
    request: ScheduleFetchRequest,
) -> Result<SchedulePayload, String> {
    let site = school_site(&request.school_id)?;
    if !(2000..=2100).contains(&request.academic_year) || !matches!(request.semester, 1 | 2) {
        return Err("学年或学期无效".into());
    }

    let login_request = SchoolLoginRequest {
        school_id: request.school_id.clone(),
        account_id: request.account_id.clone(),
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
        .cookies_for_url(endpoint.clone())
        .map_err(|error| error.to_string())?;
    let cookie_header = cookies
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ");
    if cookie_header.is_empty() {
        return Err("没有检测到登录会话，请重新登录".into());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|error| error.to_string())?;
    let semester_code = if request.semester == 1 { "3" } else { "12" };
    let response = client
        .post(endpoint.as_str())
        .header(reqwest::header::COOKIE, cookie_header)
        .header(reqwest::header::REFERER, checked_login_url(site)?.as_str())
        .header(reqwest::header::USER_AGENT, "Kezhi/0.1 WebView2")
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            fetch_school_schedule
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
        assert_eq!(school_site("ndnu").unwrap().allowed_host, "jwgl.ndnu.edu.cn");
        assert!(school_site("untrusted-school").is_err());
    }

    #[test]
    fn the_catalogued_login_url_is_https_and_host_locked() {
        let url = checked_login_url(&NDNU).unwrap();
        assert_eq!(url.scheme(), "https");
        assert_eq!(url.host_str(), Some("jwgl.ndnu.edu.cn"));
    }
}
