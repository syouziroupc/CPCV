const invoke = window.__TAURI__?.core?.invoke;

const environment = document.getElementById('environment');
const sessionInput = document.getElementById('sessionInput');
const monitorSelect = document.getElementById('monitorSelect');
const statusLog = document.getElementById('statusLog');
const controls = {
  openAdminButton: document.getElementById('openAdminButton'),
  refreshMonitorsButton: document.getElementById('refreshMonitorsButton'),
  startOverlayButton: document.getElementById('startOverlayButton'),
  closeOverlayButton: document.getElementById('closeOverlayButton'),
  reapplyTopmostButton: document.getElementById('reapplyTopmostButton'),
  commentsVisible: document.getElementById('commentsVisible'),
  qrVisible: document.getElementById('qrVisible'),
  clickThrough: document.getElementById('clickThrough'),
  diagnosticsVisible: document.getElementById('diagnosticsVisible')
};

let overlaySyncGeneration = 0;

function log(message, error = false) {
  const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  statusLog.textContent = `[${time}] ${message}`;
  statusLog.dataset.error = error ? '1' : '0';
}

function requireInvoke() {
  if (typeof invoke !== 'function') {
    throw new Error('Tauri APIが見つかりません。ブラウザではなくTauriから起動してください。');
  }
  return invoke;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function validSessionCandidate(value) {
  const candidate = safeDecode(String(value || '').trim());
  return /^sess_[A-Za-z0-9_-]{5,123}$/.test(candidate) ? candidate : '';
}

function normalizeSessionId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const direct = validSessionCandidate(raw);
  if (direct) return direct;

  try {
    const url = new URL(raw);
    for (const key of ['sessionId', 'session_id', 'session']) {
      const fromQuery = validSessionCandidate(url.searchParams.get(key));
      if (fromQuery) return fromQuery;
    }
    const parts = url.pathname.split('/').filter(Boolean).reverse();
    for (const part of parts) {
      const fromPath = validSessionCandidate(part);
      if (fromPath) return fromPath;
    }
  } catch {}

  const embedded = raw.match(/sess_[A-Za-z0-9_-]{5,123}/);
  return embedded ? validSessionCandidate(embedded[0]) : '';
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withDisabled(button, operation) {
  button.disabled = true;
  try {
    return await operation();
  } finally {
    button.disabled = false;
  }
}

async function refreshMonitors() {
  await withDisabled(controls.refreshMonitorsButton, async () => {
    const monitors = await requireInvoke()('list_monitors');
    const previous = monitorSelect.value;
    monitorSelect.replaceChildren();
    for (const monitor of monitors) {
      const option = document.createElement('option');
      option.value = String(monitor.index);
      option.textContent = `${monitor.index + 1}: ${monitor.name || 'Display'} — ${monitor.width}×${monitor.height} @ (${monitor.x}, ${monitor.y})${monitor.primary ? ' [Primary]' : ''}`;
      monitorSelect.appendChild(option);
    }
    if (previous && [...monitorSelect.options].some((option) => option.value === previous)) {
      monitorSelect.value = previous;
    } else if (monitors.length > 1) {
      monitorSelect.value = String(monitors.find((monitor) => !monitor.primary)?.index ?? 0);
    }
    controls.startOverlayButton.disabled = monitors.length === 0;
    controls.reapplyTopmostButton.disabled = monitors.length === 0;
    if (monitors.length === 0) throw new Error('利用可能なディスプレイが見つかりません。');
    log(`${monitors.length}台のディスプレイを取得しました。`);
  });
}

controls.openAdminButton.addEventListener('click', () => {
  withDisabled(controls.openAdminButton, async () => {
    const result = await requireInvoke()('open_admin', { origin: environment.value });
    log(result);
  }).catch((error) => log(error.message || String(error), true));
});

controls.refreshMonitorsButton.addEventListener('click', () => {
  refreshMonitors().catch((error) => log(error.message || String(error), true));
});

controls.startOverlayButton.addEventListener('click', () => {
  withDisabled(controls.startOverlayButton, async () => {
    const sessionId = normalizeSessionId(sessionInput.value);
    if (!sessionId) throw new Error('授業IDまたは投影画面URLを正しく入力してください。');
    sessionInput.value = sessionId;
    const monitorIndex = Number.parseInt(monitorSelect.value, 10);
    if (!Number.isInteger(monitorIndex)) throw new Error('投影先ディスプレイを選択してください。');
    const result = await requireInvoke()('open_overlay', {
      origin: environment.value,
      sessionId,
      monitorIndex
    });
    log(result);
    scheduleOverlayControlSync();
  }).catch((error) => log(error.message || String(error), true));
});

controls.closeOverlayButton.addEventListener('click', () => {
  withDisabled(controls.closeOverlayButton, async () => {
    overlaySyncGeneration += 1;
    const result = await requireInvoke()('close_overlay');
    log(result);
  }).catch((error) => log(error.message || String(error), true));
});

controls.reapplyTopmostButton.addEventListener('click', () => {
  withDisabled(controls.reapplyTopmostButton, async () => {
    const monitorIndex = Number.parseInt(monitorSelect.value, 10);
    if (!Number.isInteger(monitorIndex)) throw new Error('投影先ディスプレイを選択してください。');
    const result = await requireInvoke()('reapply_overlay_window', { monitorIndex });
    log(result);
    scheduleOverlayControlSync();
  }).catch((error) => log(error.message || String(error), true));
});

controls.commentsVisible.addEventListener('change', () => {
  requireInvoke()('set_overlay_comments', { visible: controls.commentsVisible.checked })
    .then(log)
    .catch((error) => log(error.message || String(error), true));
});

controls.qrVisible.addEventListener('change', () => {
  requireInvoke()('set_overlay_qr', { visible: controls.qrVisible.checked })
    .then(log)
    .catch((error) => log(error.message || String(error), true));
});

controls.clickThrough.addEventListener('change', () => {
  requireInvoke()('set_overlay_click_through', { enabled: controls.clickThrough.checked })
    .then(log)
    .catch((error) => log(error.message || String(error), true));
});

controls.diagnosticsVisible.addEventListener('change', () => {
  requireInvoke()('set_overlay_diagnostics', { visible: controls.diagnosticsVisible.checked })
    .then(log)
    .catch((error) => log(error.message || String(error), true));
});

async function syncOverlayControls() {
  const api = requireInvoke();
  await api('set_overlay_comments', { visible: controls.commentsVisible.checked });
  await api('set_overlay_qr', { visible: controls.qrVisible.checked });
  await api('set_overlay_click_through', { enabled: controls.clickThrough.checked });
  await api('set_overlay_diagnostics', { visible: controls.diagnosticsVisible.checked });
}

function scheduleOverlayControlSync() {
  const generation = ++overlaySyncGeneration;
  const delays = [0, 400, 1_200, 2_500, 5_000, 8_000];
  for (const delay of delays) {
    void (async () => {
      await sleep(delay);
      if (generation !== overlaySyncGeneration) return;
      try {
        await syncOverlayControls();
      } catch (error) {
        if (generation === overlaySyncGeneration && delay === delays.at(-1)) {
          log(`オーバーレイ設定の同期に失敗しました: ${error.message || String(error)}`, true);
        }
      }
    })();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (typeof invoke !== 'function') {
    log('Tauri APIが見つかりません。npm run devで起動してください。', true);
    return;
  }
  refreshMonitors().catch((error) => log(error.message || String(error), true));
});