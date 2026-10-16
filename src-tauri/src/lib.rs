mod config;
mod logs;
mod runner;
mod shell;
mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // 开机自启动：注册项由插件维护（Windows 注册表 Run 键 / macOS LaunchAgent / Linux .desktop）
        // 启动参数固定携带 --minimized，开机拉起后静默驻留托盘，不弹主窗口
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![
            config::load_config,
            config::save_config,
            config::export_config,
            config::import_config,
            shell::detect_shell,
            runner::run_action,
            runner::stop_action,
            tray::refresh_tray_menu,
            tray::quit_app,
            tray::hide_to_tray,
        ])
        .setup(|app| {
            tray::setup(app.handle())?;
            // 主窗口 visible:false 防闪现：正常启动立即显示，--minimized（开机自启）保持托盘驻留
            if let Some(win) = app.get_webview_window("main") {
                if !std::env::args_os().any(|a| a == "--minimized") {
                    let _ = win.show();
                }
            }
            Ok(())
        })
        .on_window_event(tray::handle_window_event)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
