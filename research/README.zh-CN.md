# REA 上游研究与目标范围

检查日期：2026-10-18（Asia/Shanghai）。以下区分官方文档、实际运行、原型设计选择和未知信息。

## 仓库与许可

- 官方仓库：[morluto/rea](https://github.com/morluto/rea)。完整克隆保留提交历史；远程命名为 `upstream`。
- 本地固定基线：`c12d9eda87aa5a022ee7e18ea96d8d03bfd12e96`，`package.json` 版本为 6.7.0。后续运行的 npm 6.7.0 发布包是单独的发布产物，不把它等同于该 Git 提交的逐字构建。
- 上游 `LICENSE` 为 MIT，署名 `Copyright (c) 2026 morluto`；保留原文。`THIRD_PARTY_NOTICES.md`、`licenses/` 和 `third_party/` 的声明均保留。第三方工具及材料有各自许可；根目录 MIT 不等同于这些外部工具的授权。
- 克隆未初始化可选 Git 子模块，没有把缺失子模块或外部引擎标为已安装。
- 新增原型独立采用 `studio/LICENSE` 的 MIT 文本，没有复制目标收费软件的私有代码、图标或界面图片。

来源：[固定提交 README](https://github.com/morluto/rea/blob/c12d9eda87aa5a022ee7e18ea96d8d03bfd12e96/README.md)、[LICENSE](https://github.com/morluto/rea/blob/c12d9eda87aa5a022ee7e18ea96d8d03bfd12e96/LICENSE)、[第三方声明](https://github.com/morluto/rea/blob/c12d9eda87aa5a022ee7e18ea96d8d03bfd12e96/THIRD_PARTY_NOTICES.md)。

## REA 是什么，哪些模块适合复用

REA 是本地逆向分析工具，通过 CLI 或 MCP 提供共同的分析工作流。它不是录屏编辑器，不提供可直接替换品牌就能使用的视频渲染引擎。

上游架构按入口、组合、应用、适配器、领域分层，见 `docs/architecture.mermaid`。主要复用方向如下：

| 模块 | 源码位置 | 本项目用途及状态 |
|---|---|---|
| CLI / MCP 入口 | `scripts/rea.mjs`、`src/cli.ts`、`src/main.ts`、`src/server/` | 复用已发布 CLI 进行原型源码检查；尚未向 Codex 全局注册 MCP |
| JavaScript / Electron 静态检查 | `src/application/javascript/`、`src/artifacts/javascript/` | 后续若取得相应应用目录或 ASAR，可用于模块和调用关系分析；已用自制原型完成真实 CLI 冒烟测试 |
| 分析证据与未知项 | `src/domain/evidence.ts`、`src/application/investigation/` | 保留 REA 原始 Evidence，研究记录明确区分事实、推导与未知；没有把本报告伪装成上游 Evidence 格式 |
| 浏览器行为证据 | `src/browser/` | 可作为后续有明确目标页面时的研究入口；本轮未对目标软件执行动态捕获 |
| 原生分析适配器 | `src/hopper/`、`src/ghidra/`、`src/ida/`、`bridge/` | 需要匹配目标格式、操作系统和已有引擎；本轮未安装或验证这些引擎 |
| 进程与 Windows 资源管理 | `src/process/`、`src/windows/`、`native/windows/` | 上游 CLI 自己管理其分析子进程；原型没有复制这些复杂模块或增加目标程序执行功能 |
| 录屏、时间线、视频合成 | 上游没有对应的录屏产品实现 | 独立实现于 `studio/`，使用浏览器 MediaRecorder 和 Canvas |

原型运行时不依赖 REA，因此播放器故障和研究工具故障可以分别处理。REA 的实际复用通过 `research/verify-rea.mjs` 调用官方 CLI 完成；它分析的是原型自身，不能证明目标收费软件的实现方式。

## 运行方式与本机结果

上游 README 声明运行时支持 Node.js 22.x（≥22.19）、24.x（≥24.11）或 26+。源码开发固定 `.nvmrc` 为 24.18.0，包管理器为 npm 11.16.0；源码正常流程为 `npm ci`、`npm run build:cached`。本机已有 Node.js 24.19.0，满足发布包的运行范围。

Windows 源码检出不包含 `native/windows/build/` 插件；`CONTRIBUTING.md` 明确说明普通安装和 TypeScript 构建不会生成它，插件构建需 Linux / MinGW-w64 / tar。因此本轮没有声称已在 Windows 编译完整上游，而是隔离安装官方 `rea-agents@6.7.0` 发布包，验证其 CLI 和静态 JavaScript 检查。安装使用 `--ignore-scripts`，没有运行 `rea setup`、更改全局代理配置或安装原生逆向工具。

可重跑的原型检查：

```powershell
node research/verify-rea.mjs
```

默认读取 `studio/.local/tooling/node_modules/rea-agents/scripts/rea.mjs`，也可通过 `STUDIO_REA_CLI` 指定已安装的官方 CLI 文件。生成完整 Evidence、运行日志及摘要到 `studio/.local/evidence/`。静态图存在未解析关系；以实际 Evidence 的 `limitations` 为准，不能把静态关联解释为已执行行为。

## 截图2目前能确认什么

| 问题 | 证据及状态 |
|---|---|
| 目标类别 | 用户明确说“图2是一个收费录屏软件” |
| 名称 | 用户请求中称为“Screen Studio RE ENGINE”；具体产品、版本及 RE ENGINE 的含义待确认 |
| 截图像素 | 原会话缓存不含图片；本轮读取结果未提供目标截图，因此未看到截图2 |
| 布局、颜色、图标、按钮文案 | 未知，不能按截图准确复刻 |
| 自动缩放、点击追踪、鼠标平滑、摄像头、音轨、字幕 | 对目标截图均未知，不能根据品类推定 |
| 导出格式、分辨率、快捷键、保存格式、系统平台 | 对目标截图均未知 |

补充研究：[Screen Studio 官方网站](https://screen.studio/)公开介绍录屏、自动/手动缩放、画面布局和视频导出；[官方比例说明](https://screen.studio/guide/aspect-ratio)列出多种画幅。这些只是同名公开产品的功能资料，尚不能确认截图2对应同一产品/版本，更不能证明其 RE ENGINE 算法。

需要用户补充：完整截图或短操作录像、软件确切名称/版本、希望优先完成的 3–5 个操作、Windows 或 macOS 的目标要求，以及音频和导出的需求。

## 第一版设计与后续顺序

1. **M0 已实现**：本地服务、自制演示素材、浏览器屏幕捕获入口、现有视频导入、预览和寻址、入点/出点裁剪、单个手动缩放区间、焦点、背景/留白/圆角、PNG 和静音 WebM 导出、项目参数保存/恢复。
2. **M1 等截图后确定**：将已观察到的每个按钮/区域映射为功能清单与验收用例，再调整布局、交互和多个缩放片段。未观察内容继续标记未知。
3. **M2 按优先级实现**：音频采集、摄像头、原生鼠标事件和时间同步、自动缩放/鼠标平滑。需要明确算法行为和真实素材，不能仅靠静态界面得出结论。
4. **M3 桌面化与导出**：决定 Electron/Tauri 等桌面容器及编码方案；增加 MP4、长视频、音画同步、性能与恢复测试。平台方案尚未选定。

M0 的浏览器捕获无法提供操作系统全局点击事件；自制示例中的移动指针是绘制动画。它没有实现对用户鼠标的自动跟随。

本轮验证详情和未覆盖范围见 [verification.json](verification.json)。
