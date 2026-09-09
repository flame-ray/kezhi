# 0.4.4 界面与动效改版验收

日期：2026-09-09。本文记录 0.4.4 界面与动效改版的范围和验证结果。

## 改版范围

- 统一 Material 风格的亮色/暗色配色、文字层级、间距、圆角与按钮状态。
- 9 类弹窗/面板统一交互：添加/编辑课程、课程详情、作息、设置、成绩编辑、教务导入、ICS 导入、导出、同步差异。
- Windows 居中弹窗；手机底部面板；触控拖拽柄支持短拖回弹和下拉关闭。
- 关闭按钮、保存、Escape 与应用返回状态关闭均保留 200ms 退场生命周期。
- 模态窗口隔离背景交互、约束键盘焦点，关闭后恢复焦点；嵌套编辑与详情可以逐级返回。
- 手机输入使用视觉视口约束，内容滚动与底部操作栏分离；移除自动聚焦输入导致的无意唤起键盘。
- 导入步骤方向性过渡，切步滚动位置复位；每一步都有标题与进度文字。
- “今天”页三页跟手滑动、日期条触摸滚动和点击选日；避免程序自动居中时误选中途日期。
- 日期切换、提示条、按钮触控反馈和导航选中状态使用统一的动效时长与缓动。
- 课程窄列改善字号、换行、单双周标记；成绩页主操作与统计信息重新排版。
- 长按添加、自动选课、凭据保存等已有业务继续使用原有入口。

## 性能取舍

- 动态面板以 transform 和 opacity 为主，不用逐帧修改 React 状态驱动手势。
- 手势移动使用 requestAnimationFrame 合并；周视图合成提示只在滑动/收尾期间启用。
- 弹窗遮罩以独立透明度层处理；取消覆盖大面积内容的实时 backdrop-filter 模糊。
- 移除静态页面长期保留的 will-change 和不必要的独立合成层。
- 系统“减少动态效果”偏好同时作用于 CSS 动画、页面过渡、日期居中和日历翻页。
- 不引入额外动画运行时依赖。

设计参考：[Material Components 官方动效规范](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)、[官方底部面板组件说明](https://github.com/material-components/material-components-android/blob/master/docs/components/BottomSheet.md)。这些是视觉和交互参考，本应用仍采用 React + Tauri。

## 验证结果

- 101 项原有前端单元测试全部通过。
- TypeScript 与 Vite 生产构建通过。
- 16 项主流程浏览器检查通过：空课表、课程保存、详情嵌套编辑、导入返回、ICS、作息、设置、成绩、选课页面、日期点击与手势、深色主题、Windows 导出与减少动态效果。
- 9 项扩展检查通过：长按添加、短拖回弹、下拉关闭、取消翻周、连续翻周、键盘高度下操作栏、快速重复开关、同步确认、模拟原生导入。
- 390×844 手机、320×568 小屏、390×400 键盘高度场景、1440×960 桌面布局经过检查。
- 本机无头 Chromium 的弹窗重复开关样本：169 个帧间隔，95 分位 16.7ms，最大 16.8ms，未记录到超过 50ms 的长任务。这是测试机浏览器样本，不是 Android 真机性能保证。
- 所有浏览器检查均阻断非本机 HTTP 请求；原生登录与课表读取使用模拟调用，没有向学校发起操作。

重跑浏览器检查时，先启动本地 Vite 服务器（默认测试地址 http://127.0.0.1:1421），并提供可用的 Playwright 模块：
- scripts/ui-smoke.cjs
- scripts/ui-motion-smoke.cjs
- 可通过 KEZHI_UI_URL、KEZHI_UI_OUTPUT、KEZHI_PLAYWRIGHT_PATH 指定测试地址、输出目录和模块路径。
- scripts/ui-fixtures.html / .tsx 仅供本地开发服务器测试；不属于生产入口，正式构建不会打包这些页面。

## 仍需真机验证

- Android 系统侧边返回与不同输入法实际键盘的交互，特别是各厂商的手势导航。
- 60/90/120Hz 设备上的实测帧率、低端手机及高密度课表的性能。
- 原生教务浏览器窗口仍使用现有 Android/Windows 适配，不属于本轮 React 页面重做。
- Android 包沿用本机调试证书，是测试安装包；Windows 安装包未配置公开代码签名。

## 安装包

- Android：`Kezhi-0.4.4-arm64-test-signed.apk`，19,977,666 字节（19.98 MB / 19.05 MiB），arm64 测试版，版本 0.4.4 / versionCode 4004，Android 7.0 及以上。
- APK v2、v3 签名与 16 KB 页对齐检查通过；沿用原有本机调试证书，证书 SHA-256：`bc6f6cd56653f5eb634b9846df84e85a84b1e5bf03e3050092c1c65456a47232`。
- APK SHA-256：`DA30359EF6AF1598ADD1130D567D1C5065173B4CA0ED4B6D113C8F015D81E2A7`。
- Windows：`src-tauri/target/release/bundle/nsis/课织_0.4.4_x64-setup.exe`，4,176,095 字节（4.18 MB / 3.98 MiB），x64 安装包，未配置公开代码签名。
- Windows 安装包 SHA-256：`F927EC4E6BF29013D57CEC73F56BB96EFDC6DD28951482AC15F32AD604FA4693`。
- 此轮只生成本地安装包，未安装到手机、未上传 GitHub。
