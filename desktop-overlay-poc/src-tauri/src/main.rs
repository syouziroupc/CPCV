use serde::Serialize;
use tauri::{
    webview::Color, AppHandle, Manager, Position, Size, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

const PRODUCTION_ORIGIN: &str = "https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev";
const STAGING_ORIGIN: &str =
    "https://class-pdf-comment-viewer-v01-staging.syouziroupc.workers.dev";
const OVERLAY_LABEL: &str = "overlay";
const ADMIN_LABEL: &str = "admin";

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
    commentsVisible: null,
    qrVisible: false,
    diagnosticsVisible: true
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
        background: 'rgba(0, 0, 0, 0.78)',
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
    hide(document.getElementById('viewerLogin'));
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

      if (state.commentsVisible !== null) {
        commentPanel.classList.toggle('hidden', !state.commentsVisible);
      }
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

    const diagnostic = ensureDiagnostic();
    if (diagnostic) {
      diagnostic.style.display = state.diagnosticsVisible ? 'block' : 'none';
      const login = document.getElementById('viewerLogin');
      const loginVisible = login && !login.classList.contains('hidden');
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorInfo {
    index: usize,
    name: Option<String>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
    primary: bool,
}

fn normalize_origin(origin: &str) -> Result<&'static str, String> {
    let normalized = origin.trim().trim_end_matches('/');
    match normalized {
        PRODUCTION_ORIGIN => Ok(PRODUCTION_ORIGIN),
        STAGING_ORIGIN => Ok(STAGING_ORIGIN),
        _ => Err("許可されていない接続先です。".to_string()),
    }
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

fn destroy_window_if_present(app: &AppHandle, label: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        window.destroy().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn monitor_at(app: &AppHandle, monitor_index: usize) -> Result<tauri::Monitor, String> {
    app.available_monitors()
        .map_err(|error| error.to_string())?
        .into_iter()
        .nth(monitor_index)
        .ok_or_else(|| "指定したディスプレイが見つかりません。再取得してください。".to_string())
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

fn eval_overlay(app: &AppHandle, expression: &str) -> Result<(), String> {
    overlay_window(app)?
        .eval(expression)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let primary = app
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .map(|monitor| (*monitor.position(), *monitor.size()));
    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;
    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| {
            let position = *monitor.position();
            let size = *monitor.size();
            MonitorInfo {
                index,
                name: monitor.name().map(ToOwned::to_owned),
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
                scale_factor: monitor.scale_factor(),
                primary: primary
                    .as_ref()
                    .is_some_and(|(primary_position, primary_size)| {
                        *primary_position == position && *primary_size == size
                    }),
            }
        })
        .collect())
}

#[tauri::command]
fn open_admin(app: AppHandle, origin: String) -> Result<String, String> {
    let origin = normalize_origin(&origin)?;
    destroy_window_if_present(&app, ADMIN_LABEL)?;
    let url = format!("{origin}/admin")
        .parse()
        .map_err(|error| format!("管理画面URLを作成できません: {error}"))?;
    let window = WebviewWindowBuilder::new(&app, ADMIN_LABEL, WebviewUrl::External(url))
        .title("CPCV 管理")
        .inner_size(1180.0, 820.0)
        .min_inner_size(760.0, 620.0)
        .resizable(true)
        .build()
        .map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok("管理画面を開きました。ログイン後に授業を作成してください。".to_string())
}

#[tauri::command]
fn open_overlay(
    app: AppHandle,
    origin: String,
    session_id: String,
    monitor_index: usize,
) -> Result<String, String> {
    let origin = normalize_origin(&origin)?;
    let session_id = normalize_session_id(&session_id)?;
    let monitor = monitor_at(&app, monitor_index)?;
    destroy_window_if_present(&app, OVERLAY_LABEL)?;
    let url = format!("{origin}/viewer/{session_id}")
        .parse()
        .map_err(|error| format!("投影URLを作成できません: {error}"))?;

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
        .initialization_script(OVERLAY_INITIALIZATION_SCRIPT)
        .build()
        .map_err(|error| error.to_string())?;

    place_overlay(&overlay, &monitor)?;
    Ok(format!(
        "ディスプレイ{}にオーバーレイを開始しました。",
        monitor_index + 1
    ))
}

#[tauri::command]
fn close_overlay(app: AppHandle) -> Result<String, String> {
    destroy_window_if_present(&app, OVERLAY_LABEL)?;
    Ok("オーバーレイを終了しました。".to_string())
}

#[tauri::command]
fn reapply_overlay_window(app: AppHandle, monitor_index: usize) -> Result<String, String> {
    let monitor = monitor_at(&app, monitor_index)?;
    let overlay = overlay_window(&app)?;
    place_overlay(&overlay, &monitor)?;
    Ok(format!(
        "ディスプレイ{}へ最前面設定を再適用しました。",
        monitor_index + 1
    ))
}

#[tauri::command]
fn set_overlay_click_through(app: AppHandle, enabled: bool) -> Result<String, String> {
    overlay_window(&app)?
        .set_ignore_cursor_events(enabled)
        .map_err(|error| error.to_string())?;
    Ok(if enabled {
        "カーソル入力を下のアプリへ通します。"
    } else {
        "カーソル入力の透過を停止しました。"
    }
    .to_string())
}

#[tauri::command]
fn set_overlay_comments(app: AppHandle, visible: bool) -> Result<String, String> {
    eval_overlay(
        &app,
        &format!("window.__CPCV_DESKTOP_OVERLAY__?.setCommentsVisible({visible});"),
    )?;
    Ok(if visible {
        "コメント表示を有効にしました。"
    } else {
        "コメントを隠しました。"
    }
    .to_string())
}

#[tauri::command]
fn set_overlay_qr(app: AppHandle, visible: bool) -> Result<String, String> {
    eval_overlay(
        &app,
        &format!("window.__CPCV_DESKTOP_OVERLAY__?.setQrVisible({visible});"),
    )?;
    Ok(if visible {
        "大型QRコードを表示しました。"
    } else {
        "大型QRコードを隠しました。"
    }
    .to_string())
}

#[tauri::command]
fn set_overlay_diagnostics(app: AppHandle, visible: bool) -> Result<String, String> {
    eval_overlay(
        &app,
        &format!("window.__CPCV_DESKTOP_OVERLAY__?.setDiagnosticsVisible({visible});"),
    )?;
    Ok(if visible {
        "接続診断を表示しました。"
    } else {
        "接続診断を隠しました。"
    }
    .to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_monitors,
            open_admin,
            open_overlay,
            close_overlay,
            reapply_overlay_window,
            set_overlay_click_through,
            set_overlay_comments,
            set_overlay_qr,
            set_overlay_diagnostics
        ])
        .run(tauri::generate_context!())
        .expect("failed to run CPCV Overlay PoC");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_known_origins() {
        assert_eq!(
            normalize_origin(PRODUCTION_ORIGIN).unwrap(),
            PRODUCTION_ORIGIN
        );
        assert_eq!(
            normalize_origin(&format!("{STAGING_ORIGIN}/")).unwrap(),
            STAGING_ORIGIN
        );
        assert!(normalize_origin("https://example.com").is_err());
        assert!(normalize_origin("javascript:alert(1)").is_err());
    }

    #[test]
    fn validates_session_ids() {
        assert!(normalize_session_id("sess_0123456789abcdef").is_ok());
        assert!(normalize_session_id("sess_with-dash_123").is_ok());
        assert!(normalize_session_id("wrong_0123456789").is_err());
        assert!(normalize_session_id("sess_bad/path").is_err());
    }

    #[test]
    fn overlay_script_is_scoped_to_expected_viewer_pages() {
        assert!(OVERLAY_INITIALIZATION_SCRIPT.contains("window.top !== window"));
        assert!(OVERLAY_INITIALIZATION_SCRIPT.contains("allowedOrigins.has"));
        assert!(OVERLAY_INITIALIZATION_SCRIPT.contains("viewerPathPattern.test"));
    }
}