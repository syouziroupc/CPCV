from pathlib import Path
import hashlib
import json


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing patch anchor: {label}")
    return text.replace(old, new, 1)


def patch_admin_html(path):
    p = Path(path)
    s = p.read_text()
    s = replace_once(s, '<body class="page admin-page auth-view">', '<body class="page admin-page">', f'{path}: body')
    s = replace_once(
        s,
        '    </header>\n\n    <section id="loginSection" class="auth-shell admin-login-shell" aria-labelledby="teacherLoginHeading">',
        '    </header>\n\n    <section id="adminBootSection" class="section"><p id="adminBootStatus" class="status">授業管理を読み込んでいます。</p></section>\n\n    <section id="loginSection" class="auth-shell admin-login-shell hidden" aria-labelledby="teacherLoginHeading">',
        f'{path}: boot section'
    )
    old = '<select id="sessionAiTargetLanguage" class="select"><option value="ja">日本語</option><option value="en">英語</option></select>'
    options = [
        ('ja','日本語'),('en','English'),('zh','中文'),('ko','한국어'),('es','Español'),('fr','Français'),
        ('de','Deutsch'),('it','Italiano'),('pt','Português'),('ru','Русский'),('uk','Українська'),('tr','Türkçe'),
        ('ar','العربية'),('hi','हिन्दी'),('bn','বাংলা'),('th','ไทย'),('vi','Tiếng Việt'),('id','Bahasa Indonesia'),
        ('ms','Bahasa Melayu'),('tl','Filipino / Tagalog'),('fa','فارسی'),('ur','اردو'),('ne','नेपाली'),('si','සිංහල'),
        ('km','ខ្មែរ'),('lo','ລາວ'),('my','မြန်မာ'),('nl','Nederlands'),('pl','Polski'),('sv','Svenska')
    ]
    new = '<select id="sessionAiTargetLanguage" class="select">' + ''.join(f'<option value="{code}">{label}</option>' for code,label in options) + '</select>'
    s = replace_once(s, old, new, f'{path}: target languages')
    p.write_text(s)


for admin_html in ['public/_admin_spa.html', 'public/admin/index.html']:
    patch_admin_html(admin_html)

# Master page: never paint a login form before session verification.
p = Path('public/master/index.html')
s = p.read_text()
s = replace_once(
    s,
    '    </header>\n\n    <section id="masterLoginSection" class="auth-shell admin-login-shell">',
    '    </header>\n\n    <section id="masterBootSection" class="section"><p id="masterBootStatus" class="status">組織管理を読み込んでいます。</p></section>\n\n    <section id="masterLoginSection" class="auth-shell admin-login-shell hidden">',
    'master boot/login'
)
p.write_text(s)

# Account page: password changes become an explicit user-only action.
p = Path('public/account/index.html')
s = p.read_text()
insert = '''        <section id="passwordSettings" class="workspace-panel">
          <h2>パスワードを変更</h2>
          <p class="muted">このフォームを送信した場合だけパスワードを変更します。通常のログインや画面移動でパスワードが変更されることはありません。</p>
          <form id="passwordForm">
            <label class="label" for="passwordCurrent">現在のパスワード</label><input id="passwordCurrent" class="input" type="password" autocomplete="current-password" maxlength="128" required>
            <label class="label" for="passwordNew">新しいパスワード</label><input id="passwordNew" class="input" type="password" autocomplete="new-password" maxlength="128" required>
            <label class="label" for="passwordConfirm">新しいパスワードを確認</label><input id="passwordConfirm" class="input" type="password" autocomplete="new-password" maxlength="128" required>
            <button id="passwordButton" class="button primary auth-submit" type="submit">パスワードを変更</button>
          </form>
          <p id="passwordStatus" class="status" aria-live="polite"></p>
        </section>
'''
s = replace_once(s, '        <section id="loginSettings" class="workspace-panel">', insert + '        <section id="loginSettings" class="workspace-panel">', 'account password form')
p.write_text(s)

