from pathlib import Path
path = Path(__file__).resolve().parents[1] / "scripts" / "finalize-membership-auth-races-v7.py"
text = path.read_text(encoding="utf-8")
old = '''    response = await h.api(`/api/org/members/${encodeURIComponent(deleteTargetId)}`, {
      method: "DELETE", auth: admin
    });'''
new = '''    response = await h.api(`/api/org/members/${encodeURIComponent(deleteTargetId)}`, {
      method: "DELETE", auth: admin, body: {}
    });'''
if text.count(old) != 1:
    raise SystemExit(f"expected DELETE test request once, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("DELETE authorization-race test now satisfies JSON request contract")