import { detectCommentLanguage } from "../src/content-filter/language.js";
import { runTranslationModel } from "../src/ai/provider.js";

const results = [];

function check(name, ok, details = null) {
  results.push({ name, ok: Boolean(ok), details });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && details != null) console.log(details);
}

function translationEnv(handler) {
  const calls = [];
  return {
    calls,
    env: {
      AI_TRANSLATION_MODEL: "@cf/meta/m2m100-1.2b",
      AI_TRANSLATION_BALANCED_MODEL: "balanced-model",
      AI_TRANSLATION_ACCURATE_MODEL: "@cf/moonshotai/kimi-k2.6",
      AI: {
        async run(model, request) {
          calls.push({ model, request });
          return handler(model, request, calls.length);
        }
      }
    }
  };
}

async function main() {
  const az = detectCommentLanguage("Mən bu dərsi başa düşmədim, müəllim yenidən izah edə bilər?");
  check("Azerbaijani is not mislabeled as Turkish", az.code === "az", az);

  const shared = detectCommentLanguage("çğışü");
  check("shared Turkic letters alone do not force Turkish", shared.code !== "tr", shared);

  const tr = detectCommentLanguage("Bu ders çok iyi, teşekkür ederim hocam");
  check("ordinary Turkish is detected as Turkish", tr.code === "tr", tr);

  const casual = detectCommentLanguage("ngl bro this ain't it lol");
  check("casual English slang is detected as English", casual.code === "en" && casual.confidenceMilli >= 900, casual);

  const casual2 = detectCommentLanguage("idk tbh, kinda confusing rn");
  check("short casual English stays English", casual2.code === "en", casual2);

  {
    const h = translationEnv(() => ({ translated_text: "Mən dərsi başa düşdüm." }));
    const result = await runTranslationModel(h.env, {
      message: "授業を理解しました", sourceLanguage: "ja", sourceLanguageConfidenceMilli: 1000,
      targetLanguage: "az", quality: "fast"
    });
    check("provider accepts Azerbaijani target from public language contract",
      result.translatedText && h.calls[0]?.model === "@cf/meta/m2m100-1.2b"
      && h.calls[0]?.request?.source_lang === "ja" && h.calls[0]?.request?.target_lang === "az", h.calls);
  }

  {
    const h = translationEnv(() => ({ choices: [{ message: { content: "This is an uncertain Turkic-language comment." } }] }));
    await runTranslationModel(h.env, {
      message: "çox yaxşı", sourceLanguage: "tr", sourceLanguageConfidenceMilli: 650,
      targetLanguage: "en", quality: "fast"
    });
    const payload = JSON.parse(h.calls[0]?.request?.messages?.[1]?.content || "{}");
    check("low-confidence source bypasses M2M100 and uses auto-detect LLM",
      h.calls[0]?.model.includes("kimi-k2.6") && payload.sourceLanguage === "auto", h.calls);
  }

  {
    const h = translationEnv(() => ({ choices: [{ message: { content: "I did not understand this lesson." } }] }));
    const result = await runTranslationModel(h.env, {
      message: "Mən bu dərsi başa düşmədim", sourceLanguage: "az", sourceLanguageConfidenceMilli: 980,
      targetLanguage: "en", quality: "balanced"
    });
    check("Azerbaijani balanced translation is promoted to accurate model",
      result.effectiveQuality === "accurate" && h.calls[0]?.model.includes("kimi-k2.6"), { result, calls: h.calls });
    check("Kimi translation uses its supported completion request shape",
      h.calls[0]?.request?.max_completion_tokens === 220 && !Object.hasOwn(h.calls[0]?.request || {}, "max_tokens"), h.calls[0]);
  }

  {
    const h = translationEnv(() => ({ choices: [{ message: { content: "正直、これはちょっと違うと思う。" } }] }));
    const result = await runTranslationModel(h.env, {
      message: "ngl bro this ain't it lol", sourceLanguage: "en", sourceLanguageConfidenceMilli: 950,
      targetLanguage: "ja", quality: "balanced"
    });
    check("casual English balanced translation is promoted to accurate model",
      result.effectiveQuality === "accurate" && h.calls[0]?.model.includes("kimi-k2.6"), { result, calls: h.calls });
  }

  {
    const h = translationEnv((model) => model === "balanced-model"
      ? { choices: [{ message: { content: "Esto es importante" } }] }
      : { choices: [{ message: { content: "This is important" } }] });
    const result = await runTranslationModel(h.env, {
      message: "Esto es importante", sourceLanguage: "es", sourceLanguageConfidenceMilli: 950,
      targetLanguage: "en", quality: "balanced"
    });
    check("unchanged non-target output is rejected and retried on another model",
      result.translatedText === "This is important" && h.calls.length === 2, h.calls);
  }

  {
    const h = translationEnv((model) => model.includes("kimi-k2.6")
      ? { choices: [{ message: { content: "Mən bunu başa düşmədim" } }] }
      : { choices: [{ message: { content: "I did not understand this." } }] });
    const result = await runTranslationModel(h.env, {
      message: "Mən bunu başa düşmədim", sourceLanguage: "az", sourceLanguageConfidenceMilli: 980,
      targetLanguage: "en", quality: "balanced"
    });
    check("obvious wrong-language output is rejected before persistence",
      result.translatedText === "I did not understand this." && h.calls.length === 2, h.calls);
  }

  const failed = results.filter((item) => !item.ok).length;
  console.log(`\nTranslation language hardening summary: ${results.length - failed} passed, ${failed} failed, ${results.length} total.`);
  if (failed) process.exitCode = 1;
}

await main();
