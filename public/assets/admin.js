const pathParts = location.pathname.split('/').filter(Boolean);
const sessionId = pathParts[1] || '';

const loginSection = document.getElementById('loginSection');
const createSection = document.getElementById('createSection');
const activeSessionsSection = document.getElementById('activeSessionsSection');
const activeSessionList = document.getElementById('activeSessionList');
const sessionSection = document.getElementById('sessionSection');
const notFoundSection = document.getElementById('notFoundSection');
const teacherLoginId = document.getElementById('teacherLoginId');
const teacherPassword = document.getElementById('teacherPassword');
const teacherOrganizationGroup = document.getElementById('teacherOrganizationGroup');
const teacherOrganization = document.getElementById('teacherOrganization');
const organizationManageLink = document.getElementById('organizationManageLink');
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const loginStatus = document.getElementById('loginStatus');
const newTitle = document.getElementById('newTitle');
const createButton = document.getElementById('createButton');
const notFoundCreateButton = document.getElementById('notFoundCreateButton');
const sessionTitle = document.getElementById('sessionTitle');
const joinUrlEl = document.getElementById('joinUrl');
const publicCodeEl = document.getElementById('publicCode');
const viewerUrlEl = document.getElementById('viewerUrl');
const openViewerButton = document.getElementById('openViewerButton');
const copyJoinButton = document.getElementById('copyJoinButton');
const postingState = document.getElementById('postingState');
const commentsState = document.getElementById('commentsState');
const commentModeState = document.getElementById('commentModeState');
const moderationModeState = document.getElementById('moderationModeState');
const commentDisplayState = document.getElementById('commentDisplayState');
const sessionState = document.getElementById('sessionState');
const documentInfo = document.getElementById('documentInfo');
const togglePostingButton = document.getElementById('togglePostingButton');
const toggleCommentsButton = document.getElementById('toggleCommentsButton');
const commentDisplayMode = document.getElementById('commentDisplayMode');
const commentDisplaySeconds = document.getElementById('commentDisplaySeconds');
const commentDisplaySecondsLabel = document.getElementById('commentDisplaySecondsLabel');
const moderationMode = document.getElementById('moderationMode');
const clearCommentsButton = document.getElementById('clearCommentsButton');
const endSessionButton = document.getElementById('endSessionButton');
const deleteSessionButton = document.getElementById('deleteSessionButton');
const adminStatus = document.getElementById('adminStatus');
const refreshLocalLogButton = document.getElementById('refreshLocalLogButton');
const adminLocalLogState = document.getElementById('adminLocalLogState');
const adminLocalLogBody = document.getElementById('adminLocalLogBody');
const moderationStateFilter = document.getElementById('moderationStateFilter');
const refreshModerationButton = document.getElementById('refreshModerationButton');
const moderationStatus = document.getElementById('moderationStatus');
const moderationBody = document.getElementById('moderationBody');
const bulkApproveButton = document.getElementById('bulkApproveButton');
const bulkHideButton = document.getElementById('bulkHideButton');
const bulkRestoreButton = document.getElementById('bulkRestoreButton');
const bulkDeleteButton = document.getElementById('bulkDeleteButton');
const sessionAnalyticsSection = document.getElementById('sessionAnalyticsSection');
const analyticsStatus = document.getElementById('analyticsStatus');
const analyticsSummary = document.getElementById('analyticsSummary');
const analyticsBody = document.getElementById('analyticsBody');
const refreshAnalyticsButton = document.getElementById('refreshAnalyticsButton');
const createAnalyticsSnapshotButton = document.getElementById('createAnalyticsSnapshotButton');
const analyticsSnapshotSelect = document.getElementById('analyticsSnapshotSelect');
const downloadAnalyticsSnapshotButton = document.getElementById('downloadAnalyticsSnapshotButton');

const organizationAiSection = document.getElementById('organizationAiSection');
const organizationAiEnabled = document.getElementById('organizationAiEnabled');
const aiModerationDailyLimit = document.getElementById('aiModerationDailyLimit');
const aiTranslationDailyLimit = document.getElementById('aiTranslationDailyLimit');
const saveOrganizationAiButton = document.getElementById('saveOrganizationAiButton');
const organizationAiStatus = document.getElementById('organizationAiStatus');
const sessionAiSection = document.getElementById('sessionAiSection');
const sessionAiModerationEnabled = document.getElementById('sessionAiModerationEnabled');
const sessionAiTranslationEnabled = document.getElementById('sessionAiTranslationEnabled');
const sessionAiTargetLanguage = document.getElementById('sessionAiTargetLanguage');
const saveSessionAiButton = document.getElementById('saveSessionAiButton');
const sessionAiStatus = document.getElementById('sessionAiStatus');
const organizationFilterSection = document.getElementById('organizationFilterSection');
const filterTermInput = document.getElementById('filterTermInput');
const filterTermCategory = document.getElementById('filterTermCategory');
const filterTermSeverity = document.getElementById('filterTermSeverity');
const filterTermFuzzy = document.getElementById('filterTermFuzzy');
const filterTermLanguage = document.getElementById('filterTermLanguage');
const filterTermBoundary = document.getElementById('filterTermBoundary');
const filterTermMatchMode = document.getElementById('filterTermMatchMode');
const filterTermAdvancedDetails = document.getElementById('filterTermAdvancedDetails');
const addFilterTermButton = document.getElementById('addFilterTermButton');
const cancelFilterTermEditButton = document.getElementById('cancelFilterTermEditButton');
const organizationFilterPreset = document.getElementById('organizationFilterPreset');
const applyOrganizationFilterPresetButton = document.getElementById('applyOrganizationFilterPresetButton');
const exportFilterTermsButton = document.getElementById('exportFilterTermsButton');
const organizationFilterStatus = document.getElementById('organizationFilterStatus');
const filterPackStatus = document.getElementById('filterPackStatus');
const installJapaneseFilterPackButton = document.getElementById('installJapaneseFilterPackButton');
const installEnglishFilterPackButton = document.getElementById('installEnglishFilterPackButton');
const installJapaneseContextFilterPackButton = document.getElementById('installJapaneseContextFilterPackButton');
const installEnglishContextFilterPackButton = document.getElementById('installEnglishContextFilterPackButton');
const filterTermsBody = document.getElementById('filterTermsBody');
const filterPoliciesBody = document.getElementById('filterPoliciesBody');
const saveFilterPoliciesButton = document.getElementById('saveFilterPoliciesButton');
const sessionFilterSection = document.getElementById('sessionFilterSection');
const sessionFilterSimpleMode = document.getElementById('sessionFilterSimpleMode');
const saveSessionFilterSimpleButton = document.getElementById('saveSessionFilterSimpleButton');
const sessionFilterEnabled = document.getElementById('sessionFilterEnabled');
const sessionFilterAiRouting = document.getElementById('sessionFilterAiRouting');
const sessionFilterMaskCharacter = document.getElementById('sessionFilterMaskCharacter');
const sessionTranslationFilterEnabled = document.getElementById('sessionTranslationFilterEnabled');
const sessionUnsupportedLanguageMode = document.getElementById('sessionUnsupportedLanguageMode');
const saveSessionFilterButton = document.getElementById('saveSessionFilterButton');
const sessionFilterStatus = document.getElementById('sessionFilterStatus');
const LOG_DB_NAME = 'CPCV_LOCAL_LOGS';
const LOG_DB_VERSION = 1;
const LOG_STORE_NAME = 'comments';
const LOG_CHANNEL_NAME = 'CPCV_LOCAL_LOG_UPDATES';
const localLogChannel = 'BroadcastChannel' in window ? new BroadcastChannel(LOG_CHANNEL_NAME) : null;
let localLogRefreshTimer = 0;
let lastLocalLogSignature = '';
let currentSession = null;
let csrfToken = '';
let currentIdentity = null;
let pendingOrganizations = [];
let moderationComments = [];
let moderationRefreshTimer = 0;
let moderationRequestRunning = false;
let analyticsRefreshTimer = 0;
let analyticsRequestRunning = false;
let currentAnalytics = null;
let organizationFilterData = { categories: [], languages: [], policies: [], terms: [], packs: [], termLimit: 2000 };
let editingFilterTermId = '';

