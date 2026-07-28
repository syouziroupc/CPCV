from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing replacement target: {label}")
    return text.replace(old, new, 1)


account_path = Path("public/account/index.html")
account = account_path.read_text(encoding="utf-8")
filter_section = '''          <section id="organizationFilterSection" class="workspace-panel filter-control-panel">
            <div class="filter-heading-row">
              <div>
                <p class="eyebrow">自動設定</p>
                <h3>コメント判定</h3>
                <p class="muted small-text">通常は「推奨」で十分です。ボタンを押すと、辞書パックと種類別の処理基準まで自動設定して保存します。</p>
              </div>
              <p id="organizationFilterModeState" class="filter-mode-state" data-mode="loading">現在 <strong id="organizationFilterModeLabel">読み込み中</strong><span id="organizationFilterDirtyState" class="filter-dirty-state hidden">未保存</span></p>
            </div>
            <div class="filter-preset-actions" role="group" aria-label="コメント判定の自動設定">
              <button class="filter-preset-button" data-filter-preset="standard" type="button" aria-pressed="false"><strong>推奨</strong><span>迷う投稿は確認し、強い表現は伏字、最重大だけ投稿拒否にします。</span></button>
              <button class="filter-preset-button" data-filter-preset="strict" type="button" aria-pressed="false"><strong>厳格</strong><span>軽い表現から早めに確認し、伏字の範囲も広げます。</span></button>
              <button class="filter-preset-button" data-filter-preset="off" type="button" aria-pressed="false"><strong>無効</strong><span>辞書による承認待ち・伏字・投稿拒否を停止します。</span></button>
            </div>
            <p id="organizationFilterModeDescription" class="muted small-text filter-mode-description"></p>
            <p id="organizationFilterStatus" class="status" aria-live="polite"></p>
            <p id="filterPackStatus" class="muted small-text">辞書パックを確認しています。</p>
            <details class="advanced-settings filter-pack-details"><summary>辞書パックを個別に導入・更新</summary>
              <div class="row wrap">
                <button id="installJapaneseFilterPackButton" data-default-label="日本語 基本" class="button" type="button">日本語 基本</button>
                <button id="installEnglishFilterPackButton" data-default-label="英語 基本" class="button" type="button">英語 基本</button>
                <button id="installJapaneseContextFilterPackButton" data-default-label="日本語 文脈注意" class="button" type="button">日本語 文脈注意</button>
                <button id="installEnglishContextFilterPackButton" data-default-label="英語 文脈注意" class="button" type="button">英語 文脈注意</button>
              </div>
            </details>
          </section>'''
account, count = re.subn(
    r'          <section id="organizationFilterSection" class="workspace-panel">.*?          </section>(?=\n        </div>)',
    filter_section,
    account,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"organization filter section replacement count={count}")

