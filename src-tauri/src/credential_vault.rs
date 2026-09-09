use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
const SERVICE_NAME: &str = "app.kezhi.school-login";
const MAX_SECRET_BYTES: usize = 480;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedLoginCredential {
    pub(crate) username: String,
    pub(crate) password: String,
}

pub(crate) fn validate_key(school_id: &str, account_id: &str) -> Result<String, String> {
    if !valid_identifier(school_id) || !valid_identifier(account_id) {
        return Err("学校或账号标识无效".into());
    }
    Ok(format!("{school_id}.{account_id}"))
}

pub(crate) fn validate_credential(
    username: &str,
    password: &str,
) -> Result<SavedLoginCredential, String> {
    let username = username.trim();
    if username.is_empty() || username.chars().count() > 80 {
        return Err("登录账号长度无效".into());
    }
    if password.is_empty() || password.chars().count() > 256 {
        return Err("密码长度无效".into());
    }
    if username.chars().any(char::is_control) || password.chars().any(|value| value == '\0') {
        return Err("账号或密码包含不支持的字符".into());
    }
    let credential = SavedLoginCredential {
        username: username.into(),
        password: password.into(),
    };
    let serialized = serde_json::to_vec(&credential).map_err(|error| error.to_string())?;
    if serialized.len() > MAX_SECRET_BYTES {
        return Err("账号密码过长，无法写入系统保险库".into());
    }
    Ok(credential)
}

#[cfg(target_os = "windows")]
pub(crate) fn initialize() -> Result<(), String> {
    let store = windows_native_keyring_store::Store::new().map_err(vault_error)?;
    keyring_core::set_default_store(store);
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn save(key: &str, credential: &SavedLoginCredential) -> Result<(), String> {
    let serialized = serde_json::to_string(credential).map_err(|error| error.to_string())?;
    keyring_core::Entry::new(SERVICE_NAME, key)
        .and_then(|entry| entry.set_password(&serialized))
        .map_err(vault_error)
}

#[cfg(target_os = "windows")]
pub(crate) fn load(key: &str) -> Result<Option<SavedLoginCredential>, String> {
    let entry = keyring_core::Entry::new(SERVICE_NAME, key).map_err(vault_error)?;
    let serialized = match entry.get_password() {
        Ok(value) => value,
        Err(keyring_core::Error::NoEntry) => return Ok(None),
        Err(error) => return Err(vault_error(error)),
    };
    let credential = serde_json::from_str::<SavedLoginCredential>(&serialized)
        .map_err(|_| "系统保险库中的登录信息已损坏，请删除后重新保存".to_string())?;
    validate_credential(&credential.username, &credential.password).map(Some)
}

#[cfg(all(desktop, not(target_os = "windows")))]
pub(crate) fn load(_key: &str) -> Result<Option<SavedLoginCredential>, String> {
    Ok(None)
}

#[cfg(target_os = "windows")]
pub(crate) fn delete(key: &str) -> Result<(), String> {
    let entry = keyring_core::Entry::new(SERVICE_NAME, key).map_err(vault_error)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
        Err(error) => Err(vault_error(error)),
    }
}

#[cfg(target_os = "windows")]
fn vault_error(error: impl std::fmt::Display) -> String {
    format!("无法访问 Windows 凭据管理器：{error}")
}

#[cfg(desktop)]
pub(crate) fn autofill_script(credential: &SavedLoginCredential) -> Result<String, String> {
    let username =
        serde_json::to_string(&credential.username).map_err(|error| error.to_string())?;
    let password =
        serde_json::to_string(&credential.password).map_err(|error| error.to_string())?;
    Ok(format!(
        r#"(() => {{
          const username = {username};
          const password = {password};
          const setValue = (input, value) => {{
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(input, value); else input.value = value;
            input.dispatchEvent(new Event('input', {{ bubbles: true }}));
            input.dispatchEvent(new Event('change', {{ bubbles: true }}));
          }};
          const fill = () => {{
            const passwordInput = document.querySelector('input[type="password"]');
            if (!passwordInput) return false;
            const scope = passwordInput.form || document;
            const usernameInput = scope.querySelector('input[autocomplete="username"], input[name*="user" i], input[name*="account" i], input[name*="login" i], input[id*="user" i], input[id*="account" i]') || Array.from(scope.querySelectorAll('input:not([type]), input[type="text"], input[type="email"], input[type="tel"]')).find((input) => {{
              const hint = `${{input.name}} ${{input.id}} ${{input.placeholder}}`.toLowerCase();
              return !/(captcha|verify|yzm|code|验证码)/.test(hint);
            }});
            if (!usernameInput) return false;
            if (!usernameInput.value) setValue(usernameInput, username);
            if (!passwordInput.value) setValue(passwordInput, password);
            return true;
          }};
          if (!fill()) {{
            const observer = new MutationObserver(() => {{ if (fill()) observer.disconnect(); }});
            observer.observe(document.documentElement, {{ childList: true, subtree: true }});
            window.setTimeout(() => observer.disconnect(), 15000);
          }}
        }})()"#
    ))
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_keys_and_empty_secrets() {
        assert!(validate_key("ndnu", "account-1").is_ok());
        assert!(validate_key("../school", "account-1").is_err());
        assert!(validate_credential("student", "").is_err());
    }

    #[test]
    fn autofill_script_quotes_untrusted_values() {
        let credential = validate_credential("student\"name", "pa'ss\\word").unwrap();
        let script = autofill_script(&credential).unwrap();
        assert!(script.contains("student\\\"name"));
        assert!(script.contains("pa'ss\\\\word"));
        assert!(!script.contains("const username = student"));
    }
}
