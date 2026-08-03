#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};

use serde::Serialize;
use tauri::{
    webview::{Color, PageLoadEvent, PageLoadPayload},
    AppHandle, Manager, Position, Size, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

const PRODUCTION_ORIGIN: &str = "https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev";
const STAGING_ORIGIN: &str = "https://class-pdf-comment-viewer-v01-staging.syouziroupc.workers.dev";
const ACTION_HOST: &str = "desktop.cpcv.local";
const ADMIN_LABEL: &str = "main";
const OVERLAY_LABEL: &str = "overlay";
const SHARED_PROFILE_DIRECTORY: &str = "shared-webview-profile";
const ADMIN_INITIALIZATION_SCRIPT: &str = include_str!("../scripts/admin.js");
const OVERLAY_INITIALIZATION_SCRIPT: &str = include_str!("../scripts/overlay.js");

#[derive(Debug)]
struct DesktopState {
    origin: &'static str,
    overlay_active: bool,
    comments_visible: bool,
    qr_visible: bool,
    monitor_index: Option<usize>,
    message: String,
    error: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminUiState {
    overlay_active: bool,
    comments_visible: bool,
    qr_visible: bool,
    monitor_label: String,
    environment_label: String,
    message: String,
    error: bool,
}

fn selected_origin() -> &'static str {
    if std::env::args().any(|argument| argument == "--staging") {
        STAGING_ORIGIN
    } else {
        PRODUCTION_ORIGIN
    }
}

fn state_lock(app: &AppHandle) -> Result<MutexGuard<'_, DesktopState>, String> {
    app.state::<Mutex<DesktopState>>()
        .inner()
        .lock()
        .map_err(|_| "デスクトップ状態の取得に失敗しました。".to_string())
}

fn shared_webview_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("WebView2保存先を取得できません: {error}"))?
        .join(SHARED_PROFILE_DIRECTORY);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("WebView2保存先を作成できません: {error}"))?;
    Ok(directory)
}

fn normalize_session_id(session_id: &str) -> Result<String, String> {
    let normalized = session_id.trim();
    if !(10..=128).contains(&normalized.len())
        || !normalized.starts_with("sess_")
        || !normalized.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
    {
        return Err("授業IDの形式が正しくありません。".to_string());
    }
    Ok(normalized.to_string())
}

fn expected_remote_url(url: &tauri::Url, expected_origin: &str) -> bool {
    let value = url.as_str();
    value == expected_origin || value.starts_with(&format!("{expected_origin}/"))
}

fn action_url(url: &tauri::Url) -> bool {
    url.scheme() == "https" && url.host_str() == Some(ACTION_HOST)
}

fn action_session(url: &tauri::Url) -> Option<String> {
    url.query_pairs()
        .find(|(key, _)| key == "session")
        .map(|(_, value)| value.into_owned())
}

fn action_optional_bool(url: &tauri::Url, key: &str) -> Result<Option<bool>, String> {
    let Some(value) = url
        .query_pairs()
        .find(|(query_key, _)| query_key == key)
        .map(|(_, value)| value.into_owned())
    else {
        return Ok(None);
    };

    match value.as_str() {
        "1" | "true" => Ok(Some(true)),
        "0" | "false" => Ok(Some(false)),
        _ => Err(format!("{key}の値が正しくありません。")),
    }
}

fn destroy_window_if_present(app: &AppHandle, label: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        window.destroy().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn monitor_index_and_label(
    app: &AppHandle,
    preferred: Option<usize>,
) -> Result<(usize, String), String> {
    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;
    if monitors.is_empty() {
        return Err("利用可能なディスプレイが見つかりません。".to_string());
    }

    let primary = app
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .map(|monitor| (*monitor.position(), *monitor.size()));

    let index = preferred
        .filter(|index| *index < monitors.len())
        .or_else(|| {
            monitors.iter().position(|monitor| {
                primary.as_ref().is_some_and(|(position, size)| {
                    *position != *monitor.position() || *size != *monitor.size()
                })
            })
        })
        .unwrap_or(0);

    let monitor = &monitors[index];
    let label = monitor
        .name()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("ディスプレイ{}", index + 1));
    Ok((index, label))
}

