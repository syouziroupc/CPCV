const publicCode = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '').toUpperCase();
const titleEl = document.getElementById('classTitle');
const postingEl = document.getElementById('postingState');
const nicknameEl = document.getElementById('nickname');
const messageEl = document.getElementById('message');
const counterEl = document.getElementById('counter');
const sendButton = document.getElementById('sendButton');
const statusEl = document.getElementById('status');
const understandingSection = document.getElementById('understandingSection');
const understandingStatus = document.getElementById('understandingStatus');
const understandingButtons = [...document.querySelectorAll('.understanding-button')];

let postingEnabled = false;
let requiresApproval = false;
let pendingSubmission = null;
let understandingEnabled = false;
let currentPdfState = null;
let sessionRefreshTimer = 0;

function codePointLength(value) { return Array.from(String(value || '')).length; }
function truncateCodePoints(value, limit) { return Array.from(String(value || '')).slice(0, limit).join(''); }

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#dc2626' : '#2563eb';
}

async function loadSession() {
  try {
    const response = await fetch(`/api/public/sessions/${encodeURIComponent(publicCode)}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'SESSION_ERROR');
    titleEl.textContent = data.title || '授業コメント';
    postingEnabled = Boolean(data.postingEnabled);
    requiresApproval = Boolean(data.requiresApproval);
    understandingEnabled = Boolean(data.understandingEnabled && data.pdfState);
    currentPdfState = understandingEnabled ? data.pdfState : null;
    understandingSection.classList.toggle('hidden', !understandingEnabled);
    postingEl.textContent = postingEnabled
      ? requiresApproval ? '投稿できます。コメントは先生の承認後に表示されます。' : '投稿できます。'
      : '現在投稿停止中です。';
    sendButton.disabled = !postingEnabled || messageEl.value.trim().length === 0;
  } catch (error) {
    titleEl.textContent = '授業が見つかりません';
    postingEl.textContent = '授業コードを確認してください。';
    sendButton.disabled = true;
    understandingEnabled = false;
    currentPdfState = null;
    understandingSection.classList.add('hidden');
    setStatus(error.message, true);
  }
}

nicknameEl.addEventListener('input', () => {
  const truncated = truncateCodePoints(nicknameEl.value, 20);
  if (nicknameEl.value !== truncated) nicknameEl.value = truncated;
  pendingSubmission = null;
});

messageEl.addEventListener('input', () => {
  pendingSubmission = null;
  const len = codePointLength(messageEl.value);
  counterEl.textContent = `${len} / 140`;
  sendButton.disabled = !postingEnabled || len === 0 || len > 140;
});

sendButton.addEventListener('click', async () => {
  const message = messageEl.value.trim();
  if (!message) return;
  sendButton.disabled = true;
  setStatus('送信中...');
  try {
    const nickname = nicknameEl.value.trim();
    if (!pendingSubmission || pendingSubmission.message !== message || pendingSubmission.nickname !== nickname) {
      pendingSubmission = { nickname, message, idempotencyKey: crypto.randomUUID() };
    }
    const response = await fetch(`/api/public/sessions/${encodeURIComponent(publicCode)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(pendingSubmission)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'SEND_FAILED');
    messageEl.value = '';
    counterEl.textContent = '0 / 140';
    pendingSubmission = null;
    setStatus(data.duplicate ? '送信済みのコメントを確認しました。' : data.moderationState === 'pending' ? '承認待ちとして送信しました。' : data.filter?.action === 'mask' ? '一部を伏字にして送信しました。' : '送信しました。');
  } catch (error) {
    const map = {
      RATE_LIMITED: '連投制限中です。10秒ほど待ってください。',
      POSTING_CLOSED: '現在投稿停止中です。',
      URL_NOT_ALLOWED: 'URLは投稿できません。',
      CONTENT_REJECTED: 'この投稿は授業の投稿ルールにより送信できません。',
      MESSAGE_TOO_LONG: '140字以内にしてください。',
      IDEMPOTENCY_KEY_INVALID: '送信識別子が不正です。ページを再読み込みしてください。'
    };
    setStatus(map[error.message] || `送信失敗: ${error.message}`, true);
  } finally {
    sendButton.disabled = !postingEnabled || messageEl.value.trim().length === 0;
  }
});

for (const button of understandingButtons) {
  button.addEventListener('click', async () => {
    if (!understandingEnabled || !currentPdfState) return;
    understandingButtons.forEach((item) => { item.disabled = true; });
    understandingStatus.textContent = '回答を送信しています。';
    understandingStatus.style.color = '#2563eb';
    try {
      const response = await fetch(`/api/public/sessions/${encodeURIComponent(publicCode)}/understanding`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signal: button.dataset.signal, ...currentPdfState })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'SIGNAL_FAILED');
      understandingStatus.textContent = data.duplicate ? 'このページには同じ回答を送信済みです。' : 'このページの理解度を回答しました。';
    } catch (error) {
      const map = {
        PDF_PAGE_NOT_ACTIVE: '現在は理解度を回答できません。',
        PDF_PAGE_CHANGED: 'ページが切り替わりました。再読み込みしてもう一度回答してください。',
        PDF_BINDING_STALE: 'PDFが切り替わりました。再読み込みしてください。',
        SIGNAL_RATE_LIMITED: '少し待ってから変更してください。',
        RATE_LIMITED: '送信回数が多すぎます。少し待ってください。',
        UNDERSTANDING_WRITE_CONFLICT: 'ページ状態が更新されました。再読み込みしてもう一度回答してください。',
        POSTING_CLOSED: '授業は終了しています。'
      };
      understandingStatus.textContent = map[error.message] || `回答失敗: ${error.message}`;
      understandingStatus.style.color = '#dc2626';
    } finally {
      await loadSession();
      understandingButtons.forEach((item) => { item.disabled = !understandingEnabled; });
    }
  });
}

function scheduleSessionRefresh() {
  clearInterval(sessionRefreshTimer);
  sessionRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') loadSession();
  }, 15_000);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadSession();
});

loadSession();
scheduleSessionRefresh();
