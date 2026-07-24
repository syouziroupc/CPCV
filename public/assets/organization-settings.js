const $ = (id) => document.getElementById(id);
const section = $('organizationSettings');
if (section) {
  let csrfToken = '';
  let identity = null;
  let filterData = { categories: [], languages: [], policies: [], terms: [], packs: [], termLimit: 2000 };
  let editingTermId = '';

  const POLICY_PRESETS = Object.freeze({
    standard: {
      sexual: [2, 3, 5], profanity: [2, 3, 5], harassment: [3, 4, 5], discrimination: [2, 4, 5],
      violence: [3, 4, 5], personal_info: [1, 2, 5], spam: [2, 3, 5], illegal: [3, 4, 5], custom: [3, 4, 5]
    },
    strict: {
      sexual: [1, 2, 5], profanity: [1, 2, 5], harassment: [2, 3, 5], discrimination: [1, 3, 5],
      violence: [2, 3, 5], personal_info: [1, 2, 5], spam: [1, 2, 5], illegal: [2, 3, 5], custom: [2, 3, 5]
    }
  });

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
      error.code = data.error || 'API_ERROR';
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function setStatus(id, text, error = false) {
    const node = $(id);
    if (!node) return;
    node.textContent = text;
    node.style.color = error ? '#dc2626' : '';
  }

  function errorText(error) {
    return ({
      FORBIDDEN: 'この設定を変更する権限がありません。',
      FILTER_TERM_LIMIT_REACHED: '登録できる語句数の上限に達しました。',
      FILTER_TERM_DUPLICATE: '同じ語句がすでに登録されています。',
      FILTER_POLICY_INVALID: '処理基準を確認してください。'
    })[error?.code] || `処理できませんでした。${error?.code ? ` (${error.code})` : ''}`;
  }

  async function withButton(button, label, task) {
    if (!button) return task();
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '処理中...';
    try { return await task(); }
    finally { button.disabled = false; button.textContent = label || original; }
  }

  function ownerEditable() { return identity?.organization?.role === 'owner'; }
  function termEditable() { return ['owner', 'admin'].includes(identity?.organization?.role); }
  function visible() { return termEditable(); }
  function categoryLabel(id) { return filterData.categories.find((item) => item.id === id)?.label || id || '-'; }
  function languageLabel(id) { return filterData.languages.find((item) => item.id === id)?.label || id || '自動'; }
  function boundaryLabel(id) { return ({ auto: '自動', word: '単語', substring: '部分' })[id] || id || '自動'; }

  async function loadIdentity() {
    identity = await api('/api/auth/session');
    csrfToken = identity.csrfToken || '';
    if (!visible()) return;
    section.classList.remove('hidden');
    $('organizationRoleStatus').textContent = `${identity.organization?.name || '組織'} / ${identity.organization?.role || ''}`;
    await Promise.all([loadAiSettings(), loadFilterSettings()]);
  }

  async function loadAiSettings() {
    setStatus('organizationAiStatus', '読み込んでいます。');
    try {
      const data = await api('/api/org/ai-settings');
      $('organizationAiEnabled').checked = Boolean(data.settings.enabled);
      $('aiModerationDailyLimit').value = String(data.settings.moderationDailyLimit);
      $('aiTranslationDailyLimit').value = String(data.settings.translationDailyLimit);
      for (const id of ['organizationAiEnabled', 'aiModerationDailyLimit', 'aiTranslationDailyLimit', 'saveOrganizationAiButton']) $(id).disabled = !ownerEditable();
      setStatus('organizationAiStatus', ownerEditable() ? 'Ownerは変更できます。' : 'AI上限は閲覧のみです。語句の追加と編集はできます。');
    } catch (error) { setStatus('organizationAiStatus', errorText(error), true); }
  }

  async function saveAiSettings() {
    await withButton($('saveOrganizationAiButton'), 'AI設定を保存', async () => {
      try {
        const data = await api('/api/org/ai-settings', {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
            enabled: $('organizationAiEnabled').checked,
            moderationDailyLimit: Number($('aiModerationDailyLimit').value),
            translationDailyLimit: Number($('aiTranslationDailyLimit').value)
          })
        });
        setStatus('organizationAiStatus', `保存しました。AIは${data.settings.enabled ? '利用可能' : '停止中'}です。`);
      } catch (error) { setStatus('organizationAiStatus', errorText(error), true); }
    });
  }

  async function loadFilterSettings() {
    setStatus('organizationFilterStatus', '辞書を読み込んでいます。');
    try {
      filterData = await api('/api/org/content-filter');
      renderCategoryOptions();
      renderTerms();
      renderPolicies();
      renderPackStatus();
      $('organizationFilterPreset').value = inferPreset();
      $('applyOrganizationFilterPresetButton').disabled = !ownerEditable();
      $('addFilterTermButton').disabled = !termEditable();
      setStatus('organizationFilterStatus', `${filterData.terms.length}語を登録中。上限${filterData.termLimit}語。`);
    } catch (error) { setStatus('organizationFilterStatus', errorText(error), true); }
  }

  function renderCategoryOptions() {
    const category = $('filterTermCategory');
    const selectedCategory = category.value;
    category.textContent = '';
    for (const item of filterData.categories || []) category.append(new Option(item.label, item.id));
    if ([...category.options].some((option) => option.value === selectedCategory)) category.value = selectedCategory;
    const language = $('filterTermLanguage');
    const selectedLanguage = language.value || 'und';
    language.textContent = '';
    for (const item of filterData.languages || [{ id: 'und', label: '自動・指定なし' }]) language.append(new Option(item.label, item.id));
    if ([...language.options].some((option) => option.value === selectedLanguage)) language.value = selectedLanguage;
  }

  function renderPackStatus() {
    const packs = filterData.packs || [];
    const byId = (id) => packs.find((pack) => pack.id === id);
    const label = (pack) => pack?.installed ? `導入済み v${pack.installedVersion || pack.version}・${pack.termCount}語` : `未導入・${pack?.termCount || 0}語`;
    $('filterPackStatus').textContent = `日本語基本: ${label(byId('ja-core-v1'))} / 英語基本: ${label(byId('en-core-v1'))} / 日本語文脈: ${label(byId('ja-context-v1'))} / 英語文脈: ${label(byId('en-context-v1'))}`;
    setPackButton($('installJapaneseFilterPackButton'), byId('ja-core-v1'));
    setPackButton($('installEnglishFilterPackButton'), byId('en-core-v1'));
    setPackButton($('installJapaneseContextFilterPackButton'), byId('ja-context-v1'));
    setPackButton($('installEnglishContextFilterPackButton'), byId('en-context-v1'));
  }

  function setPackButton(button, pack) {
    if (!button) return;
    const current = Boolean(pack?.installed && Number(pack.installedVersion) >= Number(pack.version));
    button.disabled = !ownerEditable() || current;
    button.textContent = pack?.installed && !current ? '更新' : button.dataset.defaultLabel;
  }

  async function installPack(packId, button) {
    let installed = false;
    await withButton(button, '導入', async () => {
      try {
        await api(`/api/org/content-filter/packs/${encodeURIComponent(packId)}/install`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        installed = true;
      } catch (error) { setStatus('organizationFilterStatus', errorText(error), true); }
    });
    if (installed) {
      await loadFilterSettings();
      setStatus('organizationFilterStatus', '辞書パックを導入しました。');
    }
  }

  async function ensurePacks(mode) {
    const map = new Map((filterData.packs || []).map((pack) => [pack.id, pack]));
    const ids = mode === 'strict' ? ['ja-core-v1', 'en-core-v1', 'ja-context-v1', 'en-context-v1'] : ['ja-core-v1', 'en-core-v1'];
    for (const id of ids) {
      const pack = map.get(id);
      if (pack?.installed && Number(pack.installedVersion) >= Number(pack.version)) continue;
      await api(`/api/org/content-filter/packs/${encodeURIComponent(id)}/install`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    }
  }

  function inferPreset() {
    if ((filterData.policies || []).every((policy) => !policy.enabled)) return 'off';
    for (const [name, source] of Object.entries(POLICY_PRESETS)) {
      const matches = (filterData.policies || []).every((policy) => {
        const levels = source[policy.category];
        if (!levels) return !policy.enabled;
        return policy.enabled && policy.reviewMinSeverity === levels[0] && policy.maskMinSeverity === levels[1] && policy.rejectMinSeverity === levels[2];
      });
      if (matches) return name;
    }
    return 'custom';
  }

  async function applyPreset() {
    const name = $('organizationFilterPreset').value;
    if (name === 'custom') return setStatus('organizationFilterStatus', '現在の詳細設定を維持します。');
    const source = POLICY_PRESETS[name] || {};
    const policies = (filterData.policies || []).map((policy) => {
      const levels = source[policy.category];
      return { category: policy.category, enabled: Boolean(levels), reviewMinSeverity: levels?.[0] ?? policy.reviewMinSeverity, maskMinSeverity: levels?.[1] ?? policy.maskMinSeverity, rejectMinSeverity: levels?.[2] ?? policy.rejectMinSeverity };
    });
    await withButton($('applyOrganizationFilterPresetButton'), '基本設定を適用', async () => {
      try {
        if (name === 'standard' || name === 'strict') await ensurePacks(name);
        await api('/api/org/content-filter/policies', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policies }) });
        await loadFilterSettings();
        setStatus('organizationFilterStatus', name === 'off' ? '辞書判定を無効にしました。' : `${name === 'strict' ? '厳格' : '推奨'}設定を適用しました。`);
      } catch (error) { setStatus('organizationFilterStatus', errorText(error), true); }
    });
  }

  function renderTerms() {
    const body = $('filterTermsBody');
    body.textContent = '';
    if (!(filterData.terms || []).length) {
      const row = body.insertRow(); const cell = row.insertCell(); cell.colSpan = 8; cell.className = 'muted'; cell.textContent = '登録済みの語句はありません。'; return;
    }
    for (const term of filterData.terms) {
      const row = body.insertRow();
      appendCell(row, term.term); appendCell(row, languageLabel(term.languageCode)); appendCell(row, categoryLabel(term.category)); appendCell(row, term.severity); appendCell(row, boundaryLabel(term.boundaryMode)); appendCell(row, term.fuzzyEnabled ? '使用' : '不使用');
      const activeCell = row.insertCell(); const active = document.createElement('input'); active.type = 'checkbox'; active.checked = Boolean(term.active); active.disabled = !termEditable(); active.setAttribute('aria-label', `${term.term}を有効化`); active.addEventListener('change', () => updateActive(term, active)); activeCell.append(active);
      const actionCell = row.insertCell(); actionCell.className = 'row-actions';
      const edit = button('編集', 'button small', () => beginEdit(term)); const remove = button('削除', 'button small danger', () => deleteTerm(term, remove)); edit.disabled = !termEditable(); remove.disabled = !termEditable(); actionCell.append(edit, remove);
    }
  }

  function appendCell(row, value) { const cell = row.insertCell(); cell.textContent = String(value ?? ''); }
  function button(text, className, handler) { const node = document.createElement('button'); node.type = 'button'; node.className = className; node.textContent = text; node.addEventListener('click', handler); return node; }

  function beginEdit(term) {
    editingTermId = term.id;
    $('filterTermInput').value = term.term;
    $('filterTermCategory').value = term.category;
    $('filterTermSeverity').value = String(term.severity);
    $('filterTermLanguage').value = term.languageCode || 'und';
    $('filterTermBoundary').value = term.boundaryMode || 'auto';
    $('filterTermMatchMode').value = term.matchMode || 'normalized';
    $('filterTermFuzzy').checked = Boolean(term.fuzzyEnabled);
    $('addFilterTermButton').textContent = '変更を保存';
    $('cancelFilterTermEditButton').classList.remove('hidden');
    $('filterTermInput').focus();
  }

  function resetTermForm() {
    editingTermId = '';
    $('filterTermInput').value = '';
    $('filterTermSeverity').value = '3';
    $('filterTermLanguage').value = 'und';
    $('filterTermBoundary').value = 'auto';
    $('filterTermMatchMode').value = 'normalized';
    $('filterTermFuzzy').checked = true;
    $('addFilterTermButton').textContent = '語句を追加';
    $('cancelFilterTermEditButton').classList.add('hidden');
  }

  async function saveTerm() {
    const text = $('filterTermInput').value.trim();
    if (!text) return setStatus('organizationFilterStatus', '語句を入力してください。', true);
    const existing = filterData.terms.find((term) => term.id === editingTermId);
    await withButton($('addFilterTermButton'), existing ? '変更を保存' : '語句を追加', async () => {
      try {
        const payload = { term: text, category: $('filterTermCategory').value, severity: Number($('filterTermSeverity').value), matchMode: $('filterTermMatchMode').value, fuzzyEnabled: $('filterTermFuzzy').checked, languageCode: $('filterTermLanguage').value || 'und', boundaryMode: $('filterTermBoundary').value || 'auto' };
        await api(existing ? `/api/org/content-filter/terms/${encodeURIComponent(existing.id)}` : '/api/org/content-filter/terms', { method: existing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        resetTermForm(); await loadFilterSettings(); setStatus('organizationFilterStatus', existing ? '語句を更新しました。' : '語句を追加しました。');
      } catch (error) { setStatus('organizationFilterStatus', errorText(error), true); }
    });
  }

  async function updateActive(term, checkbox) {
    try {
      await api(`/api/org/content-filter/terms/${encodeURIComponent(term.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: checkbox.checked }) });
      term.active = checkbox.checked;
      setStatus('organizationFilterStatus', '有効状態を更新しました。');
    } catch (error) { checkbox.checked = !checkbox.checked; setStatus('organizationFilterStatus', errorText(error), true); }
  }

  async function deleteTerm(term, buttonNode) {
    if (!confirm(`「${term.term}」を削除しますか。`)) return;
    await withButton(buttonNode, '削除', async () => {
      try { await api(`/api/org/content-filter/terms/${encodeURIComponent(term.id)}`, { method: 'DELETE' }); await loadFilterSettings(); setStatus('organizationFilterStatus', '語句を削除しました。'); }
      catch (error) { setStatus('organizationFilterStatus', errorText(error), true); }
    });
  }

  function renderPolicies() {
    const body = $('filterPoliciesBody'); body.textContent = '';
    for (const policy of filterData.policies || []) {
      const row = body.insertRow(); row.dataset.category = policy.category; appendCell(row, categoryLabel(policy.category));
      const enabledCell = row.insertCell(); const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.className = 'filter-policy-enabled'; enabled.checked = Boolean(policy.enabled); enabled.disabled = !ownerEditable(); enabledCell.append(enabled);
      for (const [key, value] of [['review', policy.reviewMinSeverity], ['mask', policy.maskMinSeverity], ['reject', policy.rejectMinSeverity]]) {
        const cell = row.insertCell(); const select = document.createElement('select'); select.className = `select filter-policy-${key}`; select.disabled = !ownerEditable(); select.append(new Option('使用しない', '')); for (let level = 1; level <= 5; level += 1) select.append(new Option(String(level), String(level))); select.value = value == null ? '' : String(value); cell.append(select);
      }
    }
    $('saveFilterPoliciesButton').disabled = !ownerEditable();
  }

  async function savePolicies() {
    const policies = [...$('filterPoliciesBody').rows].map((row) => ({ category: row.dataset.category, enabled: row.querySelector('.filter-policy-enabled').checked, reviewMinSeverity: nullable(row.querySelector('.filter-policy-review').value), maskMinSeverity: nullable(row.querySelector('.filter-policy-mask').value), rejectMinSeverity: nullable(row.querySelector('.filter-policy-reject').value) }));
    await withButton($('saveFilterPoliciesButton'), '種類別基準を保存', async () => {
      try { await api('/api/org/content-filter/policies', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policies }) }); await loadFilterSettings(); setStatus('organizationFilterStatus', '種類別基準を保存しました。'); }
      catch (error) { setStatus('organizationFilterStatus', errorText(error), true); }
    });
  }

  function nullable(value) { return value === '' ? null : Number(value); }
  function exportCsv() {
    const rows = [['term', 'language_code', 'category', 'severity', 'match_mode', 'fuzzy_enabled', 'boundary_mode', 'active'], ...(filterData.terms || []).map((term) => [term.term, term.languageCode || 'und', term.category, term.severity, term.matchMode, term.fuzzyEnabled ? 1 : 0, term.boundaryMode || 'auto', term.active ? 1 : 0])];
    const csv = '\uFEFF' + rows.map((row) => row.map((value) => /[",\r\n]/.test(String(value ?? '')) ? `"${String(value ?? '').replace(/"/g, '""')}"` : String(value ?? '')).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `cpcv-content-filter-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  $('saveOrganizationAiButton')?.addEventListener('click', saveAiSettings);
  $('applyOrganizationFilterPresetButton')?.addEventListener('click', applyPreset);
  $('installJapaneseFilterPackButton')?.addEventListener('click', () => installPack('ja-core-v1', $('installJapaneseFilterPackButton')));
  $('installEnglishFilterPackButton')?.addEventListener('click', () => installPack('en-core-v1', $('installEnglishFilterPackButton')));
  $('installJapaneseContextFilterPackButton')?.addEventListener('click', () => installPack('ja-context-v1', $('installJapaneseContextFilterPackButton')));
  $('installEnglishContextFilterPackButton')?.addEventListener('click', () => installPack('en-context-v1', $('installEnglishContextFilterPackButton')));
  $('addFilterTermButton')?.addEventListener('click', saveTerm);
  $('cancelFilterTermEditButton')?.addEventListener('click', resetTermForm);
  $('saveFilterPoliciesButton')?.addEventListener('click', savePolicies);
  $('exportFilterTermsButton')?.addEventListener('click', exportCsv);

  loadIdentity().catch(() => {});
}
