import * as pdfjsLib from './pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.mjs';

const sessionId = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const viewerLogin = document.getElementById('viewerLogin');
const viewerLoginId = document.getElementById('viewerLoginId');
const viewerPassword = document.getElementById('viewerPassword');
const viewerOrganizationGroup = document.getElementById('viewerOrganizationGroup');
const viewerOrganization = document.getElementById('viewerOrganization');
const viewerLoginButton = document.getElementById('viewerLoginButton');
const viewerLoginStatus = document.getElementById('viewerLoginStatus');
const viewerLogoutButton = document.getElementById('viewerLogoutButton');
const titleEl = document.getElementById('viewerTitle');
const stateEl = document.getElementById('connectionState');
const topBar = document.getElementById('topBar');
const pdfStage = document.getElementById('pdfStage');
const pdfPageContainer = document.getElementById('pdfPageContainer');
const pdfCanvas = document.getElementById('pdfCanvas');
const pdfAnnotationLayer = document.getElementById('pdfAnnotationLayer');
const pdfPageControls = document.getElementById('pdfPageControls');
const previousPageButton = document.getElementById('previousPageButton');
const nextPageButton = document.getElementById('nextPageButton');
const pdfPageState = document.getElementById('pdfPageState');
const downloadLogButton = document.getElementById('downloadLogButton');
const clearLogButton = document.getElementById('clearLogButton');
const localLogState = document.getElementById('localLogState');
const emptyDocument = document.getElementById('emptyDocument');
const localPdfInput = document.getElementById('localPdfInput');
const localPdfInfo = document.getElementById('localPdfInfo');
const commentPanel = document.getElementById('commentPanel');
const commentList = document.getElementById('commentList');
const scrollCommentLayer = document.getElementById('scrollCommentLayer');
const qrOverlay = document.getElementById('qrOverlay');
const qrButton = document.getElementById('qrButton');
const qrCornerButton = document.getElementById('qrCornerButton');
const qrCorner = document.getElementById('qrCorner');
const qrImage = document.getElementById('qrImage');
const qrCornerImage = document.getElementById('qrCornerImage');
const joinUrlText = document.getElementById('joinUrlText');

let queue = [];
let commentsVisible = true;
let qrVisible = false;
let qrCornerVisible = localStorage.getItem('CPCV_QR_CORNER') === '1';
let pdfDocument = null;
let pdfPageNumber = 1;
let pdfRenderTask = null;
let pdfRenderRequest = 0;
let pdfLoadRequest = 0;
let pdfLoadAbortController = null;
let pdfNavigationPromise = Promise.resolve();
let pdfBindingId = "";
let pdfClientVersion = 0;
let pendingPdfPageSync = null;
let pdfPageSyncRunning = false;
let pdfPageRetryTimer = 0;
let socket = null;
let reconnectTimer = 0;
let reconnectAttempt = 0;
let realtimeStopped = false;
const realtimeSequenceKey = `CPCV_REALTIME_SEQUENCE:${sessionId}`;
let lastAppliedSequence = loadLastSequence();
let csrfToken = '';
let authenticated = false;
const MAX_QUEUE = 50;
const INTERVAL_MS = 2_000;
let displayMs = 60_000;
let displayMode = 'stack3';
const SCROLL_LANE_COUNT = 14;
const scrollLaneBusyUntil = Array(SCROLL_LANE_COUNT).fill(0);
const LOG_DB_NAME = 'CPCV_LOCAL_LOGS';
const LOG_DB_VERSION = 1;
const LOG_STORE_NAME = 'comments';
const LOG_CHANNEL_NAME = 'CPCV_LOCAL_LOG_UPDATES';
const MAX_LOCAL_LOG_ENTRIES = 10_000;
let logDatabasePromise = null;
let localLogCount = 0;
let commentRetentionDays = 30;
const localLogChannel = 'BroadcastChannel' in window ? new BroadcastChannel(LOG_CHANNEL_NAME) : null;

function show(el, visible) {
  el.classList.toggle('hidden', !visible);
}

function setConnection(text) { stateEl.textContent = text; }

function setLoginStatus(text, error = false) {
  viewerLoginStatus.textContent = text;
  viewerLoginStatus.style.color = error ? '#fecaca' : '#bfdbfe';
}

function showLogin(message = '', error = false) {
  if (socket) socket.close();
  show(viewerLogin, true);
  show(topBar, false);
  show(emptyDocument, false);
  show(commentPanel, false);
  show(qrCorner, false);
  show(pdfStage, false);
  show(pdfPageControls, false);
  setLoginStatus(message, error);
  viewerLoginId.focus();
}

function showViewerShell() {
  show(viewerLogin, false);
  show(topBar, true);
  show(commentPanel, commentsVisible);
  show(qrCorner, qrCornerVisible);
  if (!pdfDocument) show(emptyDocument, true);
}

async function api(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('x-csrf-token', csrfToken);
  const response = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
    method,
    headers
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || 'API_ERROR');
    error.status = response.status;
    error.code = data.error || 'API_ERROR';
    error.data = data;
    throw error;
  }
  return data;
}

async function verifySession() {
  const data = await api('/api/auth/session');
  csrfToken = data.csrfToken || '';
  authenticated = true;
  return data;
}

