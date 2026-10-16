//! 动作执行器：spawn 子进程执行 curl/shell 脚本，流式回传输出，支持停止与超时
//!
//! 停止机制（双保险）：
//! 1. Notify 通知 → tokio 原生 child.kill() 杀直接子进程（bash/powershell 本体）
//! 2. taskkill /T /F 按 PID 杀整棵进程树（bash 派生的 curl 等子孙进程）
//! 全链路写入调试日志（logs.rs → 应用数据目录 quik.log）

use crate::logs::log_line;
use crate::shell::find_bash;
use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, Notify};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputChunk {
    run_id: String,
    stream: String,
    data: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResult {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub killed: bool,
    pub timed_out: bool,
    pub error: Option<String>,
}

/// 进行中运行的控制句柄
struct RunHandle {
    pid: Option<u32>,
    notify: Arc<Notify>,
}

/// 进行中的运行（停止用）
static RUNS: Lazy<Mutex<HashMap<String, RunHandle>>> = Lazy::new(|| Mutex::new(HashMap::new()));
/// 已请求停止的 runId 集合（用于区分"被停止"与"自然失败"）
static KILLED: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));

/// 输出解码：优先 UTF-8，失败时回退 GBK（Windows PowerShell/CMD 输出常见）
fn decode_bytes(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => encoding_rs::GBK.decode(bytes).0.into_owned(),
    }
}

async fn pump<R: tokio::io::AsyncRead + Unpin>(
    app: AppHandle,
    run_id: String,
    mut pipe: R,
    stream: &'static str,
) {
    let mut buf = vec![0u8; 8192];
    loop {
        match pipe.read(&mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                let data = decode_bytes(&buf[..n]);
                let _ = app.emit(
                    "run://output",
                    OutputChunk {
                        run_id: run_id.clone(),
                        stream: stream.into(),
                        data,
                    },
                );
            }
        }
    }
}

/// 按 PID 杀掉整棵进程树（bash 会派生 curl 等子进程，必须连树一起杀）
async fn kill_tree(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        let out = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .await
            .map_err(|e| format!("spawn taskkill failed: {e}"))?;
        if !out.status.success() {
            return Err(format!(
                "taskkill exit {:?}: {}",
                out.status.code(),
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        Ok(())
    }
    #[cfg(unix)]
    {
        // 优先杀进程组（process_group(0) 已在 spawn 时设置），失败则杀单进程
        let group_ok = Command::new("kill")
            .arg("-9")
            .arg(format!("-{pid}"))
            .status()
            .await
            .map(|s| s.success())
            .unwrap_or(false);
        if !group_ok {
            let _ = Command::new("kill")
                .arg("-9")
                .arg(pid.to_string())
                .status()
                .await;
        }
        Ok(())
    }
}

fn resolve_shell(mode: &str) -> String {
    match mode {
        "bash" | "powershell" | "cmd" => mode.to_string(),
        // auto：bash → powershell → cmd（非 Windows 恒为 bash）
        _ => {
            if cfg!(windows) {
                if find_bash().is_some() {
                    "bash".into()
                } else {
                    "powershell".into()
                }
            } else {
                "bash".into()
            }
        }
    }
}

/// 把参数字符串切分为 argv：空白分隔，支持单/双引号包裹含空格的参数（引号本身被去掉）
fn split_args(raw: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut has_token = false;
    let mut in_single = false;
    let mut in_double = false;
    let mut chars = raw.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\'' if !in_double => {
                in_single = !in_single;
                has_token = true;
            }
            '"' if !in_single => {
                in_double = !in_double;
                has_token = true;
            }
            '\\' if in_double => match chars.peek() {
                Some(next @ ('"' | '\\')) => {
                    cur.push(*next);
                    chars.next();
                    has_token = true;
                }
                _ => {
                    cur.push('\\');
                    has_token = true;
                }
            },
            c if c.is_whitespace() && !in_single && !in_double => {
                if has_token {
                    out.push(std::mem::take(&mut cur));
                    has_token = false;
                }
            }
            c => {
                cur.push(c);
                has_token = true;
            }
        }
    }
    if has_token {
        out.push(cur);
    }
    out
}

