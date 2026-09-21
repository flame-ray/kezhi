# 1.3.0 — 今天与下一节课

发行版本：v1.3.0。安装包与源码见 [GitHub Release](https://github.com/flame-ray/kezhi/releases/tag/v1.3.0)。

## Android 桌面小组件

- 在“设置 → 添加桌面小组件”请求系统固定到桌面。Android 7 或不支持固定请求的桌面，长按桌面空白处 → 小组件／工具 → 课织 → 今天与下一节课。
- 显示本地日期、今天课程数量、正在上课／后续课程、时间与教室，突出显示下一堂尚未开始的课（可跨天）。当天已结束的课程在没有剩余课程时仍可查看。
- 根据桌面分配的高度展示 1–3 条课程，剩余数量另行提示；点击打开课织，右上角 ↻ 手动刷新。支持调整大小，颜色跟随 Android 系统明暗主题，不跟随应用手动主题。
- 导入、手动编辑、删除、单次调课／停课、切换作息及开学日期后，自动更新本地缓存。遵循单双周、周次及实际开课日期，不把“未开课”课程当作当天安排。
- 本机私有缓存仅包含日期、起止时间、课程名与教室，不保存账号、密码或成绩。不需要定位权限、联网、常驻前台服务或精确闹钟权限。
- 定期刷新及课程起止／跨天刷新由系统调度；开机、修改日期／时区、升级安装后尝试重新刷新。省电模式和厂商后台限制可能延迟更新；强行停止应用后需重新打开。小组件显示最后刷新时间，不能当作精确到点的通知。

课程与教室将直接显示在手机桌面，请留意周围人的可见范围。

## 校园地图

- 南行政楼右侧“实验楼”标签与楼栋选择改为“医学院”，保留“实验楼”旧别名匹配，不改变化学／生物／物理实验楼。
- 底图 v2 保持原有坐标；仍是位置示意图，默认全图显示，仅高亮楼栋，不提供路线导航。

## 验证与待验收

2026-09-21 本地结果：227 项前端测试、22 项 Rust 测试、11 项 Kotlin 测试全部通过；小组件桥接、地图与当前周滑动三个 UI smoke 脚本通过。

已生成 `Kezhi-1.3.0-arm64.apk`，22,566,896 字节，versionCode 10300。沿用原正式签名，v2/v3 校验通过；包内已确认地图 v2、当前前端及小组件命令。SHA-256：`c39df4ac27423408aab6713e5b07b94a9c16bec88a1f9d972d7a7f6050359285`。

Windows 安装包 `Kezhi-1.3.0-windows-x64-setup.exe`，6,197,831 字节，包含地图更名；桌面小组件仅限 Android。Windows 安装包未配置 Authenticode 签名，可能提示未知发布者。SHA-256：`bddb53824bf0f357dffdf6f27306e6b4e62e341b80f0a9d418f8c16fd0da842a`。建议覆盖升级前导出 JSON 备份，旧发布版本与附件保留。

- 前端单元测试含小组件日期投影、单双周、单次调课／停课、空课表及作息变更。
- Kotlin JVM 测试覆盖上课前、正在上课、结束边界、跨天、空数据、非法时间与夏令时。
- UI 自动化覆盖同步内容最小化、等待本机课表加载、添加入口、系统不支持时的引导、同步失败重试、清空课程，以及非 Android 平台不展示该入口。
- 地图 UI 回归核对“医学院”选择、高亮、v2 图片、系统返回和原有滑动行为。
- Android release 构建及正式签名校验。未连接真机／未安装模拟器，未验证真实桌面固定弹窗、RemoteViews 最终显示和厂商省电策略；安装后需重点验收这三项。

## 开发验证命令

```powershell
bun run build
bun run test
cargo test --manifest-path src-tauri/Cargo.toml --lib
$env:KEZHI_PLAYWRIGHT_PATH='D:\tools\Lib\site-packages\playwright\driver\package'
node scripts/ui-widget-smoke.cjs
node scripts/ui-campus-map-smoke.cjs
node scripts/ui-current-week-smoke.cjs
# 设置 JAVA_HOME、ANDROID_HOME 后，在 src-tauri/gen/android 下执行：
.\gradlew.bat :app:testUniversalReleaseUnitTest -x :app:rustBuildUniversalRelease
```

UI 脚本使用本地 1421 端口开发服务。原生单元测试不替代真实桌面显示测试。