old_policy = '          <details class="workspace-detail"><summary>種類別の処理基準</summary>\n            <div class="detail-body"><p class="muted small-text">通常は変更不要です。空欄はその処理を使いません。</p><div class="filter-table-wrap"><table class="filter-table policy-table"><thead><tr><th>種類</th><th>使用</th><th>承認待ち</th><th>伏字</th><th>投稿拒否</th></tr></thead><tbody id="filterPoliciesBody"></tbody></table></div><button id="saveFilterPoliciesButton" class="button primary" type="button">種類別基準を保存</button></div>\n          </details>'
new_policy = '''          <section class="workspace-detail policy-batch-section" aria-labelledby="policyBatchHeading">
            <div class="policy-section-heading">
              <div><p class="eyebrow">まとめて変更</p><h3 id="policyBatchHeading">全種類の処理基準</h3></div>
              <p class="muted small-text">有効・無効は変えず、承認待ち・伏字・投稿拒否のレベルだけを全種類へそろえます。</p>
            </div>
            <div class="policy-batch-grid">
              <label class="policy-batch-item" data-action="review" for="bulkReviewMinSeverity"><strong>承認待ち</strong><span>先生の確認後に表示</span><select id="bulkReviewMinSeverity" class="select"><option value="mixed">種類ごとに異なる・変更しない</option><option value="">使用しない</option><option value="1">レベル1以上</option><option value="2">レベル2以上</option><option value="3">レベル3以上</option><option value="4">レベル4以上</option><option value="5">レベル5のみ</option></select></label>
              <label class="policy-batch-item" data-action="mask" for="bulkMaskMinSeverity"><strong>伏字</strong><span>該当部分を隠して表示</span><select id="bulkMaskMinSeverity" class="select"><option value="mixed">種類ごとに異なる・変更しない</option><option value="">使用しない</option><option value="1">レベル1以上</option><option value="2">レベル2以上</option><option value="3">レベル3以上</option><option value="4">レベル4以上</option><option value="5">レベル5のみ</option></select></label>
              <label class="policy-batch-item" data-action="reject" for="bulkRejectMinSeverity"><strong>投稿拒否</strong><span>送信時点で受け付けない</span><select id="bulkRejectMinSeverity" class="select"><option value="mixed">種類ごとに異なる・変更しない</option><option value="">使用しない</option><option value="1">レベル1以上</option><option value="2">レベル2以上</option><option value="3">レベル3以上</option><option value="4">レベル4以上</option><option value="5">レベル5のみ</option></select></label>
            </div>
            <p class="muted small-text policy-order-help">基準は「承認待ち ≤ 伏字 ≤ 投稿拒否」の順にします。数字が小さいほど厳しい設定です。</p>
            <button id="applyBulkPolicyButton" class="button primary" type="button">全種類へ適用して保存</button>
          </section>
          <details id="categoryPolicyDetails" class="workspace-detail category-policy-detail"><summary>種類ごとに微調整</summary>
            <div class="detail-body">
              <p class="muted small-text">ここを変更すると現在の設定は「カスタム・未保存」になります。通常は一括設定だけで十分です。</p>
              <div class="filter-table-wrap"><table class="filter-table policy-table"><thead><tr><th>種類</th><th>使用</th><th>承認待ち</th><th>伏字</th><th>投稿拒否</th></tr></thead><tbody id="filterPoliciesBody"></tbody></table></div>
              <button id="saveFilterPoliciesButton" class="button primary" type="button">種類別の変更を保存</button>
            </div>
          </details>'''
account = replace_once(account, old_policy, new_policy, "policy controls")
account_path.write_text(account, encoding="utf-8")

