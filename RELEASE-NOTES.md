# Release features and implementation notes

This repository contains two portable Windows x64 builds of the REA Studio Lab prototype. The version tags identify the source commits used for the corresponding builds. Each archive has a matching `.sha256` file.

## 0.3.0 — manual zoom, 2K and 4K

- Standalone Electron desktop app; choose a screen or application window, record locally, or import a video.
- Fixed-focus manual zoom with editable start/end times, magnification, and horizontal/vertical focus.
- Canvas background, margin, rounded corners, segment trimming, parameter save/restore, PNG frame output, and silent WebM export.
- Output choices: 720p, 1080p, 2K/QHD (2560 × 1440), and 4K/UHD (3840 × 2160).
- Preview, PNG, and WebM share the same Canvas composition and output geometry. Export resolution changes the encoded canvas; it does not change the operating-system display resolution or create detail absent from the source.

**Implementation:** the editor lives in `studio/`. Electron provides the Windows desktop shell and selected-screen/window capture flow. Browser APIs handle local video playback, `Canvas` compositing, PNG capture, and `MediaRecorder` WebM encoding. Editing parameters use a versioned JSON format. The application does not require the REA analysis engine at runtime.

**Build provenance:** source commit `4aae199a579cbfefb5a608a632d5794711dee391`, based on upstream `morluto/rea` commit `c12d9eda87aa5a022ee7e18ea96d8d03bfd12e96`. Packaged with Electron 44.9.0 for Windows x64. Build time: 2026-10-18 11:55:55 +08:00. ZIP size: 163,303,841 bytes. SHA-256: `66229a6599e680598109a083bc4321758324cf39a611b6bfee01536efb474622`.

## 0.4.0 — recorded mouse-follow zoom

- Adds a zoom-mode choice between fixed focus and following the mouse for new desktop recordings.
- Records cursor position and time while capturing the selected screen or window. The user can adjust camera smoothing; the default time constant is 200 ms.
- Saves up to 4,500 normalized, time-stamped pointer samples in project JSON v3 and binds the trace to the source video content hash.
- Precomputes a smoothed camera path and reuses it for playback, seeking, PNG frame output, and WebM export, so results do not depend on playback order.
- Retains the 720p, 1080p, 2K/QHD, and 4K/UHD choices and the manual-focus mode.

**Implementation:** the Electron main process starts a small C# helper built with the Windows .NET Framework compiler already present on the build machine. The helper reads cursor position and screen/window bounds; it does not capture pixels, read keyboard input, write files, or access the network. The desktop app maps the samples to the capture area, normalizes them, and aligns their monotonic timestamps with the recording. The editor applies exponential smoothing and shares one deterministic time-based camera path across preview and exports. The helper is bundled in the portable folder, so users do not need a compiler installed.

**Build provenance:** source commit `0aa94883bd2257c18efa198a133980fb96a7810b`, based on upstream `morluto/rea` commit `c12d9eda87aa5a022ee7e18ea96d8d03bfd12e96`. Packaged with Electron 44.9.0 for Windows x64. Build time: 2026-10-18 12:29:16 +08:00. ZIP size: 163,314,654 bytes. SHA-256: `4f79aeb3a19377a6191800ad3348cb9641880edeaa5282d7fc28b4b6cc7b0e67`.

## Shared provenance, licenses, and limits

- Upstream repository: [morluto/rea](https://github.com/morluto/rea), pinned to commit `c12d9eda87aa5a022ee7e18ea96d8d03bfd12e96`. Its full source tree, Git history, root MIT license, third-party notices, and license files remain in this repository.
- New prototype code: `studio/`, under its own MIT license in `studio/LICENSE`.
- Runtime components: Electron 44.9.0 and Chromium notices are bundled with the app; see `LICENSE`, `LICENSES.chromium.html`, and `SOURCE-NOTICES.txt` inside each ZIP.
- These builds are prototypes, not the commercial app. The original target screenshot was unavailable, so the exact product identity, UI, and zoom algorithm remain unverified. No proprietary code, icon, or screenshot assets from the paid application are included.
- Recording/export is silent WebM, with a two-minute recording/export limit and a 256 MiB media cache in the packaged app. There is no installer, code signing, or auto-updater. Click-triggered zoom, audio, camera overlay, MP4, and multiple zoom regions are not implemented. Long 4K performance and all hardware/display combinations have not been validated.