function handleAuthError(error) {
  if (error.status === 401) {
    csrfToken = '';
    authenticated = false;
    stopRealtime('認証切れ');
    showLogin('ログインが必要です。', true);
    return true;
  }
  return false;
}

async function loadSession() {
  const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}`);
  const session = data.session;
  titleEl.textContent = session.title;
  commentsVisible = session.commentsVisible;
  displayMs = normalizeDisplayMs(session.commentDisplaySeconds);
  applyDisplayMode(session.commentDisplayMode);
  commentRetentionDays = normalizeRetentionDays(session.commentRetentionDays);
  commentPanel.classList.toggle('hidden', !commentsVisible);
  setJoinQr(session.joinUrl || `${location.origin}/j/${session.publicCode}`);
  showViewerShell();
  await pruneLocalLogs();
  await refreshLocalLogCount();
}

async function showLocalPdf(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    localPdfInfo.textContent = 'PDFファイルを選択してください。';
    return;
  }
  const loadRequest = ++pdfLoadRequest;
  if (pdfLoadAbortController) pdfLoadAbortController.abort();
  pdfLoadAbortController = new AbortController();
  const abortSignal = pdfLoadAbortController.signal;
  localPdfInfo.textContent = 'PDFを検証してページ連動を準備しています。';
  let loadedDocument = null;
  let committed = false;
  try {
    const buffer = await file.arrayBuffer();
    if (loadRequest !== pdfLoadRequest) return;
    const sha256Hex = await sha256HexFromBuffer(buffer);
    if (loadRequest !== pdfLoadRequest) return;
    loadedDocument = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    if (loadRequest !== pdfLoadRequest) {
      await loadedDocument.destroy();
      return;
    }

    const bound = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/pdf/bind`, {
      method: 'POST',
      signal: abortSignal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sha256Hex,
        pdfjsFingerprint: loadedDocument.fingerprints?.[0] || null,
        pageCount: loadedDocument.numPages,
        fileSizeBytes: file.size
      })
    });
    if (loadRequest !== pdfLoadRequest) {
      await loadedDocument.destroy();
      return;
    }

    const previousDocument = pdfDocument;
    clearTimeout(pdfPageRetryTimer);
    pdfPageRetryTimer = 0;
    pendingPdfPageSync = null;
    pdfDocument = loadedDocument;
    loadedDocument = null;
    committed = true;
    const serverState = bound.state || {};
    pdfBindingId = serverState.bindingId || '';
    pdfClientVersion = Number(serverState.clientVersion || 1);
    const serverPage = Number(serverState.currentPage || 1);
    pdfPageNumber = serverPage >= 1 && serverPage <= pdfDocument.numPages ? serverPage : 1;
    show(pdfStage, true);
    show(pdfPageControls, true);
    show(emptyDocument, false);
    await renderPdfPage();
    if (previousDocument && previousDocument !== pdfDocument) await previousDocument.destroy().catch(() => {});
    localPdfInfo.textContent = bound.previousSnapshot
      ? `${file.name} を表示中。前のPDF集計を確定記録へ保存しました。`
      : `${file.name} を表示中。ページ連動ON`;
  } catch (error) {
    if (loadedDocument) await loadedDocument.destroy().catch(() => {});
    if (loadRequest !== pdfLoadRequest || error?.name === 'AbortError') return;
    if (committed) {
      if (pdfDocument) await pdfDocument.destroy().catch(() => {});
      pdfDocument = null;
      pdfBindingId = '';
      pdfClientVersion = 0;
      show(pdfStage, false);
      show(pdfPageControls, false);
      show(emptyDocument, true);
      localPdfInfo.textContent = 'PDFのページ表示に失敗しました。別のPDFを選択してください。';
      return;
    }
    if (!handleAuthError(error)) {
      localPdfInfo.textContent = pdfDocument
        ? '新しいPDFを連動できませんでした。現在のPDFを維持しています。'
        : 'PDFを連動できませんでした。設定を確認してもう一度お試しください。';
    }
  }
}
async function renderPdfPage() {
  if (!pdfDocument) return;
  const requestId = ++pdfRenderRequest;
  if (pdfRenderTask) {
    const previousTask = pdfRenderTask;
    try { previousTask.cancel(); } catch {}
    try {
      await previousTask.promise;
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') throw error;
    }
  }
  if (requestId !== pdfRenderRequest || !pdfDocument) return;
  const pageNumber = pdfPageNumber;
  const page = await pdfDocument.getPage(pageNumber);
  if (requestId !== pdfRenderRequest) return;
  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(320, pdfStage.clientWidth - 24);
  const availableHeight = Math.max(240, pdfStage.clientHeight - 24);
  const cssScale = Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height);
  const pixelRatio = Math.min(devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: cssScale * pixelRatio });
  pdfCanvas.width = Math.floor(viewport.width);
  pdfCanvas.height = Math.floor(viewport.height);
  pdfCanvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
  pdfCanvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
  const cssWidth = Math.floor(viewport.width / pixelRatio);
  const cssHeight = Math.floor(viewport.height / pixelRatio);
  pdfPageContainer.style.width = `${cssWidth}px`;
  pdfPageContainer.style.height = `${cssHeight}px`;
  pdfAnnotationLayer.style.width = `${cssWidth}px`;
  pdfAnnotationLayer.style.height = `${cssHeight}px`;
  pdfAnnotationLayer.textContent = '';
  const task = page.render({ canvasContext: pdfCanvas.getContext('2d'), viewport });
  pdfRenderTask = task;
  try {
    await task.promise;
  } catch (error) {
    if (error?.name !== 'RenderingCancelledException') throw error;
  } finally {
    if (pdfRenderTask === task) pdfRenderTask = null;
  }
  if (requestId !== pdfRenderRequest || !pdfDocument) return;
  const annotationViewport = page.getViewport({ scale: cssScale });
  await renderPdfLinks(page, annotationViewport, requestId);
  if (requestId !== pdfRenderRequest || !pdfDocument) return;
  pdfPageState.textContent = `${pageNumber} / ${pdfDocument.numPages}`;
  previousPageButton.disabled = pageNumber <= 1;
  nextPageButton.disabled = pageNumber >= pdfDocument.numPages;
}