/// 指定工作目录/参数时脚本落盘为临时文件再执行：
/// - bash：CRLF 会导致 "\r: command not found"，需归一为 LF、无 BOM
/// - PowerShell 5.1：无 BOM 的 UTF-8 脚本按 ANSI 解析，中文需带 BOM
/// - cmd：批处理按 CRLF 习惯书写
fn write_temp_script(run_id: &str, shell: &str, content: &str) -> Result<PathBuf, String> {
    let normalized = content.replace("\r\n", "\n");
    let (ext, body): (&str, Vec<u8>) = match shell {
        "bash" => ("sh", normalized.into_bytes()),
        "powershell" => {
            let mut b = vec![0xEF, 0xBB, 0xBF];
            b.extend_from_slice(normalized.as_bytes());
            ("ps1", b)
        }
        _ => ("cmd", normalized.replace('\n', "\r\n").into_bytes()),
    };
    let path = std::env::temp_dir().join(format!("quik-{run_id}.{ext}"));
    fs::write(&path, body).map_err(|e| e.to_string())?;
    Ok(path)
}

fn build_command(
    shell: &str,
    script: &str,
    script_file: Option<&std::path::Path>,
    args: &[String],
    workdir: Option<&str>,
) -> Result<Command, String> {
    let mut cmd = match shell {
        "bash" => {
            let bash = find_bash().ok_or(
                "bash not found. Install Git Bash, or switch the shell to PowerShell/CMD in settings.",
            )?;
            let mut c = Command::new(bash);
            match script_file {
                // 文件模式：bash file.sh arg1 arg2 → 脚本内 $1/$2 可用
                Some(f) => {
                    c.arg(f);
                    c.args(args);
                }
                None => {
                    c.arg("-c").arg(script);
                }
            }
            c.env("LANG", "C.UTF-8");
            c
        }
        "powershell" => {
            let mut c = Command::new("powershell");
            c.args(["-NoProfile", "-NonInteractive"]);
            match script_file {
                // 文件模式：-File file.ps1 arg1 arg2 → 脚本内 $args / param() 绑定可用
                Some(f) => {
                    c.args(["-ExecutionPolicy", "Bypass", "-File"]);
                    c.arg(f);
                    c.args(args);
                }
                None => {
                    c.arg("-Command");
                    // 强制 UTF-8 输出，避免中文乱码
                    c.arg(format!(
                        "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; {script}"
                    ));
                }
            }
            c
        }
        _ => {
            let mut c = Command::new("cmd");
            c.arg("/C");
            match script_file {
                // 文件模式：cmd 无内联位置参数概念，必须走批处理文件（%1/%2）
                Some(f) => {
                    let mut line = format!("chcp 65001 >nul & \"{}\"", f.to_string_lossy());
                    for a in args {
                        if a.contains([' ', '\t', '&', '|', '<', '>', '^']) {
                            line.push_str(" \"");
                            line.push_str(a);
                            line.push('"');
                        } else {
                            line.push(' ');
                            line.push_str(a);
                        }
                    }
                    #[cfg(windows)]
                    c.raw_arg(line);
                    #[cfg(not(windows))]
                    c.arg(line);
                }
                None => {
                    c.arg(format!("chcp 65001 >nul & {script}"));
                }
            }
            c
        }
    };

    if let Some(wd) = workdir {
        if !wd.trim().is_empty() {
            cmd.current_dir(wd);
        }
    }

    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    Ok(cmd)
}

/// 等待进程退出；可被 Notify 中断并原生 kill；返回 (ExitStatus, 是否超时)
async fn wait_with_kill_switch(
    mut child: Child,
    notify: Arc<Notify>,
    timeout: Duration,
) -> Result<(std::process::ExitStatus, bool), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let notify_in = notify.clone();
    tokio::spawn(async move {
        tokio::select! {
            st = child.wait() => { let _ = tx.send(st); }
            _ = notify_in.notified() => {
                // 原生 kill 直接子进程；子孙进程由 stop_action 的 taskkill /T 处理
                let _ = child.kill().await;
                let st = child.wait().await;
                let _ = tx.send(st);
            }
        }
    });

    // Box::pin 让 rx 在超时后仍可继续 await（回收进程）
    let mut recv = Box::pin(rx);
    match tokio::time::timeout(timeout, recv.as_mut()).await {
        Ok(Ok(st)) => Ok((st.map_err(|e| e.to_string())?, false)),
        Ok(Err(_)) => Err("wait channel closed unexpectedly".into()),
        Err(_) => {
            notify.notify_one();
            match recv.await {
                Ok(st) => Ok((st.map_err(|e| e.to_string())?, true)),
                Err(_) => Err("wait channel closed unexpectedly".into()),
            }
        }
    }
}