fn monitor_at(app: &AppHandle, monitor_index: usize) -> Result<tauri::Monitor, String> {
    app.available_monitors()
        .map_err(|error| error.to_string())?
        .into_iter()
        .nth(monitor_index)
        .ok_or_else(|| "指定したディスプレイが見つかりません。".to_string())
}

fn place_overlay(window: &WebviewWindow, monitor: &tauri::Monitor) -> Result<(), String> {
    window
        .set_position(Position::Physical(*monitor.position()))
        .map_err(|error| error.to_string())?;
    window
        .set_size(Size::Physical(*monitor.size()))
        .map_err(|error| error.to_string())?;
    window
        .set_background_color(Some(Color(0, 0, 0, 0)))
        .map_err(|error| error.to_string())?;
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    window
        .set_focusable(false)
        .map_err(|error| error.to_string())?;
    window
        .set_ignore_cursor_events(true)
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    Ok(())
}

fn overlay_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| "オーバーレイが起動していません。".to_string())
}

fn apply_overlay_state(app: &AppHandle) -> Result<(), String> {
    let (comments_visible, qr_visible) = {
        let state = state_lock(app)?;
        (state.comments_visible, state.qr_visible)
    };

    overlay_window(app)?
        .eval(format!(
            "window.__CPCV_DESKTOP_OVERLAY__?.setCommentsVisible({comments_visible});\
             window.__CPCV_DESKTOP_OVERLAY__?.setQrVisible({qr_visible});"
        ))
        .map_err(|error| error.to_string())
}

fn admin_ui_state(app: &AppHandle) -> Result<AdminUiState, String> {
    let (preferred, origin, overlay_active, comments_visible, qr_visible, message, error) = {
        let state = state_lock(app)?;
        (
            state.monitor_index,
            state.origin,
            state.overlay_active,
            state.comments_visible,
            state.qr_visible,
            state.message.clone(),
            state.error,
        )
    };

    let monitor_label = monitor_index_and_label(app, preferred)
        .map(|(_, label)| label)
        .unwrap_or_else(|_| "未検出".to_string());

    Ok(AdminUiState {
        overlay_active,
        comments_visible,
        qr_visible,
        monitor_label,
        environment_label: if origin == STAGING_ORIGIN {
            "試験環境".to_string()
        } else {
            String::new()
        },
        message,
        error,
    })
}

fn sync_admin_ui(app: &AppHandle) -> Result<(), String> {
    let Some(admin) = app.get_webview_window(ADMIN_LABEL) else {
        return Ok(());
    };

    let payload =
        serde_json::to_string(&admin_ui_state(app)?).map_err(|error| error.to_string())?;
    admin
        .eval(format!(
            "window.__CPCV_DESKTOP_ADMIN__?.setState({payload});"
        ))
        .map_err(|error| error.to_string())
}

fn set_status(app: &AppHandle, message: impl Into<String>, error: bool) {
    if let Ok(mut state) = state_lock(app) {
        state.message = message.into();
        state.error = error;
    }
    let _ = sync_admin_ui(app);
}

fn set_comments_visible(app: &AppHandle, visible: bool) -> Result<(), String> {
    {
        let mut state = state_lock(app)?;
        state.comments_visible = visible;
        state.message = if visible {
            "コメント表示を有効にしました。".to_string()
        } else {
            "コメントを隠しました。".to_string()
        };
        state.error = false;
    }

    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        apply_overlay_state(app)?;
    }
    sync_admin_ui(app)
}

