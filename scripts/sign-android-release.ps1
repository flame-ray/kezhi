param(
    [Parameter(Mandatory = $true)][string]$UnsignedApk,
    [Parameter(Mandatory = $true)][string]$OutputApk,
    [string]$KeyDirectory = (Join-Path $env:USERPROFILE '.android\kezhi-release'),
    [string]$BuildTools = (Join-Path $env:LOCALAPPDATA 'Android\Sdk\build-tools\36.0.0'),
    [switch]$InitializeKey
)

# The private key and Windows-user-bound encrypted password never enter the repo.
$ErrorActionPreference = 'Stop'
$inputPath = (Resolve-Path -LiteralPath $UnsignedApk).Path
$outputPath = [IO.Path]::GetFullPath($OutputApk)
$keyPath = [IO.Path]::GetFullPath($KeyDirectory)
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($keyPath -eq $repository -or $keyPath.StartsWith($repository + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Keep signing keys outside the source repository.'
}
if (Test-Path -LiteralPath $outputPath) { throw 'Output already exists; choose a new output path.' }
$zipalign = Join-Path $BuildTools 'zipalign.exe'
$apksigner = Join-Path $BuildTools 'apksigner.bat'
foreach ($tool in @($zipalign, $apksigner)) {
    if (!(Test-Path -LiteralPath $tool)) { throw "Missing Android build tool: $tool" }
}
$keytool = (Get-Command keytool.exe -ErrorAction Stop).Source
$keystore = Join-Path $keyPath 'kezhi-release.p12'
$credentialPath = Join-Path $keyPath 'signing-password.dpapi.xml'
$alias = 'kezhi-release'

if ($InitializeKey) {
    if (Test-Path -LiteralPath $keyPath) { throw 'Signing directory already exists. Never replace an existing release key.' }
    New-Item -ItemType Directory -Path $keyPath | Out-Null
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $keyPath /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict signing directory permissions.' }
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $plainPassword = [BitConverter]::ToString($bytes).Replace('-', '')
    $credential = New-Object Management.Automation.PSCredential($alias, (ConvertTo-SecureString $plainPassword -AsPlainText -Force))
    # Export-Clixml encrypts SecureString with DPAPI on Windows (same user/machine).
    $credential | Export-Clixml -LiteralPath $credentialPath
    $env:KEZHI_RELEASE_STORE_PASSWORD = $plainPassword
    try {
        & $keytool -genkeypair -keystore $keystore -storetype PKCS12 -alias $alias -keyalg RSA -keysize 4096 -sigalg SHA256withRSA -validity 10000 -dname 'CN=Kezhi Release, OU=Android, O=Kezhi' -storepass:env KEZHI_RELEASE_STORE_PASSWORD -keypass:env KEZHI_RELEASE_STORE_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw 'Release key generation failed; do not delete or replace existing key files automatically.' }
    } finally {
        $env:KEZHI_RELEASE_STORE_PASSWORD = $null
        $plainPassword = $null
    }
}
if (!(Test-Path -LiteralPath $keystore) -or !(Test-Path -LiteralPath $credentialPath)) {
    throw 'Release signing key/password missing. Restore the original key; use -InitializeKey only for the first release.'
}
$credential = Import-Clixml -LiteralPath $credentialPath
$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ('kezhi-sign-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
$alignedPath = Join-Path $temporaryDirectory 'aligned.apk'
& $zipalign -P 16 -f 4 $inputPath $alignedPath
if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed.' }
$env:KEZHI_RELEASE_STORE_PASSWORD = $credential.GetNetworkCredential().Password
try {
    & $apksigner sign --ks $keystore --ks-type PKCS12 --ks-key-alias $alias --ks-pass env:KEZHI_RELEASE_STORE_PASSWORD --key-pass env:KEZHI_RELEASE_STORE_PASSWORD --out $outputPath $alignedPath
    if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
} finally { $env:KEZHI_RELEASE_STORE_PASSWORD = $null }
& $apksigner verify --verbose --print-certs $outputPath
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
& $zipalign -c -P 16 4 $outputPath
if ($LASTEXITCODE -ne 0) { throw 'Signed APK alignment verification failed.' }
Write-Output "Verified release APK: $outputPath"
Write-Output "Private signing files (never publish): $keyPath"
