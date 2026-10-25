param(
    [string]$Device = "192.168.31.18:5555",
    [int]$Seconds = 20
)
$ErrorActionPreference = "Stop"
if ($Seconds -lt 5 -or $Seconds -gt 120) { throw "Seconds must be between 5 and 120" }
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (!(Test-Path $adb)) { throw "ADB not found: $adb" }
& $adb connect $Device | Out-Host
& $adb -s $Device get-state | Out-Null
if ($LASTEXITCODE -ne 0) { throw "TV is not connected" }
$focus = ((& $adb -s $Device shell dumpsys window) | Select-String "mCurrentFocus=" | Select-Object -First 1)
if ($null -eq $focus -or $focus.ToString() -notmatch "com.example.lampalitetv") {
    throw "Open Lampa Lite TV on the television before starting diagnostics."
}
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$folder = Join-Path $env:USERPROFILE "Desktop\Lampa-C645-Diagnostics-$stamp"
New-Item -ItemType Directory -Path $folder | Out-Null
"Read-only CPU, memory and graphics capture for TCL C645" | Set-Content (Join-Path $folder "README.txt")
("Device: " + $Device + "; started: " + (Get-Date -Format o)) | Add-Content (Join-Path $folder "README.txt")
& $adb -s $Device shell getprop ro.build.version.release | Set-Content (Join-Path $folder "android-version.txt")
& $adb -s $Device shell getprop ro.product.model | Set-Content (Join-Path $folder "model.txt")
& $adb -s $Device shell dumpsys meminfo com.example.lampalitetv | Set-Content (Join-Path $folder "app-memory-before.txt")
& $adb -s $Device shell dumpsys gfxinfo com.example.lampalitetv | Set-Content (Join-Path $folder "app-gfxinfo-before.txt")
Write-Host "Navigate continuously with the remote for $Seconds seconds..."
$watch = [Diagnostics.Stopwatch]::StartNew()
$i=0
while ($watch.Elapsed.TotalSeconds -lt $Seconds) {
    $i++
    $sec = [math]::Round($watch.Elapsed.TotalSeconds,1)
    ("SAMPLE " + $i + " at " + $sec + "s") | Add-Content (Join-Path $folder "cpu-top.txt")
    & $adb -s $Device shell top -b -n 1 -m 20 | Add-Content (Join-Path $folder "cpu-top.txt")
    Start-Sleep -Milliseconds 500
}
& $adb -s $Device shell dumpsys meminfo com.example.lampalitetv | Set-Content (Join-Path $folder "app-memory-after.txt")
& $adb -s $Device shell dumpsys gfxinfo com.example.lampalitetv | Set-Content (Join-Path $folder "app-gfxinfo-after.txt")
& $adb -s $Device shell dumpsys meminfo | Select-String -Pattern "Total RAM:|Free RAM:|Used RAM:|Lost RAM:" | Set-Content (Join-Path $folder "system-memory-summary.txt")
$zip = "$folder.zip"
Compress-Archive -Path (Join-Path $folder "*") -DestinationPath $zip
Write-Host "Diagnosis complete. Upload this ZIP: $zip"