# Admin JS: boot screen, single safe auth retry, no forced-password nag, preserve moderation selections.
p = Path('public/assets/admin.js')
s = p.read_text()
s = replace_once(s, "const loginStatus = document.getElementById('loginStatus');", "const loginStatus = document.getElementById('loginStatus');\nconst adminBootSection = document.getElementById('adminBootSection');\nconst adminBootStatus = document.getElementById('adminBootStatus');", 'admin boot refs')
s = replace_once(s, "let moderationComments = [];", "let moderationComments = [];\nconst selectedModerationIds = new Set();", 'moderation selection set')
s = replace_once(
    s,
    "function setViewMode(mode) {\n  const authView = mode === 'auth';",
    "function setViewMode(mode) {\n  show(adminBootSection, false);\n  const authView = mode === 'auth';",
    'hide boot on view'
)
old_verify = '''async function verifySession() {
  const data = await api('/api/auth/session');
  csrfToken = data.csrfToken || '';
  currentIdentity = data;
  show(organizationManageLink, ['owner', 'admin'].includes(data.organization?.role));
  if (data.user?.requirePasswordChange) setStatus('初期パスワードを変更してください。', true);
  return data;
}'''
new_verify = '''async function verifySession() {
  let data;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      data = await api('/api/auth/session');
      break;
    } catch (error) {
      lastError = error;
      if (error?.status === 401 || attempt === 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  if (!data) throw lastError || new Error('AUTH_SESSION_UNAVAILABLE');
  csrfToken = data.csrfToken || '';
  currentIdentity = data;
  show(organizationManageLink, ['owner', 'admin'].includes(data.organization?.role));
  return data;
}'''
s = replace_once(s, old_verify, new_verify, 'verifySession retry')
s = replace_once(s, "function showLogin(message = '', error = false) {\n  stopModerationRefresh();", "function showLogin(message = '', error = false) {\n  show(adminBootSection, false);\n  stopModerationRefresh();", 'showLogin boot')
s = replace_once(
    s,
    "    checkbox.value = comment.id;\n    checkbox.setAttribute('aria-label', `${comment.nickname || '匿名'}のコメントを選択`);",
    "    checkbox.value = comment.id;\n    checkbox.checked = selectedModerationIds.has(comment.id);\n    checkbox.setAttribute('aria-label', `${comment.nickname || '匿名'}のコメントを選択`);\n    checkbox.addEventListener('change', () => {\n      if (checkbox.checked) selectedModerationIds.add(comment.id);\n      else selectedModerationIds.delete(comment.id);\n    });",
    'restore moderation checkbox'
)
s = replace_once(
    s,
    "      setStatus(`一括操作: 成功${data.succeeded}件。失敗${data.failed}件。`, data.failed > 0);\n      await loadModerationComments();",
    "      if (data.failed === 0) for (const item of items) selectedModerationIds.delete(item.commentId);\n      setStatus(`一括操作: 成功${data.succeeded}件。失敗${data.failed}件。`, data.failed > 0);\n      await loadModerationComments();",
    'clear successful bulk selection'
)
old_lang = "return { ja: '日本語', en: '英語', ko: '韓国語', 'zh-CN': '中国語 簡体', 'zh-TW': '中国語 繁体' }[value] || value || '-';"
new_lang = "return { ja: '日本語', en: '英語', zh: '中国語', ko: '韓国語', es: 'スペイン語', fr: 'フランス語', de: 'ドイツ語', it: 'イタリア語', pt: 'ポルトガル語', ru: 'ロシア語', uk: 'ウクライナ語', tr: 'トルコ語', ar: 'アラビア語', hi: 'ヒンディー語', bn: 'ベンガル語', th: 'タイ語', vi: 'ベトナム語', id: 'インドネシア語', ms: 'マレー語', tl: 'タガログ語', fa: 'ペルシャ語', ur: 'ウルドゥー語', ne: 'ネパール語', si: 'シンハラ語', km: 'クメール語', lo: 'ラオ語', my: 'ミャンマー語', nl: 'オランダ語', pl: 'ポーランド語', sv: 'スウェーデン語' }[value] || value || '-';"
s = replace_once(s, old_lang, new_lang, 'AI language labels')
old_boot = '''async function boot() {
  try {
    await verifySession();
    if (sessionId) await loadSession();
    else {
      showAdminTop();
      await loadActiveSessions();

    }
  } catch (error) {
    if (error.status === 401) showLogin();
    else displayError(error, setLoginStatus);
  }
}

boot();'''
new_boot = '''async function boot() {
  show(adminBootSection, true);
  try {
    await verifySession();
    if (sessionId) await loadSession();
    else {
      showAdminTop();
      await loadActiveSessions();
    }
  } catch (error) {
    if (error.status === 401) showLogin();
    else {
      show(adminBootSection, true);
      if (adminBootStatus) adminBootStatus.textContent = `読み込みに失敗しました: ${error.code || error.message || 'API_ERROR'}。再読み込みしてください。`;
    }
  }
}

boot();'''
s = replace_once(s, old_boot, new_boot, 'admin boot')
p.write_text(s)