js_path = Path("public/assets/organization-settings.js")
js = js_path.read_text(encoding="utf-8")
js = replace_once(
    js,
    "  let editingTermId = '';",
    "  let editingTermId = '';\n  let filterMode = 'custom';\n  let policyDirty = false;",
    "filter state",
)
helper_anchor = "  function boundaryLabel(id) { return ({ auto: '自動', word: '単語', substring: '部分' })[id] || id || '自動'; }"
helper_block = helper_anchor + '''

  function presetLabel(mode) { return ({ standard: '推奨', strict: '厳格', off: '無効', custom: 'カスタム' })[mode] || 'カスタム'; }
  function presetDescription(mode) {
    return ({
      standard: '推奨値を種類別の詳細設定へ展開して適用しています。',
      strict: '厳格値を種類別の詳細設定へ展開して適用しています。',
      off: '辞書による自動処理は停止しています。',
      custom: '一括設定または種類別設定で調整された値を使用します。'
    })[mode] || '';
  }
  function setFilterMode(mode, dirty = false) {
    filterMode = ['standard', 'strict', 'off'].includes(mode) ? mode : 'custom';
    policyDirty = Boolean(dirty);
    const state = $('organizationFilterModeState');
    if (state) state.dataset.mode = filterMode;
    if ($('organizationFilterModeLabel')) $('organizationFilterModeLabel').textContent = presetLabel(filterMode);
    if ($('organizationFilterModeDescription')) $('organizationFilterModeDescription').textContent = presetDescription(filterMode);
    $('organizationFilterDirtyState')?.classList.toggle('hidden', !policyDirty);
    for (const buttonNode of document.querySelectorAll('[data-filter-preset]')) {
      const active = buttonNode.dataset.filterPreset === filterMode && !policyDirty;
      buttonNode.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }
  function markCustomDirty(message = '詳細設定を変更しました。保存すると反映されます。') {
    setFilterMode('custom', true);
    setStatus('organizationFilterStatus', message);
  }
  function policyLevelLabel(level) {
    return level === 1 ? '1 軽微以上' : level === 2 ? '2 注意以上' : level === 3 ? '3 中程度以上' : level === 4 ? '4 強い以上' : '5 最重大のみ';
  }
  function createPolicyLevelSelect(className, value) {
    const select = document.createElement('select');
    select.className = `select ${className}`;
    select.disabled = !ownerEditable();
    select.append(new Option('使用しない', ''));
    for (let level = 1; level <= 5; level += 1) select.append(new Option(policyLevelLabel(level), String(level)));
    select.value = value == null ? '' : String(value);
    select.addEventListener('change', () => markCustomDirty());
    return select;
  }
  function policyOrderValid(policy) {
    const values = [policy.reviewMinSeverity, policy.maskMinSeverity, policy.rejectMinSeverity];
    for (let index = 0; index < values.length - 1; index += 1) {
      if (values[index] != null && values[index + 1] != null && values[index] > values[index + 1]) return false;
    }
    return true;
  }
  function syncBulkPolicyControls() {
    const fields = [
      ['bulkReviewMinSeverity', 'reviewMinSeverity'],
      ['bulkMaskMinSeverity', 'maskMinSeverity'],
      ['bulkRejectMinSeverity', 'rejectMinSeverity']
    ];
    for (const [id, key] of fields) {
      const select = $(id);
      if (!select) continue;
      const values = new Set((filterData.policies || []).map((policy) => policy[key] == null ? '' : String(policy[key])));
      select.value = values.size === 1 ? [...values][0] : 'mixed';
      select.disabled = !ownerEditable();
    }
    if ($('applyBulkPolicyButton')) $('applyBulkPolicyButton').disabled = !ownerEditable();
  }'''
js = replace_once(js, helper_anchor, helper_block, "policy helpers")
old_load = "      $('organizationFilterPreset').value = inferPreset();\n      $('applyOrganizationFilterPresetButton').disabled = !ownerEditable();\n      $('addFilterTermButton').disabled = !termEditable();"
new_load = "      setFilterMode(inferPreset());\n      syncBulkPolicyControls();\n      $('addFilterTermButton').disabled = !termEditable();"
js = replace_once(js, old_load, new_load, "load filter state")

js, count = re.subn(
    r"  async function applyPreset\(\) \{.*?\n  \}\n\n  function renderTerms\(\)",
    '''  async function applyPreset(name, buttonNode) {
    if (!['standard', 'strict', 'off'].includes(name)) return;
    const source = POLICY_PRESETS[name] || {};
    const policies = (filterData.policies || []).map((policy) => {
      const levels = source[policy.category];
      return {
        category: policy.category,
        enabled: Boolean(levels),
        reviewMinSeverity: levels?.[0] ?? policy.reviewMinSeverity,
        maskMinSeverity: levels?.[1] ?? policy.maskMinSeverity,
        rejectMinSeverity: levels?.[2] ?? policy.rejectMinSeverity
      };
    });
    await withButton(buttonNode, presetLabel(name), async () => {
      try {
        if (name === 'standard' || name === 'strict') await ensurePacks(name);
        await api('/api/org/content-filter/policies', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policies }) });
        await loadFilterSettings();
        setFilterMode(name);
        setStatus('organizationFilterStatus', name === 'off' ? '辞書判定を無効にしました。' : `${presetLabel(name)}設定を自動作成して適用しました。`);
      } catch (error) { setStatus('organizationFilterStatus', errorText(error), true); }
    });
  }

  function renderTerms()''',
    js,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"applyPreset replacement count={count}")

