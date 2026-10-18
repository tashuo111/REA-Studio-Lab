# 原型开发说明

这是独立的本地浏览器原型。运行时只依赖 Node.js 标准库和浏览器 API，不修改 REA 的 CLI、MCP、分析引擎或发布配置。

## 架构

- `server.mjs`：只提供白名单中的静态资源和健康检查；不接收视频上传，也不开放任意文件或命令执行端点。
- `public/model.mjs`：项目参数验证、裁剪边界、平滑缩放、源画面坐标和 SHA-256 素材身份匹配。
- `public/render.mjs`：Canvas 合成和自制示例动画；预览、PNG 和 WebM 共用合成逻辑。
- `public/media.mjs`：本地视频加载、时长解析、内容指纹、资源回收和下载。
- `public/app.mjs`：浏览器捕获、播放器、导出和编辑器状态。
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

## 运行边界

文件和媒体由用户在浏览器中选择，项目参数以本地 JSON 下载。恢复视频项目时需要相同字节内容的原片。SHA-256 目前通过 Web Crypto 一次性读取文件计算，大视频会增加峰值内存；尚未测量 512 MiB 上限场景、长视频、4K 性能或跨浏览器结果。

浏览器捕获自带可见的来源选择与停止分享控件；代码不尝试替用户授权。自动点击追踪需要独立的事件采集与时间同步设计，不能从任意普通视频中恢复原生鼠标事件。

新增原型采用 [MIT](LICENSE)；它是本地实验项目，与 Screen Studio 官方没有隶属关系。上游 REA 的许可和声明位于根目录。
