<div align="center">

# Quik

**Turn your everyday commands into buttons — click and run**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Tauri](https://img.shields.io/badge/Tauri-2-orange)
![Vue](https://img.shields.io/badge/Vue-3-42b883)

Configure curl requests, shell commands, and deploy scripts as button cards on your desktop: click to run, watch streaming output in real time, and get a system notification when it finishes. A handy launcher for the small, high-frequency operations of developers, testers, and ops folks.

**English** | [简体中文](./README.md)

<!-- Consider adding app screenshots before publishing (create docs/images/ and uncomment):
![Main window](docs/images/main.png)
![Output panel](docs/images/output.png)
-->

</div>

---

## ✨ Features

### 🎛 Buttons & Groups

- Create / edit / delete buttons; drag-to-reorder buttons and groups
- Fully customizable appearance: emoji icons, custom colors (solid / gradient fill), glow / frosted-glass effects, font family / size / weight / color, border toggle — with live preview
- Group management: sidebar navigation, collapsing, per-group colors; button search in the toolbar

### ⚡ Execution

- **Shell commands**: run any command or script (curl included) — pipes and multi-line scripts work; curl copied from a browser or Postman can be pasted as-is
- **Script runner**: reference reusable scripts from the built-in script library, with a custom working directory and positional arguments (the backend writes a temp script file and handles bash `$1` / PowerShell `-File` / CMD `%1` for you); editing a library script takes effect on every button that references it
- Multi-environment variables: maintain dev / prod sets and use `{{baseUrl}}`, `{{token}}` placeholders in scripts
- Per-button timeout; optional confirm-before-run dialog (with the script shown)
- Concurrency control: re-clicking is blocked while running by default, or allow it per button

### 📋 Output & Feedback

- Real-time streaming of stdout / stderr (stderr shown in red), plus exit code and duration
- Task list beside the log panel: switch between running and finished tasks when several run in parallel
- Stop: kills the entire process tree (Windows `taskkill /T` plus extra safety nets); timeouts terminate automatically
- Optional system notification when a run ends (success / failure / stopped / timeout, with duration)
- Status flash on the button card; one-click rerun from the output panel

### 💾 Config & Data

- Everything persists in a local `config.json`: atomic writes + `.bak` backup, auto-recovery on corruption
- Import / export as `.quik.json`: pick groups to export, referenced library scripts are carried along; **environment variables are excluded by default** (so tokens don't leak)

### 🖥 Desktop Integration

- System tray with configurable close behavior: ask every time / minimize to tray / quit
- Launch at startup (silently stays in the tray)
- Bilingual UI (Chinese / English via vue-i18n); tray menu follows the language
- Cross-platform: Windows / macOS / Linux (Windows is fully tested; macOS / Linux code is ready — feedback welcome)

## 🚀 Getting Started

### Install

<!-- TODO: upload installers to the first GitHub Release, then this section is ready to use -->

Download the installer for your platform from the [Releases](../../releases) page:

- **Windows**: `.exe` (NSIS) or `.msi`; requires Windows 10 1803+ (WebView2 and curl are built in)
- **macOS / Linux**: please build from source for now (see below)

### Run from Source

Prerequisites:

- [Node.js](https://nodejs.org/) ≥ 18
- The [Rust](https://rustup.rs/) toolchain plus platform build tools:
  - Windows: Visual Studio Build Tools (with the C++ desktop workload)
  - macOS: Xcode Command Line Tools
  - Linux: webkit2gtk and other deps — see the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/)

```bash
git clone https://github.com/CNlanny/quik.git
cd quik
npm install          # install frontend dependencies
npm run tauri dev    # start dev mode
npm run tauri build  # build installers (NSIS / MSI on Windows)
```

## 💡 Tips

- **Shell auto-detection**: probes bash → PowerShell → CMD in order (WSL bash excluded). On Windows, installing [Git Bash](https://git-scm.com/) is recommended for a consistent scripting experience (pipes and quoting behave as on macOS / Linux)
- **Encoding**: output is decoded as UTF-8 with an automatic GBK fallback; PowerShell runs get `chcp 65001` prepended
- **Sharing configs**: exported `.quik.json` files contain no environment variables — each machine keeps its own tokens

## ⚠️ Security Notes

- Button scripts are equivalent to **arbitrary local command execution**. Quik is a personal, trust-based tool — only run configs you maintain yourself
- Preview the scripts inside any config file shared by others before importing it
- Turn on the per-button "confirm before run" switch for dangerous operations

## 🗺 Roadmap

- [ ] Execution history (recent N runs, replayable output)
- [ ] JSON output detection, formatting, and syntax highlighting
- [ ] Global shortcut to toggle the main window (default `Alt+Q`)
- [ ] curl form mode (method / url / headers / body)
- [ ] Batch orchestration (multiple actions per button, stop on failure)
- [ ] Team config sharing (merge import, conflict handling)
- [ ] Quick-run panel in the tray

## 🧩 Project Structure

```
quik/
├─ src/               # Vue 3 frontend
│  ├─ components/     # UI components (button card / grid / output panel / dialogs…)
│  ├─ stores/         # Pinia stores (config, runner)
│  ├─ i18n/           # zh-CN / en-US locales
│  └─ utils/          # appearance rendering, log highlighting, notifications…
├─ src-tauri/         # Rust backend
│  └─ src/
│     ├─ config.rs    # config load/save, import/export (atomic write + .bak backup)
│     ├─ runner.rs    # process spawning, streaming output, stop / timeout
│     ├─ shell.rs     # shell detection (bash → powershell → cmd)
│     ├─ tray.rs      # system tray and close behavior
│     └─ logs.rs      # debug logging
└─ docs/              # design docs (in Chinese)
```

See [docs/技术方案.md](docs/技术方案.md) for design details and [docs/需求清单.md](docs/需求清单.md) for the requirement list and progress tracking (both in Chinese).

## 🤝 Contributing

Issues and pull requests are welcome:

- For feature requests or bug reports, please open an [Issue](../../issues) describing your use case first; accepted items get tracked in the requirement list
- Follow Conventional Commits (`feat:` / `fix:` / `chore:` prefixes)
- Real-machine testing on macOS / Linux and CI builds are the contributions we need most right now

## 📄 License

[MIT](./LICENSE) © 2026 Lanny
