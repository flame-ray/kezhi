#[cfg(target_os = "android")]
use tauri::{plugin::{Builder, PluginHandle, TauriPlugin}, Manager, Runtime};

#[cfg(target_os = "android")]
pub(crate) struct PhoneCalendar<R: Runtime>(PluginHandle<R>);

#[tauri::command]
pub(crate) async fn write_phone_calendar(
    app: tauri::AppHandle,
    request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let command = match request.get("action").and_then(serde_json::Value::as_str) {
                Some("preview") => "previewCalendar",
                Some("apply") => "applyCalendar",
                None | Some("write") => "writeCalendar",
                _ => return Err("不支持的日历操作".into()),
            };
            app.state::<PhoneCalendar<tauri::Wry>>().0
                .run_mobile_plugin(command, request)
                .map_err(|error| error.to_string())
        }).await.map_err(|error| error.to_string())?
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, request);
        Err("直接写入手机日历需要 Android 安装版，请使用 ICS 导出".into())
    }
}

#[cfg(target_os = "android")]
pub(crate) fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("phone-calendar").setup(|app, api| {
        let handle = api.register_android_plugin("app.kezhi.android", "PhoneCalendarPlugin")?;
        app.manage(PhoneCalendar(handle));
        Ok(())
    }).build()
}
