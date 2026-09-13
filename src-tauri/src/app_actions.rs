#[cfg(target_os = "android")]
use tauri::{plugin::{Builder, PluginHandle, TauriPlugin}, Manager, Runtime};

#[cfg(target_os = "android")]
struct AppActions<R: Runtime>(PluginHandle<R>);

#[tauri::command]
pub(crate) async fn return_to_home(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    { tauri::async_runtime::spawn_blocking(move || app.state::<AppActions<tauri::Wry>>().0.run_mobile_plugin::<()>("goHome", ()).map_err(|error| error.to_string())).await.map_err(|error| error.to_string())? }
    #[cfg(not(target_os = "android"))]
    { let _ = app; Err("仅 Android 支持返回桌面".into()) }
}

#[tauri::command]
pub(crate) async fn save_exam_calendar(app: tauri::AppHandle, content: String) -> Result<serde_json::Value, String> {
    if content.len() > 4 * 1024 * 1024 || !content.starts_with("BEGIN:VCALENDAR\r\n") || !content.ends_with("END:VCALENDAR\r\n") { return Err("考试日历内容格式或大小无效".into()); }
    #[cfg(target_os = "android")]
    { tauri::async_runtime::spawn_blocking(move || app.state::<AppActions<tauri::Wry>>().0.run_mobile_plugin("saveExamCalendar", serde_json::json!({"content":content})).map_err(|error| error.to_string())).await.map_err(|error| error.to_string())? }
    #[cfg(not(target_os = "android"))]
    { let _ = app; Err("请使用文件下载导出日历".into()) }
}

#[cfg(target_os = "android")]
pub(crate) fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("app-actions").setup(|app, api| {
        let handle = api.register_android_plugin("app.kezhi.android", "AppActionsPlugin")?;
        app.manage(AppActions(handle));
        Ok(())
    }).build()
}