#[tauri::command]
pub async fn run_action(
    app: AppHandle,
    run_id: String,
    script: String,
    shell: String,
    timeout_sec: u64,
    vars: HashMap<String, String>,
    workdir: Option<String>,
    args: Option<String>,
) -> Result<RunResult, String> {
    let started = Instant::now();

    // 占位符渲染（前端已渲染过一遍，这里兜底），脚本/参数/工作目录都参与
    let render = |mut s: String| {
        for (k, v) in &vars {
            s = s.replace(&format!("{{{{{k}}}}}"), v);
        }
        s
    };
    let rendered = render(script);
    let rendered_args = render(args.unwrap_or_default());
    let rendered_workdir = workdir.unwrap_or_default();

    let resolved = resolve_shell(&shell);
    // 带参数或指定工作目录 → 脚本落盘为临时文件执行（位置参数、工作目录才有效）
    let file_mode =
        !rendered_args.trim().is_empty() || !rendered_workdir.trim().is_empty();
    let script_file = if file_mode {
        match write_temp_script(&run_id, &resolved, &rendered) {
            Ok(p) => Some(p),
            Err(e) => {
                log_line(&format!("run error: run_id={run_id} write temp script: {e}"));
                return Err(e);
            }
        }
    } else {
        None
    };

    let spawn_result = build_command(
        &resolved,
        &rendered,
        script_file.as_deref(),
        &split_args(&rendered_args),
        Some(&rendered_workdir),
    )
    .and_then(|mut c| c.spawn().map_err(|e| format!("spawn failed: {e}")));
    let mut child = match spawn_result {
        Ok(c) => c,
        Err(e) => {
            if let Some(p) = &script_file {
                let _ = fs::remove_file(p);
            }
            return Err(e);
        }
    };
    let pid = child.id();
    log_line(&format!(
        "run start: run_id={run_id} shell={resolved} pid={pid:?} file_mode={file_mode} workdir={:?} args={:?}",
        rendered_workdir, rendered_args
    ));

    let notify = Arc::new(Notify::new());
    RUNS.lock().await.insert(
        run_id.clone(),
        RunHandle {
            pid,
            notify: notify.clone(),
        },
    );

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let out_task = stdout.map(|p| tokio::spawn(pump(app.clone(), run_id.clone(), p, "stdout")));
    let err_task = stderr.map(|p| tokio::spawn(pump(app.clone(), run_id.clone(), p, "stderr")));

    let timeout = Duration::from_secs(if timeout_sec == 0 { 30 } else { timeout_sec });
    let (status, timed_out) = match wait_with_kill_switch(child, notify, timeout).await {
        Ok(v) => v,
        Err(e) => {
            RUNS.lock().await.remove(&run_id);
            KILLED.lock().await.remove(&run_id);
            log_line(&format!("run error: run_id={run_id} {e}"));
            return Err(e);
        }
    };

    // 等输出管道读完（进程已退出，很快返回）
    if let Some(t) = out_task {
        let _ = t.await;
    }
    if let Some(t) = err_task {
        let _ = t.await;
    }
    // 临时脚本用完即删（尽力而为）
    if let Some(p) = &script_file {
        let _ = fs::remove_file(p);
    }

    RUNS.lock().await.remove(&run_id);
    let killed = KILLED.lock().await.remove(&run_id);
    let success = status.success() && !killed && !timed_out;
    log_line(&format!(
        "run end: run_id={run_id} code={:?} killed={killed} timed_out={timed_out} ms={}",
        status.code(),
        started.elapsed().as_millis()
    ));

    Ok(RunResult {
        success,
        exit_code: status.code(),
        duration_ms: started.elapsed().as_millis() as u64,
        killed,
        timed_out,
        error: None,
    })
}