const FILTER_POLICY_PRESETS = Object.freeze({
  standard: {
    sexual: [2, 3, 5], profanity: [2, 3, 5], harassment: [3, 4, 5],
    discrimination: [2, 4, 5], violence: [3, 4, 5], personal_info: [1, 2, 5],
    spam: [2, 3, 5], illegal: [3, 4, 5], custom: [3, 4, 5]
  },
  strict: {
    sexual: [1, 2, 5], profanity: [1, 2, 5], harassment: [2, 3, 5],
    discrimination: [1, 3, 5], violence: [2, 3, 5], personal_info: [1, 2, 5],
    spam: [1, 2, 5], illegal: [2, 3, 5], custom: [2, 3, 5]
  }
});

function show(el, visible) {
  el?.classList.toggle('hidden', !visible);
}

function setStatus(text, error = false) {
  adminStatus.textContent = text;
  adminStatus.style.color = error ? '#dc2626' : '#2563eb';
}

function setLoginStatus(text, error = false) {
  loginStatus.textContent = text;
  loginStatus.style.color = error ? '#dc2626' : '#2563eb';
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

function displayError(error, target = setStatus) {
  if (error.status === 401) {
    csrfToken = '';
    currentIdentity = null;
    showLogin('ログインが必要です。', true);
    return;
  }
  if ((error.status === 404 && error.code === 'SESSION_NOT_FOUND') || error.code === 'SESSION_EXPIRED') {
    showNotFound();
    return;
  }
  target(`操作に失敗しました: ${error.code || error.message}`, true);
}

async function verifySession() {
  const data = await api('/api/auth/session');
  csrfToken = data.csrfToken || '';
  currentIdentity = data;
  show(organizationManageLink, ['owner', 'admin'].includes(data.organization?.role));
  if (data.user?.requirePasswordChange) setStatus('初期パスワードを変更してください。', true);
  return data;
}

function showLogin(message = '', error = false) {
  stopModerationRefresh();
  stopAnalyticsRefresh();
  currentSession = null;
  moderationComments = [];
  show(loginSection, true);
  show(createSection, false);
  show(activeSessionsSection, false);
  show(sessionSection, false);
  show(notFoundSection, false);
  show(logoutButton, false);
  show(organizationManageLink, false);
  show(organizationAiSection, false);
  show(organizationFilterSection, false);
  setStatus('');
  setLoginStatus(message, error);
  teacherLoginId.focus();
}

function showAdminTop() {
  stopModerationRefresh();
  stopAnalyticsRefresh();
  show(loginSection, false);
  show(createSection, true);
  show(activeSessionsSection, true);
  show(sessionSection, false);
  show(notFoundSection, false);
  show(logoutButton, true);
  show(organizationManageLink, ['owner', 'admin'].includes(currentIdentity?.organization?.role));
  show(organizationAiSection, ['owner', 'admin'].includes(currentIdentity?.organization?.role));
  show(organizationFilterSection, ['owner', 'admin'].includes(currentIdentity?.organization?.role));
  setStatus('');
}

function showSession() {
  show(loginSection, false);
  show(createSection, false);
  show(activeSessionsSection, false);
  show(sessionSection, true);
  show(notFoundSection, false);
  show(logoutButton, true);
  show(organizationManageLink, ['owner', 'admin'].includes(currentIdentity?.organization?.role));
  show(organizationAiSection, ['owner', 'admin'].includes(currentIdentity?.organization?.role));
  show(organizationFilterSection, false);
}

function showNotFound() {
  stopModerationRefresh();
  stopAnalyticsRefresh();
  show(loginSection, false);
  show(createSection, false);
  show(activeSessionsSection, false);
  show(sessionSection, false);
  show(notFoundSection, true);
  show(logoutButton, true);
  show(organizationManageLink, ['owner', 'admin'].includes(currentIdentity?.organization?.role));
  show(organizationAiSection, false);
  show(organizationFilterSection, false);
  setStatus('授業が見つかりません。', true);
}

async function withButton(button, label, fn) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '処理中...';
  try {
    await fn();
  } finally {
    button.disabled = false;
    button.textContent = label || original;
  }
}

loginButton.addEventListener('click', () => withButton(loginButton, 'ログイン', async () => {
  const account = teacherLoginId.value.trim();
  const password = teacherPassword.value;
  if (!account || !password) return setLoginStatus('メールアドレスとパスワードを入力してください。', true);
  const body = account.includes('@') ? { email: account, password } : { loginId: account, password };
  if (!teacherOrganizationGroup.classList.contains('hidden') && teacherOrganization.value) {
    body.organizationId = teacherOrganization.value;
  }
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    csrfToken = data.csrfToken || '';
    currentIdentity = data;
    pendingOrganizations = [];
    teacherPassword.value = '';
    show(teacherOrganizationGroup, false);
    setLoginStatus('');
    if (sessionId) await loadSession();
    else {
      showAdminTop();
      await loadActiveSessions();
      await Promise.all([loadOrganizationAiSettings(), loadOrganizationFilterSettings()]);
    }
  } catch (error) {
    if (error.code === 'ORGANIZATION_SELECTION_REQUIRED') {
      pendingOrganizations = error.data.organizations || [];
      teacherOrganization.textContent = '';
      for (const organization of pendingOrganizations) {
        const option = document.createElement('option');
        option.value = organization.id;
        option.textContent = `${organization.name} (${organization.role})`;
        teacherOrganization.appendChild(option);
      }
      show(teacherOrganizationGroup, true);
      return setLoginStatus('組織を選択してもう一度ログインしてください。');
    }
    setLoginStatus('メールアドレスまたはパスワードを確認してください。', true);
  }
}));

teacherPassword.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loginButton.click();
});
teacherLoginId.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') teacherPassword.focus();
});

logoutButton.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
  } catch {}
  csrfToken = '';
  currentIdentity = null;
  currentSession = null;
  showLogin('ログアウトしました。');
});

createButton.addEventListener('click', () => createSession(createButton));
notFoundCreateButton.addEventListener('click', () => {
  history.pushState(null, '', '/admin');
  showAdminTop();
  loadActiveSessions();
  newTitle.focus();
});

async function createSession(button) {
  await withButton(button, '授業を作成', async () => {
    try {
      const data = await api('/api/private/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: newTitle.value.trim() || 'Untitled class' })
      });
      location.href = `/admin/${encodeURIComponent(data.sessionId)}`;
    } catch (error) {
      displayError(error);
    }
  });
}

async function loadActiveSessions() {
  const data = await api('/api/private/sessions');
  activeSessionList.textContent = '';
  if (!data.sessions.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = '進行中の授業はありません。';
    activeSessionList.appendChild(empty);
    return;
  }
  for (const session of data.sessions) {
    activeSessionList.appendChild(renderSessionItem(session));
  }
}

function renderSessionItem(session) {
  const item = document.createElement('div');
  item.className = 'teacher-item';
  const summary = document.createElement('div');
  const remaining = formatRemaining(session.endsAt);
  summary.innerHTML = `<strong>${escapeHtml(session.title)}</strong><br><span class="muted">残り ${escapeHtml(remaining)}</span><br><span class="mono">${escapeHtml(session.joinUrl)}</span>`;

  const actions = document.createElement('div');
  actions.className = 'row wrap';
  const openButton = document.createElement('button');
  openButton.className = 'button primary';
  openButton.type = 'button';
  openButton.textContent = '開く';
  openButton.addEventListener('click', () => { location.href = `/admin/${encodeURIComponent(session.id)}`; });

  const endButton = document.createElement('button');
  endButton.className = 'button';
  endButton.type = 'button';
  endButton.textContent = '終了';
  endButton.addEventListener('click', () => endListedSession(session));

  const deleteButton = document.createElement('button');
  deleteButton.className = 'button danger';
  deleteButton.type = 'button';
  deleteButton.textContent = '消す';
  deleteButton.addEventListener('click', () => deleteListedSession(session));
  actions.append(openButton, endButton, deleteButton);
  item.append(summary, actions);
  return item;
}

