from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ".github/workflows/ci.yml",
    ".github/workflows/deploy-production.yml",
    ".github/workflows/responsive-and-ai-regression.yml",
]

changed = 0
for rel in FILES:
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    before = text
    text = text.replace("actions/checkout@v4", "actions/checkout@v7")
    text = text.replace("actions/setup-node@v4", "actions/setup-node@v7")
    if text == before:
        raise SystemExit(f"{rel}: no legacy checkout/setup-node action found")
    path.write_text(text, encoding="utf-8")
    changed += 1

print(f"Modernized GitHub Actions runtime in {changed} permanent workflows")
