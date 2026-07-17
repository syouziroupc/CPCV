const publicCodeInput = document.getElementById('homePublicCode');
const joinButton = document.getElementById('homeJoinButton');
const statusEl = document.getElementById('homeJoinStatus');

function normalizedPublicCode() {
  return publicCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function updateCode() {
  const code = normalizedPublicCode();
  publicCodeInput.value = code;
  joinButton.disabled = code.length !== 6;
  statusEl.textContent = '';
}

function joinClass() {
  const code = normalizedPublicCode();
  if (code.length !== 6) {
    statusEl.textContent = '6文字の合言葉を入力してください。';
    statusEl.style.color = '#dc2626';
    return;
  }
  location.href = `/j/${encodeURIComponent(code)}`;
}

publicCodeInput.addEventListener('input', updateCode);
publicCodeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinClass();
});
joinButton.addEventListener('click', joinClass);
updateCode();
