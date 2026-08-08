import assert from 'node:assert/strict';
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
  ['La energía eólica puede ayudar al futuro.', 'es'],
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