async function renderPdfLinks(page, viewport, requestId) {
  const annotations = await page.getAnnotations({ intent: 'display' });
  if (requestId !== pdfRenderRequest) return;
  const fragment = document.createDocumentFragment();
  const linkGroups = new Map();
  for (const annotation of annotations) {
    if (annotation.subtype !== 'Link' || !Array.isArray(annotation.rect)) continue;
    const externalUrl = annotation.url || annotation.unsafeUrl || '';
    if (!externalUrl && !annotation.dest) continue;
    const hitAreas = getPdfLinkHitAreas(annotation, viewport);
    const targetKey = externalUrl
      ? `url:${externalUrl}`
      : `dest:${JSON.stringify(annotation.dest)}`;
    const group = linkGroups.get(targetKey) || {
      externalUrl,
      destination: annotation.dest,
      areas: []
    };
    group.areas.push(...hitAreas);
    linkGroups.set(targetKey, group);
  }
  for (const group of linkGroups.values()) {
    const mergedAreas = mergeSameLineLinkAreas(group.areas);
    for (const area of mergedAreas) {
      if (area.width < 1 || area.height < 1) continue;
      const link = document.createElement('a');
      link.className = 'pdf-annotation-link';
      link.style.left = `${area.left}px`;
      link.style.top = `${area.top}px`;
      link.style.width = `${area.width}px`;
      link.style.height = `${area.height}px`;
      link.setAttribute('aria-label', group.externalUrl ? `PDFリンク: ${group.externalUrl}` : 'PDF内ページリンク');
      if (group.externalUrl) {
        link.href = group.externalUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      } else {
        link.href = '#';
        link.addEventListener('click', (event) => {
          event.preventDefault();
          goToPdfDestination(group.destination).catch((error) => {
            console.error('PDF destination navigation failed', error);
          });
        });
      }
      fragment.appendChild(link);
    }
  }
  pdfAnnotationLayer.replaceChildren(fragment);
}

function getPdfLinkHitAreas(annotation, viewport) {
  const quadPoints = flattenQuadPoints(annotation.quadPoints);
  if (quadPoints.length >= 8 && quadPoints.length % 8 === 0) {
    const areas = [];
    for (let index = 0; index < quadPoints.length; index += 8) {
      const points = [];
      for (let point = 0; point < 8; point += 2) {
        points.push(viewport.convertToViewportPoint(
          quadPoints[index + point],
          quadPoints[index + point + 1]
        ));
      }
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      areas.push({
        left: Math.min(...xs),
        top: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
      });
    }
    return mergeSameLineLinkAreas(areas);
  }
  const rect = viewport.convertToViewportRectangle(annotation.rect);
  return [{
    left: Math.min(rect[0], rect[2]),
    top: Math.min(rect[1], rect[3]),
    width: Math.abs(rect[0] - rect[2]),
    height: Math.abs(rect[1] - rect[3])
  }];
}

function mergeSameLineLinkAreas(areas) {
  const sorted = areas
    .filter((area) => area.width >= 1 && area.height >= 1)
    .sort((left, right) => left.top - right.top || left.left - right.left);
  const merged = [];
  for (const area of sorted) {
    const previous = merged.at(-1);
    if (!previous || !areLinkAreasOnSameLine(previous, area)) {
      merged.push({ ...area });
      continue;
    }
    const rightEdge = Math.max(previous.left + previous.width, area.left + area.width);
    const bottomEdge = Math.max(previous.top + previous.height, area.top + area.height);
    previous.left = Math.min(previous.left, area.left);
    previous.top = Math.min(previous.top, area.top);
    previous.width = rightEdge - previous.left;
    previous.height = bottomEdge - previous.top;
  }
  return merged;
}

function areLinkAreasOnSameLine(left, right) {
  const overlap = Math.min(left.top + left.height, right.top + right.height) - Math.max(left.top, right.top);
  const minimumHeight = Math.min(left.height, right.height);
  const centerDifference = Math.abs(
    (left.top + left.height / 2) - (right.top + right.height / 2)
  );
  return overlap >= minimumHeight * 0.45 || centerDifference <= minimumHeight * 0.45;
}

