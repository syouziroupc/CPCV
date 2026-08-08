from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

replace_once(
    "src/realtime/comment-room.js",
    '      if (result.comment.moderationState === "visible") {\n',
    '      if (!result.duplicate && result.comment.moderationState === "visible") {\n'
)
replace_once(
    "scripts/test-load-hardening.mjs",
    'assert.match(room, /if \\(result\\.comment\\.moderationState === "visible"\\)/);\n',
    'assert.match(room, /if \\(!result\\.duplicate && result\\.comment\\.moderationState === "visible"\\)/);\n'
)
print("duplicate broadcast compatibility fix applied")
