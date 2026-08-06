import assert from 'node:assert/strict';
import { runTranslationModel } from '../src/ai/provider.js';

const M2M = '@cf/meta/m2m100-1.2b';
const GLM = '@cf/zai-org/glm-4.7-flash';
const QWEN = '@cf/qwen/qwen3-30b-a3b-fp8';

await testAccurateUsesQwenPrompt();
await testBalancedFallsBackAfterRejectedModel();
await testFastFallsBackAfterDedicatedOutage();
await testUnknownLanguageUsesMultilingualModel();
console.log('AI translation resilience tests passed');

async function testAccurateUsesQwenPrompt() {
  const calls = [];
  const env = environment(async (model, request) => {
    calls.push({ model, request });
    assert.equal(model, QWEN);
    return { response: 'これは翻訳の正常性確認です。' };
  });
  const result = await runTranslationModel(env, {
    message: 'This is a translation health check.',
    sourceLanguage: 'en',
    targetLanguage: 'ja',
    quality: 'accurate'
  });
  assert.equal(result.translatedText, 'これは翻訳の正常性確認です。');
  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0].request.prompt, 'string');
  assert.equal(calls[0].request.messages, undefined);
}

async function testBalancedFallsBackAfterRejectedModel() {
  const calls = [];
  const env = environment(async (model, request) => {
    calls.push({ model, request });
    if (model === GLM) {
      const error = new Error('request schema rejected');
      error.status = 400;
      throw error;
    }
    assert.equal(model, QWEN);
    return { response: '代替モデルで翻訳しました。' };
  });
  const result = await runTranslationModel(env, {
    message: 'Fallback translation.',
    sourceLanguage: 'en',
    targetLanguage: 'ja',
    quality: 'balanced'
  });
  assert.equal(result.translatedText, '代替モデルで翻訳しました。');
  assert.deepEqual(calls.map((call) => call.model), [GLM, QWEN]);
  assert.equal(calls[0].request.reasoning_effort, 'low');
  assert.equal(calls[0].request.max_completion_tokens, 220);
  assert.equal(typeof calls[1].request.prompt, 'string');
}

async function testFastFallsBackAfterDedicatedOutage() {
  const calls = [];
  const env = environment(async (model, request) => {
    calls.push({ model, request });
    if (model === M2M) {
      const error = new Error('temporary model capacity');
      error.status = 503;
      throw error;
    }
    assert.equal(model, GLM);
    return { choices: [{ message: { content: '高速翻訳の代替結果です。' } }] };
  });
  const result = await runTranslationModel(env, {
    message: 'Fast translation fallback.',
    sourceLanguage: 'en',
    targetLanguage: 'ja',
    quality: 'fast'
  });
  assert.equal(result.translatedText, '高速翻訳の代替結果です。');
  assert.deepEqual(calls.map((call) => call.model), [M2M, GLM]);
  assert.equal(calls[0].request.source_lang, 'en');
  assert.equal(calls[0].request.target_lang, 'ja');
}

async function testUnknownLanguageUsesMultilingualModel() {
  const calls = [];
  const env = environment(async (model, request) => {
    calls.push({ model, request });
    assert.equal(model, GLM);
    return { response: '自動判定した翻訳です。' };
  });
  const result = await runTranslationModel(env, {
    message: 'La precisione della traduzione è scarsa.',
    sourceLanguage: 'other',
    targetLanguage: 'ja',
    quality: 'balanced'
  });
  assert.equal(result.translatedText, '自動判定した翻訳です。');
  assert.equal(calls.length, 1);
  assert.match(calls[0].request.messages[1].content, /"sourceLanguage":"auto"/);
}

function environment(run) {
  return {
    AI: { run },
    AI_TRANSLATION_MODEL: M2M,
    AI_TRANSLATION_BALANCED_MODEL: GLM,
    AI_TRANSLATION_ACCURATE_MODEL: QWEN,
    AI_TRANSLATION_TIMEOUT_MS: '1000',
    AI_TRANSLATION_FALLBACK_TIMEOUT_MS: '1000',
    AI_TRANSLATION_BALANCED_TIMEOUT_MS: '2000',
    AI_TRANSLATION_ACCURATE_TIMEOUT_MS: '3000'
  };
}