async function endListedSession(session) {
  if (!confirm(`「${session.title}」を終了しますか。`)) return;
  await api(`/api/private/sessions/${encodeURIComponent(session.id)}/settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'ended', postingEnabled: false })
  });
  setStatus('授業を終了しました。');
  await loadActiveSessions();
}

async function deleteListedSession(session) {
  if (!confirm(`「${session.title}」を一覧から消しますか。学生投稿も止まります。`)) return;
  await api(`/api/private/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' });
  setStatus('授業を一覧から消しました。');
  await loadActiveSessions();
}

async function loadSession() {
  const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}`);
  currentSession = data.session;
  renderSession();
  showSession();
  await Promise.all([loadOrganizationAiSettings(), loadOrganizationFilterSettings(), loadSessionAiSettings(), loadSessionFilterSettings(), loadPdfState(), loadSessionAnalytics(), loadAnalyticsSnapshots()]);
}

function renderSession() {
  sessionTitle.textContent = currentSession.title;
  joinUrlEl.textContent = currentSession.joinUrl || `/j/${currentSession.publicCode}`;
  publicCodeEl.textContent = `合言葉: ${currentSession.publicCode}`;
  const viewerUrl = `${location.origin}/viewer/${currentSession.id}`;
  viewerUrlEl.textContent = viewerUrl;
  postingState.textContent = `投稿: ${currentSession.postingEnabled ? '受付中' : '停止中'}`;
  commentsState.textContent = `コメント表示: ${currentSession.commentsVisible ? 'ON' : 'OFF'}`;
  commentModeState.textContent = `表示方法: ${formatDisplayMode(currentSession.commentDisplayMode)}`;
  moderationModeState.textContent = `投稿承認: ${currentSession.moderationMode === 'pre' ? '承認後に表示' : '自動表示'}`;
  commentDisplayState.textContent = currentSession.commentDisplayMode === 'scroll'
    ? `速度: ${formatScrollSpeed(currentSession.commentDisplaySeconds)}`
    : `表示時間: ${formatDisplaySeconds(currentSession.commentDisplaySeconds)}`;
  sessionState.textContent = `残り: ${formatRemaining(currentSession.endsAt)}`;
  commentDisplayMode.value = normalizeDisplayMode(currentSession.commentDisplayMode);
  commentDisplaySeconds.value = String(normalizeDisplaySeconds(currentSession.commentDisplaySeconds));
  moderationMode.value = currentSession.moderationMode === 'pre' ? 'pre' : 'off';
  updateDisplaySettingLabels();
  togglePostingButton.textContent = currentSession.postingEnabled ? '投稿を停止' : '投稿を再開';
  toggleCommentsButton.textContent = currentSession.commentsVisible ? 'コメント表示OFF' : 'コメント表示ON';
  documentInfo.textContent = 'PDFは投影画面で選択します。クラウドには送りません。';
  loadLocalLogs();
  loadModerationComments();
  startModerationRefresh();
  startAnalyticsRefresh();
}

function startModerationRefresh() {
  if (moderationRefreshTimer || !sessionId) return;
  moderationRefreshTimer = window.setInterval(() => {
    if (currentSession && !document.hidden) loadModerationComments({ quiet: true });
  }, 5000);
}

function stopModerationRefresh() {
  if (!moderationRefreshTimer) return;
  window.clearInterval(moderationRefreshTimer);
  moderationRefreshTimer = 0;
}

function startAnalyticsRefresh() {
  if (analyticsRefreshTimer || !sessionId) return;
  analyticsRefreshTimer = window.setInterval(() => {
    if (currentSession && !document.hidden) {
      loadPdfState({ quiet: true });
      loadSessionAnalytics({ quiet: true });
    }
  }, 15000);
}

function stopAnalyticsRefresh() {
  if (!analyticsRefreshTimer) return;
  window.clearInterval(analyticsRefreshTimer);
  analyticsRefreshTimer = 0;
}

async function loadPdfState({ quiet = false } = {}) {
  if (!sessionId || !documentInfo) return;
  try {
    const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/pdf/state`);
    const state = data.state;
    if (!state) {
      documentInfo.textContent = '未選択。投影画面でPDFを選ぶとページ連動を開始します。PDF本体とファイル名は送信しません。';
      return;
    }
    const sizeMb = (Number(state.fileSizeBytes || 0) / 1048576).toFixed(1);
    documentInfo.textContent = `${state.pageCount}ページ / 現在 ${state.currentPage}ページ / ${sizeMb} MB / 識別子 ${String(state.documentSha256 || '').slice(0, 12)}…`;
  } catch (error) {
    if (!quiet) displayError(error, (text) => { documentInfo.textContent = text; });
  }
}

async function loadSessionAnalytics({ quiet = false } = {}) {
  if (!sessionId || !analyticsBody || analyticsRequestRunning) return;
  analyticsRequestRunning = true;
  if (!quiet) analyticsStatus.textContent = 'ページ別集計を読み込んでいます。';
  try {
    const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/analytics`);
    currentAnalytics = data;
    renderSessionAnalytics(data);
    analyticsStatus.textContent = `集計時点 ${formatDateTime(data.sourceCutoffAt)}。理解度は${data.minimumGroupSize}人未満を非表示にします。`;
  } catch (error) {
    if (error.code === 'PDF_NOT_BOUND') {
      currentAnalytics = null;
      clearAnalyticsDisplay();
      analyticsStatus.textContent = '投影画面でPDFを選ぶとページ別集計を開始します。';
    } else if (!quiet) {
      displayError(error, (text) => { analyticsStatus.textContent = text; });
    }
  } finally {
    analyticsRequestRunning = false;
  }
}

function renderSessionAnalytics(data) {
  const summary = data.summary || {};
  analyticsSummary.textContent = '';
  const cards = [
    ['総コメント', summary.totalComments ?? 0],
    ['理解度回答', summary.totalSignals ?? 0],
    ['活動ページ', `${summary.pagesWithActivity ?? 0} / ${summary.pageCount ?? 0}`],
    ['全体理解度', summary.overallUnderstandingScore == null ? '非表示' : `${summary.overallUnderstandingScore}%`]
  ];
  for (const [label, value] of cards) {
    const card = document.createElement('div');
    card.className = 'analytics-summary-card';
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = label;
    card.append(strong, span);
    analyticsSummary.appendChild(card);
  }
  show(analyticsSummary, true);
  analyticsBody.textContent = '';
  for (const page of Array.isArray(data.pages) ? data.pages : []) {
    const row = analyticsBody.insertRow();
    insertAnalyticsCell(row, `P.${page.pageNumber}`);
    insertAnalyticsCell(row, `${page.viewCount}回`);
    insertAnalyticsCell(row, formatDwellSeconds(page.dwellSeconds));
    insertAnalyticsCell(row, `${page.commentCount}件
表示${page.visibleCommentCount} / 承認待ち${page.pendingCommentCount} / 非表示${page.hiddenCommentCount}`);
    insertAnalyticsCell(row, `${page.questionMarkCommentCount}件`);
    const signalText = page.suppressed
      ? `${page.signalTotal}件（内訳非表示）`
      : `${page.signalTotal}件
理解${page.understoodCount ?? 0} / 不明${page.unsureCount ?? 0} / 困惑${page.confusedCount ?? 0}`;
    insertAnalyticsCell(row, signalText, page.suppressed ? 'analytics-suppressed' : '');
    insertAnalyticsCell(row, page.understandingScore == null ? '—' : `${page.understandingScore}%`);
  }
  if (!analyticsBody.rows.length) {
    const row = analyticsBody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 7;
    cell.className = 'muted';
    cell.textContent = '集計対象のページがありません。';
  }
}

function clearAnalyticsDisplay() {
  show(analyticsSummary, false);
  analyticsSummary.textContent = '';
  analyticsBody.textContent = '';
}

function insertAnalyticsCell(row, value, className = '') {
  const cell = row.insertCell();
  cell.textContent = String(value ?? '');
  cell.style.whiteSpace = 'pre-line';
  if (className) cell.className = className;
}

function formatDwellSeconds(value) {
  const seconds = Math.max(0, Number(value || 0));
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return remainder ? `${minutes}分${remainder}秒` : `${minutes}分`;
}

function formatDateTime(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ja-JP') : '-';
}

async function loadAnalyticsSnapshots() {
  if (!sessionId || !analyticsSnapshotSelect) return;
  try {
    const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/analytics/snapshots`);
    analyticsSnapshotSelect.textContent = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '確定記録を選択';
    analyticsSnapshotSelect.appendChild(empty);
    for (const snapshot of Array.isArray(data.snapshots) ? data.snapshots : []) {
      const option = document.createElement('option');
      option.value = snapshot.id;
      option.textContent = `${formatDateTime(snapshot.createdAt)} / ${String(snapshot.checksumSha256 || '').slice(0, 10)}…`;
      analyticsSnapshotSelect.appendChild(option);
    }
    downloadAnalyticsSnapshotButton.disabled = true;
  } catch (error) {
    if (error.code !== 'PDF_NOT_BOUND') displayError(error, (text) => { analyticsStatus.textContent = text; });
  }
}