# Master JS: boot screen and eliminate the duplicate auth/session call on every navigation.
p = Path('public/assets/master.js')
s = p.read_text()
s = replace_once(s, "const masterLoginStatus = $('masterLoginStatus');", "const masterLoginStatus = $('masterLoginStatus');\nconst masterBootSection = $('masterBootSection');\nconst masterBootStatus = $('masterBootStatus');", 'master boot refs')
s = replace_once(s, "function showLogin(message = '', error = false) {\n  show(loginSection, true);", "function showLogin(message = '', error = false) {\n  show(masterBootSection, false);\n  show(loginSection, true);", 'master showLogin')
s = replace_once(s, "function showPanel() { show(loginSection, false); show(masterPanel, true); show(masterLogoutButton, true); }", "function showPanel() { show(masterBootSection, false); show(loginSection, false); show(masterPanel, true); show(masterLogoutButton, true); }", 'master showPanel')
s = replace_once(s, "    applyIdentity(data); showPanel(); await loadPanel();", "    applyIdentity(data); showPanel(); await loadPanel(data);", 'master login loadPanel')
old_panel = "async function loadPanel() {\n  const [sessionData, organizationData] = await Promise.all([api('/api/auth/session'), api('/api/org')]);\n  applyIdentity(sessionData); organizationName.textContent = organizationData.organization.name;"
new_panel = "async function loadPanel(sessionData = identity) {\n  const organizationData = await api('/api/org');\n  if (sessionData) applyIdentity(sessionData);\n  organizationName.textContent = organizationData.organization.name;"
s = replace_once(s, old_panel, new_panel, 'master duplicate session')
old_master_boot = "async function boot() {\n  try { const data = await api('/api/auth/session'); if (!['owner', 'admin'].includes(data.organization?.role)) return showLogin('この画面はOwnerまたはAdmin専用です。', true); applyIdentity(data); showPanel(); await loadPanel(); }\n  catch (error) { if (error.status === 401) showLogin(); else showLogin(`起動できません: ${error.code || error.message}`, true); }\n}"
new_master_boot = "async function boot() {\n  show(masterBootSection, true);\n  try {\n    const data = await api('/api/auth/session');\n    if (!['owner', 'admin'].includes(data.organization?.role)) return showLogin('この画面はOwnerまたはAdmin専用です。', true);\n    applyIdentity(data);\n    showPanel();\n    await loadPanel(data);\n  } catch (error) {\n    if (error.status === 401) showLogin();\n    else {\n      show(masterBootSection, true);\n      if (masterBootStatus) masterBootStatus.textContent = `読み込みに失敗しました: ${error.code || error.message || 'API_ERROR'}。再読み込みしてください。`;\n    }\n  }\n}"
s = replace_once(s, old_master_boot, new_master_boot, 'master boot')
p.write_text(s)

# Account JS: one shared auth/session request across account modules + explicit password form.
p = Path('public/assets/account.js')
s = p.read_text()
anchor = '''function errorText(code) {'''
helper = '''function sharedSession() {
  if (!window.__cpcvSessionPromise) {
    window.__cpcvSessionPromise = api("/api/auth/session").catch((error) => {
      window.__cpcvSessionPromise = null;
      throw error;
    });
  }
  return window.__cpcvSessionPromise;
}
'''
s = replace_once(s, anchor, helper + anchor, 'account shared session')
s = replace_once(s, '    const session = await api("/api/auth/session");', '    const session = await sharedSession();', 'account session reuse')
password_handler = '''
$("passwordForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("passwordButton");
  const status = $("passwordStatus");
  const currentPassword = $("passwordCurrent").value;
  const newPassword = $("passwordNew").value;
  if (newPassword !== $("passwordConfirm").value) {
    status.textContent = "新しいパスワードの確認入力が一致しません。";
    status.style.color = "#dc2626";
    return;
  }
  button.disabled = true;
  status.textContent = "変更しています。";
  status.style.color = "";
  try {
    const data = await api("/api/auth/password/change", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    csrfToken = data.csrfToken || csrfToken;
    window.__cpcvSessionPromise = Promise.resolve(data);
    $("passwordCurrent").value = "";
    $("passwordNew").value = "";
    $("passwordConfirm").value = "";
    status.textContent = "パスワードを変更しました。他の端末のログイン状態は終了しました。";
  } catch (error) {
    status.textContent = error.code === "CURRENT_PASSWORD_INVALID"
      ? "現在のパスワードが正しくありません。"
      : errorText(error.code);
    status.style.color = "#dc2626";
  } finally { button.disabled = false; }
});
'''
s = replace_once(s, '$("logoutButton").addEventListener("click", async () => {', password_handler + '$("logoutButton").addEventListener("click", async () => {', 'password handler')
p.write_text(s)

