# Quik

自定义按钮一键执行工具：按钮绑定 curl 脚本、任意命令或脚本库脚本（可指定工作目录与参数），点击即执行，支持颜色/名称自定义与分组管理。

技术栈：Tauri 2 + Vue 3 + TypeScript + Element Plus + vue-i18n（中/英）

## 开发

```bash
npm install          # 安装前端依赖
npm run tauri dev    # 启动开发模式（需要 Rust 工具链）
```

## 构建

```bash
npm run tauri build  # 产出安装包（Windows 下为 nsis/msi）
```

## 环境要求

- Node.js >= 18
- Rust（rustup）+ MSVC 构建工具（Visual Studio Build Tools，含 C++ 工作负载）
- Windows 10 1803+（自带 WebView2 与 curl）；macOS / Linux 见 `docs/技术方案.md`

## 文档

- [docs/技术方案.md](docs/技术方案.md)
- [docs/需求清单.md](docs/需求清单.md)（需求与进度跟踪）
