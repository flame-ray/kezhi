use std::time::Duration;

#[tauri::command]
pub(crate) async fn check_app_update() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(concat!("Kezhi/", env!("CARGO_PKG_VERSION")))
        .build().map_err(|_| "无法初始化更新连接")?;
    let mut response = client.get("https://api.github.com/repos/flame-ray/kezhi/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send().await.map_err(|_| "暂时无法连接 GitHub，请检查网络后重试")?;
    if response.status().as_u16() == 403 || response.status().as_u16() == 429 {
        return Err("更新服务访问频繁，请稍后重试".into());
    }
    if !response.status().is_success() { return Err("暂时未能获取正式版信息，请稍后重试".into()); }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "更新信息读取失败")? {
        if bytes.len() + chunk.len() > 524288 { return Err("更新信息过大".into()); }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "更新信息格式无效".into())
}
