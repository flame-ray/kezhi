use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

const PLUGIN_NAME: &str = "school-login";
const ANDROID_PACKAGE: &str = "app.kezhi.android";
const ANDROID_CLASS: &str = "SchoolLoginPlugin";

pub(crate) struct AndroidSchoolLogin<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenRequest<'a> {
    pub(crate) url: &'a str,
    pub(crate) allowed_host: &'a str,
    pub(crate) account_id: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeLoginStatus {
    pub(crate) window_open: bool,
    pub(crate) authenticated: bool,
    #[serde(default)]
    pub(crate) cookie_header: String,
    #[serde(default)]
    pub(crate) user_agent: String,
    #[serde(default)]
    pub(crate) account_id: String,
}

impl<R: Runtime> AndroidSchoolLogin<R> {
    pub(crate) fn open(&self, request: OpenRequest<'_>) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<()>("open", request)
            .map_err(|error| error.to_string())
    }

    pub(crate) fn status(&self) -> Result<NativeLoginStatus, String> {
        self.0
            .run_mobile_plugin("status", ())
            .map_err(|error| error.to_string())
    }

    pub(crate) fn close(&self) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<()>("close", ())
            .map_err(|error| error.to_string())
    }
}

pub(crate) fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new(PLUGIN_NAME)
        .setup(|app, api| {
            let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_CLASS)?;
            app.manage(AndroidSchoolLogin(handle));
            Ok(())
        })
        .build()
}
