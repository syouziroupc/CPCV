(() => {
  const CPCV_WEB_VERSION = '0.8.10';
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

  const ensureStyle = () => {
    if (document.getElementById('cpcvDesktopOverlayStyle')) return;
    const style = document.createElement('style');
    style.id = 'cpcvDesktopOverlayStyle';
    style.textContent = `
      html,
      body,
      #viewerStage {
        background: transparent !important;
        background-color: transparent !important;
      }
      body[data-cpcv-desktop-overlay="true"] {
        margin: 0 !important;
        overflow: hidden !important;
      }
      body[data-cpcv-desktop-overlay="true"] #pdfStage,
      body[data-cpcv-desktop-overlay="true"] #emptyDocument,
      body[data-cpcv-desktop-overlay="true"] #topBar,
      body[data-cpcv-desktop-overlay="true"] #pdfPageControls,
      body[data-cpcv-desktop-overlay="true"] #qrCorner,
      body[data-cpcv-desktop-overlay="true"] #viewerLogin {
        display: none !important;
      }
      body[data-cpcv-desktop-overlay="true"] #commentPanel {
        position: fixed !important;
        pointer-events: none !important;
        background: transparent !important;
        background-color: transparent !important;
      }
      body[data-cpcv-desktop-overlay="true"] #commentPanel.scroll-mode {
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-height: none !important;
      }
      body[data-cpcv-desktop-overlay="true"] #commentList,
      body[data-cpcv-desktop-overlay="true"] #scrollCommentLayer,
      body[data-cpcv-desktop-overlay="true"] #qrOverlay {
        pointer-events: none !important;
      }
      body[data-cpcv-desktop-overlay="true"] #qrOverlay {
        background: transparent !important;
        background-color: transparent !important;
      }
    `;
    document.documentElement.appendChild(style);
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
    ensureStyle();
    transparent(document.documentElement);
    transparent(document.body);
    transparent(document.getElementById('viewerStage'));

    if (document.body) {
      document.body.dataset.cpcvDesktopOverlay = 'true';
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

      if (state.commentsVisible != null) {
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
      transparent(qrOverlay);
    }

    const login = document.getElementById('viewerLogin');
    const loginVisible = Boolean(login && !login.classList.contains('hidden'));
    hide(login);

    const diagnostic = ensureDiagnostic();
    if (diagnostic) {
      diagnostic.style.display = loginVisible || state.diagnosticsVisible ? 'block' : 'none';
      const connection = document.getElementById('connectionState')?.textContent?.trim() || '初期化中';
      diagnostic.textContent = loginVisible
        ? `CPCV ${CPCV_WEB_VERSION} Overlay: 未認証\n管理画面でログインしてください。`
        : `CPCV ${CPCV_WEB_VERSION} Overlay: ${connection}`;
    }
  };

  window.__CPCV_DESKTOP_OVERLAY__ = {
    webVersion: CPCV_WEB_VERSION,
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
    ensureStyle();
    apply();
    window.setInterval(apply, 500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
