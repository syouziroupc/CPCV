(() => {
  const CPCV_WEB_VERSION = '0.8.10';
  const API_TIMEOUT_MS = 15_000;
  const AUTH_RETRY_DELAY_MS = 120;
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
    monitorIndex: null,
    monitorLabel: '自動選択',
    monitorOptions: [],
    environmentLabel: '',
    message: 'CPCVへ接続しています。',
    error: false
  };

  let reportedSessionId = '';
  let lastReportedCommentsVisible = null;
  let observedCommentsState = null;
  let commentsObserver = null;
  let environmentProbeRunning = false;
  let lastEnvironmentReport = '';

  const sessionId = () => {
    const match = window.location.pathname.match(/^\/admin\/(sess_[A-Za-z0-9_-]+)\/?$/);
    return match ? match[1] : '';
  };

  const dispatch = (path, includeSession = false, params = {}) => {
    const url = new URL(`https://desktop.cpcv.local/${path}`);
    if (includeSession) {
      const id = sessionId();
      if (!id) return;
      url.searchParams.set('session', id);
    }
    for (const [key, value] of Object.entries(params)) {
      if (value != null) url.searchParams.set(key, String(value));
    }
    window.location.assign(url.href);
  };

  const readServerCommentsVisible = () => {
    if (!sessionId()) return null;

    const stateText = document.getElementById('commentsState')?.textContent?.toUpperCase() || '';
    if (stateText.includes('OFF')) return false;
    if (stateText.includes('ON')) return true;

    const buttonText = document.getElementById('toggleCommentsButton')?.textContent || '';
    if (buttonText.includes('表示')) return false;
    if (buttonText.includes('隠')) return true;
    return null;
  };

  const reportServerCommentsVisible = (visible) => {
    const id = sessionId();
    if (!id) return;
    if (reportedSessionId !== id) {
      reportedSessionId = id;
      lastReportedCommentsVisible = null;
    }
    if (lastReportedCommentsVisible === visible) return;
    lastReportedCommentsVisible = visible;
    dispatch('comments/set', false, { visible: visible ? '1' : '0' });
  };

  const syncCommentsState = () => {
    const visible = readServerCommentsVisible();
    if (visible == null) return;
    state.commentsVisible = visible;
    reportServerCommentsVisible(visible);
    render();
  };

  const startOverlay = () => {
    const visible = readServerCommentsVisible();
    const params = visible == null ? {} : { comments: visible ? '1' : '0' };
    dispatch('overlay/start', true, params);
  };

  const toggleServerComments = () => {
    const button = document.getElementById('toggleCommentsButton');
    if (!sessionId() || !button) {
      state.message = '授業のコメント設定を取得できません。';
      state.error = true;
      render();
      return;
    }
    if (button.disabled) return;
    button.click();
    window.setTimeout(syncCommentsState, 80);
    window.setTimeout(syncCommentsState, 400);
    window.setTimeout(syncCommentsState, 1000);
  };

  const ensureCommentsObserver = () => {
    const target = document.getElementById('commentsState');
    if (target === observedCommentsState) return;
    commentsObserver?.disconnect();
    observedCommentsState = target || null;
    if (!target) return;
    commentsObserver = new MutationObserver(syncCommentsState);
    commentsObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });
  };

  const fetchJsonWithTimeout = async (path) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    let response;
    let text = '';
    try {
      response = await fetch(path, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal
      });
      text = await response.text();
    } catch (cause) {
      if (controller.signal.aborted) {
        const timeout = new Error('API_TIMEOUT');
        timeout.code = 'API_TIMEOUT';
        timeout.status = 0;
        throw timeout;
      }
      throw cause;
    } finally {
      window.clearTimeout(timer);
    }

    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      const invalid = new Error('API_RESPONSE_INVALID');
      invalid.code = 'API_RESPONSE_INVALID';
      invalid.status = response.status;
      throw invalid;
    }

    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || `HTTP_${response.status}`);
      error.code = data.error || `HTTP_${response.status}`;
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const verifyAuthSession = async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await fetchJsonWithTimeout('/api/auth/session');
      } catch (error) {
        lastError = error;
        if (error?.status === 401 || attempt === 1) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, AUTH_RETRY_DELAY_MS));
      }
    }
    throw lastError || new Error('AUTH_SESSION_UNAVAILABLE');
  };

  const probeErrorText = (error) => {
    if (error?.code === 'API_TIMEOUT') return '一覧APIの応答がタイムアウトしました。';
    if (error?.code === 'API_RESPONSE_INVALID') return '一覧APIの応答形式が正しくありません。';
    return String(error?.code || error?.message || error || '取得失敗').slice(0, 180);
  };

  const reportEnvironmentState = async () => {
    if (environmentProbeRunning) return;
    if (!/^\/admin\/?$/.test(window.location.pathname)) return;

    environmentProbeRunning = true;
    let authenticated = false;
    let sessionsLoaded = false;
    let activeCount = 0;
    let error = '';

    try {
      await verifyAuthSession();
      authenticated = true;
      const data = await fetchJsonWithTimeout('/api/private/sessions');
      if (!Array.isArray(data.sessions)) {
        const invalid = new Error('API_RESPONSE_INVALID');
        invalid.code = 'API_RESPONSE_INVALID';
        throw invalid;
      }
      sessionsLoaded = true;
      activeCount = data.sessions.length;
    } catch (cause) {
      if (cause?.status === 401) {
        authenticated = false;
        sessionsLoaded = false;
        activeCount = 0;
      } else {
        error = probeErrorText(cause);
      }
    } finally {
      environmentProbeRunning = false;
    }

    const environment = window.location.origin.includes('-staging.') ? 'staging' : 'production';
    const signature = [
      environment,
      authenticated ? '1' : '0',
      sessionsLoaded ? '1' : '0',
      String(activeCount),
      error
    ].join(':');
    if (signature === lastEnvironmentReport) return;
    lastEnvironmentReport = signature;

    dispatch('environment/report', false, {
      environment,
      authenticated: authenticated ? '1' : '0',
      sessionsLoaded: sessionsLoaded ? '1' : '0',
      activeCount,
      error
    });
  };

  const ensureStyle = () => {
    if (document.getElementById('cpcvDesktopStyle')) return;
    const style = document.createElement('style');
    style.id = 'cpcvDesktopStyle';
    style.textContent = `
      body[data-cpcv-desktop-admin="true"] {
        padding-bottom: 76px !important;
      }
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
        background: rgba(15,18,22,.96);
        box-shadow: 0 12px 32px rgba(0,0,0,.34);
        color: #fff;
        font: 600 14px/1.25 "Segoe UI", "Yu Gothic UI", sans-serif;
      }
      #cpcvDesktopBar button,
      #cpcvDesktopBar select {
        min-height: 38px;
        border: 1px solid rgba(255,255,255,.34);
        border-radius: 0;
        padding: 7px 11px;
        background: #242a31;
        color: #fff;
        font: inherit;
      }
      #cpcvDesktopBar button { cursor: pointer; }
      #cpcvDesktopBar select {
        min-width: 250px;
        max-width: 390px;
        cursor: pointer;
      }
      #cpcvDesktopBar button:hover:not(:disabled),
      #cpcvDesktopBar select:hover:not(:disabled) { background: #343c46; }
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
        body[data-cpcv-desktop-admin="true"] {
          padding-bottom: 148px !important;
        }
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
    document.body.dataset.cpcvDesktopAdmin = 'true';
    ensureStyle();
    let bar = document.getElementById('cpcvDesktopBar');
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = 'cpcvDesktopBar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', `CPCV ${CPCV_WEB_VERSION} デスクトップ投影操作`);

    const start = makeButton('cpcvDesktopStart', '投影開始', startOverlay);
    const stop = makeButton('cpcvDesktopStop', '投影停止', () => dispatch('overlay/stop'));
    const comments = makeButton('cpcvDesktopComments', 'コメント', toggleServerComments);
    const qr = makeButton('cpcvDesktopQr', 'QR', () => dispatch('qr/toggle'));
    const monitor = document.createElement('select');
    monitor.id = 'cpcvDesktopMonitor';
    monitor.setAttribute('aria-label', '投影先ディスプレイ');
    monitor.addEventListener('change', () => {
      const index = Number.parseInt(monitor.value, 10);
      if (Number.isInteger(index) && index >= 0) {
        dispatch('monitor/select', false, { index });
      }
    });
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
    comments.disabled = !state.overlayActive || !document.getElementById('toggleCommentsButton');
    qr.disabled = !state.overlayActive;
    comments.dataset.active = String(state.commentsVisible);
    qr.dataset.active = String(state.qrVisible);
    comments.textContent = state.commentsVisible ? 'コメント ON' : 'コメント OFF';
    qr.textContent = state.qrVisible ? 'QR ON' : 'QR OFF';
    const options = Array.isArray(state.monitorOptions) ? state.monitorOptions : [];
    const selectedIndex = Number.isInteger(state.monitorIndex) ? state.monitorIndex : -1;
    const currentSignature = options.join('\u0000');
    if (monitor.dataset.options !== currentSignature) {
      monitor.replaceChildren();
      if (!options.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '投影先：未検出';
        monitor.appendChild(option);
      } else {
        options.forEach((label, index) => {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent = `投影先：${label}`;
          monitor.appendChild(option);
        });
      }
      monitor.dataset.options = currentSignature;
    }
    monitor.disabled = options.length === 0;
    if (selectedIndex >= 0 && selectedIndex < options.length) {
      monitor.value = String(selectedIndex);
    }
    monitor.title = state.monitorLabel ? `現在の投影先：${state.monitorLabel}` : '投影先を選択';

    status.textContent = !id && !state.error
      ? state.message || '授業を作成または選択すると投影できます。'
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
    if (!sessionId()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startOverlay();
  }, true);

  window.__CPCV_DESKTOP_ADMIN__ = {
    webVersion: CPCV_WEB_VERSION,
    setState(next) {
      if (next && typeof next === 'object') {
        const serverCommentsVisible = readServerCommentsVisible();
        const { commentsVisible: _ignoredCommentsVisible, ...rest } = next;
        Object.assign(state, rest);
        state.commentsVisible = serverCommentsVisible ?? Boolean(next.commentsVisible);
      }
      render();
    },
    render,
    syncCommentsState,
    reportEnvironmentState
  };

  const start = () => {
    ensureCommentsObserver();
    syncCommentsState();
    render();
    void reportEnvironmentState();
    window.setInterval(() => {
      ensureCommentsObserver();
      syncCommentsState();
      render();
    }, 500);
    window.setInterval(() => {
      void reportEnvironmentState();
    }, 2000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
