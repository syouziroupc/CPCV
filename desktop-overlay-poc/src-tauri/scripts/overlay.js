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
      document.body.dataset.cpcvDesktopOverlay = 'true';
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
