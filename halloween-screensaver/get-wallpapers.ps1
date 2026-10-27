$ErrorActionPreference = 'Stop'
$assets = Join-Path $PSScriptRoot 'src/main/assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null
$clips = @(
    @{Name='zombies.mp4'; Url='https://motionbgs.com/dl/4k/7086'; Sha='5EC597D01280BF4F043AF4B1713C8A7F07D87905A21D4B24B8FE8618FA2DC64F'},
    @{Name='ghosts-wall.mp4'; Url='https://motionbgs.com/dl/hd/3134'; Sha='5C626846695CA11C58B6BD02A573B137C15A4F9FF57EF4E361C72E2D08A022D3'}
)
foreach ($clip in $clips) {
    $path = Join-Path $assets $clip.Name
    if (!(Test-Path -LiteralPath $path)) { Invoke-WebRequest -Uri $clip.Url -OutFile $path }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $clip.Sha) {
        throw "Wallpaper differs from the tested original: $($clip.Name). Inspect it before rebuilding."
    }
    Write-Host "Verified $($clip.Name)"
}
