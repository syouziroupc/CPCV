from pathlib import Path

p = Path("scripts/test-ai-quality-ui-refinement.mjs")
text = p.read_text()
old = """await runTranslationModel(env, { message: 'Una frase italiana', sourceLanguage: 'other', targetLanguage: 'ja', quality: 'fast' });
assert.equal(calls.at(-1).model, '@cf/zai-org/glm-4.7-flash');
"""
new = """await runTranslationModel(env, { message: 'Una frase italiana', sourceLanguage: 'other', targetLanguage: 'ja', quality: 'fast' });
assert.equal(calls.at(-1).model, '@cf/qwen/qwen3-30b-a3b-fp8');
"""
if old not in text:
    raise SystemExit("unknown-source translation expectation shape changed")
p.write_text(text.replace(old, new, 1))
