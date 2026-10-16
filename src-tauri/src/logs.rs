//! 简易调试日志：追加写入应用数据目录 quik.log，用于诊断执行/停止链路

use once_cell::sync::Lazy;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

static LOG_PATH: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

/// 在 load_config（启动后必然调用）时设置日志路径为应用数据目录
pub fn set_log_path(path: PathBuf) {
    *LOG_PATH.lock().unwrap() = Some(path);
}

pub fn log_line(msg: &str) {
    let path = LOG_PATH
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_else(|| std::env::temp_dir().join("quik.log"));
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "[{ts}] {msg}");
    }
}
