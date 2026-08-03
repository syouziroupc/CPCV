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
const PREFERRED_ORIGIN_FILE: &str = "preferred-origin.txt";
const ADMIN_INITIALIZATION_SCRIPT: &str = include_str!("../scripts/admin.js");
const OVERLAY_INITIALIZATION_SCRIPT: &str = include_str!("../scripts/overlay.js");

#[derive(Debug, Clone)]
struct EnvironmentReport {
    authenticated: bool,
    sessions_loaded: bool,
    error: String,
}

#[derive(Debug)]
struct DesktopState {
    origin: &'static str,
    origin_locked: bool,
    production_report: Option<EnvironmentReport>,
    staging_report: Option<EnvironmentReport>,
    environment_scan_complete: bool,
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

fn requested_origin() -> Option<&'static str> {
    if std::env::args().any(|argument| argument == "--staging") {
        Some(STAGING_ORIGIN)
    } else if std::env::args().any(|argument| argument == "--production") {
        Some(PRODUCTION_ORIGIN)
    } else {
        None
    }
}

fn origin_key(origin: &str) -> Option<&'static str> {
    if origin == "production" || origin == PRODUCTION_ORIGIN {
        Some(PRODUCTION_ORIGIN)
    } else if origin == "staging" || origin == STAGING_ORIGIN {
        Some(STAGING_ORIGIN)
    } else {
        None
    }
}

fn alternate_origin(origin: &str) -> &'static str {
    if origin == STAGING_ORIGIN {
        PRODUCTION_ORIGIN
    } else {
        STAGING_ORIGIN
    }
}

fn state_lock(app: &AppHandle) -> Result<MutexGuard<'_, DesktopState>, String> {
    app.state::<Mutex<DesktopState>>()
        .inner()
        .lock()
        .map_err(|_| "デスクトップ状態の取得に失敗しました。".to_string())
}

fn app_data_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("アプリ保存先を取得できません: {error}"))
}

fn shared_webview_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app_data_path(app)?.join(SHARED_PROFILE_DIRECTORY);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("WebView2保存先を作成できません: {error}"))?;
    Ok(directory)
}

fn preferred_origin_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_path(app)?.join(PREFERRED_ORIGIN_FILE))
}

fn load_preferred_origin(app: &AppHandle) -> Option<&'static str> {
    let path = preferred_origin_path(app).ok()?;
    let value = fs::read_to_string(path).ok()?;
    origin_key(value.trim())
}

fn save_preferred_origin(app: &AppHandle, origin: &str) -> Result<(), String> {
    let path = preferred_origin_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("接続先保存先を作成できません: {error}"))?;
    }
    let key = if origin == STAGING_ORIGIN {
        "staging"
    } else {
        "production"
    };
    fs::write(path, key).map_err(|error| format!("接続先を保存できません: {error}"))
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

fn expected_cpcv_url(url: &tauri::Url) -> bool {
    expected_remote_url(url, PRODUCTION_ORIGIN) || expected_remote_url(url, STAGING_ORIGIN)
}

fn action_url(url: &tauri::Url) -> bool {
    url.scheme() == "https" && url.host_str() == Some(ACTION_HOST)
}

fn action_value(url: &tauri::Url, key: &str) -> Option<String> {
    url.query_pairs()
        .find(|(query_key, _)| query_key == key)
        .map(|(_, value)| value.into_owned())
}

fn action_session(url: &tauri::Url) -> Option<String> {
    action_value(url, "session")
}

fn action_usize(url: &tauri::Url, key: &str) -> Result<usize, String> {
    action_value(url, key)
        .ok_or_else(|| format!("{key}が指定されていません。"))?
        .parse::<usize>()
        .map_err(|_| format!("{key}の値が正しくありません。"))
}

fn action_optional_bool(url: &tauri::Url, key: &str) -> Result<Option<bool>, String> {
    let Some(value) = action_value(url, key) else {
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
        .map_err(|error| error.to_string())?
    window
        .set_size(Size::Physical(*monitor.size()))
        .map_err(|error| error.to_string())?;
    window
        .set_background_color(Some(Color(0, 0, 0, 0)))
        .map_err(|error| error.to_string())?
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    window
        .set_focusable(false)
        .map_err(|error| error.to_string())?;
    window
        .set_ignore_cursor_events(true)
        .map_err(|error| error.to_string()?;
    window.show().map_err(|error| error.to_string()?;
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
    let script = format!(
        "window.__CPCV_DESKTOP_OVERLAY__?.setCommentsVisible({comments_visible});",
    );
    script.push_str(&format!(
        "window.__CPCV_DESKTOP_OVERLAY__?.setQrVisible({qr_visible});",
    ));
    overlay_window(app)?
        .eval(script)
        .map_err(|error| error.to_string()
}

fn admin_ui_state(app: &AppHandle) -> Result<AdminUiState, String> {
    let (preferred, origin, origin_locked, scan_complete, overlay_active, comments_visible, qr_visible, message, error) = {
        let state = state_lock(app)?;
        (
            state.monitor_index,
            state.origin,
            state.origin_locked,
            state.environment_scan_complete,
            state.overlay_active,
            state.comments_visible,
            state.qr_visible,
            state.message.clone(),
            state.error,
        )
    };
    let monitor_label = monitor_index_and_label(app, preferred)
        .map((|_, label)| label)
        .unwrap_or_else(|| "未検出".to_string());

    let environment_label = if origin_locked {
        if origin == STAGING_ORIGIN {
            "試験環境。".to_string()
        } else {
            String::new()
        }
    } else if !scan_complete {
        "接続先確認中".to_string()
    } else {
        String::new()
    };

    Ok(AdminUiState {
        overlay_active,
        comments_visible,
        qr_visible,
        monitor_label,
        environment_label,
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

fn navigate_admin_to_origin(
    app: &AppHandle,
    origin: &'static str,
    message: impl Into<String>,
) -> Result<(), String> {
    let admin = app
        .get_webview_window(ADMIN_LABEL)
        .ok_or_else(|| "管理画面が見つかりません。".to_string())?;
    let target = format!("{origin}/admin");
    let target_json = serde_json::to_string(&target).map_err(|error| error.to_string())?;

    destroy_window_if_present(app, OVERLAY_LABEL)? {
        let mut state = state_lock(app)?;
        state.origin = origin;
        state.overlay_active = false;
        state.message = message.into();
        state.error = false;
    }
    admin
        .eval(format!("window.location.replace({target_json});"))
        .map_err(|error| error.to_string()?;
    sync_admin_ui(app)
}