#[tauri::command]
pub async fn stop_action(run_id: String) -> Result<bool, String> {
    log_line(&format!("stop_action called: run_id={run_id}"));
    let handle = RUNS.lock().await.remove(&run_id);
    KILLED.lock().await.insert(run_id);
    match handle {
        Some(h) => {
            // 双保险：原生 kill 直接子进程 + taskkill 杀整棵进程树
            h.notify.notify_one();
            if let Some(pid) = h.pid {
                match kill_tree(pid).await {
                    Ok(()) => log_line(&format!("stop_action kill_tree pid={pid} ok")),
                    Err(e) => log_line(&format!("stop_action kill_tree pid={pid} FAILED: {e}")),
                }
            }
            Ok(true)
        }
        None => {
            log_line("stop_action: run not found (already finished or unknown id)");
            Ok(false)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_args_with_quotes() {
        assert_eq!(split_args(""), Vec::<String>::new());
        assert_eq!(split_args("a b c"), vec!["a", "b", "c"]);
        assert_eq!(split_args("  --port   8080  "), vec!["--port", "8080"]);
        assert_eq!(split_args("\"hello world\" x"), vec!["hello world", "x"]);
        assert_eq!(split_args("'a b' \"c d\""), vec!["a b", "c d"]);
        // 引号包裹的 token 即使没有空白也作为整体（引号被去掉）
        assert_eq!(split_args("q=\"v\""), vec!["q=v"]);
        // 双引号内支持 \" 与 \\ 转义
        assert_eq!(split_args(r#""a\"b" "\\" "#), vec!["a\"b", "\\"]);
    }

    #[test]
    fn writes_temp_script_normalized() {
        // bash：CRLF 归一为 LF、无 BOM
        let p = write_temp_script("test-run", "bash", "echo hi\r\n").unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"echo hi\n");
        // powershell：带 UTF-8 BOM
        let p2 = write_temp_script("test-run", "powershell", "echo 中文").unwrap();
        let b = std::fs::read(&p2).unwrap();
        assert_eq!(&b[..3], &[0xEF, 0xBB, 0xBF]);
        assert_eq!(&b[3..], "echo 中文".as_bytes());
        // cmd：LF 归一为 CRLF
        let p3 = write_temp_script("test-run", "cmd", "echo hi\n").unwrap();
        assert_eq!(std::fs::read(&p3).unwrap(), b"echo hi\r\n");
        let _ = std::fs::remove_file(&p);
        let _ = std::fs::remove_file(&p2);
        let _ = std::fs::remove_file(&p3);
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn runs_script_file_with_args_and_workdir() {
        // 环境（CI 等）无 bash 时跳过
        let Some(bash) = find_bash() else { return };
        let dir = std::env::temp_dir();
        let f = write_temp_script("it-args", "bash", "echo \"a=$1 d=$(pwd -W 2>/dev/null || pwd)\"\n").unwrap();
        let out = build_command(
            "bash",
            "",
            Some(&f),
            &["hello".into()],
            Some(dir.to_str().unwrap()),
        )
        .unwrap()
        .output()
        .await
        .unwrap();
        let stdout = decode_bytes(&out.stdout);
        assert!(out.status.success(), "stderr: {}", decode_bytes(&out.stderr));
        assert!(stdout.contains("a=hello"), "stdout: {stdout}");
        // 工作目录已切换到 temp（pwd -W 输出 Windows 形式路径，比较时忽略大小写与尾部斜杠）
        let mixed = stdout.replace('\\', "/").to_lowercase();
        let expect = dir
            .to_string_lossy()
            .replace('\\', "/")
            .trim_end_matches('/')
            .to_lowercase();
        let mapped = expect.replace(':', "");
        assert!(
            mixed.contains(&expect) || mixed.contains(&mapped),
            "stdout: {stdout}, expect: {expect} or {mapped}"
        );
        let _ = std::fs::remove_file(&f);
        let _ = bash; // find_bash 仅用于判断是否跳过
    }
}