function flattenQuadPoints(value) {
  if (!value) return [];
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (!Array.isArray(value)) return [];
  return value.flatMap((part) => ArrayBuffer.isView(part) || Array.isArray(part) ? Array.from(part) : [part]);
}

async function goToPdfDestination(destination) {
  if (!pdfDocument || !destination) return;
  const resolved = typeof destination === 'string'
    ? await pdfDocument.getDestination(destination)
    : destination;
  if (!Array.isArray(resolved) || !resolved[0]) return;
  const target = resolved[0];
  const pageIndex = typeof target === 'object'
    ? await pdfDocument.getPageIndex(target)
    : Number(target);
  if (!Number.isInteger(pageIndex)) return;
  setPdfPage(pageIndex + 1);
}

function setPdfPage(pageNumber) {
  if (!pdfDocument) return;
  const nextPage = Math.min(pdfDocument.numPages, Math.max(1, pageNumber));
  if (nextPage === pdfPageNumber) return;
  pdfPageNumber = nextPage;
  pdfPageState.textContent = `${pdfPageNumber} / ${pdfDocument.numPages}`;
  previousPageButton.disabled = pdfPageNumber <= 1;
  nextPageButton.disabled = pdfPageNumber >= pdfDocument.numPages;
  schedulePdfPageSync(pdfPageNumber);
  pdfNavigationPromise = pdfNavigationPromise
    .catch(() => {})
    .then(() => renderPdfPage())
    .catch((error) => {
      console.error('PDF page render failed', error);
      localPdfInfo.textContent = 'ページを表示できませんでした。もう一度お試しください。';
    });
}

function schedulePdfPageSync(pageNumber) {
  if (!pdfBindingId || !authenticated) return;
  pdfClientVersion += 1;
  pendingPdfPageSync = { bindingId: pdfBindingId, pageNumber, clientVersion: pdfClientVersion };
  void flushPdfPageSync();
}

async function flushPdfPageSync() {
  if (pdfPageSyncRunning || !pendingPdfPageSync || !authenticated) return;
  pdfPageSyncRunning = true;
  clearTimeout(pdfPageRetryTimer);
  pdfPageRetryTimer = 0;
  try {
    while (pendingPdfPageSync && authenticated) {
      const payload = pendingPdfPageSync;
      pendingPdfPageSync = null;
      try {
        const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/pdf/page`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const state = data.state || {};
        if (state.bindingId && state.bindingId !== pdfBindingId) {
          pdfBindingId = '';
          localPdfInfo.textContent = '別の投影画面でPDFが変更されました。ページ連動を停止しました。';
          pendingPdfPageSync = null;
          break;
        }
        if (Number(state.clientVersion) > pdfClientVersion) pdfClientVersion = Number(state.clientVersion);
      } catch (error) {
        if (handleAuthError(error)) break;
        if (error.code === 'PDF_BINDING_STALE' || error.code === 'PDF_NOT_BOUND') {
          pdfBindingId = '';
          pendingPdfPageSync = null;
          localPdfInfo.textContent = 'PDFページ連動が別の投影画面へ移りました。';
          break;
        }
        pendingPdfPageSync = pendingPdfPageSync || payload;
        pdfPageRetryTimer = window.setTimeout(() => void flushPdfPageSync(), 1500);
        break;
      }
    }
  } finally {
    pdfPageSyncRunning = false;
  }
}

async function sha256HexFromBuffer(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function changePdfPage(offset) {
  if (!pdfDocument) return;
  setPdfPage(pdfPageNumber + offset);
}

async function connectWebSocket() {
  if (!authenticated || realtimeStopped) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  setConnection(reconnectAttempt ? '再接続中' : '接続中');
  let ticket;
  try {
    ticket = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/live-ticket`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastSequence: lastAppliedSequence })
    });
  } catch (error) {
    if (handleAuthError(error) || error.code === 'SESSION_EXPIRED' || error.code === 'SESSION_NOT_FOUND') {
      stopRealtime('授業は終了しました');
      return;
    }
    scheduleReconnect();
    return;
  }

  const wsUrl = new URL(`/api/private/sessions/${encodeURIComponent(sessionId)}/live`, location.href);
  wsUrl.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.searchParams.set('ticket', ticket.ticket);
  const currentSocket = new WebSocket(wsUrl);
  socket = currentSocket;
  currentSocket.addEventListener('open', () => {
    if (socket !== currentSocket) return currentSocket.close();
    reconnectAttempt = 0;
    setConnection('コメント接続済み');
  });
  currentSocket.addEventListener('close', (event) => {
    if (socket === currentSocket) socket = null;
    if (!authenticated || realtimeStopped) return;
    if (event.code === 1000 || event.code === 4001) {
      stopRealtime('授業は終了しました');
      return;
    }
    scheduleReconnect();
  });
  currentSocket.addEventListener('error', () => {
    if (socket === currentSocket) setConnection('接続エラー');
  });
  currentSocket.addEventListener('message', (event) => {
    if (socket !== currentSocket) return;
    let payload;
    try { payload = JSON.parse(event.data); } catch { return; }
    handleRealtimeMessage(payload, currentSocket).catch((error) => {
      console.error('Realtime message failed', error);
      try { currentSocket.close(4002, 'sync failed'); } catch {}
    });
  });
}

