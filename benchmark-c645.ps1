param(
    [string]$Device = "192.168.31.18:5555",
    [int]$Seconds = 12
)
$ErrorActionPreference = "Stop"
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (!(Test-Path $adb)) { throw "ADB not found: $adb" }
$package = "com.example.lampalitetv"
$screen = (& $adb -s $Device shell dumpsys window | Select-String "mCurrentFocus=" | Select-Object -First 1).ToString()
if ($screen -notmatch [regex]::Escape($package)) { throw "Lampa Lite TV is not focused. Current focus: $screen" }
$layers = @(& $adb -s $Device shell dumpsys SurfaceFlinger --list | ForEach-Object { $_.Trim() } |
    Where-Object { $_ -match "^$([regex]::Escape($package))/$([regex]::Escape($package))\.MainActivity#\d+$" })
if ($layers.Count -lt 1) { throw "No Lampa Lite surface found" }
$layer = $layers[-1]
Write-Host "Surface: $layer"
& $adb -s $Device shell dumpsys SurfaceFlinger --latency-clear $layer | Out-Null
Write-Host "Move continuously across the SAME row of cards with the TV remote for $Seconds seconds."
Start-Sleep -Seconds $Seconds
$raw = @(& $adb -s $Device shell dumpsys SurfaceFlinger --latency $layer)
$frames = @($raw | Select-Object -Skip 1 | ForEach-Object {
    $p = $_.Trim() -split '\s+'
    if ($p.Count -eq 3 -and $p[1] -match '^\d+$' -and $p[1] -ne '9223372036854775807') {
        [long]$p[1]
    }
})
if ($frames.Count -lt 3) { throw "Not enough frame samples; run again while actively moving cards." }
$intervals = @(
    for ($i = 1; $i -lt $frames.Count; $i++) {
        $ms = ($frames[$i] - $frames[$i - 1]) / 1000000.0
        if ($ms -gt 0) { $ms }
    }
)
$quick = @($intervals | Where-Object { $_ -le 24 })
$slow = @($intervals | Where-Object { $_ -gt 33.3 })
$pauses = @($intervals | Where-Object { $_ -ge 100 })
$mean = ($intervals | Measure-Object -Average).Average
$sorted = @($intervals | Sort-Object)
$median = $sorted[[int][math]::Floor($sorted.Count / 2)]
Write-Host ("Frame samples: {0}; mean FPS (includes pauses): {1:N1}" -f $frames.Count, (1000/$mean))
Write-Host ("Median frame interval: {0:N2}ms" -f $median)
Write-Host ("Intervals <=24ms: {0}/{1}; >33.3ms: {2}; >=100ms: {3}" -f $quick.Count,$intervals.Count,$slow.Count,$pauses.Count)
$filename = Join-Path $env:USERPROFILE "Desktop\Lampa_C645_FPS.txt"
$raw | Set-Content $filename
Write-Host "Raw frames: $filename"
