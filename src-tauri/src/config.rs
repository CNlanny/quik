//! 配置持久化：读写 config.json（原子写入 + .bak 备份）、导入导出 .quik.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

// ---------- 数据模型（与前端 src/types/index.ts 保持一致，camelCase） ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub language: String,
    pub default_shell: String,
    pub history_limit: u32,
    /// 关闭按钮行为：ask（每次询问）/ tray（最小化到托盘）/ exit（直接退出）
    pub close_action: String,
    /// 界面主题：light / dark / system（跟随系统）；旧配置缺失时按浅色处理
    pub theme: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "zh-CN".into(),
            default_shell: "auto".into(),
            history_limit: 50,
            close_action: "ask".into(),
            theme: "light".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub vars: std::collections::HashMap<String, String>,
}

impl Default for Environment {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            vars: Default::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Action {
    #[serde(rename = "type")]
    pub action_type: String,
    pub mode: String,
    pub script: String,
    /// type=script 时引用的脚本库条目 id
    pub script_id: String,
    /// type=script 时的工作目录（空 = 不切换）
    pub workdir: String,
    /// type=script 时的命令行参数（支持引号包裹含空格的参数）
    pub args: String,
    pub timeout_sec: u64,
    pub shell: String,
}

impl Default for Action {
    fn default() -> Self {
        Self {
            action_type: "curl".into(),
            mode: "script".into(),
            script: String::new(),
            script_id: String::new(),
            workdir: String::new(),
            args: String::new(),
            timeout_sec: 30,
            shell: "auto".into(),
        }
    }
}

/// 脚本库条目（与前端 ScriptItem 一致）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Script {
    pub id: String,
    pub name: String,
    pub content: String,
    pub order: u32,
}