async fn open_overlay(
    app: AppHandle,
    session_id: String,
    comments_visible: Option<bool>,
) -> Result<(), String> {
    let session_id = normalize_session_id(&session_id)?;
    let (origin, preferred) = {
        let mut state = state_lock(&app)?;
        if let Some(visible) = comments_visible {
            state.comments_visible = visible;
        }
        (state.origin, state.monitor_index)
    };

    let (monitor_index, monitor_label) = monitor_index_and_label(&app, preferred)?;
    let monitor = monitor_at(&app, monitor_index)?;
    let data_directory = shared_webview_data_directory(&app)?;
    destroy_window_if_present(&app, OVERLAY_LABEL)?;

    let url = format!("{origin}/viewer/{session_id}")
        .parse()
        .map_err(|error| format!("投影URLを作成できません: {error}"))?;

    let load_app = app.clone();
    let overlay = WebviewWindowBuilder::new(&app, OVERLAY_LABEL, WebviewUrl::External(url))
        .title("CPCV Overlay")
        .decorations(false)
        .shadow(false)
        .transparent(true)
        .background_color(Color(0, 0, 0, 0))
        .always_on_top(true)
        .focusable(false)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .data_directory(data_directory)
        .initialization_script(OVERLAY_INITIALIZATION_SCRIPT)
        .on_navigation(move |url| expected_remote_url(url, origin))
        .on_page_load(move |_window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let app = load_app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = apply_overlay_state(&app);
                    let _ = sync_admin_ui(&app);
                });
            }
        })
        .build()
        .map_err(|error| error.to_string())?;

    place_overlay(&overlay, &monitor)?;

    {
        let mut state = state_lock(&app)?;
        state.overlay_active = true;
        state.monitor_index = Some(monitor_index);
        state.message = format!("{monitor_label}へ投影しています。");
        state.error = false;
    }
    sync_admin_ui(&app)?;
    Ok(())
}

fn close_overlay(app: &AppHandle) -> Result<(), String> {
    destroy_window_if_present(app, OVERLAY_LABEL)?;
    {
        let mut state = state_lock(app)?;
        state.overlay_active = false;
        state.message = "投影を停止しました。".to_string();
        state.error = false;
    }
    sync_admin_ui(app)
}

fn toggle_qr(app: &AppHandle) -> Result<(), String> {
    let visible = {
        let mut state = state_lock(app)?;
        state.qr_visible = !state.qr_visible;
        state.qr_visible
    };

    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        apply_overlay_state(app)?;
    }

    set_status(
        app,
        if visible {
            "QRコードを表示しました。"
        } else {
            "QRコードを隠しました。"
        },
        false,
    );
    Ok(())
}

fn next_monitor(app: &AppHandle) -> Result<(), String> {
    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;
    if monitors.is_empty() {
        return Err("利用可能なディスプレイが見つかりません。".to_string());
    }

    let next_index = {
        let state = state_lock(app)?;
        state
            .monitor_index
            .map(|index| (index + 1) % monitors.len())
            .unwrap_or(0)
    };
    let monitor = monitor_at(app, next_index)?;
    let label = monitor
        .name()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("ディスプレイ{}", next_index + 1));

    if let Some(overlay) = app.get_webview_window(OVERLAY_LABEL) {
        place_overlay(&overlay, &monitor)?;
    }

    {
        let mut state = state_lock(app)?;
        state.monitor_index = Some(next_index);
        state.message = format!("投影先を{label}へ変更しました。");
        state.error = false;
    }
    sync_admin_ui(app)
}

async fn handle_admin_action(app: AppHandle, url: tauri::Url) -> Result<(), String> {
    match url.path().trim_matches('/') {
        "overlay/start" => {
            let session =
                action_session(&url).ok_or_else(|| "授業を選択してください。".to_string())?;
            let comments_visible = action_optional_bool(&url, "comments")?;
            open_overlay(app, session, comments_visible).await
        }
        "overlay/stop" => close_overlay(&app),
        "comments/set" => {
            let visible = action_optional_bool(&url, "visible")?
                .ok_or_else(|| "コメント表示状態が指定されていません。".to_string())?;
            set_comments_visible(&app, visible)
        }
        "qr/toggle" => toggle_qr(&app),
        "monitor/next" => next_monitor(&app),
        _ => Err("不明なデスクトップ操作です。".to_string()),
    }
}