# Organization settings uses the same in-flight auth/session promise instead of issuing a second request.
p = Path('public/assets/organization-settings.js')
s = p.read_text()
helper = '''  function sharedIdentity() {
    if (!window.__cpcvSessionPromise) {
      window.__cpcvSessionPromise = api('/api/auth/session').catch((error) => {
        window.__cpcvSessionPromise = null;
        throw error;
      });
    }
    return window.__cpcvSessionPromise;
  }

'''
s = replace_once(s, "  function setStatus(id, text, error = false) {", helper + "  function setStatus(id, text, error = false) {", 'org shared identity helper')
s = replace_once(s, "    identity = await api('/api/auth/session');", "    identity = await sharedIdentity();", 'org session reuse')
p.write_text(s)

# Full M2M100 language-code support in backend validation/provider.
M2M_CODES = ['af','am','ar','ast','az','ba','be','bg','bn','br','bs','ca','ceb','cs','cy','da','de','el','en','es','et','fa','ff','fi','fr','fy','ga','gd','gl','gu','ha','he','hi','hr','ht','hu','hy','id','ig','ilo','is','it','ja','jv','ka','kk','km','kn','ko','lb','lg','ln','lo','lt','lv','mg','mk','ml','mn','mr','ms','my','ne','nl','no','ns','oc','or','pa','pl','ps','pt','ro','ru','sd','si','sk','sl','so','sq','sr','ss','su','sv','sw','ta','th','tl','tn','tr','uk','ur','uz','vi','wo','xh','yi','yo','zh','zu']
array_js = json.dumps(M2M_CODES, ensure_ascii=False)
p = Path('src/ai/validation.js')
s = p.read_text()
s = replace_once(s, 'export const AI_TARGET_LANGUAGES = Object.freeze(["ja", "en"]);', f'export const AI_TARGET_LANGUAGES = Object.freeze({array_js});', 'AI target languages')
p.write_text(s)

p = Path('src/ai/provider.js')
s = p.read_text()
s = replace_once(s, 'const DEDICATED_LANGUAGES = new Set(["ja", "en", "ru", "tr"]);\nconst SUPPORTED_LANGUAGES = new Set(["ja", "en", "ru", "tr"]);', f'const M2M_LANGUAGES = {array_js};\nconst DEDICATED_LANGUAGES = new Set(M2M_LANGUAGES);\nconst SUPPORTED_LANGUAGES = new Set(M2M_LANGUAGES);', 'provider language sets')
p.write_text(s)