async function createAnalyticsSnapshot() {
  await withButton(createAnalyticsSnapshotButton, '記録を確定', async () => {
    try {
      const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/analytics/snapshots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      analyticsStatus.textContent = `確定記録を作成しました。SHA-256 ${String(data.snapshot?.checksumSha256 || '').slice(0, 16)}…`;
      await Promise.all([loadSessionAnalytics({ quiet: true }), loadAnalyticsSnapshots()]);
      if (data.snapshot?.id) {
        analyticsSnapshotSelect.value = data.snapshot.id;
        downloadAnalyticsSnapshotButton.disabled = false;
      }
    } catch (error) {
      if (error.code === 'PDF_NOT_BOUND') analyticsStatus.textContent = 'PDFを選択してから記録を確定してください。';
      else displayError(error, (text) => { analyticsStatus.textContent = text; });
    }
  });
}

function downloadSelectedAnalyticsSnapshot() {
  const snapshotId = analyticsSnapshotSelect?.value || '';
  if (!snapshotId) return;
  const url = `/api/private/sessions/${encodeURIComponent(sessionId)}/analytics/snapshots/${encodeURIComponent(snapshotId)}/export`;
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function loadModerationComments({ quiet = false } = {}) {
  if (!moderationBody || !sessionId || moderationRequestRunning) return;
  moderationRequestRunning = true;
  if (!quiet) moderationStatus.textContent = '保存コメントを読み込んでいます。';
  try {
    const state = moderationStateFilter?.value || '';
    const query = new URLSearchParams({ limit: '100' });
    if (state) query.set('state', state);
    const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments?${query}`);
    moderationComments = Array.isArray(data.comments) ? data.comments : [];
    renderModerationComments();
    moderationStatus.textContent = `${moderationComments.length}件表示中${data.nextCursor ? '。101件目以降は状態で絞り込んでください。' : ''}`;
  } catch (error) {
    if (!quiet) displayError(error, (text) => { moderationStatus.textContent = text; });
  } finally {
    moderationRequestRunning = false;
  }
}

function renderModerationComments() {
  moderationBody.textContent = '';
  if (!moderationComments.length) {
    const row = moderationBody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 8;
    cell.className = 'muted';
    cell.textContent = '該当する保存コメントはありません。';
    return;
  }
  for (const comment of moderationComments) {
    const row = moderationBody.insertRow();
    row.dataset.commentId = comment.id;
    const selectCell = row.insertCell();
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'moderation-select';
    checkbox.value = comment.id;
    checkbox.setAttribute('aria-label', `${comment.nickname || '匿名'}のコメントを選択`);
    selectCell.appendChild(checkbox);
    appendModerationCell(row, formatLogDate(comment.createdAt));
    appendModerationCell(row, comment.nickname || '匿名');
    appendFilteredCommentCell(row, comment);
    const stateCell = row.insertCell();
    const stateBadge = document.createElement('span');
    stateBadge.className = `moderation-state state-${comment.moderationState}`;
    stateBadge.textContent = moderationStateLabel(comment.moderationState);
    stateCell.appendChild(stateBadge);
    appendAiModerationCell(row, comment);
    appendAiTranslationCell(row, comment);
    const actionsCell = row.insertCell();
    actionsCell.className = 'moderation-actions';
    for (const action of allowedModerationActions(comment.moderationState)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = action === 'delete' ? 'button small danger' : 'button small';
      button.textContent = moderationActionLabel(action);
      button.addEventListener('click', () => runSingleModeration(comment, action, button));
      actionsCell.appendChild(button);
    }
  }
}

function appendAiModerationCell(row, comment) {
  const cell = row.insertCell();
  cell.className = 'ai-result-cell';
  const result = comment.ai?.moderation;
  if (!result) {
    cell.textContent = '未実行';
    cell.classList.add('muted');
    return;
  }
  const label = { allow: '問題なし', review: '要確認', hide: '非表示推奨' }[result.recommendation] || aiStatusLabel(result.status);
  const badge = document.createElement('span');
  badge.className = `ai-result-badge ai-${result.recommendation || result.status || 'unknown'}`;
  badge.textContent = `AI参考: ${label}`;
  cell.appendChild(badge);
  if (Number.isFinite(result.confidence)) {
    const confidence = document.createElement('small');
    confidence.className = 'muted ai-result-detail';
    confidence.textContent = `確信度 ${Math.round(result.confidence * 100)}%`;
    cell.appendChild(confidence);
  }
  if (Array.isArray(result.categories) && result.categories.length) {
    const categories = document.createElement('small');
    categories.className = 'muted ai-result-detail';
    categories.textContent = result.categories.join(', ');
    cell.appendChild(categories);
  }
  appendAiRetryButton(cell, comment, 'moderation', result);
}

function appendAiTranslationCell(row, comment) {
  const cell = row.insertCell();
  cell.className = 'ai-result-cell';
  const result = comment.ai?.translation;
  if (!result) {
    cell.textContent = '未実行';
    cell.classList.add('muted');
    return;
  }
  if (result.text) {
    const label = document.createElement('strong');
    label.textContent = `AI翻訳 (${aiLanguageLabel(result.targetLanguage)})`;
    const text = document.createElement('span');
    text.className = 'ai-translation-text';
    text.textContent = result.text;
    cell.append(label, text);
  } else if (['review', 'reject'].includes(result.filterAction)) {
    cell.textContent = result.filterAction === 'reject' ? '翻訳文を検閲により非表示' : '翻訳文を承認待ち';
  } else {
    cell.textContent = aiStatusLabel(result.status, result.error);
  }
  appendAiRetryButton(cell, comment, 'translation', result);
}

function appendAiRetryButton(cell, comment, jobType, result) {
  if (!['failed', 'skipped'].includes(result?.status)) return;
  if (['PII_DETECTED', 'AI_DISABLED'].includes(result?.error)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button small ai-retry-button';
  button.textContent = '再実行';
  button.addEventListener('click', () => retryCommentAi(comment, jobType, button));
  cell.appendChild(button);
}

function aiStatusLabel(status, error = '') {
  const base = { queued: '待機中', processing: '処理中', retry: '再試行待ち', succeeded: '完了', failed: '失敗', skipped: '未実行' }[status] || '未実行';
  return error ? `${base} (${error})` : base;
}

function aiLanguageLabel(value) {
  return { ja: '日本語', en: '英語', ko: '韓国語', 'zh-CN': '中国語 簡体', 'zh-TW': '中国語 繁体' }[value] || value || '-';
}

async function retryCommentAi(comment, jobType, button) {
  await withButton(button, '再実行', async () => {
    try {
      const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments/${encodeURIComponent(comment.id)}/ai-retry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobTypes: [jobType] })
      });
      setStatus(data.queuedJobs ? 'AI処理を再投入しました。' : '再実行できるAI処理はありません。', !data.queuedJobs);
      await loadModerationComments();
    } catch (error) {
      displayError(error);
    }
  });
}

function appendModerationCell(row, value, className = '') {
  const cell = row.insertCell();
  cell.textContent = String(value || '');
  if (className) cell.className = className;
}

function moderationStateLabel(state) {
  return { visible: '表示中', pending: '承認待ち', hidden: '非表示', deleted: '削除済み' }[state] || state;
}

function moderationActionLabel(action) {
  return { approve: '承認', hide: '非表示', restore: '復元', delete: '削除' }[action] || action;
}

function allowedModerationActions(state) {
  return {
    pending: ['approve', 'hide', 'delete'],
    visible: ['hide', 'delete'],
    hidden: ['restore', 'delete'],
    deleted: ['restore']
  }[state] || [];
}

async function runSingleModeration(comment, action, button) {
  const reason = moderationReason(action);
  if (reason === false) return;
  await withButton(button, moderationActionLabel(action), async () => {
    try {
      const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments/${encodeURIComponent(comment.id)}/moderate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, expectedUpdatedAt: comment.updatedAt, reason: reason || undefined })
      });
      setStatus(data.realtimeDelivered === false ? '保存状態は更新しました。投影画面への即時反映に失敗しました。再接続してください。' : 'コメント状態を更新しました。', data.realtimeDelivered === false);
      await loadModerationComments();
    } catch (error) {
      if (error.code === 'COMMENT_VERSION_CONFLICT') setStatus('別の操作で状態が変わりました。再読み込みしました。', true);
      else displayError(error);
      await loadModerationComments({ quiet: true });
    }
  });
}

function moderationReason(action) {
  if (!['hide', 'delete'].includes(action)) return '';
  const value = prompt(`${moderationActionLabel(action)}の理由を入力できます。空欄でも実行できます。`, '');
  return value === null ? false : value.trim();
}

async function runBulkModeration(action, button) {
  const selectedIds = [...document.querySelectorAll('.moderation-select:checked')].map((item) => item.value);
  if (!selectedIds.length) return setStatus('操作するコメントを選択してください。', true);
  const reason = moderationReason(action);
  if (reason === false) return;
  const items = selectedIds.map((id) => moderationComments.find((comment) => comment.id === id)).filter(Boolean).map((comment) => ({
    commentId: comment.id,
    action,
    expectedUpdatedAt: comment.updatedAt,
    reason: reason || undefined
  }));
  await withButton(button, button.textContent, async () => {
    try {
      const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments/moderate-bulk`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items })
      });
      setStatus(`一括操作: 成功${data.succeeded}件。失敗${data.failed}件。`, data.failed > 0);
      await loadModerationComments();
    } catch (error) {
      displayError(error);
    }
  });
}


