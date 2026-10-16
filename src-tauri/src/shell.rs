//! Shell 检测：PATH 查找 bash（排除 WSL 的 bash）、powershell、curl

use serde::Serialize;
use std::path::PathBuf;

/// 在 PATH 中查找可执行文件（Windows 下同时尝试 .exe/.cmd/.bat）
fn find_in_path(name: &str) -> Option<String> {
    let path_var = std::env::var_os("PATH")?;
    let exts: &[&str] = if cfg!(windows) {
        &["", ".exe", ".cmd", ".bat"]
    } else {
        &[""]
    };
    for dir in std::env::split_paths(&path_var) {
        for ext in exts {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return candidate.to_str().map(|s| s.to_string());
            }
        }
    }
    None
}

/// 查找可用的 bash：
/// - Windows：PATH 中的 bash（排除 System32 下 WSL 的 bash.exe，它跑不了 Windows 侧的 curl）
///   以及 Git Bash 常见安装位置
/// - macOS/Linux：PATH 中的 bash
pub fn find_bash() -> Option<String> {
    if !cfg!(windows) {
        return find_in_path("bash");
    }
    if let Some(p) = find_in_path("bash") {
        let lower = p.to_lowercase().replace('/', "\\");
        if !lower.contains("system32") {
            return Some(p);
        }
    }
    let mut candidates: Vec<PathBuf> = vec![
        PathBuf::from(r"C:\Program Files\Git\bin\bash.exe"),
        PathBuf::from(r"C:\Program Files (x86)\Git\bin\bash.exe"),
    ];
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        candidates.push(PathBuf::from(local).join(r"Programs\Git\bin\bash.exe"));
    }
    candidates
        .into_iter()
        .find(|c| c.is_file())
        .and_then(|c| c.to_str().map(|s| s.to_string()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    pub auto: String,
    pub bash_found: bool,
    pub bash_path: Option<String>,
    pub curl_found: bool,
}

#[tauri::command]
pub async fn detect_shell() -> Result<ShellInfo, String> {
    let bash_path = find_bash();
    let curl_found = if cfg!(windows) {
        find_in_path("curl").is_some() || std::path::Path::new(r"C:\Windows\System32\curl.exe").is_file()
    } else {
        find_in_path("curl").is_some()
    };
    let auto = if cfg!(windows) {
        if bash_path.is_some() {
            "bash"
        } else if find_in_path("powershell").is_some() {
            "powershell"
        } else {
            "cmd"
        }
    } else {
        "bash"
    };
    Ok(ShellInfo {
        auto: auto.into(),
        bash_found: bash_path.is_some(),
        bash_path,
        curl_found,
    })
}