# Language detector: preserve bilingual filtering while identifying more source languages for translation routing.
Path('src/content-filter/language.js').write_text(r'''const JAPANESE_KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN = /\p{Script=Han}/u;
const LATIN = /\p{Script=Latin}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
const TURKISH_DISTINCTIVE = /[çğıöşüÇĞİÖŞÜ]/u;
const UKRAINIAN_DISTINCTIVE = /[іїєґІЇЄҐ]/u;
const RUSSIAN_DISTINCTIVE = /[ыэёъЫЭЁЪ]/u;

const SCRIPT_LANGUAGES = [
  [/\p{Script=Hangul}/u, 'ko', 'hangul'],
  [/\p{Script=Thai}/u, 'th', 'thai_script'],
  [/\p{Script=Hebrew}/u, 'he', 'hebrew_script'],
  [/\p{Script=Greek}/u, 'el', 'greek_script'],
  [/\p{Script=Georgian}/u, 'ka', 'georgian_script'],
  [/\p{Script=Armenian}/u, 'hy', 'armenian_script'],
  [/\p{Script=Khmer}/u, 'km', 'khmer_script'],
  [/\p{Script=Lao}/u, 'lo', 'lao_script'],
  [/\p{Script=Myanmar}/u, 'my', 'myanmar_script'],
  [/\p{Script=Sinhala}/u, 'si', 'sinhala_script'],
  [/\p{Script=Bengali}/u, 'bn', 'bengali_script'],
  [/\p{Script=Gujarati}/u, 'gu', 'gujarati_script'],
  [/\p{Script=Gurmukhi}/u, 'pa', 'gurmukhi_script'],
  [/\p{Script=Kannada}/u, 'kn', 'kannada_script'],
  [/\p{Script=Malayalam}/u, 'ml', 'malayalam_script'],
  [/\p{Script=Tamil}/u, 'ta', 'tamil_script']
];

const JAPANESE_HAN_ONLY = new Set(`賛成 反対 同意 質問 回答 先生 学生 日本 社会 政治 政府批判 経済 環境 授業 課題 意見 原因 結果 問題 改善 必要 不要 可能 不可能 良い 悪い 重要 理由`.split(/\s+/));
const RUSSIAN_COMMON = new Set(`и в не на что я с он как это по но они мы к у вы за от о из для так да нет есть был быть урок студент учитель спасибо`.split(/\s+/));
const UKRAINIAN_COMMON = new Set(`і в не на що я з він як це але вони ми ви для так так ні є був бути урок студент вчитель дякую`.split(/\s+/));

const LATIN_HINTS = Object.freeze({
  en: new Set(`a an and are as at be because but by can could did do does during for from had has have he her here how i if in into is it its may my no not of on or our over she should so than that the their them there they this through to very was we were what when where which who why will with without would you your classroom discussion`.split(/\s+/)),
  es: new Set(`a al algo como con de del el ella en es esta este hay la las lo los más no para pero por que se si sin su sus un una y yo gracias hola clase estudiante profesor`.split(/\s+/)),
  fr: new Set(`à au aux avec ce ces comme dans de des du elle en est et il la le les mais ne nous ou pas pour que qui sans se son sur un une vous merci bonjour classe étudiant professeur`.split(/\s+/)),
  de: new Set(`aber als am an auch auf aus bei das dem den der die ein eine einer eines er es für hat ich im in ist mit nicht oder sie sind und von was wir zu zum zur danke hallo klasse student lehrer`.split(/\s+/)),
  it: new Set(`a al alla che con da del della di e è gli ha il in io la le ma non o per più questo se si sono su un una grazie ciao classe studente insegnante`.split(/\s+/)),
  pt: new Set(`a ao com da de do e ela ele em é eu não o os para por que se sem sua um uma você nós mas obrigado olá aula estudante professor`.split(/\s+/)),
  tr: new Set(`ama ben bir bu çok da de değil ders evet hayır için ile iyi katılıyorum merhaba mi nasıl ne neden o olarak öğrenci öğretmen siz teşekkür var yok`.split(/\s+/)),
  id: new Set(`ada adalah aku anda atau dengan di dan dari ini itu karena ke kelas mahasiswa tidak untuk yang guru saya kami mereka terima kasih`.split(/\s+/)),
  ms: new Set(`ada adalah aku anda atau dengan di dan dari ini itu kerana ke kelas pelajar tidak untuk yang guru saya kami mereka terima kasih`.split(/\s+/)),
  vi: new Set(`và là của không một cho với trong tôi bạn chúng lớp sinh viên giáo viên cảm ơn`.split(/\s+/))
});

export function detectCommentLanguage(value) {
  const text = String(value ?? '').normalize('NFKC').trim();
  const letters = Array.from(text).filter((char) => LETTER_OR_MARK.test(char));
  if (!letters.length) return decision('neutral', 1000, true, 'no_letters');
  if (JAPANESE_KANA.test(text)) return decision('ja', 1000, true, 'kana');

  for (const [pattern, code, reason] of SCRIPT_LANGUAGES) {
    if (pattern.test(text)) return decision(code, 980, false, reason);
  }

  if (CYRILLIC.test(text)) return detectCyrillic(text);
  if (TURKISH_DISTINCTIVE.test(text)) return decision('tr', 950, false, 'turkish_distinctive');

  if (HAN.test(text)) {
    const compact = text.replace(/[\p{P}\p{S}\p{Z}\p{N}]/gu, '');
    if (JAPANESE_HAN_ONLY.has(compact)) return decision('ja', 880, true, 'japanese_han_whitelist');
    return decision('other', 650, false, 'han_ambiguous');
  }

  if (LATIN.test(text)) return detectLatin(text);
  return decision('other', 700, false, 'unsupported_or_ambiguous_script');
}

function detectCyrillic(text) {
  if (UKRAINIAN_DISTINCTIVE.test(text)) return decision('uk', 980, false, 'ukrainian_distinctive');
  if (RUSSIAN_DISTINCTIVE.test(text)) return decision('ru', 940, false, 'russian_distinctive');
  const tokens = text.toLocaleLowerCase().match(/\p{Script=Cyrillic}+/gu) || [];
  const uk = tokens.filter((token) => UKRAINIAN_COMMON.has(token)).length;
  const ru = tokens.filter((token) => RUSSIAN_COMMON.has(token)).length;
  if (uk >= 2 && uk > ru) return decision('uk', 860, false, 'ukrainian_words');
  if (ru >= 2 && ru > uk) return decision('ru', 860, false, 'russian_words');
  return decision('other', 650, false, 'cyrillic_ambiguous');
}

function detectLatin(text) {
  const lower = text.toLocaleLowerCase();
  if (/[ñ¿¡]/u.test(lower)) return decision('es', 960, false, 'spanish_distinctive');
  if (/ß/u.test(lower)) return decision('de', 960, false, 'german_distinctive');
  if (/[ãõ]/u.test(lower)) return decision('pt', 950, false, 'portuguese_distinctive');
  const tokens = lower.match(/\p{Script=Latin}+(?:['’]\p{Script=Latin}+)?/gu) || [];
  if (!tokens.length) return decision('other', 500, false, 'latin_unresolved');
  const ranked = Object.entries(LATIN_HINTS)
    .map(([code, words]) => ({ code, hits: tokens.filter((token) => words.has(token)).length }))
    .sort((a, b) => b.hits - a.hits || a.code.localeCompare(b.code));
  const best = ranked[0];
  const second = ranked[1];
  if (best.hits >= 2 && best.hits > second.hits) {
    return decision(best.code, Math.min(960, 760 + best.hits * 45), best.code === 'en', `${best.code}_words`);
  }
  if (best.hits === 1 && second.hits === 0 && (tokens.length <= 3 || best.code === 'en')) {
    return decision(best.code, best.code === 'en' ? 760 : 720, best.code === 'en', `${best.code}_hint`);
  }
  return decision('other', 600, false, 'latin_ambiguous');
}

export function isSupportedFilterLanguage(code) {
  return code === 'ja' || code === 'en' || code === 'neutral';
}

function decision(code, confidenceMilli, supported, reason) {
  return { code, confidenceMilli, supported, reason, aiRequired: !supported };
}
''')

