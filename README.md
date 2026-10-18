# REA Studio Lab

A Windows x64 desktop prototype for local screen recording and zoom-focused video editing. It is an independent experiment built alongside the preserved source history of [morluto/rea](https://github.com/morluto/rea); it is not affiliated with Screen Studio or its developers.

[简体中文说明](studio/README.zh-CN.md) · [Research notes and scope](research/README.zh-CN.md) · [Release feature and implementation notes](RELEASE-NOTES.md) · [Original upstream README](UPSTREAM-README.md)

## Releases

- [0.4.0 — mouse-follow zoom](https://github.com/tashuo111/REA-Studio-Lab/releases/tag/v0.4.0): records cursor positions during a new Windows recording and uses a smoothed pointer-follow camera in preview and export.
- [0.3.0 — manual zoom and high-resolution export](https://github.com/tashuo111/REA-Studio-Lab/releases/tag/v0.3.0): standalone Windows desktop build with manual focus and 720p, 1080p, 2K/QHD, and 4K/UHD output.

Each release includes a portable Windows x64 ZIP and a SHA-256 checksum file. Extract the full ZIP folder and launch `REA Studio Lab.exe`; there is no installer.

## What is implemented

Both versions can record a selected screen or application window, import local video, crop a segment, adjust the canvas background, margin and corner radius, save and reopen editing parameters, save a PNG frame, and export silent WebM. Version 0.3.0 supports fixed-focus manual zoom. Version 0.4.0 adds a selectable fixed-focus or mouse-follow zoom mode for recordings made in the desktop app.

2K means 2560 × 1440 and 4K means 3840 × 2160. Exporting a lower-resolution source at 2K or 4K enlarges it; that does not restore detail that was not present in the recording.

## Source and implementation

The complete upstream Git history and code are retained. The upstream baseline is [`c12d9eda87aa5a022ee7e18ea96d8d03bfd12e96`](https://github.com/morluto/rea/commit/c12d9eda87aa5a022ee7e18ea96d8d03bfd12e96). The recorder/editor prototype is separately implemented under `studio/` using Electron, browser capture APIs, Canvas rendering, and `MediaRecorder`.

For mouse-follow zoom, a small Windows helper reads cursor position and the selected capture bounds. The editor stores time-stamped normalized cursor samples with the project, computes a smoothed camera path, and uses that same path for preview, PNG frames, and WebM export. It does not install mouse or keyboard hooks, infer cursor events from old videos, or implement click-triggered zooms. See [RELEASE-NOTES.md](RELEASE-NOTES.md) for version-specific details and limitations.

The target screenshot from the original request was not available for inspection. This repository therefore documents a working prototype and its known scope; it does not claim a complete or pixel-accurate recreation of the paid application.

## Licenses

The upstream REA source keeps its root MIT license, notices, and third-party license files. The prototype has its own MIT license at [`studio/LICENSE`](studio/LICENSE). The packaged Electron runtime and Chromium notices are included in each Windows ZIP. Review each component's license before redistribution.