function appendFilteredCommentCell(row, comment) {
  const cell = row.insertCell();
  cell.className = 'moderation-message';
  const original = document.createElement('div');
  original.textContent = comment.message || '';
  cell.appendChild(original);
  if (comment.pdfPageNumber) {
    const page = document.createElement('span');
    page.className = 'page-reference muted';
    page.textContent = `PDF P.${comment.pdfPageNumber}`;
    cell.appendChild(page);
  }
  if (comment.displayMessage && comment.displayMessage !== comment.message) {
    const display = document.createElement('div');
    display.className = 'filter-display-message';
    display.textContent = `投影表示: ${comment.displayMessage}`;
    cell.appendChild(display);
  }
  const matches = Array.isArray(comment.filter?.matches) ? comment.filter.matches : [];
  if (comment.filter?.action && comment.filter.action !== 'allow') {
    const line = document.createElement('div');
    line.className = 'filter-evidence';
    const categories = [...new Set(matches.map((item) => filterCategoryLabel(item.category)))];
    line.textContent = `辞書: ${filterActionLabel(comment.filter.action)}${categories.length ? ` / ${categories.join('・')}` : ''}`;
    cell.appendChild(line);
  }
}

function filterActionLabel(action) {
  return { allow: '許可', review: '承認待ち', mask: '伏字', reject: '投稿拒否' }[action] || action;
}

function filterCategoryLabel(category) {
  return organizationFilterData.categories.find((item) => item.id === category)?.label || category || '-';
}

async function loadOrganizationFilterSettings() {
  if (!organizationFilterSection || !['owner', 'admin'].includes(currentIdentity?.organization?.role)) return;
  organizationFilterStatus.textContent = '辞書設定を読み込んでいます。';
  try {
    const data = await api('/api/org/content-filter');
    organizationFilterData = data;
    renderFilterCategoryOptions();
    renderFilterTerms();
    renderFilterPolicies();
    renderFilterPackStatus();
    organizationFilterStatus.textContent = `${data.terms.length}語を登録中。上限${data.termLimit}語。`;
  } catch (error) {
    displayError(error, (text) => { organizationFilterStatus.textContent = text; });
  }
}

function renderFilterPackStatus() {
  if (!filterPackStatus) return;
  const packs = organizationFilterData.packs || [];
  const byId = (id) => packs.find((pack) => pack.id === id);
  const jaCore = byId('ja-core-v1');
  const enCore = byId('en-core-v1');
  const jaContext = byId('ja-context-v1');
  const enContext = byId('en-context-v1');
  const label = (pack) => pack?.installed
    ? `導入済み v${pack.installedVersion || pack.version}・${pack.termCount}語`
    : `未導入・${pack?.termCount || 0}語`;
  filterPackStatus.textContent = `基本 日本語: ${label(jaCore)} / 英語: ${label(enCore)}　文脈注意 日本語: ${label(jaContext)} / 英語: ${label(enContext)}`;
  const editable = currentIdentity?.organization?.role === 'owner';
  setPackButtonState(installJapaneseFilterPackButton, jaCore, editable);
  setPackButtonState(installEnglishFilterPackButton, enCore, editable);
  setPackButtonState(installJapaneseContextFilterPackButton, jaContext, editable);
  setPackButtonState(installEnglishContextFilterPackButton, enContext, editable);
}

function setPackButtonState(button, pack, editable) {
  if (!button) return;
  const current = Boolean(pack?.installed && Number(pack.installedVersion) >= Number(pack.version));
  button.disabled = !editable || current;
  button.textContent = pack?.installed && !current ? '更新' : button.dataset.defaultLabel || button.textContent;
}

async function installFilterPack(packId, button) {
  await withButton(button, '導入', async () => {
    try {
      await api(`/api/org/content-filter/packs/${encodeURIComponent(packId)}/install`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
      });
      await loadOrganizationFilterSettings();
      organizationFilterStatus.textContent = `${packId.startsWith('ja-') ? '日本語' : '英語'}パックを導入しました。`;
    } catch (error) {
      displayError(error, (text) => { organizationFilterStatus.textContent = text; });
    }
  });
}

async function ensureBilingualFilterPacks(mode = 'standard') {
  const packMap = new Map((organizationFilterData.packs || []).map((pack) => [pack.id, pack]));
  const required = mode === 'strict'
    ? ['ja-core-v1', 'en-core-v1', 'ja-context-v1', 'en-context-v1']
    : ['ja-core-v1', 'en-core-v1'];
  for (const packId of required) {
    const pack = packMap.get(packId);
    if (pack?.installed && Number(pack.installedVersion) >= Number(pack.version)) continue;
    await api(`/api/org/content-filter/packs/${encodeURIComponent(packId)}/install`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    });
  }
}

function renderFilterCategoryOptions() {
  const selected = filterTermCategory.value;
  filterTermCategory.textContent = '';
  for (const category of organizationFilterData.categories || []) {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.label;
    filterTermCategory.appendChild(option);
  }
  if ([...filterTermCategory.options].some((option) => option.value === selected)) filterTermCategory.value = selected;

  const selectedLanguage = filterTermLanguage.value || 'und';
  filterTermLanguage.textContent = '';
  for (const language of organizationFilterData.languages || [{ id: 'und', label: '自動・指定なし' }]) {
    filterTermLanguage.append(new Option(language.label, language.id));
  }
  if ([...filterTermLanguage.options].some((option) => option.value === selectedLanguage)) filterTermLanguage.value = selectedLanguage;
  organizationFilterPreset.value = inferOrganizationFilterPreset();
}

function renderFilterTerms() {
  filterTermsBody.textContent = '';
  const terms = organizationFilterData.terms || [];
  if (!terms.length) {
    const row = filterTermsBody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 8;
    cell.className = 'muted';
    cell.textContent = '登録済みの用語はありません。';
    return;
  }
  for (const term of terms) {
    const row = filterTermsBody.insertRow();
    appendModerationCell(row, term.term);
    appendModerationCell(row, filterLanguageLabel(term.languageCode));
    appendModerationCell(row, filterCategoryLabel(term.category));
    appendModerationCell(row, String(term.severity));
    appendModerationCell(row, filterBoundaryLabel(term.boundaryMode));
    appendModerationCell(row, term.fuzzyEnabled ? '使用' : '不使用');
    const activeCell = row.insertCell();
    const active = document.createElement('input');
    active.type = 'checkbox';
    active.checked = Boolean(term.active);
    active.setAttribute('aria-label', `${term.term}を有効化`);
    active.addEventListener('change', () => updateFilterTermActive(term, active));
    activeCell.appendChild(active);
    const actionCell = row.insertCell();
    actionCell.className = 'row-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'button small';
    edit.textContent = '編集';
    edit.addEventListener('click', () => beginFilterTermEdit(term));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button small danger';
    remove.textContent = '削除';
    remove.addEventListener('click', () => deleteFilterTermRow(term, remove));
    actionCell.append(edit, remove);
  }
}

