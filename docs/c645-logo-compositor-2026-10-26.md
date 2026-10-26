# TCL C645: logo compositor optimization, 2026-10-26

## Result and scope

Version 1.5.3-c645 (versionCode 9) was built, linted, signed with the existing
local Android debug key and installed with install-tv.ps1 / adb install -r.
No package data was cleared and no TV system settings were changed.
**A stable 60 FPS has not been achieved.** This iteration removes a measured
paint bottleneck while retaining the visible logo animation and catalog motion.

The original Halloween logo animates background-color continuously. DevTools
navigation tracing showed about 6.27 s Paint, 3.14 s Layerize and 2.56 s
UpdateLayoutTree over roughly 40 s; most Paint was associated with the full
1920x1080 document, despite the small animated logo. A diagnostic pause of only
this logo improved presentation cadence. Pausing it is NOT the shipped fix.

The asset recreates its same colors, per-keyframe ease, five-second period and
current phase using two colored layers and compositor opacity. Colors change
only at the original keyframe boundaries, while the changing layer is hidden.
The code affects only .head__logo-halloween-fire on lampa.mx. It checks the
original keyframes, colors, timing, playback rate and an unused ::after before
activating. Unknown future animation versions retain the original behavior.
Catalog rows, card animations, media paths, key handling and storage are untouched.
The observer watches the header after activation; the timer stops while hidden.
The state.restore() hook removes this override for diagnostic same-page A/B.

## Method

Both existing benchmark-c645.ps1 and diagnose-c645.ps1 ran concurrently for
24 seconds. A temporary app_process DEX sends native Instrumentation key down/up
pairs, all within one Java VM: spawning `input keyevent` for every key adds
substantial CPU load on this TV. This still exercises the Activity/WebView key
path. Delay is 600 ms, with a three-second driver warmup; 24 keys per run.

Horizontal sequence: (RIGHT x3, LEFT x3) x4. Rows sequence:
DOWN,R,R,L,L,DOWN,R,R,L,L,DOWN,R,L,UP,R,R,L,L,UP,R,R,L,L,UP.
Both start at the first card of the first row via Lampa's focus controller.
No CSS motion suppression or WebView rendering flags are used.

SurfaceFlinger presentation timestamps are the primary metric. Its rolling
127-frame buffer is polled and merged. CDP NavigationStart aligns DOM arrow
keydown times with monotonic SF timestamps. Only consecutive frame intervals
inside the first 400 ms after each key count in the navigation metrics below;
intervals between keys and idle stretches are excluded. RAF is also captured,
but callbacks are not proof that a new frame was presented. Gfxinfo is cumulative
Android host telemetry and is not equivalent to rendered WebView content FPS.

## Navigation results

| Scenario | Variant | Presentation FPS | p95 interval ms | intervals >25ms / samples |
|---|---|---:|---:|---:|
| Horizontal | original logo, control | 45.05 | 33.92 | 123 / 407 |
| Horizontal | optimized, run 1 | 57.35 | 17.47 | 20 / 523 |
| Horizontal | optimized, run 2 | 58.26 | 17.41 | 16 / 536 |
| Horizontal, final expanded catalog | optimized | 58.68 | 17.45 | 12 / 538 |
| Rows, initial | original logo | 37.22 | 49.99 | 166 / 323 |
| Rows, initial | optimized | 56.27 | 33.26 | 30 / 517 |
| Rows, repeated after lazy loading | original logo | 35.22 | 50.03 | 179 / 310 |
| Rows, repeated after lazy loading | optimized | 53.72 | 33.34 | 46 / 488 |

All runs delivered 24 DOM keydown events and ended in items_line. Controls use
the same installed APK with only the logo override restored. Tests were not
randomized; cache, network, growing lazy-loaded rows and temperature can affect
absolute values. Initial rows runs caused additional loading; the repeated
pair used the already expanded catalog (16 rows). These are short TV tests,
not a guarantee for every plugin, network source or catalog.

Horizontal gain is approximately 27-29%; the warmed row comparison is about
53%. Horizontal p95 approaches the 16.67 ms budget, but row p95 still reaches
33.3 ms. Native presentation and JS RAF metrics diverge, so a smooth RAF counter
alone must not be described as stable 60 FPS. Future work should profile layout,
card/poster work and scrolling during row changes, preserving their animations.

## Correctness checks

- JavaScript syntax, assembleDebug and lintDebug passed. Existing lint warnings
  (TV landscape / old sideload target API) remain; targetSdk is unchanged.
- Installed state became active automatically; one injected style / one opacity
  animation. Reinjecting is idempotent.
- Changing the original playbackRate to 0.5 makes the compatibility guard refuse
  activation, without injecting CSS; restoring playbackRate to 1 activates normally.
- Sixteen natural-time samples across a complete logo cycle matched the original
  computed RGB exactly, including the final transition to the underlying base color.
  This validates colors mathematically; it is not physical screen video capture.
- Catalog lazy loading remains functional: 4 initially loaded rows expanded to
  10 and then 16 during the row tests. No global transition/animation override.
- Native D-pad events reached catalog focus; BACK exits HTML5 fullscreen and
  restores the catalog. Local H.264 Blob test: 640x360, playing, fullscreen=true,
  75 decoded/presented video frames at the sample; fullscreen=false after BACK.
  Real third-party film/series sources were not verified by this synthetic test.
- Background timer optimization from 1.5.2 and media/fullscreen code are unchanged.
- All 20 localStorage keys and their complete values matched exactly before installation and after all tests. No settings defaults or localStorage writes were introduced.

## Reproduce navigation capture (Windows)

Requires JDK 17, Android SDK Platform 35/build-tools 36, Node.js 22+ and Python 3.
The installed debug WebView must be foreground and its DevTools socket forwarded
from `webview_devtools_remote_<app-pid>` to localhost:9223. Obtain the actual socket
with `adb shell cat /proc/net/unix`; do not assume the PID survives APK installation.

```powershell
$sdk = "$env:LOCALAPPDATA/Android/Sdk"
$adb = "$sdk/platform-tools/adb.exe"
New-Item -ItemType Directory -Force diagnostics/driver/classes,diagnostics/driver/dex
javac -source 8 -target 8 -bootclasspath "$sdk/platforms/android-35/android.jar" -d diagnostics/driver/classes tools/C645NavigationDriver.java
& "$sdk/build-tools/36.0.0/d8.bat" --lib "$sdk/platforms/android-35/android.jar" --output diagnostics/driver/dex diagnostics/driver/classes/C645NavigationDriver.class
& $adb -s 192.168.31.18:5555 push diagnostics/driver/dex/classes.dex /data/local/tmp/c645-navigation-driver.dex
$env:LAMPA_ADB = $adb
node tools/measure-navigation.mjs diagnostics/horizontal
node tools/measure-navigation.mjs diagnostics/rows rows
python tools/summarize-navigation.py diagnostics/horizontal diagnostics/rows
& $adb -s 192.168.31.18:5555 shell rm /data/local/tmp/c645-navigation-driver.dex
```

The driver is temporary diagnostic code, not an installed application. Do not
press the remote during capture. Run the same scenario from the same catalog
state for comparisons. The helper requires an already active ADB connection and
DevTools forward; it does not change system settings. APKs, local keys, storage
snapshots and raw diagnostic output are excluded from Git.