impl Default for Script {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            content: String::new(),
            order: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Button {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub confirm: bool,
    /// 运行输出中是否显示脚本内容；旧配置缺省该字段时保持原行为（显示）
    #[serde(default = "default_true")]
    pub show_script: bool,
    /// 是否允许并发执行；旧配置缺省该字段时保持原行为（执行中不可重复触发）
    pub allow_concurrent: bool,
    /// 执行结束时是否通过系统通知提醒；旧配置缺省该字段时保持原行为（不提醒）
    pub notify: bool,
    /// 按钮外观（填充 + 特效等），schema 由前端维护，这里原样透传避免两端重复定义；
    /// 旧配置没有该字段时为 None，由前端按默认外观处理
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<serde_json::Value>,
    pub action: Action,
    pub order: u32,
}

fn default_true() -> bool {
    true
}

impl Default for Button {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            color: "#409EFF".into(),
            icon: String::new(),
            confirm: false,
            show_script: true,
            allow_concurrent: false,
            notify: false,
            style: None,
            action: Default::default(),
            order: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub color: String,
    pub collapsed: bool,
    pub order: u32,
    pub buttons: Vec<Button>,
}

impl Default for Group {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            color: "#409EFF".into(),
            collapsed: false,
            order: 0,
            buttons: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub version: u32,
    pub settings: Settings,
    pub environments: Vec<Environment>,
    pub active_env_id: String,
    pub groups: Vec<Group>,
    pub scripts: Vec<Script>,
}

impl Default for AppConfig {
    fn default() -> Self {
        // 首次运行写入两个示例按钮，让用户直接体验点击执行
        Self {
            version: 1,
            settings: Settings::default(),
            environments: Vec::new(),
            active_env_id: String::new(),
            scripts: vec![Script {
                id: "sc-sample".into(),
                name: "示例脚本（带参数）".into(),
                content:
                    "# 参数以位置参数传入：bash $1 / PowerShell $args[0] / CMD %1\necho \"hello $1, working dir: $(pwd)\"\n"
                        .into(),
                order: 1,
            }],
            groups: vec![Group {
                id: "g-sample".into(),
                name: "示例 / Examples".into(),
                color: "#409EFF".into(),
                collapsed: false,
                order: 1,
                buttons: vec![
                    Button {
                        id: "b-sample-curl".into(),
                        name: "curl 示例".into(),
                        color: "#67C23A".into(),
                        icon: "🌐".into(),
                        confirm: false,
                        show_script: true,
                        allow_concurrent: false,
                        notify: false,
                        style: None,
                        order: 1,
                        action: Action {
                            action_type: "curl".into(),
                            script: "curl -s https://example.com".into(),
                            timeout_sec: 30,
                            ..Default::default()
                        },
                    },
                    Button {
                        id: "b-sample-echo".into(),
                        name: "echo 示例".into(),
                        color: "#909399".into(),
                        icon: "⚡".into(),
                        confirm: false,
                        show_script: true,
                        allow_concurrent: false,
                        notify: false,
                        style: None,
                        order: 2,
                        action: Action {
                            action_type: "shell".into(),
                            script: "echo \"Quik is ready 🚀\"".into(),
                            timeout_sec: 10,
                            ..Default::default()
                        },
                    },
                    Button {
                        id: "b-sample-script".into(),
                        name: "脚本按钮示例".into(),
                        color: "#9B59B6".into(),
                        icon: "📜".into(),
                        confirm: false,
                        show_script: true,
                        allow_concurrent: false,
                        notify: false,
                        style: None,
                        order: 3,
                        action: Action {
                            action_type: "script".into(),
                            script_id: "sc-sample".into(),
                            args: "Quik".into(),
                            timeout_sec: 10,
                            ..Default::default()
                        },
                    },
                ],
            }],
        }
    }
}

// ---------- 文件读写 ----------

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

fn read_config_file(path: &std::path::Path) -> Result<AppConfig, String> {
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

/// 读取设置（托盘菜单、关闭行为等原生逻辑用）；文件不存在或损坏时回退默认值
pub fn read_settings(app: &AppHandle) -> Settings {
    config_path(app)
        .ok()
        .and_then(|p| read_config_file(&p).ok())
        .map(|cfg| cfg.settings)
        .unwrap_or_default()
}

fn write_config_file(path: &std::path::Path, cfg: &AppConfig) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // 原子写入：先写临时文件再替换，避免写一半损坏配置
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    let path = config_path(&app)?;
    // 顺带初始化调试日志路径（应用数据目录/quik.log）
    if let Some(dir) = path.parent() {
        crate::logs::set_log_path(dir.join("quik.log"));
    }
    if !path.exists() {
        let cfg = AppConfig::default();
        write_config_file(&path, &cfg)?;
        return Ok(cfg);
    }
    match read_config_file(&path) {
        Ok(cfg) => Ok(cfg),
        Err(_) => {
            // 主配置损坏时尝试从备份恢复
            let bak = path.with_extension("json.bak");
            match read_config_file(&bak) {
                Ok(cfg) => Ok(cfg),
                Err(_) => Ok(AppConfig::default()),
            }
        }
    }
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    if path.exists() {
        let _ = fs::copy(&path, path.with_extension("json.bak"));
    }
    write_config_file(&path, &config)
}

// ---------- 导入 / 导出 ----------

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
pub fn export_config(
    app: AppHandle,
    path: String,
    group_ids: Option<Vec<String>>,
    include_env: bool,
) -> Result<(), String> {
    let cfg = load_config(app)?;
    let groups = match &group_ids {
        Some(ids) if !ids.is_empty() => cfg
            .groups
            .clone()
            .into_iter()
            .filter(|g| ids.contains(&g.id))
            .collect(),
        _ => cfg.groups.clone(),
    };

    // 导出内容引用到的脚本库条目一并带上（type=script 按钮运行时依赖它们）
    let referenced: std::collections::HashSet<String> = groups
        .iter()
        .flat_map(|g| g.buttons.iter())
        .filter(|b| b.action.action_type == "script")
        .map(|b| b.action.script_id.clone())
        .collect();
    let scripts: Vec<Script> = cfg
        .scripts
        .iter()
        .filter(|s| referenced.contains(&s.id))
        .cloned()
        .collect();

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ExportFile {
        kind: &'static str,
        version: u32,
        exported_at: u64,
        groups: Vec<Group>,
        #[serde(skip_serializing_if = "Option::is_none")]
        environments: Option<Vec<Environment>>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        scripts: Vec<Script>,
    }

    let file = ExportFile {
        kind: "quik-export",
        version: 1,
        exported_at: unix_now(),
        groups,
        environments: if include_env && !cfg.environments.is_empty() {
            Some(cfg.environments)
        } else {
            None
        },
        scripts,
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub groups_added: u32,
    pub buttons_added: u32,
}

#[tauri::command]
pub fn import_config(app: AppHandle, path: String) -> Result<ImportSummary, String> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ExportFile {
        #[serde(default)]
        groups: Vec<Group>,
        #[serde(default)]
        environments: Option<Vec<Environment>>,
        #[serde(default)]
        scripts: Vec<Script>,
    }

    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: ExportFile =
        serde_json::from_str(&text).map_err(|e| format!("not a quik export file: {e}"))?;

    let mut cfg = load_config(app.clone())?;
    let mut groups_added = 0u32;
    let mut buttons_added = 0u32;

    for mut group in file.groups {
        // 整组追加：id 冲突时重新生成，按钮 id 统一重新生成，避免与现有内容冲突
        if cfg.groups.iter().any(|g| g.id == group.id) {
            group.id = format!("g-{}", uuid::Uuid::new_v4());
        }
        for button in group.buttons.iter_mut() {
            button.id = format!("b-{}", uuid::Uuid::new_v4());
        }
        buttons_added += group.buttons.len() as u32;
        cfg.groups.push(group);
        groups_added += 1;
    }

    if let Some(envs) = file.environments {
        for env in envs {
            if !cfg.environments.iter().any(|e| e.id == env.id) {
                cfg.environments.push(env);
            }
        }
    }

    // 脚本按 id 合并：id 已存在时保留本地版本，引用关系依然成立
    for script in file.scripts {
        if !cfg.scripts.iter().any(|s| s.id == script.id) {
            cfg.scripts.push(script);
        }
    }

    save_config(app, cfg)?;
    Ok(ImportSummary {
        groups_added,
        buttons_added,
    })
}