async function handleRealtimeMessage(payload, currentSocket) {
  if (payload.type === 'room:sync') {
    await applyRoomSync(payload);
    acknowledgeSequence(currentSocket, lastAppliedSequence);
    return;
  }
  if (payload.type !== 'realtime:event') return;
  const sequence = Number(payload.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return;
  if (sequence <= lastAppliedSequence) {
    acknowledgeSequence(currentSocket, lastAppliedSequence);
    return;
  }
  if (sequence !== lastAppliedSequence + 1) {
    currentSocket.close(4002, 'sequence gap');
    return;
  }
  await applyRealtimeEvent(payload.event);
  commitSequence(sequence);
  acknowledgeSequence(currentSocket, sequence);
}

async function applyRoomSync(payload) {
  const room = payload.room || {};
  applyRoomState(room);
  if (payload.resetRequired) {
    clearComments();
    await replaceSessionLog(Array.isArray(payload.snapshot) ? payload.snapshot : []);
    for (const comment of payload.snapshot || []) enqueueComment(comment);
    commitSequence(Number(payload.currentSequence) || 0);
    return;
  }
  for (const envelope of payload.events || []) {
    const sequence = Number(envelope.sequence);
    if (!Number.isSafeInteger(sequence) || sequence <= lastAppliedSequence) continue;
    if (sequence !== lastAppliedSequence + 1) throw new Error('REALTIME_SEQUENCE_GAP');
    await applyRealtimeEvent(envelope.event);
    commitSequence(sequence);
  }
  if (Number(payload.currentSequence) > lastAppliedSequence) throw new Error('REALTIME_SYNC_INCOMPLETE');
}

async function applyRealtimeEvent(event) {
  if (!event || typeof event.type !== 'string') return;
  if (event.type === 'message:new' || event.type === 'message:restore') {
    await saveLocalLog(event).catch((error) => {
      console.error('Local log save failed', error);
      setLocalLogState('ログ保存エラー', true);
    });
    removeDisplayedComment(event.id);
    enqueueComment(event);
    return;
  }
  if (event.type === 'translation:ready') {
    await applyTranslation(event);
    return;
  }
  if (event.type === 'message:remove') {
    await removeModeratedComment(event.commentId).catch((error) => {
      console.error('Moderation removal failed', error);
      setLocalLogState('モデレーション反映エラー', true);
    });
    return;
  }
  if (event.type === 'message:clear') {
    clearComments();
    return;
  }
  if (event.type === 'settings:update') {
    if (event.translation || event.commentId || event.payload?.translation) {
      await applyTranslation(event);
      return;
    }
    applyRoomState(event);
    return;
  }
  if (event.type === 'room:closed') stopRealtime('授業は終了しました');
}

function applyRoomState(room) {
  if (typeof room.commentsVisible === 'boolean') commentsVisible = room.commentsVisible;
  if (room.commentDisplaySeconds != null) displayMs = normalizeDisplayMs(room.commentDisplaySeconds);
  if (room.commentDisplayMode) applyDisplayMode(room.commentDisplayMode);
  commentPanel.classList.toggle('hidden', !commentsVisible);
  if (room.status && room.status !== 'active') stopRealtime('授業は終了しました');
}

function scheduleReconnect() {
  if (!authenticated || realtimeStopped || reconnectTimer) return;
  reconnectAttempt += 1;
  const ceiling = Math.min(30_000, 500 * (2 ** Math.min(reconnectAttempt, 6)));
  const delay = Math.round(ceiling / 2 + Math.random() * ceiling / 2);
  setConnection(`再接続中 (${Math.ceil(delay / 1000)}秒)`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = 0;
    connectWebSocket();
  }, delay);
}

function stopRealtime(message) {
  realtimeStopped = true;
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  if (socket) {
    const current = socket;
    socket = null;
    try { current.close(1000, 'stopped'); } catch {}
  }
  setConnection(message);
}

function acknowledgeSequence(currentSocket, sequence) {
  if (!currentSocket || currentSocket.readyState !== WebSocket.OPEN) return;
  try { currentSocket.send(JSON.stringify({ type: 'ack', sequence })); } catch {}
}

function commitSequence(sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 0) return;
  lastAppliedSequence = sequence;
  localStorage.setItem(realtimeSequenceKey, String(sequence));
}

function loadLastSequence() {
  const value = Number(localStorage.getItem(`CPCV_REALTIME_SEQUENCE:${sessionId}`) || 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

async function replaceSessionLog(comments) {
  const database = await openLogDatabase();
  const existing = await getSessionLogs();
  await runLogTransaction(database, 'readwrite', (store) => {
    for (const entry of existing) store.delete(entry.id);
    for (const comment of comments) {
      if (!comment?.id || !comment?.message) continue;
      store.put({
        ...comment,
        sessionId,
        receivedAt: new Date().toISOString()
      });
    }
  });
  await refreshLocalLogCount();
}

function enqueueComment(payload) {
  if (!commentsVisible) return;
  queue.push(payload);
  if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
}

function openLogDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('INDEXED_DB_UNAVAILABLE'));
  if (logDatabasePromise) return logDatabasePromise;
  logDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(LOG_DB_NAME, LOG_DB_VERSION);
    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOG_STORE_NAME)) {
        const store = database.createObjectStore(LOG_STORE_NAME, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error || new Error('INDEXED_DB_OPEN_FAILED')));
  });
  return logDatabasePromise;
}

