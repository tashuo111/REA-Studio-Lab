# REA Studio Lab

REA Studio Lab 是一个面向 Windows x64 的桌面录屏与缩放视频编辑原型，基于开源项目 [morluto/rea](https://github.com/morluto/rea) 的上游代码继续研究。此项目为独立实验，与 Screen Studio 及其开发者无关联。

[简体中文功能与来源说明](studio/README.zh-CN.md) · [研究范围](research/README.zh-CN.md) · [版本功能、实现和许可证说明](RELEASE-NOTES.md) · [上游原始 README](UPSTREAM-README.md)

## 下载

- [v0.4.0：录制鼠标跟随缩放](https://github.com/tashuo111/REA-Studio-Lab/releases/tag/v0.4.0)：桌面端新录制可选择固定焦点或鼠标跟随，并保留 720p、1080p、2K 和 4K 导出。
- [v0.3.0：手动缩放与 2K/4K 导出](https://github.com/tashuo111/REA-Studio-Lab/releases/tag/v0.3.0)：包含固定焦点缩放和多个输出分辨率的 Windows 桌面版本。

每个版本提供 Windows x64 免安装 ZIP 和对应的 SHA-256 校验文件。下载后解压完整文件夹，运行 `REA Studio Lab.exe`。当前版本没有安装程序。

## 已实现功能

两个版本均可选择屏幕或应用窗口录制、导入本地视频、裁剪片段、调整画布背景/留白/圆角、保存和重新打开编辑参数、导出 PNG 静帧及无声 WebM。v0.3.0 提供固定焦点手动缩放；v0.4.0 为桌面端新录制增加固定焦点与鼠标跟随模式选择。

2K 指 2560 × 1440，4K 指 3840 × 2160。把低分辨率素材导出为 2K 或 4K 会放大画面，不能恢复原始录制中不存在的细节，也不会改变操作系统的显示分辨率。

## 来源与实现

仓库保留了上游 [morluto/rea](https://github.com/morluto/rea) 的完整源码和 Git 历史；研究基线固定在提交 [`c12d9eda87aa5a022ee7e18ea96d8d03bfd12e96`](https://github.com/morluto/rea/commit/c12d9eda87aa5a022ee7e18ea96d8d03bfd12e96)。录屏与编辑原型单独放在 `studio/`，使用 Electron 桌面壳、浏览器采集 API、Canvas 合成和 `MediaRecorder`。

鼠标跟随缩放由 Windows 小型辅助程序读取光标坐标及所选录制区域边界。编辑器保存带时间戳的归一化光标轨迹，计算平滑后的镜头路径，并在预览、PNG 静帧和 WebM 导出中复用同一条路径。程序不安装鼠标或键盘钩子、不从旧视频推测光标轨迹，也没有点击触发缩放。具体版本实现和限制见 [RELEASE-NOTES.md](RELEASE-NOTES.md)。

原始请求中提到的目标截图无法读取，因此本项目只说明已实现的原型和已知范围，不宣称完整或像素级复刻收费软件。

## 许可证

上游 REA 源码继续保留根目录 MIT 许可证、版权声明及第三方许可证文件。新增原型代码使用 `studio/LICENSE` 中的 MIT 许可证。Electron 和 Chromium 的运行时声明随各版本 ZIP 提供。再分发前请检查所用组件各自的许可证。
