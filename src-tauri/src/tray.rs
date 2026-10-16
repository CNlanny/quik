//! 系统托盘（R-105/R-107）：托盘后台常驻，左键点托盘恢复，右键菜单可退出
//! 关闭行为由配置 closeAction 决定：ask 弹窗询问（前端渲染）/ tray 隐藏 / exit 退出
//! 菜单文案跟随界面语言（config.settings.language），语言切换后由前端调 refresh_tray_menu 重建

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Window, WindowEvent};

const TRAY_ID: &str = "main-tray";

fn menu_labels(lang: &str) -> (&'static str, &'static str) {
    if lang == "en-US" {
        ("Show Main Window", "Quit Quik")
    } else {
        ("显示主窗口", "退出 Quik")
    }
}

fn build_menu(app: &AppHandle, lang: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let (show_text, quit_text) = menu_labels(lang);
    let show = MenuItem::with_id(app, "show", show_text, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_text, true, None::<&str>)?;
    Menu::with_items(app, &[&show, &quit])
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let lang = crate::config::read_settings(app).language;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(
            app.default_window_icon()
                .expect("default window icon missing")
                .clone(),
        )
        .tooltip("Quik")
        .show_menu_on_left_click(false)
        .menu(&build_menu(app, &lang)?)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // 左键单击恢复主窗口；右键弹菜单（默认行为）
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// 语言切换后重建托盘菜单；lang 由前端直接传入，避免与配置持久化的时序竞争，缺省回读配置
#[tauri::command]
pub fn refresh_tray_menu(app: AppHandle, lang: Option<String>) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let lang = lang.unwrap_or_else(|| crate::config::read_settings(&app).language);
        tray.set_menu(Some(build_menu(&app, &lang)?))?;
    }
    Ok(())
}

/// 关闭询问弹窗选择「直接退出」
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// 关闭询问弹窗选择「最小化到托盘」
#[tauri::command]
pub fn hide_to_tray(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

/// 恢复主窗口：显示 + 还原最小化 + 聚焦
fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// 关闭行为按配置分流（ask/tray/exit）。真正退出走托盘菜单或 ask 弹窗
pub fn handle_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let app = window.app_handle();
        match crate::config::read_settings(app).close_action.as_str() {
            "exit" => app.exit(0),
            "tray" => {
                let _ = window.hide();
            }
            // ask：交给前端弹窗询问，用户选择后回调 quit_app / hide_to_tray
            _ => {
                let _ = window.emit("close-ask", ());
            }
        }
    }
}