async function saveLocalLog(payload) {
  if (!payload?.id || !payload?.message) return;
  const database = await openLogDatabase();
  const entry = {
    id: payload.id,
    sessionId,
    classTitle: titleEl.textContent || '',
    createdAt: payload.createdAt || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    retainedUntil: payload.retainedUntil || new Date(Date.now() + commentRetentionDays * 86_400_000).toISOString(),
    nickname: String(payload.nickname || ''),
    message: String(payload.message || ''),
    moderationState: String(payload.moderationState || 'visible'),
    translation: payload.translation?.text ? {
      targetLanguage: String(payload.translation.targetLanguage || ''),
      text: String(payload.translation.text),
      label: 'AI翻訳'
    } : null
  };
  await runLogTransaction(database, 'readwrite', (store) => store.put(entry));
  await pruneLocalLogs();
  await refreshLocalLogCount();
  localLogChannel?.postMessage({ type: 'log:saved', sessionId, id: entry.id });
}

async function applyTranslation(payload) {
  const commentId = String(payload?.commentId || payload?.id || payload?.sourceCommentId || '');
  const rawTranslation = payload?.translation ?? payload?.payload?.translation ?? payload?.translatedText ?? null;
  const translation = typeof rawTranslation === 'string' ? {
    targetLanguage: String(payload?.targetLanguage || ''),
    text: rawTranslation,
    label: 'AI翻訳'
  } : rawTranslation;
  if (!commentId || !translation?.text) return;
  queue = queue.map((item) => item?.id === commentId ? { ...item, translation } : item);
  for (const element of document.querySelectorAll(`[data-comment-id="${CSS.escape(commentId)}"]`)) {
    if (element.classList.contains('scroll-comment')) continue;
    let node = element.querySelector('.comment-translation');
    if (!node) {
      node = document.createElement('span');
      node.className = 'comment-translation';
      element.appendChild(node);
    }
    node.textContent = `AI翻訳: ${translation.text}`;
  }
  try {
    const database = await openLogDatabase();
    await runLogTransaction(database, 'readwrite', (store) => {
      const request = store.get(commentId);
      request.addEventListener('success', () => {
        if (request.result) store.put({ ...request.result, translation });
      });
    });
    localLogChannel?.postMessage({ type: 'log:updated', sessionId, id: commentId });
  } catch (error) {
    console.error('Translation log update failed', error);
  }
}

async function removeModeratedComment(commentId) {
  const id = String(commentId || '');
  if (!id) return;
  queue = queue.filter((item) => item?.id !== id);
  removeDisplayedComment(id);
  const database = await openLogDatabase();
  await runLogTransaction(database, 'readwrite', (store) => store.delete(id));
  await refreshLocalLogCount();
  localLogChannel?.postMessage({ type: 'log:removed', sessionId, id });
}

function removeDisplayedComment(commentId) {
  const id = String(commentId || '');
  if (!id) return;
  for (const element of document.querySelectorAll('[data-comment-id]')) {
    if (element.dataset.commentId === id) element.remove();
  }
}

async function getSessionLogs() {
  const database = await openLogDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LOG_STORE_NAME, 'readonly');
    const index = transaction.objectStore(LOG_STORE_NAME).index('sessionId');
    const request = index.getAll(IDBKeyRange.only(sessionId));
    request.addEventListener('success', () => {
      resolve((request.result || []).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))));
    });
    request.addEventListener('error', () => reject(request.error || new Error('LOG_READ_FAILED')));
  });
}

async function refreshLocalLogCount() {
  try {
    const logs = await getSessionLogs();
    localLogCount = logs.length;
    setLocalLogState(`端末保存 ${localLogCount}件`);
  } catch (error) {
    console.error('Local log count failed', error);
    setLocalLogState('ログ利用不可', true);
  }
}

async function pruneLocalLogs() {
  const database = await openLogDatabase();
  const entries = await readAllLocalLogs(database);
  const now = Date.now();
  const expired = entries.filter((entry) => {
    const retainedUntil = Date.parse(entry.retainedUntil || '');
    if (Number.isFinite(retainedUntil)) return retainedUntil <= now;
    const fallback = Date.parse(entry.receivedAt || entry.createdAt || '');
    return !Number.isFinite(fallback) || fallback + commentRetentionDays * 86_400_000 <= now;
  });
  const expiredIds = new Set(expired.map((entry) => entry.id));
  const survivors = entries
    .filter((entry) => !expiredIds.has(entry.id))
    .sort((a, b) => String(a.receivedAt || a.createdAt).localeCompare(String(b.receivedAt || b.createdAt)));
  const overflow = survivors.slice(0, Math.max(0, survivors.length - MAX_LOCAL_LOG_ENTRIES));
  const remove = [...expired, ...overflow];
  if (!remove.length) return;
  await runLogTransaction(database, 'readwrite', (store) => {
    for (const entry of remove) store.delete(entry.id);
  });
}