function renderFilterPolicies() {
  filterPoliciesBody.textContent = '';
  const editable = currentIdentity?.organization?.role === 'owner';
  for (const policy of organizationFilterData.policies || []) {
    const row = filterPoliciesBody.insertRow();
    row.dataset.category = policy.category;
    appendModerationCell(row, filterCategoryLabel(policy.category));
    const enabledCell = row.insertCell();
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.className = 'filter-policy-enabled';
    enabled.checked = Boolean(policy.enabled);
    enabled.disabled = !editable;
    enabledCell.appendChild(enabled);
    for (const [key, value] of [['review', policy.reviewMinSeverity], ['mask', policy.maskMinSeverity], ['reject', policy.rejectMinSeverity]]) {
      const cell = row.insertCell();
      const select = document.createElement('select');
      select.className = `select filter-policy-${key}`;
      select.disabled = !editable;
      select.append(new Option('使用しない', ''));
      for (let level = 1; level <= 5; level += 1) select.append(new Option(String(level), String(level)));
      select.value = value == null ? '' : String(value);
      cell.appendChild(select);
    }
  }
  saveFilterPoliciesButton.disabled = !editable;
  applyOrganizationFilterPresetButton.disabled = !editable;
}

async function addFilterTerm() {
  const term = filterTermInput.value.trim();
  if (!term) return organizationFilterStatus.textContent = '検閲用語を入力してください。';
  const editing = organizationFilterData.terms.find((item) => item.id === editingFilterTermId);
  await withButton(addFilterTermButton, editing ? '変更を保存' : '用語を追加', async () => {
    try {
      const payload = {
        term,
        category: filterTermCategory.value,
        severity: Number(filterTermSeverity.value),
        matchMode: filterTermMatchMode.value,
        fuzzyEnabled: filterTermFuzzy.checked,
        languageCode: filterTermLanguage.value || 'und',
        boundaryMode: filterTermBoundary.value || 'auto'
      };
      await api(editing ? `/api/org/content-filter/terms/${encodeURIComponent(editing.id)}` : '/api/org/content-filter/terms', {
        method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      resetFilterTermForm();
      await loadOrganizationFilterSettings();
      organizationFilterStatus.textContent = editing ? '用語を変更しました。' : '用語を追加しました。';
    } catch (error) {
      displayError(error, (text) => { organizationFilterStatus.textContent = text; });
    }
  });
}

function beginFilterTermEdit(term) {
  editingFilterTermId = term.id;
  filterTermInput.value = term.term;
  filterTermCategory.value = term.category;
  filterTermSeverity.value = String(term.severity);
  filterTermLanguage.value = term.languageCode || 'und';
  filterTermBoundary.value = term.boundaryMode || 'auto';
  filterTermMatchMode.value = term.matchMode || 'normalized';
  filterTermFuzzy.checked = Boolean(term.fuzzyEnabled);
  addFilterTermButton.textContent = '変更を保存';
  cancelFilterTermEditButton.classList.remove('hidden');
  filterTermAdvancedDetails.open = true;
  filterTermInput.focus();
}

function resetFilterTermForm() {
  editingFilterTermId = '';
  filterTermInput.value = '';
  filterTermSeverity.value = '3';
  filterTermLanguage.value = 'und';
  filterTermBoundary.value = 'auto';
  filterTermMatchMode.value = 'normalized';
  filterTermFuzzy.checked = true;
  addFilterTermButton.textContent = '用語を追加';
  cancelFilterTermEditButton.classList.add('hidden');
}

async function updateFilterTermActive(term, checkbox) {
  checkbox.disabled = true;
  try {
    await api(`/api/org/content-filter/terms/${encodeURIComponent(term.id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: checkbox.checked })
    });
    await loadOrganizationFilterSettings();
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    displayError(error, (text) => { organizationFilterStatus.textContent = text; });
  } finally {
    checkbox.disabled = false;
  }
}

async function deleteFilterTermRow(term, button) {
  if (!confirm(`「${term.term}」を辞書から削除しますか。`)) return;
  await withButton(button, '削除', async () => {
    try {
      await api(`/api/org/content-filter/terms/${encodeURIComponent(term.id)}`, { method: 'DELETE' });
      await loadOrganizationFilterSettings();
    } catch (error) {
      displayError(error, (text) => { organizationFilterStatus.textContent = text; });
    }
  });
}

function filterLanguageLabel(code) {
  return organizationFilterData.languages.find((item) => item.id === code)?.label || code || '自動';
}

function filterBoundaryLabel(mode) {
  return { auto: '自動', word: '単語全体', substring: '部分一致' }[mode] || mode || '自動';
}

function inferOrganizationFilterPreset() {
  const policies = organizationFilterData.policies || [];
  if (policies.every((policy) => !policy.enabled)) return 'off';
  for (const name of ['standard', 'strict']) {
    const preset = FILTER_POLICY_PRESETS[name];
    const matches = policies.every((policy) => {
      const levels = preset[policy.category];
      if (!levels) return policy.category === 'political' && !policy.enabled;
      return policy.enabled
        && policy.reviewMinSeverity === levels[0]
        && policy.maskMinSeverity === levels[1]
        && policy.rejectMinSeverity === levels[2];
    });
    if (matches) return name;
  }
  return 'custom';
}

async function applyOrganizationFilterPreset() {
  const presetName = organizationFilterPreset.value;
  if (presetName === 'custom') {
    document.getElementById('organizationFilterAdvanced')?.setAttribute('open', '');
    organizationFilterStatus.textContent = '現在の詳細設定を維持します。';
    return;
  }
  const source = FILTER_POLICY_PRESETS[presetName] || {};
  const policies = (organizationFilterData.policies || []).map((policy) => {
    const levels = source[policy.category];
    return {
      category: policy.category,
      enabled: Boolean(levels),
      reviewMinSeverity: levels?.[0] ?? policy.reviewMinSeverity,
      maskMinSeverity: levels?.[1] ?? policy.maskMinSeverity,
      rejectMinSeverity: levels?.[2] ?? policy.rejectMinSeverity
    };
  });
  await withButton(applyOrganizationFilterPresetButton, '設定を適用', async () => {
    try {
      if (presetName === 'standard' || presetName === 'strict') await ensureBilingualFilterPacks(presetName);
      await api('/api/org/content-filter/policies', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policies })
      });
      await loadOrganizationFilterSettings();
      organizationFilterStatus.textContent = presetName === 'off' ? '辞書判定をすべて無効にしました。' : `${presetName === 'strict' ? '厳格' : '推奨'}設定を適用しました。`;
    } catch (error) {
      displayError(error, (text) => { organizationFilterStatus.textContent = text; });
    }
  });
}

function exportFilterTermsCsv() {
  const headers = ['term', 'language_code', 'category', 'severity', 'match_mode', 'fuzzy_enabled', 'boundary_mode', 'active'];
  const rows = (organizationFilterData.terms || []).map((term) => [
    term.term, term.languageCode || 'und', term.category, term.severity, term.matchMode,
    term.fuzzyEnabled ? 1 : 0, term.boundaryMode || 'auto', term.active ? 1 : 0
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `cpcv-content-filter-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function saveFilterPolicies() {
  const policies = [...filterPoliciesBody.rows].map((row) => ({
    category: row.dataset.category,
    enabled: row.querySelector('.filter-policy-enabled').checked,
    reviewMinSeverity: nullableFilterLevel(row.querySelector('.filter-policy-review').value),
    maskMinSeverity: nullableFilterLevel(row.querySelector('.filter-policy-mask').value),
    rejectMinSeverity: nullableFilterLevel(row.querySelector('.filter-policy-reject').value)
  }));
  await withButton(saveFilterPoliciesButton, '種類別基準を保存', async () => {
    try {
      await api('/api/org/content-filter/policies', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policies })
      });
      await loadOrganizationFilterSettings();
      organizationFilterStatus.textContent = '種類別基準を保存しました。';
    } catch (error) {
      displayError(error, (text) => { organizationFilterStatus.textContent = text; });
    }
  });
}

function nullableFilterLevel(value) {
  return value === '' ? null : Number(value);
}

async function loadSessionFilterSettings() {
  if (!sessionId || !sessionFilterSection) return;
  sessionFilterStatus.textContent = '辞書設定を読み込んでいます。';
  try {
    const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/filter-settings`);
    sessionFilterEnabled.checked = Boolean(data.settings.enabled);
    sessionFilterAiRouting.value = data.settings.aiRoutingMode || 'ambiguous';
    sessionFilterMaskCharacter.value = data.settings.maskCharacter || '＊';
    sessionTranslationFilterEnabled.checked = data.settings.translationFilterEnabled !== false;
    sessionUnsupportedLanguageMode.value = data.settings.unsupportedLanguageMode || 'ai_review';
    sessionFilterSimpleMode.value = simpleModeFromSessionSettings(data.settings);
    sessionFilterStatus.textContent = data.settings.enabled
      ? `有効。AI経路: ${{ off: '不使用', ambiguous: '曖昧な場合のみ', all: '全投稿' }[data.settings.aiRoutingMode] || data.settings.aiRoutingMode}`
      : '無効です。投稿は辞書判定を受けません。';
  } catch (error) {
    displayError(error, (text) => { sessionFilterStatus.textContent = text; });
  }
}

function simpleModeFromSessionSettings(settings) {
  if (!settings?.enabled) return 'off';
  if (settings.aiRoutingMode === 'off') return 'dictionary';
  if (settings.aiRoutingMode === 'all') return 'all';
  return 'recommended';
}

async function saveSessionFilterSimpleSettings() {
  const mode = sessionFilterSimpleMode.value;
  const mapped = {
    off: { enabled: false, aiRoutingMode: 'off', unsupportedLanguageMode: 'review_only' },
    recommended: { enabled: true, aiRoutingMode: 'ambiguous', unsupportedLanguageMode: 'ai_review' },
    dictionary: { enabled: true, aiRoutingMode: 'off', unsupportedLanguageMode: 'review_only' },
    all: { enabled: true, aiRoutingMode: 'all', unsupportedLanguageMode: 'ai_review' }
  }[mode] || { enabled: true, aiRoutingMode: 'ambiguous', unsupportedLanguageMode: 'ai_review' };
  sessionFilterEnabled.checked = mapped.enabled;
  sessionFilterAiRouting.value = mapped.aiRoutingMode;
  sessionUnsupportedLanguageMode.value = mapped.unsupportedLanguageMode;
  sessionTranslationFilterEnabled.checked = true;
  await saveSessionFilterSettings(saveSessionFilterSimpleButton, '設定を保存');
}

async function saveSessionFilterSettings(button = saveSessionFilterButton, label = '詳細設定を保存') {
  await withButton(button, label, async () => {
    try {
      const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/filter-settings`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: sessionFilterEnabled.checked,
          aiRoutingMode: sessionFilterAiRouting.value,
          maskCharacter: sessionFilterMaskCharacter.value,
          translationFilterEnabled: sessionTranslationFilterEnabled.checked,
          unsupportedLanguageMode: sessionUnsupportedLanguageMode.value
        })
      });
      sessionFilterSimpleMode.value = simpleModeFromSessionSettings(data.settings);
      sessionFilterStatus.textContent = data.settings.enabled ? '辞書フィルターを有効にしました。' : '辞書フィルターを無効にしました。';
    } catch (error) {
      displayError(error, (text) => { sessionFilterStatus.textContent = text; });
    }
  });
}

