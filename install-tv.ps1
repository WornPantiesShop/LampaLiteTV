param(
    [string]$Device = "192.168.31.18:5555"
)
$ErrorActionPreference = "Stop"

$Sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$adb = Join-Path $Sdk "platform-tools\adb.exe"
$keystore = Join-Path $env:USERPROFILE ".android\debug.keystore"
if (-not (Test-Path $adb)) { throw "ADB not found: $adb" }
if (-not (Test-Path $keystore)) { throw "Local Android Studio debug keystore not found: $keystore" }

$buildTools = Join-Path $Sdk "build-tools"
$signer = Get-ChildItem -Path $buildTools -Recurse -Filter "apksigner.bat" -File -ErrorAction SilentlyContinue |
    Sort-Object { try { [version]$_.Directory.Name } catch { [version]"0.0" } } -Descending |
    Select-Object -First 1
if (-not $signer) { throw "apksigner.bat not found. Install Android SDK Build-Tools in Android Studio." }

$url = "https://github.com/WornPantiesShop/LampaLiteTV/releases/download/dev/LampaLiteTV-debug.apk"
$apk = Join-Path $env:TEMP "LampaLiteTV-from-GitHub.apk"
$signed = Join-Path $env:TEMP "LampaLiteTV-locally-signed.apk"

Write-Host "Downloading the latest development APK from GitHub..."
Invoke-WebRequest -Uri $url -OutFile $apk -MaximumRedirection 10
if ((Get-Item $apk).Length -lt 10000) { throw "Downloaded APK looks too small" }
Write-Host "GitHub APK SHA-256: $((Get-FileHash $apk -Algorithm SHA256).Hash)"

# Re-sign GitHub build with the computer's existing Android Studio debug key.
# Never upload the keystore to GitHub or replace the installed app's data.
# Standard Android Studio debug keystore password is 'android'.
if (Test-Path $signed) { Remove-Item $signed -Force }
Write-Host "Signing locally with existing Android Studio debug key..."
& $signer.FullName sign --ks $keystore --ks-key-alias androiddebugkey --ks-pass "pass:android" --key-pass "pass:android" --out $signed $apk
if ($LASTEXITCODE -ne 0) { throw "Local APK signing failed; TV unchanged" }
& $signer.FullName verify --verbose $signed
if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed; TV unchanged" }
Write-Host "Signed APK SHA-256: $((Get-FileHash $signed -Algorithm SHA256).Hash)"

Write-Host "Connecting to TV $Device..."
& $adb connect $Device
if ($LASTEXITCODE -ne 0) { throw "ADB connection failed" }
Write-Host "Installing update without clearing app data..."
& $adb -s $Device install -r $signed
if ($LASTEXITCODE -ne 0) {
    throw "Install failed. Signature may differ from the existing installation. Do NOT uninstall it without a backup."
}
Write-Host "Launching Lampa Lite TV..."
& $adb -s $Device shell am start -n com.example.lampalitetv/.MainActivity
if ($LASTEXITCODE -ne 0) { throw "Installed but launch failed" }
Write-Host "Done."