function readAllLocalLogs(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LOG_STORE_NAME, 'readonly');
    const request = transaction.objectStore(LOG_STORE_NAME).getAll();
    request.addEventListener('success', () => resolve(request.result || []));
    request.addEventListener('error', () => reject(request.error || new Error('LOG_READ_FAILED')));
  });
}

function normalizeRetentionDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : 30;
}

function setLocalLogState(text, error = false) {
  if (!localLogState) return;
  localLogState.textContent = text;
  localLogState.style.color = error ? '#fecaca' : '#bfdbfe';
}

function runLogTransaction(database, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LOG_STORE_NAME, mode);
    operation(transaction.objectStore(LOG_STORE_NAME));
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('error', () => reject(transaction.error || new Error('LOG_WRITE_FAILED')));
    transaction.addEventListener('abort', () => reject(transaction.error || new Error('LOG_WRITE_ABORTED')));
  });
}

async function downloadSessionLog() {
  const response = await fetch(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments/export`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin'
  });
  if (response.status === 401) {
    csrfToken = '';
    authenticated = false;
    showLogin('ログインが必要です。', true);
    throw new Error('AUTH_REQUIRED');
  }
  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch {}
    throw new Error(data.error || 'CSV_EXPORT_FAILED');
  }
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `comment-log-${sessionId}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  setLocalLogState(response.headers.get('x-cpcv-export-truncated') === 'true' ? 'CSV出力 上限到達' : 'CSV出力完了');
}

async function clearSessionLog() {
  if (!confirm(`この端末に保存された現在の授業ログ ${localLogCount}件を削除しますか？\n削除後は元に戻せません。`)) return;
  const database = await openLogDatabase();
  const logs = await getSessionLogs();
  await runLogTransaction(database, 'readwrite', (store) => {
    for (const entry of logs) store.delete(entry.id);
  });
  await refreshLocalLogCount();
  localLogChannel?.postMessage({ type: 'log:cleared', sessionId });
}

function showNextComment() {
  if (!commentsVisible || queue.length === 0) return;
  if (displayMode === 'scroll') {
    const lane = findAvailableScrollLane();
    if (lane < 0) return;
    showScrollingComment(queue.shift(), lane);
    return;
  }
  const payload = queue.shift();
  const card = document.createElement('div');
  card.className = 'comment-card';
  card.dataset.commentId = String(payload.id || '');
  if (payload.nickname) {
    const name = document.createElement('span');
    name.className = 'comment-name';
    name.textContent = `${payload.nickname}:`;
    card.appendChild(name);
  }
  const text = document.createElement('span');
  text.textContent = payload.message;
  card.appendChild(text);
  if (payload.translation?.text) {
    const translation = document.createElement('span');
    translation.className = 'comment-translation';
    translation.textContent = `AI翻訳: ${payload.translation.text}`;
    card.appendChild(translation);
  }
  commentList.appendChild(card);
  const maxVisible = Number(displayMode.slice(5)) || 3;
  while (commentList.children.length > maxVisible) commentList.firstElementChild.remove();
  setTimeout(() => card.remove(), displayMs);
}

function clearComments() {
  queue = [];
  commentList.textContent = '';
  scrollCommentLayer.textContent = '';
  scrollLaneBusyUntil.fill(0);
}

function applyDisplayMode(value) {
  displayMode = ['stack3', 'stack5', 'stack7', 'scroll'].includes(value) ? value : 'stack3';
  commentPanel.classList.toggle('scroll-mode', displayMode === 'scroll');
  commentPanel.classList.toggle('mode-stack3', displayMode === 'stack3');
  commentPanel.classList.toggle('mode-stack5', displayMode === 'stack5');
  commentPanel.classList.toggle('mode-stack7', displayMode === 'stack7');
  commentList.textContent = '';
  scrollCommentLayer.textContent = '';
  scrollLaneBusyUntil.fill(0);
}

function findAvailableScrollLane() {
  const now = Date.now();
  return scrollLaneBusyUntil.findIndex((busyUntil) => busyUntil <= now);
}

function showScrollingComment(payload, lane) {
  const comment = document.createElement('div');
  comment.className = 'scroll-comment';
  comment.dataset.commentId = String(payload.id || '');
  const original = payload.nickname ? `${payload.nickname}: ${payload.message}` : payload.message;
  comment.textContent = payload.translation?.text ? `${original} ｜ AI翻訳: ${payload.translation.text}` : original;
  const now = Date.now();
  const laneHeightPercent = 100 / SCROLL_LANE_COUNT;
  comment.style.top = `calc(${lane * laneHeightPercent}% + 4px)`;
  const durationMs = scrollDurationMs(displayMs);
  comment.style.animationDuration = `${durationMs}ms`;
  scrollLaneBusyUntil[lane] = now + durationMs;
  scrollCommentLayer.appendChild(comment);
  setTimeout(() => comment.remove(), durationMs + 250);
}

function scrollDurationMs(settingMs) {
  const seconds = Math.round(settingMs / 1000);
  return {
    10: 5_000,
    30: 11_000,
    60: 14_000,
    120: 18_000,
    300: 24_000
  }[seconds] || 14_000;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen().catch(() => {});
}

async function loginWithPassword() {
  const account = viewerLoginId.value.trim();
  const password = viewerPassword.value;
  if (!account || !password) return setLoginStatus('メールアドレスとパスワードを入力してください。', true);
  const original = viewerLoginButton.textContent;
  viewerLoginButton.disabled = true;
  viewerLoginButton.textContent = '処理中...';
  const body = account.includes('@') ? { email: account, password } : { loginId: account, password };
  if (!viewerOrganizationGroup.classList.contains('hidden') && viewerOrganization.value) {
    body.organizationId = viewerOrganization.value;
  }
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    csrfToken = data.csrfToken || '';
    authenticated = true;
    realtimeStopped = false;
    viewerPassword.value = '';
    show(viewerOrganizationGroup, false);
    setLoginStatus('');
    await loadSession();
    void connectWebSocket();
  } catch (error) {
    if (error.code === 'ORGANIZATION_SELECTION_REQUIRED') {
      viewerOrganization.textContent = '';
      for (const organization of error.data.organizations || []) {
        const option = document.createElement('option');
        option.value = organization.id;
        option.textContent = `${organization.name} (${organization.role})`;
        viewerOrganization.appendChild(option);
      }
      show(viewerOrganizationGroup, true);
      setLoginStatus('組織を選択してもう一度ログインしてください。');
    } else {
      setLoginStatus('ログインIDまたはパスワードを確認してください。', true);
    }
  } finally {
    viewerLoginButton.disabled = false;
    viewerLoginButton.textContent = original;
  }
}