js, count = re.subn(
    r"  function renderPolicies\(\) \{.*?\n  \}\n\n  function nullable\(value\)",
    '''  function renderPolicies() {
    const body = $('filterPoliciesBody'); body.textContent = '';
    for (const policy of filterData.policies || []) {
      const row = body.insertRow(); row.dataset.category = policy.category; appendCell(row, categoryLabel(policy.category));
      const enabledCell = row.insertCell();
      const enabled = document.createElement('input');
      enabled.type = 'checkbox'; enabled.className = 'filter-policy-enabled'; enabled.checked = Boolean(policy.enabled); enabled.disabled = !ownerEditable();
      enabled.addEventListener('change', () => markCustomDirty());
      enabledCell.append(enabled);
      const fields = [
        ['review', policy.reviewMinSeverity],
        ['mask', policy.maskMinSeverity],
        ['reject', policy.rejectMinSeverity]
      ];
      for (const [key, value] of fields) {
        const cell = row.insertCell();
        cell.append(createPolicyLevelSelect(`filter-policy-${key}`, value));
      }
    }
    $('saveFilterPoliciesButton').disabled = !ownerEditable();
  }

  function policiesFromRows() {
    return [...$('filterPoliciesBody').rows].map((row) => ({
      category: row.dataset.category,
      enabled: row.querySelector('.filter-policy-enabled').checked,
      reviewMinSeverity: nullable(row.querySelector('.filter-policy-review').value),
      maskMinSeverity: nullable(row.querySelector('.filter-policy-mask').value),
      rejectMinSeverity: nullable(row.querySelector('.filter-policy-reject').value)
    }));
  }

  function validatePolicies(policies) {
    const invalid = policies.find((policy) => !policyOrderValid(policy));
    if (!invalid) return true;
    setStatus('organizationFilterStatus', `${categoryLabel(invalid.category)}の基準順を確認してください。承認待ち ≤ 伏字 ≤ 投稿拒否の順にします。`, true);
    return false;
  }

  async function savePolicies() {
    const policies = policiesFromRows();
    if (!validatePolicies(policies)) return;
    await withButton($('saveFilterPoliciesButton'), '種類別の変更を保存', async () => {
      try {
        await api('/api/org/content-filter/policies', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policies }) });
        await loadFilterSettings();
        setFilterMode('custom');
        setStatus('organizationFilterStatus', '種類別のカスタム設定を保存しました。');
      } catch (error) { setStatus('organizationFilterStatus', errorText(error), true); }
    });
  }

  async function applyBulkPolicies() {
    const changes = {};
    const fields = [
      ['bulkReviewMinSeverity', 'reviewMinSeverity'],
      ['bulkMaskMinSeverity', 'maskMinSeverity'],
      ['bulkRejectMinSeverity', 'rejectMinSeverity']
    ];
    for (const [id, key] of fields) {
      const value = $(id).value;
      if (value !== 'mixed') changes[key] = nullable(value);
    }
    if (!Object.keys(changes).length) return setStatus('organizationFilterStatus', '変更する項目を選択してください。', true);
    const policies = (filterData.policies || []).map((policy) => ({ ...policy, ...changes }));
    if (!validatePolicies(policies)) return;
    await withButton($('applyBulkPolicyButton'), '全種類へ適用して保存', async () => {
      try {
        await api('/api/org/content-filter/policies', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policies }) });
        await loadFilterSettings();
        setFilterMode('custom');
        setStatus('organizationFilterStatus', '選択した基準を全種類へ適用して保存しました。');
      } catch (error) { setStatus('organizationFilterStatus', errorText(error), true); }
    });
  }

  function nullable(value)''',
    js,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"policy functions replacement count={count}")

