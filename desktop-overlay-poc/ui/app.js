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

function normalizeSessionId(value) {
  const raw = value.trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts.at(-1) || '');
  } catch {}
  const parts = raw.split(/[/?#]/).filter(Boolean);
  return decodeURIComponent(parts.at(-1) || '');
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
    if (!sessionId) throw new Error('授業IDを入力してください。');
    sessionInput.value = sessionId;
    const monitorIndex = Number.parseInt(monitorSelect.value, 10);
    if (!Number.isInteger(monitorIndex)) throw new Error('投影先ディスプレイを選択してください。');
    const result = await requireInvoke()('open_overlay', {
      origin: environment.value,
      sessionId,
      monitorIndex
    });
    log(result);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await syncOverlayControls();
  }).catch((error) => log(error.message || String(error), true));
});

controls.closeOverlayButton.addEventListener('click', () => {
  withDisabled(controls.closeOverlayButton, async () => {
    const result = await requireInvoke()('close_overlay');
    log(result);
  }).catch((error) => log(error.message || String(error), true));
});

controls.reapplyTopmostButton.addEventListener('click', () => {
  withDisabled(controls.reapplyTopmostButton, async () => {
    const monitorIndex = Number.parseInt(monitorSelect.value, 10);
    const result = await requireInvoke()('reapply_overlay_window', { monitorIndex });
    log(result);
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

window.addEventListener('DOMContentLoaded', () => {
  if (typeof invoke !== 'function') {
    log('Tauri APIが見つかりません。npm run devで起動してください。', true);
    return;
  }
  refreshMonitors().catch((error) => log(error.message || String(error), true));
});
