param(
  [switch]$Build
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidHome = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$javaHome = if ($env:JAVA_HOME -and (Test-Path -LiteralPath $env:JAVA_HOME)) {
  $env:JAVA_HOME
} else {
  Get-ChildItem -Path "C:\Program Files\Eclipse Adoptium\jdk-21*" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
$ndkRoot = Join-Path $androidHome "ndk"
$adb = Join-Path $androidHome "platform-tools\adb.exe"
$androidProject = Join-Path $projectRoot "src-tauri\gen\android"

if (-not (Test-Path -LiteralPath $javaHome)) {
  throw "未找到 JDK 21。请安装 Temurin 21，或将 JAVA_HOME 指向 JDK 21。"
}
if (-not (Test-Path -LiteralPath $adb)) {
  throw "未找到 Android Platform-Tools：$adb"
}

$ndk = Get-ChildItem -LiteralPath $ndkRoot -Directory -ErrorAction Stop |
  Sort-Object { [version]$_.Name } -Descending |
  Select-Object -First 1
if (-not $ndk) {
  throw "未找到 Android NDK，请先在 Android Studio SDK Manager 中安装 NDK (Side by side)"
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome
$env:NDK_HOME = $ndk.FullName
$env:Path = "$(Join-Path $androidHome 'platform-tools');$(Join-Path $androidHome 'cmdline-tools\latest\bin');$env:Path"

Push-Location $projectRoot
try {
  if (-not (Test-Path -LiteralPath $androidProject)) {
    bun run android:init
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }

  if ($Build) {
    bun run android:build
    exit $LASTEXITCODE
  }

  $devices = & $adb devices |
    Select-String -Pattern "^[^\s]+\s+device$"
  if (-not $devices) {
    Write-Host ""
    Write-Host "未检测到可用 Android 设备。" -ForegroundColor Yellow
    Write-Host "请连接已开启 USB 调试的手机，或在 Android Studio Device Manager 中启动模拟器。" -ForegroundColor Gray
    $studio = "C:\Program Files\Android\Android Studio\bin\studio64.exe"
    if (Test-Path -LiteralPath $studio) {
      Start-Process -FilePath $studio -ArgumentList $androidProject
    }
    exit 2
  }

  bun run android:dev
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