async function loadOrganizationAiSettings() {
  if (!organizationAiSection || !['owner', 'admin'].includes(currentIdentity?.organization?.role)) return;
  organizationAiStatus.textContent = '組織AI設定を読み込んでいます。';
  try {
    const data = await api('/api/org/ai-settings');
    organizationAiEnabled.checked = Boolean(data.settings.enabled);
    aiModerationDailyLimit.value = String(data.settings.moderationDailyLimit);
    aiTranslationDailyLimit.value = String(data.settings.translationDailyLimit);
    const editable = currentIdentity?.organization?.role === 'owner';
    organizationAiEnabled.disabled = !editable;
    aiModerationDailyLimit.disabled = !editable;
    aiTranslationDailyLimit.disabled = !editable;
    saveOrganizationAiButton.disabled = !editable;
    organizationAiStatus.textContent = editable
      ? `現在: ${data.settings.enabled ? '有効' : '無効'}。設定変更はOwnerだけができます。`
      : `現在: ${data.settings.enabled ? '有効' : '無効'}。閲覧のみです。`;
  } catch (error) {
    displayError(error, (text) => { organizationAiStatus.textContent = text; });
  }
}

async function saveOrganizationAiSettings() {
  await withButton(saveOrganizationAiButton, '組織AI設定を保存', async () => {
    try {
      const data = await api('/api/org/ai-settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: organizationAiEnabled.checked,
          moderationDailyLimit: Number(aiModerationDailyLimit.value),
          translationDailyLimit: Number(aiTranslationDailyLimit.value)
        })
      });
      organizationAiStatus.textContent = `保存しました。現在: ${data.settings.enabled ? '有効' : '無効'}`;
      if (sessionId) await loadSessionAiSettings();
    } catch (error) {
      displayError(error, (text) => { organizationAiStatus.textContent = text; });
    }
  });
}