old_listener = "  $('applyOrganizationFilterPresetButton')?.addEventListener('click', applyPreset);"
new_listener = "  for (const buttonNode of document.querySelectorAll('[data-filter-preset]')) buttonNode.addEventListener('click', () => applyPreset(buttonNode.dataset.filterPreset, buttonNode));\n  $('applyBulkPolicyButton')?.addEventListener('click', applyBulkPolicies);\n  for (const id of ['bulkReviewMinSeverity', 'bulkMaskMinSeverity', 'bulkRejectMinSeverity']) $(id)?.addEventListener('change', () => markCustomDirty('一括設定はまだ保存されていません。'));"
js = replace_once(js, old_listener, new_listener, "preset listeners")
js_path.write_text(js, encoding="utf-8")

css_path = Path("public/assets/app.css")
css = css_path.read_text(encoding="utf-8")
css += '''

/* v0.8.10 filter preset and batch policy UX */
.filter-control-panel { border-left: 6px solid var(--primary); padding-left: 20px; }
.filter-heading-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 20px; align-items: start; }
.filter-mode-state { margin: 0; min-width: 150px; padding: 10px 12px; border: 1.5px solid var(--border); background: #fff; font-weight: 800; }
.filter-mode-state[data-mode="standard"] { border-left: 6px solid var(--primary); }
.filter-mode-state[data-mode="strict"] { border-left: 6px solid var(--danger); }
.filter-mode-state[data-mode="off"] { border-left: 6px solid var(--muted); }
.filter-mode-state[data-mode="custom"] { border-left: 6px solid var(--accent); }
.filter-dirty-state { margin-left: 8px; color: var(--danger); font-size: .82rem; }
.filter-mode-description { margin-top: 12px; }
.filter-preset-actions { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); margin-top: 16px; border: 2px solid var(--border); background: #fff; }
.filter-preset-button { min-width: 0; min-height: 116px; display: grid; align-content: start; gap: 8px; padding: 16px; border: 0; border-right: 1px solid var(--flat-divider); border-radius: 0; background: #fff; color: var(--text); text-align: left; cursor: pointer; }
.filter-preset-button:last-child { border-right: 0; }
.filter-preset-button strong { font-size: 1.08rem; }
.filter-preset-button span { color: var(--muted); line-height: 1.55; }
.filter-preset-button:hover:not(:disabled) { background: #f1efe9; }
.filter-preset-button[aria-pressed="true"] { background: #e6f0eb; box-shadow: inset 0 -6px 0 var(--primary); }
.filter-preset-button[data-filter-preset="strict"][aria-pressed="true"] { background: #fff1ef; box-shadow: inset 0 -6px 0 var(--danger); }
.filter-preset-button[data-filter-preset="off"][aria-pressed="true"] { background: #e9e6de; box-shadow: inset 0 -6px 0 var(--muted); }
.filter-preset-button:disabled { opacity: .55; cursor: not-allowed; }
.filter-pack-details { margin-top: 12px; }
.policy-batch-section { padding: 22px 0; }
.policy-section-heading { display: grid; grid-template-columns: minmax(0,.8fr) minmax(260px,1.2fr); gap: 28px; align-items: end; margin-bottom: 16px; }
.policy-section-heading h3 { margin-bottom: 0; }
.policy-batch-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); border: 2px solid var(--border); background: #fff; }
.policy-batch-item { min-width: 0; display: grid; align-content: start; gap: 7px; padding: 16px; border-right: 1px solid var(--flat-divider); border-top: 6px solid var(--accent); }
.policy-batch-item:last-child { border-right: 0; }
.policy-batch-item[data-action="mask"] { border-top-color: var(--primary); }
.policy-batch-item[data-action="reject"] { border-top-color: var(--danger); }
.policy-batch-item strong { font-size: 1.05rem; }
.policy-batch-item > span { min-height: 2.8em; color: var(--muted); line-height: 1.4; }
.policy-batch-item .select { width: 100%; margin-top: 4px; }
.policy-order-help { margin: 12px 0 14px; }
.category-policy-detail { margin-top: 18px; }
.category-policy-detail > summary { font-size: 1rem; }
.policy-table .select { width: 100%; min-width: 148px; }
.policy-table tr:focus-within { outline: 2px solid var(--accent); outline-offset: -2px; }
@media (max-width: 820px) {
  .filter-heading-row, .policy-section-heading { grid-template-columns: 1fr; gap: 10px; }
  .filter-mode-state { width: 100%; min-width: 0; }
  .filter-preset-actions, .policy-batch-grid { grid-template-columns: 1fr; }
  .filter-preset-button, .policy-batch-item { min-height: 0; border-right: 0; border-bottom: 1px solid var(--flat-divider); }
  .filter-preset-button:last-child, .policy-batch-item:last-child { border-bottom: 0; }
  .policy-batch-item > span { min-height: 0; }
}
@media (max-width: 520px) {
  .filter-control-panel { padding-left: 14px; }
  .filter-preset-button, .policy-batch-item { padding: 14px; }
}
'''
css_path.write_text(css, encoding="utf-8")

