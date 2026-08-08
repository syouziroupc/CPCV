from pathlib import Path
import hashlib

# Stage 7 target-language contract now follows the M2M100 language set.
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

# The authenticated admin page now starts in a neutral boot state, so the login
# shell remains structurally standalone but is intentionally hidden until a
# confirmed 401. Preserve the original hierarchy assertion with the new state.
p = Path('scripts/test-v0810-usability.mjs')
s = p.read_text()
old = "check('login uses one standalone auth shell', admin.includes('class=\"auth-shell admin-login-shell\"') && !admin.includes('class=\"section auth-panel\"') && !admin.includes('class=\"card admin-shell\"'));"
new = "check('login uses one standalone auth shell', admin.includes('class=\"auth-shell admin-login-shell hidden\"') && !admin.includes('class=\"section auth-panel\"') && !admin.includes('class=\"card admin-shell\"'));"
if old not in s:
    raise SystemExit('v0.8.10 auth shell assertion anchor missing')
p.write_text(s.replace(old, new, 1))

manifest = Path('SOURCE_SHA256SUMS.override.txt')
entries = {}
for line in manifest.read_text().splitlines():
    if line.strip():
        digest, name = line.split('  ', 1)
        entries[name] = digest
for name in ['scripts/test-ai-v2.mjs', 'scripts/test-v0810-usability.mjs']:
    entries[name] = hashlib.sha256(Path(name).read_bytes()).hexdigest()
manifest.write_text('\n'.join(f'{entries[name]}  {name}' for name in sorted(entries)) + '\n')
