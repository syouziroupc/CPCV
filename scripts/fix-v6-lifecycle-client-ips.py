from pathlib import Path

path = Path(__file__).resolve().parents[1] / "scripts" / "test-account-lifecycle-v2.mjs"
text = path.read_text(encoding="utf-8")
old = '''  const db = new D1DatabaseAdapter(sqlite); const emails = []; const pending = [];
  const env = {'''
new = '''  const db = new D1DatabaseAdapter(sqlite); const emails = []; const pending = [];
  let clientIpSequence = 1;
  const env = {'''
if text.count(old) != 1:
    raise SystemExit(f"expected harness marker once, found {text.count(old)}")
text = text.replace(old, new, 1)
old = '''      headers.set("origin", ORIGIN); headers.set("cf-connecting-ip", "127.0.0.1");'''
new = '''      headers.set("origin", ORIGIN);
      headers.set("cf-connecting-ip", `127.0.0.${1 + (clientIpSequence++ % 200)}`);'''
if text.count(old) != 1:
    raise SystemExit(f"expected IP marker once, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Lifecycle invariant scenarios now use isolated client IPs")
