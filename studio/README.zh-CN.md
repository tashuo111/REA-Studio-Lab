# 原型开发说明

这是独立的本地录屏原型，提供浏览器和 Windows 桌面两种入口。浏览器入口只依赖 Node.js 标准库和浏览器 API；桌面入口打包 Electron 运行时。不修改 REA 的 CLI、MCP、分析引擎或发布配置。

## 架构

- `server.mjs`：只提供白名单中的静态资源和健康检查；不接收视频上传，也不开放任意文件或命令执行端点。
- `public/model.mjs`：项目参数验证、裁剪边界、平滑缩放、源画面坐标和 SHA-256 素材身份匹配。
- 0.3 的 `output.resolution` 由该模型的 720p / 1080p / 1440p / 2160p 白名单统一管理；参数格式升级为版本 2，版本 1 在读取时迁移到 720p。实际 Canvas 尺寸、PNG、视频、倍率相关画面几何和导出提示均使用同一设置。
- `public/render.mjs`：Canvas 合成和自制示例动画；预览、PNG 和 WebM 共用合成逻辑。
- `public/media.mjs`：本地视频加载、时长解析、内容指纹、资源回收和下载。
- `public/app.mjs`：浏览器捕获、播放器、导出和编辑器状态。
- `desktop/main.cjs`：桌面生命周期、静态协议、用户选择后授予屏幕捕获、系统另存为。沙盒渲染器不开放 Node.js、文件读写或命令执行接口。
- `desktop/picker.*`：用户明确选择屏幕或窗口；取消、关闭和超时都拒绝该次捕获。
- `desktop/cursor.cjs`：所选捕获来源的轨迹生命周期。屏幕用 Electron DIP 坐标；窗口用只读 Windows 采集组件。渲染器只能对本次用户选择的 token 开始/停止，不接受任意句柄、路径或命令。
- `desktop/build.mjs`：复制固定 Electron 运行时及应用白名单到全新目录，保留许可；不会覆盖已有交付文件夹。
- `tests/`：项目边界及服务器测试，浏览器端到端验证。
- `.local/`：本机依赖、测试输出和 REA 完整证据，Git 忽略。

## 检查

在项目根目录运行：

```powershell
node --test studio/tests/*.test.mjs
node --check studio/public/app.mjs
```

浏览器测试使用 Playwright 1.58.2。可将开发依赖安装到隔离的本地目录，不影响上游依赖清单：

```powershell
pnpm --dir studio/.local/tooling add --ignore-scripts playwright@1.58.2 rea-agents@6.7.0
node studio/.local/tooling/node_modules/playwright/cli.js install chromium
$env:STUDIO_PLAYWRIGHT_MODULE = Join-Path (Get-Location) 'studio/.local/tooling/node_modules/playwright/index.mjs'
node studio/tests/browser.mjs
node research/verify-rea.mjs
```

`STUDIO_TEST_OUTPUT` 可指定测试产物目录。屏幕录制测试把 `getDisplayMedia` 替换成自制 Canvas 视频流，只验证应用流程、编码和清理，不证明操作系统的真实捕获选择器、权限、全屏/窗口捕获或设备兼容性。

## 桌面开发与打包

固定 Electron 44.9.0，安装在隔离目录，避免改动上游依赖：

```powershell
pnpm --dir studio/.local/tooling add --save-exact --ignore-scripts electron@44.9.0
node studio/.local/tooling/node_modules/electron/install.js
node studio/desktop/start.mjs
```

若 Node 直连下载失败，可从 Electron 官方 GitHub 版本下载 Windows x64 ZIP，核对 npm 包 `checksums.json` 及官方 `SHASUMS256.txt` 后解压到该 npm 包的 `dist`，并将 `path.txt` 设置为 `electron.exe`。本次交付使用这个经过双重 SHA-256 核对的官方 ZIP。

在仓库根目录运行 `node studio/desktop/build.mjs <新的输出目录>`。脚本要求 Windows x64，并拒绝覆盖已有目录。产物没有安装器、签名或自动更新，不改注册表、不创建开机自启动，也不依赖原来的 HTTP 服务。源码内的 `start.mjs` 仅供开发，用户运行便携文件夹内的 EXE。

桌面验证：

```powershell
node studio/tests/desktop.mjs
# 验证打包后的相同程序：
$env:STUDIO_DESKTOP_EXE = 'C:\完整路径\REA-Studio-Lab-Windows-0.3.0\REA Studio Lab.exe'
$env:STUDIO_DESKTOP_TEST_OUTPUT = 'C:\新的测试产物目录'
node studio/tests/desktop.mjs
```

该测试用真实 Windows 捕获录制测试自己创建的窗口，不录制用户的其他窗口。测试会把下载保存到指定测试目录，跳过系统另存为对话框；产品中仍由用户选保存位置。全屏、其他机器、长视频及音频不在本轮验证范围。

0.3 的桌面测试还对 1080p、1440p、2160p 实际编码短 WebM 并重新导入检查宽、高、时长，读取 PNG IHDR 检查尺寸，并验证高分辨率下点击缩放焦点、参数保存恢复和版本 1 参数迁移。它使用 720p 生成素材，因此验证的是输出尺寸和流程，不代表从低分辨率恢复了 4K 细节。各尺寸的输出字节数和测试导出墙钟时间记录在结果中；CPU、峰值内存和持续帧率尚未测量。

