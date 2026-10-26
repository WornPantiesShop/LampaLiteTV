# Real-film playback measurement, TCL C645, 2026-10-26

One run: Interstellar (2014), HDrezka through Online Mod, built-in browser player.
Observed resolution: 1280x720, not a 1080p or 4K test. Movie duration metadata was
10143.947 seconds, confirming a full film rather than the synthetic test clip.

- About 90.4 seconds of active playback recorded.
- First requestVideoFrameCallback: 13.76 seconds after choosing the dubbed stream.
- Playing event: 13.91 seconds after the same action.
- 2171 total video frames; 15 dropped (0.69%), including startup; 0 corrupted.
- Observed content frame rate: 23.96 FPS. This is film cadence, not catalog/display FPS.
- No waiting-to-playing rebuffer intervals after initial startup in this short run.
- Video decoder: MediaCodecVideoDecoder, platform-video-decoder=true. The exact
  hardware codec component was not separately identified.
- Audio decoder: FFmpegAudioDecoder. Reported bitrate: about 2.62 Mbit/s.
- Host process PSS: 87.9 MiB before, 94.2 MiB after. Separate WebView renderer and
  decoder memory were not attributed, so this is NOT total app/video RAM.
- Host CPU during sampled playback: mean 137%, maximum 160% on top's one-core
  basis (about 1.37/1.60 cores). Renderer CPU was not attributed; no total app CPU
  figure is claimed. Sampling itself adds some load.

The measurement stopped at the user's request. The test video was paused and the
probe observer/key handler disabled. No additional live measurements were started.
Raw metrics do not contain signed stream URLs, credentials or session-cookie values.
One short run does not characterize all films, qualities, providers or physical
panel behavior. The startup delay has not been separated into server/link/decoder
components. These are browser playback counters, not optical screen capture.

## Necessary playback fix (1.5.8 / versionCode 14)

Real playback exposed a local 403 before video startup: the native HDrezka policy
omitted POST /engine/ajax/search.php. The installed provider uses that endpoint
for title search. Added only that specific path to the existing HTTPS allowlist;
host restrictions and all other bounds remain. Search and real-film playback
then succeeded. Built and linted, installed with the existing key via install-tv.ps1
and adb install -r, without app-data clearing or system-setting changes.
