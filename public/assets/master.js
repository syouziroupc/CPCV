const $ = (id) => document.getElementById(id);
const loginSection = $('masterLoginSection');
const masterPanel = $('masterPanel');
const masterLoginId = $('masterLoginId');
const masterPassword = $('masterPassword');
const masterOrganizationGroup = $('masterOrganizationGroup');
const masterOrganization = $('masterOrganization');
const masterLoginButton = $('masterLoginButton');
const masterLogoutButton = $('masterLogoutButton');
const masterLoginStatus = $('masterLoginStatus');
const masterStatus = $('masterStatus');
const masterTimeLeft = $('masterTimeLeft');
const organizationName = $('organizationName');
const organizationRole = $('organizationRole');
const memberEmail = $('memberEmail');
const memberRole = $('memberRole');
const inviteMemberButton = $('inviteMemberButton');
const quotaStatus = $('quotaStatus');
const invitationList = $('invitationList');
const memberList = $('memberList');
const masterSessionList = $('masterSessionList');
const auditList = $('auditList');

let csrfToken = '';
let identity = null;
let expiresAt = '';

function show(element, visible) { element?.classList.toggle('hidden', !visible); }
function setStatus(text, error = false) { masterStatus.textContent = text; masterStatus.style.color = error ? '#dc2626' : '#2563eb'; }
function setLoginStatus(text, error = false) { masterLoginStatus.textContent = text; masterLoginStatus.style.color = error ? '#dc2626' : '#2563eb'; }

async function api(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('x-csrf-token', csrfToken);
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...options, method, headers });
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

function showLogin(message = '', error = false) {
  show(loginSection, true); show(masterPanel, false); show(masterLogoutButton, false);
  csrfToken = ''; identity = null; expiresAt = '';
  setLoginStatus(message, error); masterLoginId.focus();
}
function showPanel() { show(loginSection, false); show(masterPanel, true); show(masterLogoutButton, true); }

function applyIdentity(data) {
  csrfToken = data.csrfToken || csrfToken;
  identity = data;
  expiresAt = data.session?.absoluteExpiresAt || '';
  organizationName.textContent = data.organization?.name || '組織';
  organizationRole.textContent = `${data.user?.displayName || data.user?.email || ''} / ${roleLabel(data.organization?.role)}`;
  const owner = data.organization?.role === 'owner';
  for (const option of memberRole.options) option.hidden = !owner && option.value !== 'teacher';
  if (!owner) memberRole.value = 'teacher';
  updateTimeLeft();
}

masterLoginButton.addEventListener('click', async () => {
  const account = masterLoginId.value.trim();
  const password = masterPassword.value;
  if (!account || !password) return setLoginStatus('メールアドレスとパスワードを入力してください。', true);
  const body = account.includes('@') ? { email: account, password } : { loginId: account, password };
  if (!masterOrganizationGroup.classList.contains('hidden') && masterOrganization.value) body.organizationId = masterOrganization.value;
  masterLoginButton.disabled = true;
  masterLoginButton.textContent = '処理中...';
  try {
    const data = await api('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!['owner', 'admin'].includes(data.organization?.role)) {
      await logoutSilently(data.csrfToken);
      return setLoginStatus('この画面はOwnerまたはAdmin専用です。', true);
    }
    masterPassword.value = '';
    show(masterOrganizationGroup, false);
    applyIdentity(data); showPanel(); await loadPanel();
  } catch (error) {
    if (error.code === 'ORGANIZATION_SELECTION_REQUIRED') {
      masterOrganization.textContent = '';
      for (const org of error.data.organizations || []) {
        if (!['owner', 'admin'].includes(org.role)) continue;
        const option = document.createElement('option'); option.value = org.id; option.textContent = `${org.name} (${roleLabel(org.role)})`; masterOrganization.appendChild(option);
      }
      if (!masterOrganization.options.length) return setLoginStatus('管理可能な組織がありません。', true);
      show(masterOrganizationGroup, true); return setLoginStatus('組織を選択してもう一度ログインしてください。');
    }
    setLoginStatus(`ログインできません: ${error.code || error.message}`, true);
  } finally { masterLoginButton.disabled = false; masterLoginButton.textContent = 'ログイン'; }
});
masterPassword.addEventListener('keydown', (event) => { if (event.key === 'Enter') masterLoginButton.click(); });
masterLoginId.addEventListener('keydown', (event) => { if (event.key === 'Enter') masterPassword.focus(); });
masterLogoutButton.addEventListener('click', async () => { await logoutSilently(csrfToken); showLogin('ログアウトしました。'); });