viewerLoginButton.addEventListener('click', loginWithPassword);
viewerPassword.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loginWithPassword();
});
viewerLoginId.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') viewerPassword.focus();
});
viewerLogoutButton.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
  } catch {}
  csrfToken = '';
  authenticated = false;
  stopRealtime('切断');
  showLogin('ログアウトしました。');
});

if (qrButton && qrOverlay) {
  qrButton.addEventListener('click', () => {
    qrVisible = !qrVisible;
    qrOverlay.classList.toggle('hidden', !qrVisible);
  });
}

if (qrCornerButton && qrCorner) {
  qrCornerButton.addEventListener('click', () => {
    qrCornerVisible = !qrCornerVisible;
    localStorage.setItem('CPCV_QR_CORNER', qrCornerVisible ? '1' : '0');
    qrCorner.classList.toggle('hidden', !qrCornerVisible);
  });
}

if (qrCorner && qrOverlay) {
  qrCorner.addEventListener('click', () => {
    qrVisible = true;
    qrOverlay.classList.remove('hidden');
  });
}

if (qrOverlay) {
  qrOverlay.addEventListener('click', (event) => {
    if (event.target === qrOverlay) {
      qrVisible = false;
      qrOverlay.classList.add('hidden');
    }
  });
}

addEventListener('keydown', (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if (!isTyping && event.key === 'ArrowLeft') {
    event.preventDefault();
    changePdfPage(-1);
  }
  if (!isTyping && event.key === 'ArrowRight') {
    event.preventDefault();
    changePdfPage(1);
  }
  if (event.key.toLowerCase() === 'f') toggleFullscreen();
  if (event.key.toLowerCase() === 'c') {
    commentsVisible = !commentsVisible;
    commentPanel.classList.toggle('hidden', !commentsVisible);
  }
  if (event.key.toLowerCase() === 'q') {
    qrVisible = !qrVisible;
    qrOverlay.classList.toggle('hidden', !qrVisible);
  }
});

localPdfInput.addEventListener('change', () => showLocalPdf(localPdfInput.files?.[0]));
downloadLogButton?.addEventListener('click', () => {
  downloadSessionLog().catch((error) => {
    console.error('CSV download failed', error);
    setLocalLogState('CSV出力エラー', true);
  });
});
clearLogButton?.addEventListener('click', () => {
  clearSessionLog().catch((error) => {
    console.error('Local log clear failed', error);
    setLocalLogState('ログ削除エラー', true);
  });
});
previousPageButton.addEventListener('click', () => changePdfPage(-1));
nextPageButton.addEventListener('click', () => changePdfPage(1));
pdfCanvas.addEventListener('click', (event) => {
  if (!pdfDocument || event.button !== 0) return;
  changePdfPage(1);
});
let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderPdfPage(), 150);
});

async function boot() {
  try {
    await verifySession();
    await loadSession();
    void connectWebSocket();
  } catch (error) {
    if (handleAuthError(error)) return;
    titleEl.textContent = error.code === 'SESSION_NOT_FOUND' ? '授業が見つかりません' : 'viewerを開けません';
    setConnection(`${error.status || ''} ${error.code || error.message}`.trim());
    showViewerShell();
  }
}

function setJoinQr(joinUrl) {
  if (joinUrlText) joinUrlText.textContent = joinUrl;
  const qrSrc = `/api/public/qr?text=${encodeURIComponent(joinUrl)}`;
  if (qrImage) qrImage.src = qrSrc;
  if (qrCornerImage) qrCornerImage.src = qrSrc;
}

function normalizeDisplayMs(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return 60_000;
  return Math.min(300, Math.max(10, Math.round(value))) * 1000;
}

setInterval(showNextComment, INTERVAL_MS);
boot();
