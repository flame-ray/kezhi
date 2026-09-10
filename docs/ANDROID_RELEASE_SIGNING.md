# Android 正式发行签名

从 1.0.0 起使用独立 RSA-4096 正式发行密钥，不再使用 Android debug.keystore。之后的正式版必须沿用这把密钥，否则无法覆盖升级。正式签名不代表应用经过商店审核或所有真机兼容性认证。

正式证书 SHA-256：`64a23c1c06fbcf1182078c7b2586212374a7fecbd1af27c55c515d30cac46fe4`。

## 首次从旧测试版迁移

1. 在旧版导出 JSON 备份，保存到应用目录之外，并确认文件可以读取。
2. 卸载旧测试版（卸载会删除应用私有数据库、自动恢复点和已保存密码）。
3. 安装 1.0.0 正式签名 APK，导入 JSON 备份；重新登录并保存账号密码。

JSON 课表备份不包含密码、选课提交配置等全部私有数据，请在卸载前另行记录需要保留的设置。系统日历中旧事件可能仍存在，重新导入前请核对预览以免重复。

## 维护者打包

先按 README 构建未签名 ARM64 APK，再在 Windows PowerShell 中执行：

```powershell
.\scripts\sign-android-release.ps1 `
  -UnsignedApk '.\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk' `
  -OutputApk 'E:\课表\Kezhi-1.0.0-arm64.apk'
```

只在首次创建密钥时加 `-InitializeKey`。脚本拒绝覆盖已有密钥目录和已有输出 APK；后续版本不加此参数，使用相同密钥签名。默认 Android build-tools 为 36.0.0，可通过 `-BuildTools` 指定本机版本；需要 keytool 在 PATH 中。

密钥默认存放在用户目录 `.android/kezhi-release/`，不在源码中。目录访问权限仅授予当前 Windows 用户和 SYSTEM。随机密码通过 Windows DPAPI 加密保存为 `signing-password.dpapi.xml`，明文仅在签名进程内短暂使用，不写入仓库、日志或命令行参数。

**务必离线备份正式密钥和密码。** DPAPI 文件只适用于原 Windows 用户／机器，单独拷贝它到新电脑无法恢复密码。请在原机上将密码安全转存到自己的密码管理器，并将 `kezhi-release.p12` 保存到加密离线备份；不要把密钥或密码发到 GitHub、聊天或问题反馈中。不要将仅有的原机 DPAPI 副本误当成可跨机器恢复的备份。丢失密钥或密码可能永久失去现有安装的覆盖升级能力。

发布只上传 APK、Windows 安装包和校验清单，不上传 `.p12`、`.keystore`、密码文件或其他私有文件。公开证书指纹可用于核验签名，不是私钥。