async function logoutSilently(token) {
  const previous = csrfToken; csrfToken = token || csrfToken;
  try { await api('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); } catch {}
  csrfToken = previous;
}

inviteMemberButton.addEventListener('click', async () => {
  const body = { email: memberEmail.value.trim(), role: memberRole.value };
  if (!body.email.includes('@')) return setStatus('招待先メールアドレスを確認してください。', true);
  inviteMemberButton.disabled = true; inviteMemberButton.textContent = '送信中...';
  try {
    await api('/api/org/invitations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    memberEmail.value = '';
    setStatus('招待メールを送信しました。');
    await Promise.all([loadInvitations(), loadMembers()]);
  } catch (error) { setStatus(`招待できません: ${error.code || error.message}`, true); }
  finally { inviteMemberButton.disabled = false; inviteMemberButton.textContent = '招待メールを送る'; }
});

async function loadPanel() {
  const [sessionData, organizationData] = await Promise.all([api('/api/auth/session'), api('/api/org')]);
  applyIdentity(sessionData); organizationName.textContent = organizationData.organization.name;
  await Promise.all([loadInvitations(), loadMembers(), loadSessions(), loadAuditLogs()]);
}

async function loadInvitations() {
  const data = await api('/api/org/invitations');
  invitationList.textContent = '';
  const q = data.quota;
  quotaStatus.textContent = q ? `メンバー ${q.activeMembers}/${q.activeMemberLimit} / 未承認招待 ${q.pendingInvitations}/${q.pendingInvitationLimit} / 本日の招待メール ${q.invitationEmailsToday}/${q.invitationEmailDailyLimit}` : '';
  if (!data.invitations.length) return invitationList.appendChild(mutedText('未承認の招待はありません。'));
  for (const invitation of data.invitations) invitationList.appendChild(renderInvitation(invitation));
}

function renderInvitation(invitation) {
  const item = document.createElement('div'); item.className = 'teacher-item';
  const summary = document.createElement('div');
  const title = document.createElement('strong'); title.textContent = invitation.email;
  const detail = document.createElement('div'); detail.className = 'muted'; detail.textContent = `${roleLabel(invitation.role)} / 有効期限 ${new Date(invitation.expiresAt).toLocaleString('ja-JP')}`;
  summary.append(title, document.createElement('br'), detail);
  const actions = document.createElement('div'); actions.className = 'row wrap';
  actions.append(
    actionButton('再送', 'button', async () => {
      await api(`/api/org/invitations/${encodeURIComponent(invitation.id)}/resend`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      setStatus('招待メールを再送しました。'); await loadInvitations();
    }),
    actionButton('取消', 'button danger', async () => {
      if (!confirm(`${invitation.email} への招待を取り消しますか。`)) return;
      await api(`/api/org/invitations/${encodeURIComponent(invitation.id)}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' });
      setStatus('招待を取り消しました。'); await loadInvitations();
    })
  );
  item.append(summary, actions); return item;
}

async function loadMembers() {
  const data = await api('/api/org/members?limit=100'); memberList.textContent = '';
  if (!data.members.length) return memberList.appendChild(mutedText('メンバーはいません。'));
  for (const member of data.members) memberList.appendChild(renderMember(member));
}

function renderMember(member) {
  const item = document.createElement('div'); item.className = 'teacher-item';
  const summary = document.createElement('div');
  const title = document.createElement('strong'); title.textContent = member.displayName;
  const account = document.createElement('div'); account.className = 'mono'; account.textContent = member.email || 'メール未登録';
  const state = document.createElement('div'); state.className = 'muted'; state.textContent = `${roleLabel(member.role)} / ${statusLabel(member.status)}${member.emailVerified ? '' : ' / メール未確認'}`;
  summary.append(title, document.createElement('br'), account, state);
  const actions = document.createElement('div'); actions.className = 'row wrap';
  const canManage = identity.organization.role === 'owner' || (identity.organization.role === 'admin' && member.role === 'teacher');
  const self = member.userId === identity.user.id;
  if (canManage && !self && member.status !== 'removed') {
    if (identity.organization.role === 'owner') {
      const select = document.createElement('select'); select.className = 'select';
      for (const role of ['teacher', 'admin', 'owner']) { const option = document.createElement('option'); option.value = role; option.textContent = roleLabel(role); option.selected = role === member.role; select.appendChild(option); }
      select.addEventListener('change', async () => {
        try { await updateMember(member.userId, { role: select.value }); setStatus('権限を変更しました。'); await loadMembers(); }
        catch (error) { select.value = member.role; setStatus(`権限を変更できません: ${error.code}`, true); }
      }); actions.appendChild(select);
    }
    actions.append(
      actionButton(member.status === 'active' ? '停止' : '再開', member.status === 'active' ? 'button danger' : 'button primary', async () => {
        await updateMember(member.userId, { status: member.status === 'active' ? 'suspended' : 'active' }); setStatus(member.status === 'active' ? 'メンバーを停止しました。' : 'メンバーを再開しました。'); await loadMembers();
      }),
      actionButton('再設定メール', 'button', () => issueReset(member), !member.emailVerified),
      actionButton('解除', 'button danger', () => removeMember(member))
    );
  }
  item.append(summary, actions); return item;
}

async function updateMember(userId, patch) { return api(`/api/org/members/${encodeURIComponent(userId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }); }
async function issueReset(member) {
  if (!confirm(`${member.displayName} へパスワード再設定メールを送りますか。`)) return;
  try {
    await api(`/api/org/members/${encodeURIComponent(member.userId)}/password-reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    setStatus('パスワード再設定メールを送信しました。');
  } catch (error) { setStatus(`再設定メールを送信できません: ${error.code}`, true); }
}
async function removeMember(member) {
  if (!confirm(`${member.displayName} の組織所属を解除しますか。`)) return;
  try { await api(`/api/org/members/${encodeURIComponent(member.userId)}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' }); setStatus('組織所属を解除しました。'); await loadMembers(); }
  catch (error) { setStatus(`解除できません: ${error.code}`, true); }
}

async function loadSessions() {
  const data = await api('/api/private/sessions'); masterSessionList.textContent = '';
  if (!data.sessions.length) return masterSessionList.appendChild(mutedText('進行中の授業はありません。'));
  for (const session of data.sessions) masterSessionList.appendChild(renderSession(session));
}
function renderSession(session) {
  const item = document.createElement('div'); item.className = 'teacher-item';
  const summary = document.createElement('div'); const title = document.createElement('strong'); title.textContent = session.title;
  const detail = document.createElement('div'); detail.className = 'muted'; detail.textContent = `作成者: ${session.createdByUserId} / ${new Date(session.createdAt).toLocaleString('ja-JP')}`;
  summary.append(title, document.createElement('br'), detail);
  const actions = document.createElement('div'); actions.className = 'row wrap'; actions.append(
    actionButton('開く', 'button primary', () => { location.href = `/admin/${encodeURIComponent(session.id)}`; }),
    actionButton('終了', 'button', () => endSession(session)), actionButton('削除', 'button danger', () => deleteSession(session))
  ); item.append(summary, actions); return item;
}
async function endSession(session) { if (!confirm(`「${session.title}」を終了しますか。`)) return; await api(`/api/private/sessions/${encodeURIComponent(session.id)}/settings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'ended' }) }); setStatus('授業を終了しました。'); await loadSessions(); }
async function deleteSession(session) { if (!confirm(`「${session.title}」を削除しますか。`)) return; await api(`/api/private/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' }); setStatus('授業を削除しました。'); await loadSessions(); }

async function loadAuditLogs() {
  const data = await api('/api/org/audit-logs?limit=50'); auditList.textContent = '';
  if (!data.logs.length) return auditList.appendChild(mutedText('監査ログはありません。'));
  for (const log of data.logs) {
    const item = document.createElement('div'); item.className = 'teacher-item'; const summary = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = log.action;
    const detail = document.createElement('div'); detail.className = 'muted'; detail.textContent = `${new Date(log.createdAt).toLocaleString('ja-JP')} / ${log.actorRole || log.actorType}${log.targetId ? ` / ${log.targetId}` : ''}`;
    summary.append(title, document.createElement('br'), detail); item.appendChild(summary); auditList.appendChild(item);
  }
}

$('refreshInvitationsButton').addEventListener('click', () => loadInvitations().catch(showApiError));
$('refreshMembersButton').addEventListener('click', () => loadMembers().catch(showApiError));
$('refreshSessionsButton').addEventListener('click', () => loadSessions().catch(showApiError));
$('refreshAuditButton').addEventListener('click', () => loadAuditLogs().catch(showApiError));

function actionButton(label, className, handler, disabled = false) {
  const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label; button.disabled = disabled;
  button.addEventListener('click', async () => { button.disabled = true; try { await handler(); } catch (error) { showApiError(error); } finally { if (!disabled) button.disabled = false; } });
  return button;
}
function mutedText(text) { const element = document.createElement('p'); element.className = 'muted'; element.textContent = text; return element; }
function roleLabel(role) { return { owner: 'Owner', admin: 'Admin', teacher: 'Teacher' }[role] || role || ''; }
function statusLabel(status) { return { active: '有効', suspended: '停止', removed: '解除済み' }[status] || status; }
function updateTimeLeft() { const ms = Date.parse(expiresAt || '') - Date.now(); if (!Number.isFinite(ms) || ms <= 0) return masterTimeLeft.textContent = 'Session期限切れ'; const hours = Math.floor(ms / 3600000); const minutes = Math.ceil((ms % 3600000) / 60000); masterTimeLeft.textContent = `Session残り ${hours}時間${minutes}分`; }
function showApiError(error) { if (error?.status === 401) return showLogin('Sessionが切れました。もう一度ログインしてください。', true); setStatus(`操作できません: ${error?.code || error?.message || 'API_ERROR'}`, true); }

async function boot() {
  try { const data = await api('/api/auth/session'); if (!['owner', 'admin'].includes(data.organization?.role)) return showLogin('この画面はOwnerまたはAdmin専用です。', true); applyIdentity(data); showPanel(); await loadPanel(); }
  catch (error) { if (error.status === 401) showLogin(); else showLogin(`起動できません: ${error.code || error.message}`, true); }
}
setInterval(updateTimeLeft, 30_000); boot();