# Permanent regression test for all four reported regressions.
Path('scripts/test-user-facing-stability.mjs').write_text(r'''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectCommentLanguage } from '../src/content-filter/language.js';
import { normalizeAiTargetLanguage } from '../src/ai/validation.js';
import { runTranslationModel } from '../src/ai/provider.js';

const adminHtml = readFileSync(new URL('../public/_admin_spa.html', import.meta.url), 'utf8');
const masterHtml = readFileSync(new URL('../public/master/index.html', import.meta.url), 'utf8');
const accountHtml = readFileSync(new URL('../public/account/index.html', import.meta.url), 'utf8');
const adminJs = readFileSync(new URL('../public/assets/admin.js', import.meta.url), 'utf8');
const masterJs = readFileSync(new URL('../public/assets/master.js', import.meta.url), 'utf8');
const accountJs = readFileSync(new URL('../public/assets/account.js', import.meta.url), 'utf8');
const orgJs = readFileSync(new URL('../public/assets/organization-settings.js', import.meta.url), 'utf8');

assert.match(adminHtml, /id="adminBootSection"/);
assert.match(adminHtml, /id="loginSection" class="[^"]*hidden[^"]*"/);
assert.doesNotMatch(adminHtml, /<body class="page admin-page auth-view">/);
assert.match(masterHtml, /id="masterBootSection"/);
assert.match(masterHtml, /id="masterLoginSection" class="[^"]*hidden[^"]*"/);
assert.equal((masterJs.match(/api\('\/api\/auth\/session'\)/g) || []).length, 1, 'master boot must not verify the session twice');
assert.match(accountJs, /window\.__cpcvSessionPromise/);
assert.match(orgJs, /window\.__cpcvSessionPromise/);
assert.match(accountHtml, /id="passwordForm"/);
assert.match(accountHtml, /このフォームを送信した場合だけパスワードを変更します/);
assert.doesNotMatch(adminJs, /初期パスワードを変更してください/);

assert.match(adminJs, /const selectedModerationIds = new Set\(\)/);
assert.match(adminJs, /checkbox\.checked = selectedModerationIds\.has\(comment\.id\)/);
assert.match(adminJs, /selectedModerationIds\.add\(comment\.id\)/);

for (const code of ['ja','en','zh','ko','es','fr','de','it','pt','ru','uk','tr','ar','hi','bn','th','vi','id','ms','tl']) {
  assert.equal(normalizeAiTargetLanguage(code), code, `target ${code} should be accepted`);
}
assert.equal(normalizeAiTargetLanguage('xx-unsupported'), '');

const samples = [
  ['Energy markets change during classroom discussion.', 'en'],
  ['La energía solar es importante para el futuro.', 'es'],
  ['에너지 시장에 대해 수업에서 토론하고 싶습니다.', 'ko'],
  ['พลังงานแสงอาทิตย์มีความสำคัญต่ออนาคต', 'th'],
  ['Це важлива тема для обговорення в класі.', 'uk']
];
for (const [text, expected] of samples) {
  assert.equal(detectCommentLanguage(text).code, expected, `${text} should be ${expected}`);
}

const calls = [];
const env = {
  AI: { async run(model, request) { calls.push({ model, request }); return { translated_text: '太陽エネルギーは重要です。' }; } },
  AI_TRANSLATION_MODEL: '@cf/meta/m2m100-1.2b',
  AI_TRANSLATION_BALANCED_MODEL: '@cf/meta/llama-4-scout-17b-16e-instruct',
  AI_TRANSLATION_ACCURATE_MODEL: '@cf/moonshotai/kimi-k2.6',
  AI_MODERATION_RATE_LIMITER: { async limit() { return { success: true }; } },
  AI_TRANSLATION_TIMEOUT_MS: '8000'
};
const translated = await runTranslationModel(env, {
  message: 'La energía solar es importante.', sourceLanguage: 'es', targetLanguage: 'ja', quality: 'fast'
});
assert.equal(translated.translatedText, '太陽エネルギーは重要です。');
assert.equal(calls[0].model, '@cf/meta/m2m100-1.2b');
assert.equal(calls[0].request.source_lang, 'es');
assert.equal(calls[0].request.target_lang, 'ja');

console.log('User-facing navigation, password, selection, and language regression tests passed');
''')

# Make the new regression permanent in the v0.8.10 suite.
p = Path('package.json')
pkg = json.loads(p.read_text())
current = pkg['scripts']['check:v0810']
if 'test-user-facing-stability.mjs' not in current:
    pkg['scripts']['check:v0810'] = current + ' && node scripts/test-user-facing-stability.mjs'
p.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n')

# Update source override hashes for every persistent changed/new file.
manifest = Path('SOURCE_SHA256SUMS.override.txt')
entries = {}
for line in manifest.read_text().splitlines():
    if not line.strip():
        continue
    digest, name = line.split('  ', 1)
    entries[name] = digest
changed = [
    'public/_admin_spa.html','public/admin/index.html','public/master/index.html','public/account/index.html',
    'public/assets/admin.js','public/assets/master.js','public/assets/account.js','public/assets/organization-settings.js',
    'src/ai/validation.js','src/ai/provider.js','src/content-filter/language.js','scripts/test-user-facing-stability.mjs','package.json'
]
for name in changed:
    entries[name] = hashlib.sha256(Path(name).read_bytes()).hexdigest()
manifest.write_text('\n'.join(f'{entries[name]}  {name}' for name in sorted(entries)) + '\n')
