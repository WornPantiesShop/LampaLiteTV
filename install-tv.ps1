param(
    [string]$Device = "192.168.31.18:5555"
)
$ErrorActionPreference = "Stop"
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { throw "ADB not found: $adb" }
$url = "https://github.com/WornPantiesShop/LampaLiteTV/releases/download/dev/LampaLiteTV-debug.apk"
$apk = Join-Path $env:TEMP "LampaLiteTV-from-GitHub.apk"
Write-Host "Downloading APK from GitHub release dev..."
Invoke-WebRequest -Uri $url -OutFile $apk -MaximumRedirection 10
if ((Get-Item $apk).Length -lt 10000) { throw "Downloaded file looks too small: $apk" }
Write-Host "SHA-256: $((Get-FileHash $apk -Algorithm SHA256).Hash)"
Write-Host "Connecting to TV $Device..."
& $adb connect $Device
if ($LASTEXITCODE -ne 0) { throw "ADB connection failed" }
Write-Host "Installing (no app data wipe)..."
& $adb -s $Device install -r $apk
if ($LASTEXITCODE -ne 0) { throw "Install failed. Do NOT uninstall original without a backup." }
Write-Host "Launching Lampa Lite TV..."
& $adb -s $Device shell am start -n com.example.lampalitetv/.MainActivity
Write-Host "Done."