usability_path = Path("scripts/test-v0810-usability.mjs")
usability = usability_path.read_text(encoding="utf-8")
test_anchor = "check('Turnstile uses responsive flexible sizing', text('public/assets/auth-public.js').includes('size: \"flexible\"'));"
test_block = test_anchor + '''
check('filter presets apply immediately without a select-and-apply step', account.includes('data-filter-preset="standard"') && !account.includes('id="organizationFilterPreset"') && organizationSettings.includes('async function applyPreset(name, buttonNode)'));
check('filter settings expose batch review mask and reject controls', account.includes('id="bulkReviewMinSeverity"') && account.includes('id="bulkMaskMinSeverity"') && account.includes('id="bulkRejectMinSeverity"') && account.includes('id="applyBulkPolicyButton"'));
check('manual policy edits switch the visible state to custom', organizationSettings.includes('function markCustomDirty') && organizationSettings.includes("setFilterMode('custom', true)") && organizationSettings.includes("select.addEventListener('change', () => markCustomDirty())"));
check('batch policy changes preserve category enablement', organizationSettings.includes("const policies = (filterData.policies || []).map((policy) => ({ ...policy, ...changes }))"));
check('policy thresholds validate review mask reject order', organizationSettings.includes('function policyOrderValid') && organizationSettings.includes('承認待ち ≤ 伏字 ≤ 投稿拒否'));
check('batch and category policy controls are separate flat sections', account.includes('class="workspace-detail policy-batch-section"') && account.includes('class="workspace-detail category-policy-detail"'));
check('filter controls use a strong flat visual hierarchy', appCss.includes('v0.8.10 filter preset and batch policy UX') && appCss.includes('.filter-preset-actions') && appCss.includes('.policy-batch-grid'));'''
usability = replace_once(usability, test_anchor, test_block, "usability tests")
usability_path.write_text(usability, encoding="utf-8")

security_path = Path("scripts/test-v0810-security-ui.mjs")
security = security_path.read_text(encoding="utf-8")
security = security.replace(
    "['0.8.10', '0.8.10-ui2', '0.8.10-ui3'].includes(value)",
    "['0.8.10', '0.8.10-ui2', '0.8.10-ui3', '0.8.10-ui4'].includes(value)",
)
security_path.write_text(security, encoding="utf-8")

for html_path in Path("public").rglob("*.html"):
    html = html_path.read_text(encoding="utf-8")
    html = html.replace("app.css?v=0.8.10-ui3", "app.css?v=0.8.10-ui4")
    html_path.write_text(html, encoding="utf-8")

print("filter settings UX patch applied")
