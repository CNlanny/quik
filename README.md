<div align="center">

# Quik

**把常用命令变成按钮，点一下就执行**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Tauri](https://img.shields.io/badge/Tauri-2-orange)
![Vue](https://img.shields.io/badge/Vue-3-42b883)

将 curl 请求、Shell 命令、部署脚本配置成桌面上的按钮卡片：点击即执行，实时查看流式输出，结束时系统通知提醒。适合开发、测试、运维同学作为高频小操作的「启动器」。

[English](./README_EN.md) | **简体中文**

<!-- 建议发布前补充应用截图（新建 docs/images/ 目录后取消注释）：
![主界面](docs/images/main.png)
![执行输出](docs/images/output.png)
-->

</div>

---

## ✨ 功能特性

### 🎛 按钮与分组

- 新建 / 编辑 / 删除按钮，按钮与分组拖拽排序
- 外观全面可定制：emoji 图标、自定义颜色（纯色 / 渐变铺满）、光晕 / 毛玻璃特效、字体字号字色、边框开关，附实时预览
- 分组管理：侧边栏导航、折叠、独立配色；顶部支持按钮搜索

### ⚡ 执行能力

- **Shell 命令**：任意命令 / 脚本（含 curl），支持管道、多行，可直接粘贴从浏览器或 Postman 复制的 curl
- **运行脚本**：引用内置脚本库中的可复用脚本，可指定工作目录与位置参数（后端自动落盘临时文件，兼容 bash `$1` / PowerShell `-File` / CMD `%1`），改脚本库对所有引用按钮即时生效
- 多环境变量：dev / prod 等多套环境，脚本中 `{{baseUrl}}`、`{{token}}` 等占位符自动替换
- 按钮级超时时间；执行前确认弹窗（弹窗内展示脚本内容）
- 并发控制：默认执行中防重复点击，可按按钮开启允许并发

### 📋 输出与反馈

- stdout / stderr 流式实时滚动（stderr 红色区分），显示退出码与耗时
- 日志面板左侧任务列表：多任务并行时按「运行中 / 历史」切换查看
- 停止执行：杀掉整棵进程树（Windows `taskkill /T` 三重保险）；超时自动终止
- 执行结束系统通知提醒（成功 / 失败 / 停止 / 超时，附耗时），可按按钮开关
- 按钮卡片执行状态闪烁反馈，输出面板支持一键重跑

### 💾 配置与数据

- 所有配置持久化于本地 `config.json`：原子写入 + `.bak` 备份，损坏自动恢复
- 导入 / 导出 `.quik.json`：可选分组导出，自动携带被引用的脚本库条目；**默认不含环境变量**（避免泄露 token）

### 🖥 桌面集成

- 系统托盘常驻，关闭行为可选：每次询问 / 最小化到托盘 / 直接退出
- 开机自启动（启动后静默驻留托盘，不打扰）
- 界面中英双语（vue-i18n），托盘菜单语言跟随切换
- 跨平台：Windows / macOS / Linux（Windows 已充分验证；macOS / Linux 代码就绪，欢迎测试反馈）

## 🚀 快速开始

### 安装

<!-- TODO: 发布首个 Release 后，在 GitHub 上传安装包，此节即可直接使用 -->

从 [Releases](../../releases) 页下载对应平台的安装包：

- **Windows**：`.exe`（NSIS）或 `.msi`，需 Windows 10 1803+（系统自带 WebView2 与 curl）
- **macOS / Linux**：暂请从源码构建（见下节）

### 从源码运行

环境要求：

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://rustup.rs/) 工具链及平台构建工具：
  - Windows：Visual Studio Build Tools（含 C++ 桌面开发工作负载）
  - macOS：Xcode Command Line Tools
  - Linux：webkit2gtk 等依赖，参见 [Tauri 2 前置要求](https://tauri.app/start/prerequisites/)

```bash
git clone https://github.com/CNlanny/quik.git
cd quik
npm install          # 安装前端依赖
npm run tauri dev    # 启动开发模式
npm run tauri build  # 构建安装包（Windows 下产出 NSIS / MSI）
```

## 💡 使用提示

- **Shell 自动检测**：默认按 bash → PowerShell → CMD 顺序检测（排除 WSL bash）。Windows 下建议安装 [Git Bash](https://git-scm.com/) 以获得一致的脚本体验（管道、引号语义与 macOS / Linux 相同）
- **中文乱码**：输出按 UTF-8 解码、失败自动回退 GBK，PowerShell 执行时自动前置 `chcp 65001`
- **团队共享配置**：导出的 `.quik.json` 不含环境变量，token 等敏感信息需各端自行配置

## ⚠️ 安全须知

- 按钮脚本等同于**本机任意命令执行权限**。Quik 定位为个人可信工具，请只运行自己维护的配置
- 导入他人分享的配置前，请先打开文件预览脚本内容
- 危险操作建议开启「执行前确认」开关

## 🗺 路线图

- [ ] 执行历史（最近 N 次记录，可回看输出）
- [ ] JSON 输出自动检测与格式化高亮
- [ ] 全局快捷键唤起主窗口（默认 `Alt+Q`）
- [ ] curl 表单化配置（method / url / headers / body）
- [ ] 按钮批量编排（多动作顺序执行，失败可中止）
- [ ] 配置团队共享（合并导入、冲突处理）
- [ ] 托盘快捷执行面板

## 🧩 项目结构

```
quik/
├─ src/               # Vue 3 前端
│  ├─ components/     # 界面组件（按钮卡片 / 网格 / 输出面板 / 编辑弹窗…）
│  ├─ stores/         # Pinia 状态（配置、运行器）
│  ├─ i18n/           # 中 / 英语言包
│  └─ utils/          # 外观渲染、日志高亮、系统通知等工具
├─ src-tauri/         # Rust 后端
│  └─ src/
│     ├─ config.rs    # 配置读写、导入导出（原子写入 + .bak 备份）
│     ├─ runner.rs    # 子进程执行、流式输出回传、停止 / 超时
│     ├─ shell.rs     # shell 检测（bash → powershell → cmd）
│     ├─ tray.rs      # 系统托盘与窗口关闭行为
│     └─ logs.rs      # 调试日志
└─ docs/              # 技术方案与需求清单（中文）
```

更多设计细节见 [docs/技术方案.md](docs/技术方案.md)，需求与进度跟踪见 [docs/需求清单.md](docs/需求清单.md)。

## 🤝 参与贡献

欢迎提交 [Issue](../../issues) 与 [Pull Request](../../pulls)：

- 新需求或 Bug 反馈请先建 Issue 描述场景，采纳后会登记进需求清单跟踪
- 提交信息遵循 Conventional Commits（`feat:` / `fix:` / `chore:` 前缀）
- macOS / Linux 真机测试与 CI 构建是当前最需要的贡献

## 📄 许可证

[MIT](./LICENSE) © 2026 Lanny
