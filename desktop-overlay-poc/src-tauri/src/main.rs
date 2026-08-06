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

const ADMIN_INITIALIZATION_SCRIPT: &str = r#"
(() => {
  const allowedOrigins = new Set([
    'https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev',
    'https://class-pdf-comment-viewer-v01-staging.syouziroupc.workers.dev'
  ]);
  const adminPathPattern = /^\/admin(?:\/sess_[A-Za-z0-9_-]+)?\/?$/;

  if (window.top !== window) return;
  if (!allowedOrigins.has(window.location.origin)) return;
  if (!adminPathPattern.test(window.location.pathname)) return;
  if (window.__CPCV_DESKTOP_ADMIN__) return;

  const state = {
    overlayActive: false,
    commentsVisible: true,
    qrVisible: false,
    monitorLabel: '自動選択',
    environmentLabel: '',
    message: 'CPCVへ接続しています。',
    error: false
  };

  const sessionId = () => {
    const match = window.location.pathname.match(/^\/admin\/(sess_[A-Za-z0-9_-]+)\/?$/);
    return match ? match[1] : '';
  };

  const dispatch = (path, includeSession = false) => {
    const url = new URL(`https://desktop.cpcv.local/${path}`);
    if (includeSession) {
      const id = sessionId();
      if (!id) return;
      url.searchParams.set('session', id);
    }
    window.location.assign(url.href);
  };

  const ensureStyle = () => {
    if (document.getElementById('cpcvDesktopStyle')) return;
    const style = document.createElement('style');
    style.id = 'cpcvDesktopStyle';
    style.textContent = `
      #cpcvDesktopBar {
        position: fixed;
        z-index: 2147483646;
        right: 18px;
        bottom: 18px;
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: calc(100vw - 36px);
        padding: 10px 12px;
        border: 1px solid rgba(255,255,255,.38);
        background: rgba(15,18,22,.94);
        box-shadow: 0 12px 32px rgba(0,0,0,.34);
        color: #fff;
        font: 600 14px/1.25 "Segoe UI", "Yu Gothic UI", sans-serif;
      }
      #cpcvDesktopBar button {
        min-height: 38px;
        border: 1px solid rgba(255,255,255,.34);
        border-radius: 0;
        padding: 7px 11px;
        background: #242a31;
        color: #fff;
        font: inherit;
        cursor: pointer;
      }
      #cpcvDesktopBar button:hover:not(:disabled) { background: #343c46; }
      #cpcvDesktopBar button:disabled { opacity: .42; cursor: not-allowed; }
      #cpcvDesktopBar button[data-active="true"] {
        background: #fff;
        color: #111;
      }
      #cpcvDesktopStatus {
        min-width: 170px;
        max-width: 330px;
        font-weight: 500;
        white-space: normal;
      }
      #cpcvDesktopStatus[data-error="true"] { color: #ffb7b7; }
      #cpcvDesktopEnvironment {
        display: none;
        border: 1px solid #ffd37a;
        padding: 4px 7px;
        color: #ffd37a;
      }
      #cpcvDesktopEnvironment:not(:empty) { display: inline-block; }
      @media (max-width: 840px) {
        #cpcvDesktopBar {
          left: 10px;
          right: 10px;
          bottom: 10px;
          flex-wrap: wrap;
        }
        #cpcvDesktopStatus { flex: 1 1 100%; max-width: none; }
      }
    `;
    document.documentElement.appendChild(style);
  };

  const makeButton = (id, label, handler) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  };

  const ensureBar = () => {
    if (!document.body) return null;
    ensureStyle();
    let bar = document.getElementById('cpcvDesktopBar');
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = 'cpcvDesktopBar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'CPCVデスクトップ投影操作');

    const start = makeButton('cpcvDesktopStart', '投影開始', () => dispatch('overlay/start', true));
    const stop = makeButton('cpcvDesktopStop', '投影停止', () => dispatch('overlay/stop'));
    const comments = makeButton('cpcvDesktopComments', 'コメント', () => dispatch('comments/toggle'));
    const qr = makeButton('cpcvDesktopQr', 'QR', () => dispatch('qr/toggle'));
    const monitor = makeButton('cpcvDesktopMonitor', '投影先', () => dispatch('monitor/next'));
    const status = document.createElement('span');
    status.id = 'cpcvDesktopStatus';
    const environment = document.createElement('span');
    environment.id = 'cpcvDesktopEnvironment';

    bar.append(start, stop, comments, qr, monitor, status, environment);
    document.body.appendChild(bar);
    return bar;
  };

  const render = () => {
    const bar = ensureBar();
    if (!bar) return;
    const id = sessionId();
    const start = document.getElementById('cpcvDesktopStart');
    const stop = document.getElementById('cpcvDesktopStop');
    const comments = document.getElementById('cpcvDesktopComments');
    const qr = document.getElementById('cpcvDesktopQr');
    const monitor = document.getElementById('cpcvDesktopMonitor');
    const status = document.getElementById('cpcvDesktopStatus');
    const environment = document.getElementById('cpcvDesktopEnvironment');

    start.disabled = !id;
    start.textContent = state.overlayActive ? '投影を再開始' : '投影開始';
    stop.disabled = !state.overlayActive;
    comments.disabled = !state.overlayActive;
    qr.disabled = !state.overlayActive;
    comments.dataset.active = String(state.commentsVisible);
    qr.dataset.active = String(state.qrVisible);
    comments.textContent = state.commentsVisible ? 'コメント ON' : 'コメント OFF';
    qr.textContent = state.qrVisible ? 'QR ON' : 'QR OFF';
    monitor.textContent = `投影先: ${state.monitorLabel || '自動選択'}`;
    status.textContent = !id && !state.error
      ? '授業を作成または選択すると投影できます。'
      : state.message;
    status.dataset.error = String(Boolean(state.error));
    environment.textContent = state.environmentLabel || '';

    const existingViewerButton = document.getElementById('openViewerButton');
    if (existingViewerButton) {
      existingViewerButton.textContent = 'オーバーレイを開始';
      existingViewerButton.dataset.desktopOverlay = 'true';
    }
  };

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('#openViewerButton')
      : null;
    if (!button) return;
    const id = sessionId();
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dispatch('overlay/start', true);
  }, true);

  window.__CPCV_DESKTOP_ADMIN__ = {
    setState(next) {
      if (next && typeof next === 'object') Object.assign(state, next);
      render();
    },
    render
  };

  const start = () => {
    render();
    window.setInterval(render, 1000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
"#;

const OVERLAY_INITIALIZATION_SCRIPT: &str = r#"
(() => {
  const allowedOrigins = new Set([
    'https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev',
    'https://class-pdf-comment-viewer-v01-staging.syouziroupc.workers.dev'
  ]);
  const viewerPathPattern = /^\/viewer\/sess_[A-Za-z0-9_-]+\/?$/;

  if (window.top !== window) return;
  if (!allowedOrigins.has(window.location.origin)) return;
  if (!viewerPathPattern.test(window.location.pathname)) return;
  if (window.__CPCV_DESKTOP_OVERLAY__) return;

  const state = {
    commentsVisible: true,
    qrVisible: false,
    diagnosticsVisible: false
  };

  const hide = (element) => {
    if (!element) return;
    element.style.setProperty('display', 'none', 'important');
  };

  const transparent = (element) => {
    if (!element) return;
    element.style.setProperty('background', 'transparent', 'important');
    element.style.setProperty('background-color', 'transparent', 'important');
  };

  const clearLayoutOverrides = (element) => {
    if (!element) return;
    for (const property of ['inset', 'top', 'right', 'bottom', 'left', 'width', 'height', 'max-height']) {
      element.style.removeProperty(property);
    }
  };

  const ensureDiagnostic = () => {
    if (!document.body) return null;
    let badge = document.getElementById('cpcvDesktopOverlayDiagnostic');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'cpcvDesktopOverlayDiagnostic';
      Object.assign(badge.style, {
        position: 'fixed',
        zIndex: '2147483647',
        top: '12px',
        right: '12px',
        maxWidth: '420px',
        padding: '8px 11px',
        background: 'rgba(0, 0, 0, 0.82)',
        color: '#ffffff',
        border: '1px solid rgba(255, 255, 255, 0.7)',
        font: '600 13px/1.45 Segoe UI, Yu Gothic UI, sans-serif',
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap'
      });
      document.body.appendChild(badge);
    }
    return badge;
  };

  const apply = () => {
    transparent(document.documentElement);
    transparent(document.body);
    transparent(document.getElementById('viewerStage'));

    if (document.body) {
      document.body.style.setProperty('margin', '0', 'important');
      document.body.style.setProperty('overflow', 'hidden', 'important');
    }

    hide(document.getElementById('pdfStage'));
    hide(document.getElementById('emptyDocument'));
    hide(document.getElementById('topBar'));
    hide(document.getElementById('pdfPageControls'));
    hide(document.getElementById('qrCorner'));

    const commentPanel = document.getElementById('commentPanel');
    if (commentPanel) {
      commentPanel.style.setProperty('position', 'fixed', 'important');
      commentPanel.style.setProperty('pointer-events', 'none', 'important');
      transparent(commentPanel);

      if (commentPanel.classList.contains('scroll-mode')) {
        commentPanel.style.setProperty('inset', '0', 'important');
        commentPanel.style.setProperty('width', '100vw', 'important');
        commentPanel.style.setProperty('height', '100vh', 'important');
        commentPanel.style.setProperty('max-height', 'none', 'important');
      } else {
        clearLayoutOverrides(commentPanel);
      }

      commentPanel.classList.toggle('hidden', !state.commentsVisible);
    }

    const commentList = document.getElementById('commentList');
    const scrollLayer = document.getElementById('scrollCommentLayer');
    if (commentList) commentList.style.setProperty('pointer-events', 'none', 'important');
    if (scrollLayer) scrollLayer.style.setProperty('pointer-events', 'none', 'important');

    const qrOverlay = document.getElementById('qrOverlay');
    if (qrOverlay) {
      qrOverlay.classList.toggle('hidden', !state.qrVisible);
      qrOverlay.style.setProperty('pointer-events', 'none', 'important');
    }

    const login = document.getElementById('viewerLogin');
    const loginVisible = login && !login.classList.contains('hidden');
    hide(login);

    const diagnostic = ensureDiagnostic();
    if (diagnostic) {
      diagnostic.style.display = loginVisible || state.diagnosticsVisible ? 'block' : 'none';
      const connection = document.getElementById('connectionState')?.textContent?.trim() || '初期化中';
      diagnostic.textContent = loginVisible
        ? 'CPCV Overlay: 未認証\n管理画面でログインしてください。'
        : `CPCV Overlay: ${connection}`;
    }
  };

  window.__CPCV_DESKTOP_OVERLAY__ = {
    setCommentsVisible(value) {
      state.commentsVisible = Boolean(value);
      apply();
    },
    setQrVisible(value) {
      state.qrVisible = Boolean(value);
      apply();
    },
    setDiagnosticsVisible(value) {
      state.diagnosticsVisible = Boolean(value);
      apply();
    },
    apply
  };

  const start = () => {
    apply();
    window.setInterval(apply, 500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
"#;

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
        .eval(&format!(
            "window.__CPCV_DESKTOP_OVERLAY__?.setCommentsVisible({comments_visible});\
             window.__CPCV_DESKTOP_OVERLAY__?.setQrVisible({qr_visible});"
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
        .eval(&format!(
            "window.__CPCV_DESKTOP_ADMIN__?.setState({payload});"
        ))
        .map_err(|error| error.to_string())
}

async fn open_overlay(app: AppHandle, session_id: String) -> Result<(), String> {
    let session_id = normalize_session_id(&session_id)?;
    let (origin, preferred) = {
        let state = state_lock(&app)?;
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

fn toggle_comments(app: &AppHandle) -> Result<(), String> {
    let visible = {
        let mut state = state_lock(app)?;
        state.comments_visible = !state.comments_visible;
        state.comments_visible
    };
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        apply_overlay_state(app)?;
    }
    set_status(
        app,
        if visible {
            "コメント表示を有効にしました。"
        } else {
            "コメントを隠しました。"
        },
        false,
    );
    Ok(())
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

fn action_session(url: &tauri::Url) -> Option<String> {
    url.query_pairs()
        .find(|(key, _)| key == "session")
        .map(|(_, value)| value.into_owned())
}

async fn handle_admin_action(app: AppHandle, url: tauri::Url) -> Result<(), String> {
    match url.path().trim_matches('/') {
        "overlay/start" => {
            let session =
                action_session(&url).ok_or_else(|| "授業を選択してください。".to_string())?;
            open_overlay(app, session).await
        }
        "overlay/stop" => close_overlay(&app),
        "comments/toggle" => toggle_comments(&app),
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
    fn scripts_are_scoped_to_expected_pages() {
        assert!(ADMIN_INITIALIZATION_SCRIPT.contains("window.top !== window"));
        assert!(ADMIN_INITIALIZATION_SCRIPT.contains("adminPathPattern.test"));
        assert!(OVERLAY_INITIALIZATION_SCRIPT.contains("viewerPathPattern.test"));
    }
}
