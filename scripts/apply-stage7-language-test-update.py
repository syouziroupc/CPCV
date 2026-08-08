from pathlib import Path
import hashlib

p = Path('scripts/test-ai-v2.mjs')
s = p.read_text()
old = '''  let invalidLanguage = false;
  try { requireAiTargetLanguage("fr"); } catch (error) { invalidLanguage = error?.code === "AI_TARGET_LANGUAGE_INVALID"; }
  check("unsupported target languages are rejected", invalidLanguage);'''
new = '''  check("M2M100 target languages are accepted", requireAiTargetLanguage("fr") === "fr" && requireAiTargetLanguage("ko") === "ko");
  let invalidLanguage = false;
  try { requireAiTargetLanguage("xx-unsupported"); } catch (error) { invalidLanguage = error?.code === "AI_TARGET_LANGUAGE_INVALID"; }
  check("languages outside the M2M100 set are rejected", invalidLanguage);'''
if old not in s:
    raise SystemExit('Stage 7 language assertion anchor missing')
p.write_text(s.replace(old, new, 1))

manifest = Path('SOURCE_SHA256SUMS.override.txt')
entries = {}
for line in manifest.read_text().splitlines():
    if line.strip():
        digest, name = line.split('  ', 1)
        entries[name] = digest
entries['scripts/test-ai-v2.mjs'] = hashlib.sha256(p.read_bytes()).hexdigest()
manifest.write_text('\n'.join(f'{entries[name]}  {name}' for name in sorted(entries)) + '\n')
