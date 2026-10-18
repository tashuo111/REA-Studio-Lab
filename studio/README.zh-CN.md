# 原型开发说明

这是独立的本地录屏原型，提供浏览器和 Windows 桌面两种入口。浏览器入口只依赖 Node.js 标准库和浏览器 API；桌面入口打包 Electron 运行时。不修改 REA 的 CLI、MCP、分析引擎或发布配置。

## 架构

- `server.mjs`：只提供白名单中的静态资源和健康检查；不接收视频上传，也不开放任意文件或命令执行端点。
- `public/model.mjs`：项目参数验证、裁剪边界、平滑缩放、源画面坐标和 SHA-256 素材身份匹配。
- `public/render.mjs`：Canvas 合成和自制示例动画；预览、PNG 和 WebM 共用合成逻辑。
- `public/media.mjs`：本地视频加载、时长解析、内容指纹、资源回收和下载。
- `public/app.mjs`：浏览器捕获、播放器、导出和编辑器状态。
- `desktop/main.cjs`：桌面生命周期、静态协议、用户选择后授予屏幕捕获、系统另存为。沙盒渲染器不开放 Node.js、文件读写或命令执行接口。
- `desktop/picker.*`：用户明确选择屏幕或窗口；取消、关闭和超时都拒绝该次捕获。
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
$env:STUDIO_DESKTOP_EXE = 'C:\完整路径\REA-Studio-Lab-Windows-0.2.0\REA Studio Lab.exe'
$env:STUDIO_DESKTOP_TEST_OUTPUT = 'C:\新的测试产物目录'
node studio/tests/desktop.mjs
```

该测试用真实 Windows 捕获录制测试自己创建的窗口，不录制用户的其他窗口。测试会把下载保存到指定测试目录，跳过系统另存为对话框；产品中仍由用户选保存位置。全屏、其他机器、长视频及音频不在本轮验证范围。

桌面 API 依据：[Electron desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer)、[Session 捕获处理器](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts)、[自定义协议](https://www.electronjs.org/docs/latest/api/protocol)、[DownloadItem](https://www.electronjs.org/docs/latest/api/download-item)、[安全指南](https://www.electronjs.org/docs/latest/tutorial/security)。Windows 显示本应用的来源选择器，未把仅 macOS 支持的实验性系统选择器当作 Windows 能力。

## 运行边界

文件和媒体由用户在浏览器中选择，项目参数以本地 JSON 下载。恢复视频项目时需要相同字节内容的原片。SHA-256 目前通过 Web Crypto 一次性读取文件计算，大视频会增加峰值内存；尚未测量 512 MiB 上限场景、长视频、4K 性能或跨浏览器结果。

浏览器捕获自带可见的来源选择与停止分享控件；代码不尝试替用户授权。自动点击追踪需要独立的事件采集与时间同步设计，不能从任意普通视频中恢复原生鼠标事件。

新增原型采用 [MIT](LICENSE)；它是本地实验项目，与 Screen Studio 官方没有隶属关系。上游 REA 的许可和声明位于根目录。
