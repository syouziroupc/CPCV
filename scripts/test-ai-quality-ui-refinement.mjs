import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runModerationModel, runTranslationModel } from '../src/ai/provider.js';
import { normalizeModerationResult } from '../src/ai/validation.js';

const html = readFileSync('public/admin/index.html', 'utf8');
const js = readFileSync('public/assets/admin.js', 'utf8');
const css = `${readFileSync('public/assets/app-base.css', 'utf8')}\n${readFileSync('public/assets/app.css', 'utf8')}`;
const migration = readFileSync('migrations-v2/0018_ai_translation_quality.sql', 'utf8');
assert.match(html, /id="sessionAiTranslationQuality"/);
assert.match(html, /id="saveSessionSettingsButton"/);
assert.doesNotMatch(html, /id="saveSessionAiButton"/);
assert.doesNotMatch(html, /id="saveSessionFilterSimpleButton"/);
assert.match(js, /saveAllSessionSettings/);
assert.match(js, /aiStatusLabel\(result\.status, result\.error\)/);
assert.match(css, /AI quality and administration layout refinement/);
assert.match(migration, /translation_quality/);

const tolerant = normalizeModerationResult({ verdict: 'flag', score: 82, categories: ['personal_info', 'profanity'] });
assert.equal(tolerant.recommendation, 'review');
assert.equal(tolerant.confidenceMilli, 820);
assert.deepEqual(tolerant.categories, ['personal_data', 'harassment']);

const calls = [];
const env = {
  AI_TRANSLATION_MODEL: '@cf/meta/m2m100-1.2b',
  AI_TRANSLATION_BALANCED_MODEL: '@cf/zai-org/glm-4.7-flash',
  AI_TRANSLATION_ACCURATE_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
  AI_TRANSLATION_TIMEOUT_MS: '8000', AI_TRANSLATION_BALANCED_TIMEOUT_MS: '18000', AI_TRANSLATION_ACCURATE_TIMEOUT_MS: '30000',
  AI: { run: async (model, request) => { calls.push({ model, request }); return { response: '翻訳結果' }; } }
};
await runTranslationModel(env, { message: 'Una frase italiana', sourceLanguage: 'other', targetLanguage: 'ja', quality: 'fast' });
assert.equal(calls.at(-1).model, '@cf/zai-org/glm-4.7-flash');
await runTranslationModel(env, { message: 'Hello', sourceLanguage: 'en', targetLanguage: 'ja', quality: 'fast' });
assert.equal(calls.at(-1).model, '@cf/meta/m2m100-1.2b');
await runTranslationModel(env, { message: 'Hello', sourceLanguage: 'en', targetLanguage: 'ja', quality: 'accurate' });
assert.equal(calls.at(-1).model, '@cf/qwen/qwen3-30b-a3b-fp8');

let moderationCalls = 0;
const moderationEnv = {
  AI_MODERATION_MODEL: '@cf/zai-org/glm-4.7-flash',
  AI: { run: async (_model, request) => {
    moderationCalls += 1;
    if (request.response_format) { const error = new Error('schema unsupported'); error.status = 400; throw error; }
    return { result: { verdict: 'safe', score: 97, category: 'other' } };
  } }
};
const moderation = await runModerationModel(moderationEnv, { message: 'ordinary class comment', dictionaryCandidates: [] });
assert.equal(moderation.recommendation, 'allow');
assert.equal(moderation.confidenceMilli, 970);
assert.equal(moderationCalls, 2);
console.log('AI quality and administration UI refinement tests passed');