录屏使用理想尺寸 3840 × 2160 和最大 30fps，由浏览器对用户选中的来源应用；实际码率按视频轨道返回的宽、高选择，导出码率随预设提高（6 / 12 / 24 / 40 Mbps，编码器可调整实际值）。参考 [getDisplayMedia 约束](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)、[轨道实际设置](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings)、[MediaRecorder 编码参数](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder)。

桌面 API 依据：[Electron desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer)、[Session 捕获处理器](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts)、[自定义协议](https://www.electronjs.org/docs/latest/api/protocol)、[DownloadItem](https://www.electronjs.org/docs/latest/api/download-item)、[安全指南](https://www.electronjs.org/docs/latest/tutorial/security)。Windows 显示本应用的来源选择器，未把仅 macOS 支持的实验性系统选择器当作 Windows 能力。

## 运行边界

文件和媒体由用户在浏览器中选择，项目参数以本地 JSON 下载。恢复视频项目时需要相同字节内容的原片。SHA-256 目前通过 Web Crypto 一次性读取文件计算，大视频会增加峰值内存；尚未测量 512 MiB 上限场景、长视频、4K 性能或跨浏览器结果。

浏览器捕获自带可见的来源选择与停止分享控件；代码不尝试替用户授权。自动点击追踪需要独立的事件采集与时间同步设计，不能从任意普通视频中恢复原生鼠标事件。

## 0.4 鼠标跟随

本版按用户要求新增原生鼠标位置记录，未增加点击/键盘钩子。右侧「缩放方式」选择固定焦点或跟随鼠标，共用倍率和区间；跟随平滑度为 50–600 ms 的指数平滑时间常数。鼠标不在来源内时保持上次镜头位置。按轨迹预计算并缓存镜头路径，时间查询用二分插值；预览、任意寻址、PNG 和 WebM 共用该路径，避免播放先后顺序影响画面。

参数格式 v3 保存 `pointer.kind` 与最多 4500 个 `{t,x,y}` 采样；`t` 为录屏起点后的秒数，`x/y` 为来源内的归一化坐标，均为 null 表示来源外/不可见。参数 JSON 上限从 256 KiB 调整到 2 MiB，可容纳 2 分钟轨迹的格式化 JSON。解析器拒绝无序、越界、非有限值、半空坐标和超量采样；按原片 SHA-256 绑定，不接受将轨迹恢复到另一段视频。v1/v2 迁移为固定焦点。

Windows 窗口采样由 `cursor-helper.cs` 编译成 .NET Framework 4 x64 小型组件，仅读取鼠标位置、窗口边界与可见状态，不截屏、不读键盘、不写文件、不联网。构建使用 Windows 已有的 `Microsoft.NET/Framework64/v4.0.30319/csc.exe`；用户包包含编译结果，无需安装编译器。开发直接跑 `main.cjs` 或测试前，运行 `node studio/desktop/build-cursor.mjs`；`start.mjs` 和 `build.mjs` 会自动构建。组件在父进程关闭标准输入、录制结束、窗口关闭或看门狗到期时退出；保留已采样内容并报告中途失败。

屏幕坐标依据 [Electron screen](https://www.electronjs.org/docs/latest/api/screen) 和 [来源 display_id](https://www.electronjs.org/docs/latest/api/structures/desktop-capturer-source)，按匹配显示器的 DIP 边界归一化。窗口依据 [GetPhysicalCursorPos](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getphysicalcursorpos) 和 [DWM 扩展边界](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmgetwindowattribute)，采样线程采用 per-monitor DPI awareness。Electron 44 实测本进程来源返回 `window:<HWND>:2`；第三段是 Aura 标识，非零的本进程来源按 client 区域映射，外部窗口按 DWM 可见区域映射；参考 [Electron 原始捕获映射](https://github.com/electron/electron/blob/main/shell/browser/electron_browser_context.cc)。不能把文档中的 `0/1` 示例当作严格枚举。

主进程和渲染器用 `performance.timeOrigin + performance.now()` 对齐录制开始；原生采样用 Stopwatch 单调时钟映射，避免管道读取延迟累计成轨迹漂移。计时器请求间隔 33 ms，实际采样取决于系统调度；本机 72 秒真实外部窗口测试约 21 Hz。未承诺输入与视频逐帧同步。显示器热插拔、特殊游戏窗口、自绘鼠标、录制中改变窗口尺寸或跨 DPI 显示器移动尚未全面验证；建议录制时保持窗口尺寸和显示设置不变。

真实窗口验证（仅录测试自己创建的窗口）：

```powershell
node studio/desktop/build-cursor.mjs
node studio/tests/pointer-desktop.mjs
$env:STUDIO_EXTERNAL_POINTER = '1'
node studio/tests/pointer-desktop.mjs
```

`STUDIO_DESKTOP_EXE` 指向打包后的程序可验证便携版。`STUDIO_POINTER_TEST_OUTPUT` 指定测试产物位置。测试覆盖默认跟随、两种缩放模式、相同时间寻址的一致性、原片与参数恢复、2K 真实 WebM 导出、来源不匹配拒绝以及组件回收。`STUDIO_POINTER_MANUAL=1` 会等待测试窗口内的真实点击，再由测试目录中的 `manual-done.txt` 结束等待；每次需使用新的输出目录。单元测试另覆盖负坐标屏幕及 100/125/150/200% 坐标变换，这不等于多显示器硬件实测。证据见 `research/pointer-verification.json`；CPU 和峰值内存未测量。

新增原型采用 [MIT](LICENSE)；它是本地实验项目，与 Screen Studio 官方没有隶属关系。上游 REA 的许可和声明位于根目录。
