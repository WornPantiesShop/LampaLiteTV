param(
    [string]$Device = "192.168.31.18:5555",
    [int]$Seconds = 12
)
$ErrorActionPreference = "Stop"
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (!(Test-Path $adb)) { throw "ADB not found: $adb" }
if ($Seconds -lt 3) { throw "Use at least 3 seconds" }
$package = "com.example.lampalitetv"
$screenLine = & $adb -s $Device shell dumpsys window | Select-String "mCurrentFocus=" | Select-Object -First 1
if ($null -eq $screenLine -or $screenLine.ToString() -notmatch [regex]::Escape($package)) {
    throw "Lampa Lite TV is not focused; open it on the TV first."
}
$layers = @(& $adb -s $Device shell dumpsys SurfaceFlinger --list | ForEach-Object { $_.Trim() } |
    Where-Object { $_ -match "^$([regex]::Escape($package))/$([regex]::Escape($package))\.MainActivity#\d+$" })
if ($layers.Count -lt 1) { throw "No Lampa Lite surface found" }
$layer = $layers[-1]
$times = [System.Collections.Generic.SortedSet[long]]::new()
Write-Host "Surface: $layer"
& $adb -s $Device shell dumpsys SurfaceFlinger --latency-clear $layer | Out-Null
Write-Host "Move continuously across the SAME row of cards for $Seconds seconds."
# SurfaceFlinger keeps a short rolling buffer (~127 frames). Poll often and merge
# overlapping windows instead of reading only the final ~3 seconds.
$watch = [Diagnostics.Stopwatch]::StartNew()
while ($watch.Elapsed.TotalSeconds -lt $Seconds) {
    $raw = @(& $adb -s $Device shell dumpsys SurfaceFlinger --latency $layer)
    foreach ($line in ($raw | Select-Object -Skip 1)) {
        $p = $line.Trim() -split '\s+'
        if ($p.Count -eq 3 -and $p[1] -match '^\d+$' -and $p[1] -ne "9223372036854775807") {
            $value = [long]$p[1]
            if ($value -gt 0) { [void]$times.Add($value) }
        }
    }
    Start-Sleep -Milliseconds 900
}
if ($times.Count -lt 3) { throw "Not enough frame samples" }
$frames = @($times)
$intervals = @(
    for ($i=1; $i -lt $frames.Count; $i++) {
        $ms = ($frames[$i] - $frames[$i-1]) / 1000000.0
        if ($ms -gt 0) { $ms }
    }
)
$quick = @($intervals | Where-Object { $_ -le 24 })
$slow = @($intervals | Where-Object { $_ -gt 33.3 })
$pauses = @($intervals | Where-Object { $_ -ge 100 })
$mean = ($intervals | Measure-Object -Average).Average
$sorted = @($intervals | Sort-Object)
$median = $sorted[[int][math]::Floor($sorted.Count/2)]
$duration = ($frames[-1] - $frames[0]) / 1000000000.0
Write-Host ("Captured {0} frame timestamps spanning {1:N1}s" -f $frames.Count,$duration)
Write-Host ("Mean FPS (includes pauses): {0:N1}; median interval: {1:N2}ms" -f (1000/$mean),$median)
Write-Host ("Intervals <=24ms: {0}/{1}; >33.3ms: {2}; >=100ms: {3}" -f $quick.Count,$intervals.Count,$slow.Count,$pauses.Count)
$out = Join-Path $env:USERPROFILE "Desktop\Lampa_C645_FPS_full.txt"
(@("16666666") + @($frames | ForEach-Object { "$_" })) | Set-Content $out
Write-Host "Captured presentation timestamps: $out"