fn build_admin_window(app: &AppHandle, origin: &'static str) -> Result<WebviewWindow, String> {
    let data_directory = shared_webview_data_directory(app)?;
    let url = format!("{origin}/admin")
        .parse()
        .map_err(|error| format!("管理画面URLを作成できません: {error}"))?;

    let navigation_app = app.clone();
    let load_app = app.clone();
    WebviewWindowBuilder::new(app, ADMIN_LABEL, WebviewUrl::External(url))
        .title("CPCV")
        .inner_size(1220.0, 860.0)
        .min_inner_size(820.0, 640.0)
        .resizable(true)
        .data_directory(data_directory)
        .initialization_script(ADMIN_INITIALIZATION_SCRIPT)
        .on_navigation(move |url| {
            if action_url(url) {
                let app = navigation_app.clone();
                let action = url.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = handle_admin_action(app.clone(), action).await {
                        set_status(&app, error, true);
                    }
                });
                return false;
            }
            expected_remote_url(url, origin)
        })
        .on_page_load(move |_window, payload: PageLoadPayload<'_>| {
            if payload.event() == PageLoadEvent::Finished {
                let app = load_app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = sync_admin_ui(&app);
                });
            }
        })
        .build()
        .map_err(|error| error.to_string())
}

fn main() {
    let origin = selected_origin();
    tauri::Builder::default()
        .manage(Mutex::new(DesktopState {
            origin,
            overlay_active: false,
            comments_visible: true,
            qr_visible: false,
            monitor_index: None,
            message: "ログイン後、授業を作成または選択してください。".to_string(),
            error: false,
        }))
        .setup(move |app| {
            build_admin_window(app.handle(), origin).map_err(std::io::Error::other)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == ADMIN_LABEL
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                let app = window.app_handle().clone();
                let _ = destroy_window_if_present(&app, OVERLAY_LABEL);
                app.exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run CPCV Desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_session_ids() {
        assert!(normalize_session_id("sess_0123456789abcdef").is_ok());
        assert!(normalize_session_id("sess_with-dash_123").is_ok());
        assert!(normalize_session_id("wrong_0123456789").is_err());
        assert!(normalize_session_id("sess_bad/path").is_err());
    }

    #[test]
    fn recognizes_expected_remote_urls() {
        let production_admin = tauri::Url::parse(&format!("{PRODUCTION_ORIGIN}/admin")).unwrap();
        let staging_viewer =
            tauri::Url::parse(&format!("{STAGING_ORIGIN}/viewer/sess_0123456789")).unwrap();
        let unrelated = tauri::Url::parse("https://example.com/admin").unwrap();
        assert!(expected_remote_url(&production_admin, PRODUCTION_ORIGIN));
        assert!(expected_remote_url(&staging_viewer, STAGING_ORIGIN));
        assert!(!expected_remote_url(&unrelated, PRODUCTION_ORIGIN));
    }

    #[test]
    fn recognizes_only_desktop_action_host() {
        assert!(action_url(
            &tauri::Url::parse("https://desktop.cpcv.local/overlay/start").unwrap()
        ));
        assert!(!action_url(
            &tauri::Url::parse("https://example.com/overlay/start").unwrap()
        ));
    }

    #[test]
    fn parses_optional_boolean_actions() {
        let enabled =
            tauri::Url::parse("https://desktop.cpcv.local/comments/set?visible=1").unwrap();
        let disabled =
            tauri::Url::parse("https://desktop.cpcv.local/comments/set?visible=false").unwrap();
        let missing = tauri::Url::parse("https://desktop.cpcv.local/comments/set").unwrap();
        let invalid =
            tauri::Url::parse("https://desktop.cpcv.local/comments/set?visible=maybe").unwrap();

        assert_eq!(
            action_optional_bool(&enabled, "visible").unwrap(),
            Some(true)
        );
        assert_eq!(
            action_optional_bool(&disabled, "visible").unwrap(),
            Some(false)
        );
        assert_eq!(action_optional_bool(&missing, "visible").unwrap(), None);
        assert!(action_optional_bool(&invalid, "visible").is_err());
    }

    #[test]
    fn scripts_are_scoped_to_expected_pages() {
        assert!(ADMIN_INITIALIZATION_SCRIPT.contains("window.top !== window"));
        assert!(ADMIN_INITIALIZATION_SCRIPT.contains("adminPathPattern.test"));
        assert!(ADMIN_INITIALIZATION_SCRIPT.contains("toggleCommentsButton"));
        assert!(OVERLAY_INITIALIZATION_SCRIPT.contains("viewerPathPattern.test"));
    }
}