async function loadSessionAiSettings() {
  if (!sessionId || !sessionAiSection) return;
  sessionAiStatus.textContent = '授業AI設定を読み込んでいます。';
  try {
    const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/ai-settings`);
    sessionAiModerationEnabled.checked = Boolean(data.settings.moderationEnabled);
    sessionAiTranslationEnabled.checked = Boolean(data.settings.translationEnabled);
    sessionAiTargetLanguage.value = data.settings.targetLanguage || 'ja';
    sessionAiStatus.textContent = data.settings.organizationEnabled
      ? '組織AIは有効です。設定を保存すると既存コメントも最大100件処理します。'
      : '組織AIが無効です。授業設定を保存しても外部AIは実行されません。';
    sessionAiModerationEnabled.disabled = !data.settings.organizationEnabled;
    sessionAiTranslationEnabled.disabled = !data.settings.organizationEnabled;
    sessionAiTargetLanguage.disabled = !data.settings.organizationEnabled || !data.settings.translationEnabled;
    saveSessionAiButton.disabled = !data.settings.organizationEnabled;
  } catch (error) {
    displayError(error, (text) => { sessionAiStatus.textContent = text; });
  }
}

async function saveSessionAiSettings() {
  await withButton(saveSessionAiButton, '授業AI設定を保存', async () => {
    try {
      const data = await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/ai-settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          moderationEnabled: sessionAiModerationEnabled.checked,
          translationEnabled: sessionAiTranslationEnabled.checked,
          targetLanguage: sessionAiTargetLanguage.value
        })
      });
      sessionAiStatus.textContent = `保存しました。AI処理を${data.queuedJobs}件投入しました。`;
      await loadModerationComments();
    } catch (error) {
      displayError(error, (text) => { sessionAiStatus.textContent = text; });
    }
  });
}

async function openLocalLogDatabase() {
  if (!('indexedDB' in window)) throw new Error('INDEXED_DB_UNAVAILABLE');
  return new Promise((resolve, reject) => {
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
}

async function readLocalLogs() {
  const database = await openLocalLogDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LOG_STORE_NAME, 'readonly');
    const index = transaction.objectStore(LOG_STORE_NAME).index('sessionId');
    const request = index.getAll(IDBKeyRange.only(sessionId));
    request.addEventListener('success', () => {
      resolve((request.result || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    });
    request.addEventListener('error', () => reject(request.error || new Error('LOCAL_LOG_READ_FAILED')));
  });
}

async function loadLocalLogs() {
  if (!adminLocalLogBody || !sessionId) return;
  adminLocalLogState.textContent = 'ログを確認しています。';
  try {
    const logs = await readLocalLogs();
    const signature = logs.map((entry) => `${entry.id}:${entry.receivedAt || ''}`).join('|');
    if (signature === lastLocalLogSignature && adminLocalLogBody.childElementCount > 0) {
      adminLocalLogState.textContent = `この端末に ${logs.length}件保存されています。自動更新中`;
      return;
    }
    lastLocalLogSignature = signature;
    adminLocalLogBody.textContent = '';
    if (logs.length === 0) {
      const row = adminLocalLogBody.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 3;
      cell.className = 'muted';
      cell.textContent = 'この端末に保存されたコメントはありません。投影画面が受信したコメントのみ表示されます。';
    } else {
      for (const entry of logs) {
        const row = adminLocalLogBody.insertRow();
        appendLogCell(row, formatLogDate(entry.createdAt));
        appendLogCell(row, entry.nickname || '匿名');
        appendLogCell(row, entry.message || '', 'local-log-message');
      }
    }
    adminLocalLogState.textContent = `この端末に ${logs.length}件保存されています。自動更新中`;
  } catch (error) {
    console.error('Local log load failed', error);
    adminLocalLogState.textContent = 'このブラウザでは端末ログを読み込めませんでした。';
  }
}

function appendLogCell(row, value, className = '') {
  const cell = row.insertCell();
  cell.textContent = value;
  if (className) cell.className = className;
}

function formatLogDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString('ja-JP');
}

addFilterTermButton?.addEventListener('click', addFilterTerm);
cancelFilterTermEditButton?.addEventListener('click', resetFilterTermForm);
applyOrganizationFilterPresetButton?.addEventListener('click', applyOrganizationFilterPreset);
installJapaneseFilterPackButton?.addEventListener('click', () => installFilterPack('ja-core-v1', installJapaneseFilterPackButton));
installEnglishFilterPackButton?.addEventListener('click', () => installFilterPack('en-core-v1', installEnglishFilterPackButton));
installJapaneseContextFilterPackButton?.addEventListener('click', () => installFilterPack('ja-context-v1', installJapaneseContextFilterPackButton));
installEnglishContextFilterPackButton?.addEventListener('click', () => installFilterPack('en-context-v1', installEnglishContextFilterPackButton));
exportFilterTermsButton?.addEventListener('click', exportFilterTermsCsv);
saveFilterPoliciesButton?.addEventListener('click', saveFilterPolicies);
saveSessionFilterSimpleButton?.addEventListener('click', saveSessionFilterSimpleSettings);
saveSessionFilterButton?.addEventListener('click', () => saveSessionFilterSettings());
saveOrganizationAiButton?.addEventListener('click', saveOrganizationAiSettings);
saveSessionAiButton?.addEventListener('click', saveSessionAiSettings);
sessionAiTranslationEnabled?.addEventListener('change', () => {
  sessionAiTargetLanguage.disabled = !sessionAiTranslationEnabled.checked || saveSessionAiButton.disabled;
});

refreshLocalLogButton?.addEventListener('click', loadLocalLogs);
localLogChannel?.addEventListener('message', (event) => {
  if (event.data?.sessionId === sessionId) scheduleLocalLogRefresh(50);
});

function scheduleLocalLogRefresh(delay = 0) {
  clearTimeout(localLogRefreshTimer);
  localLogRefreshTimer = setTimeout(() => loadLocalLogs(), delay);
}

setInterval(() => {
  if (sessionId && !sessionSection.classList.contains('hidden') && document.visibilityState === 'visible') {
    scheduleLocalLogRefresh();
  }
}, 5000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && sessionId) scheduleLocalLogRefresh();
});

copyJoinButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(joinUrlEl.textContent);
    setStatus('学生リンクをコピーしました。');
  } catch {
    setStatus('コピーに失敗しました。リンクを手動でコピーしてください。', true);
  }
});

openViewerButton.addEventListener('click', () => {
  const opened = window.open(viewerUrlEl.textContent, '_blank');
  if (!opened) setStatus('投影画面を開けませんでした。リンクを手動で開いてください。', true);
});

togglePostingButton.addEventListener('click', () => updateSettings(
  { postingEnabled: !currentSession.postingEnabled },
  togglePostingButton,
  currentSession.postingEnabled ? '投稿を停止' : '投稿を再開'
));

toggleCommentsButton.addEventListener('click', () => updateSettings(
  { commentsVisible: !currentSession.commentsVisible },
  toggleCommentsButton,
  currentSession.commentsVisible ? 'コメント表示OFF' : 'コメント表示ON'
));

commentDisplaySeconds.addEventListener('change', async () => {
  commentDisplaySeconds.disabled = true;
  try {
    await updateSettings({ commentDisplaySeconds: Number(commentDisplaySeconds.value) }, null, '');
  } finally {
    commentDisplaySeconds.disabled = false;
  }
});

commentDisplayMode.addEventListener('change', async () => {
  commentDisplayMode.disabled = true;
  updateDisplaySettingLabels();
  try {
    await updateSettings({ commentDisplayMode: normalizeDisplayMode(commentDisplayMode.value) }, null, '');
  } finally {
    commentDisplayMode.disabled = false;
  }
});

moderationMode.addEventListener('change', async () => {
  moderationMode.disabled = true;
  try {
    await updateSettings({ moderationMode: moderationMode.value }, null, '');
  } finally {
    moderationMode.disabled = false;
  }
});

refreshAnalyticsButton?.addEventListener('click', () => Promise.all([loadPdfState(), loadSessionAnalytics(), loadAnalyticsSnapshots()]));
createAnalyticsSnapshotButton?.addEventListener('click', createAnalyticsSnapshot);
analyticsSnapshotSelect?.addEventListener('change', () => {
  downloadAnalyticsSnapshotButton.disabled = !analyticsSnapshotSelect.value;
});
downloadAnalyticsSnapshotButton?.addEventListener('click', downloadSelectedAnalyticsSnapshot);

moderationStateFilter?.addEventListener('change', () => loadModerationComments());
refreshModerationButton?.addEventListener('click', () => loadModerationComments());
bulkApproveButton?.addEventListener('click', () => runBulkModeration('approve', bulkApproveButton));
bulkHideButton?.addEventListener('click', () => runBulkModeration('hide', bulkHideButton));
bulkRestoreButton?.addEventListener('click', () => runBulkModeration('restore', bulkRestoreButton));
bulkDeleteButton?.addEventListener('click', () => runBulkModeration('delete', bulkDeleteButton));

clearCommentsButton.addEventListener('click', () => withButton(clearCommentsButton, '表示コメントを消去', async () => {
  try {
    await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments/clear`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    setStatus('表示コメントを消去しました。');
  } catch (error) {
    displayError(error);
  }
}));

endSessionButton.addEventListener('click', async () => {
  if (!confirm('授業を終了し、投稿を停止しますか。')) return;
  await updateSettings({ postingEnabled: false, status: 'ended' }, endSessionButton, '授業終了');
});

deleteSessionButton.addEventListener('click', async () => {
  if (!confirm('この授業を一覧から消しますか。学生投稿も止まります。')) return;
  await api(`/api/private/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' });
  location.href = '/admin';
});

async function updateSettings(partial, button, label) {
  const run = async () => {
    try {
      const body = {
        postingEnabled: currentSession.postingEnabled,
        commentsVisible: currentSession.commentsVisible,
        commentDisplaySeconds: normalizeDisplaySeconds(currentSession.commentDisplaySeconds),
        commentDisplayMode: normalizeDisplayMode(currentSession.commentDisplayMode),
        moderationMode: currentSession.moderationMode === 'pre' ? 'pre' : 'off',
        status: currentSession.status,
        ...partial
      };
      await api(`/api/private/sessions/${encodeURIComponent(sessionId)}/settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      setStatus('設定を更新しました。');
      if (body.status === 'ended') location.href = '/admin';
      else await loadSession();
    } catch (error) {
      displayError(error);
    }
  };
  if (button) await withButton(button, label, run);
  else await run();
}

function normalizeDisplaySeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 60;
  return Math.min(300, Math.max(10, Math.round(seconds)));
}

function formatDisplaySeconds(value) {
  const seconds = normalizeDisplaySeconds(value);
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}分`;
  return `${seconds}秒`;
}

function normalizeDisplayMode(value) {
  return ['stack3', 'stack5', 'stack7', 'scroll'].includes(value) ? value : 'stack3';
}

function formatDisplayMode(value) {
  return {
    stack3: '3件',
    stack5: '5件',
    stack7: '7件',
    scroll: '横流れ'
  }[normalizeDisplayMode(value)];
}

function formatScrollSpeed(value) {
  return {
    10: '最高速',
    30: '速い',
    60: '標準',
    120: '遅い',
    300: 'とても遅い'
  }[normalizeDisplaySeconds(value)] || '標準';
}

function updateDisplaySettingLabels() {
  const scrolling = commentDisplayMode.value === 'scroll';
  commentDisplaySecondsLabel.textContent = scrolling ? '速度' : '表示時間';
  for (const option of commentDisplaySeconds.options) {
    option.textContent = scrolling ? option.dataset.speedLabel : option.dataset.timeLabel;
  }
}

function formatRemaining(endsAt) {
  const ms = Date.parse(endsAt || '') - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return '終了';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.ceil((ms % 3600000) / 60000);
  if (hours <= 0) return `${minutes}分`;
  return `${hours}時間${minutes}分`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

async function boot() {
  try {
    await verifySession();
    if (sessionId) await loadSession();
    else {
      showAdminTop();
      await loadActiveSessions();
      await Promise.all([loadOrganizationAiSettings(), loadOrganizationFilterSettings()]);
    }
  } catch (error) {
    if (error.status === 401) showLogin();
    else displayError(error, setLoginStatus);
  }
}

boot();
