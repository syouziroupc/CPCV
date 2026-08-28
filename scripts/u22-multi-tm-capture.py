from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

ORIGIN = os.environ["STAGING_ORIGIN"].rstrip("/")
LOGIN_ID = os.environ["CAPTURE_LOGIN_ID"]
PASSWORD = os.environ["CAPTURE_PASSWORD"]
OUT = Path("u22-multi-tm-evidence")
RAW = OUT / "raw"
MP4 = OUT / "mp4"
SHOTS = OUT / "screenshots"
for d in (OUT, RAW, MP4, SHOTS):
    d.mkdir(parents=True, exist_ok=True)

manifest = {
    "origin": ORIGIN,
    "policy": [
        "Live isolated Cloudflare staging only",
        "Current CPCV source UI only",
        "No DOM replacement or fabricated result text",
        "Three separate real student posts per feature",
        "Translation accepted only when three Workers AI translations are visible together",
        "Mask accepted only when three dictionary-filtered posts are visible together",
    ],
    "clips": [],
    "sessions": {},
}


def record_context(browser, name: str, *, width=1920, height=1080, storage_state=None):
    ctx = browser.new_context(
        viewport={"width": width, "height": height},
        record_video_dir=str(RAW),
        record_video_size={"width": width, "height": height},
        storage_state=storage_state,
        locale="ja-JP",
    )
    return ctx, ctx.new_page()


def finish(ctx, page, name: str, purpose: str, started: float, extra=None):
    video = page.video
    try:
        page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=False)
    except Exception:
        pass
    elapsed = time.monotonic() - started
    ctx.close()
    src = Path(video.path())
    dst = RAW / f"{name}.webm"
    shutil.copy2(src, dst)
    manifest["clips"].append({"name": name, "purpose": purpose, "seconds": round(elapsed, 3), **(extra or {})})


def convert():
    for src in sorted(RAW.glob("*.webm")):
        dst = MP4 / f"{src.stem}.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src),
            "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst),
        ], check=True)


def login(page):
    page.goto(f"{ORIGIN}/admin", wait_until="domcontentloaded", timeout=30000)
    page.locator("#teacherLoginForm").wait_for(state="visible", timeout=30000)
    page.locator("#teacherLoginId").fill(LOGIN_ID)
    page.locator("#teacherPassword").fill(PASSWORD)
    page.locator("#loginButton").click()
    page.locator("#createSection").wait_for(state="visible", timeout=30000)


def setup_organization(browser):
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ja-JP")
    page = ctx.new_page()
    login(page)
    page.goto(f"{ORIGIN}/account#organizationSettings", wait_until="domcontentloaded", timeout=30000)
    page.locator("#organizationSettings").wait_for(state="visible", timeout=30000)
    page.locator("#organizationAiEnabled").wait_for(state="visible", timeout=30000)
    if not page.locator("#organizationAiEnabled").is_checked():
        page.locator("#organizationAiEnabled").check()
        page.locator("#saveOrganizationAiButton").click()
        page.wait_for_function("() => document.querySelector('#organizationAiStatus')?.textContent.includes('保存しました')", timeout=30000)
    strict = page.locator('[data-filter-preset="strict"]')
    strict.wait_for(state="visible", timeout=30000)
    if strict.get_attribute("aria-pressed") != "true":
        strict.click()
        page.wait_for_function("() => document.querySelector('[data-filter-preset=\"strict\"]')?.getAttribute('aria-pressed') === 'true'", timeout=60000)
    page.wait_for_timeout(1800)
    status = page.locator("#filterPackStatus").inner_text()
    if "日本語基本: 導入済み" not in status:
        raise RuntimeError(f"Japanese filter pack is not installed: {status}")
    state = ctx.storage_state()
    ctx.close()
    return state


def create_pdf(browser):
    path = OUT / "lesson.pdf"
    ctx = browser.new_context()
    page = ctx.new_page()
    page.set_content("""<!doctype html><meta charset='utf-8'><style>
@page{size:13.333in 7.5in;margin:0}body{margin:0;font-family:'Noto Sans JP','IPA Gothic',sans-serif;color:#17211d}
section{box-sizing:border-box;width:100%;height:100vh;padding:72px 86px;background:#fcfbf8}
small{font-size:18px;color:#1f5b4f;font-weight:700;letter-spacing:.1em}h1{font-size:50px;margin:18px 0 28px}p{font-size:29px;line-height:1.65}
</style><section><small>CPCV DEMO LESSON</small><h1>地域文化と観光</h1><p>地域の文化は、観光によってどのように変化するのでしょうか。</p></section>""")
    page.pdf(path=str(path), width="13.333in", height="7.5in", print_background=True)
    ctx.close()
    return path


def create_session(browser, storage_state, title):
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, storage_state=storage_state, locale="ja-JP")
    page = ctx.new_page()
    page.goto(f"{ORIGIN}/admin", wait_until="domcontentloaded", timeout=30000)
    page.locator("#createSection").wait_for(state="visible", timeout=30000)
    page.locator("#newTitle").fill(title)
    page.locator("#createButton").click()
    page.wait_for_url(f"{ORIGIN}/admin/*", timeout=30000)
    page.locator("#sessionSection").wait_for(state="visible", timeout=30000)
    session = {
        "id": page.url.rstrip("/").split("/")[-1],
        "admin_url": page.url,
        "join_url": page.locator("#joinUrl").inner_text().strip(),
        "viewer_url": page.locator("#viewerUrl").inner_text().strip(),
    }
    state = ctx.storage_state()
    ctx.close()
    return session, state


def private_request(page, method, path, payload=None):
    result = page.evaluate("""async ({method,path,payload}) => {
      const sr=await fetch('/api/auth/session',{cache:'no-store',credentials:'same-origin'}); const s=await sr.json();
      if(!sr.ok||!s.csrfToken) return {ok:false,status:sr.status,text:JSON.stringify(s)};
      const opts={method,cache:'no-store',credentials:'same-origin',headers:{'x-csrf-token':s.csrfToken}};
      if(payload!==null){opts.headers['content-type']='application/json';opts.body=JSON.stringify(payload)}
      const r=await fetch(path,opts); return {ok:r.ok,status:r.status,text:await r.text()};
    }""", {"method": method, "path": path, "payload": payload})
    if not result.get("ok"):
        raise RuntimeError(f"private API failed {method} {path}: {result}")
    return result


def set_long_stack(page, session):
    private_request(page, "POST", f"/api/private/sessions/{session['id']}/settings", {
        "postingEnabled": True,
        "commentsVisible": True,
        "commentDisplaySeconds": 300,
        "commentDisplayMode": "stack3",
        "moderationMode": "off",
        "status": "active",
    })


def load_pdf(page, viewer_url, pdf_path):
    page.goto(viewer_url, wait_until="domcontentloaded", timeout=30000)
    page.locator("#topBar").wait_for(state="visible", timeout=30000)
    page.locator("input[type=file][accept='application/pdf']").set_input_files(str(pdf_path))
    page.locator("#pdfStage").wait_for(state="visible", timeout=30000)
    page.wait_for_function("() => !document.querySelector('#pdfPageState')?.textContent.startsWith('0')", timeout=30000)
    page.wait_for_timeout(1300)


def send_posts(browser, session, messages, name):
    ctx, page = record_context(browser, name, width=430, height=932)
    started = time.monotonic()
    page.goto(session["join_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#message").wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(700)
    for message in messages:
        page.locator("#message").fill(message)
        page.wait_for_timeout(500)
        page.locator("#sendButton").click()
        page.wait_for_timeout(1400)
    page.wait_for_timeout(1500)
    finish(ctx, page, name, "Three separate real student posts from the current mobile UI", started, {"messages": messages})


def capture_translation(browser, storage_state, pdf_path):
    session, storage_state = create_session(browser, storage_state, "U22 AI翻訳 複数投稿デモ")
    manifest["sessions"]["translation"] = session
    admin_ctx = browser.new_context(viewport={"width":1440,"height":1000}, storage_state=storage_state, locale="ja-JP")
    admin = admin_ctx.new_page()
    admin.goto(session["admin_url"], wait_until="domcontentloaded", timeout=30000)
    admin.locator("#sessionAiTranslationEnabled").wait_for(state="visible", timeout=30000)
    private_request(admin, "PATCH", f"/api/private/sessions/{session['id']}/ai-settings", {
        "moderationEnabled": False,
        "translationEnabled": True,
        "targetLanguage": "ja",
        "translationQuality": "fast",
    })
    set_long_stack(admin, session)
    admin_ctx.close()

    messages = [
        "Could you explain this point again?",
        "I am not sure why this happens.",
        "Can you show another example?",
    ]
    send_posts(browser, session, messages, "01_translation_three_student_posts")

    ctx, page = record_context(browser, "02_translation_three_projector_verified", storage_state=storage_state)
    started = time.monotonic()
    load_pdf(page, session["viewer_url"], pdf_path)
    try:
        page.wait_for_function("() => document.querySelectorAll('.comment-translation').length >= 3", timeout=120000)
    except PlaywrightTimeoutError:
        page.screenshot(path=str(SHOTS / "translation_three_timeout.png"), full_page=False)
        raise RuntimeError("Three real Workers AI translations did not become visible")
    cards = page.locator(".comment-card,.scroll-comment")
    visible = cards.all_inner_texts()
    joined = "\n---\n".join(visible)
    translations = page.locator(".comment-translation").all_inner_texts()
    if len(translations) < 3 or any(not str(x).strip() for x in translations[:3]):
        raise RuntimeError(f"Translation count/content invalid: {translations}")
    if any(m not in joined for m in messages):
        raise RuntimeError(f"Not all English source posts visible together: {joined}")
    page.screenshot(path=str(SHOTS / "02_translation_three_projector_verified.png"), full_page=False)
    page.wait_for_timeout(8500)
    finish(ctx, page, "02_translation_three_projector_verified", "Three real English posts and three genuine Workers AI Japanese translations visible together", started, {"sources": messages, "translations": translations[:3], "visible": visible})
    manifest["translation_verified"] = {"sources": messages, "translations": translations[:3], "visible": visible}
    return storage_state


def capture_mask(browser, storage_state, pdf_path):
    session, storage_state = create_session(browser, storage_state, "U22 伏字 複数投稿デモ")
    manifest["sessions"]["mask"] = session
    admin_ctx = browser.new_context(viewport={"width":1440,"height":1000}, storage_state=storage_state, locale="ja-JP")
    admin = admin_ctx.new_page()
    admin.goto(session["admin_url"], wait_until="domcontentloaded", timeout=30000)
    admin.locator("#sessionFilterSimpleMode").wait_for(state="visible", timeout=30000)
    private_request(admin, "PATCH", f"/api/private/sessions/{session['id']}/filter-settings", {
        "enabled": True,
        "aiRoutingMode": "off",
        "maskCharacter": "＊",
        "translationFilterEnabled": True,
        "unsupportedLanguageMode": "review_only",
    })
    set_long_stack(admin, session)
    admin_ctx.close()

    messages = [
        "この説明は無能だと思います",
        "無能という言葉は使わない方がいいです",
        "相手を無能と呼ぶのは失礼です",
    ]
    send_posts(browser, session, messages, "03_mask_three_student_posts")

    ctx, page = record_context(browser, "04_mask_three_projector_verified", storage_state=storage_state)
    started = time.monotonic()
    load_pdf(page, session["viewer_url"], pdf_path)
    try:
        page.wait_for_function("() => { const cards=[...document.querySelectorAll('.comment-card,.scroll-comment')]; if(cards.length<3)return false; const t=cards.map(x=>x.textContent||'').join('\n'); const masked=(t.match(/[＊*]{2,}/g)||[]).length; return masked>=3 && !t.includes('無能'); }", timeout=45000)
    except PlaywrightTimeoutError:
        page.screenshot(path=str(SHOTS / "mask_three_timeout.png"), full_page=False)
        raise RuntimeError("Three real dictionary-masked posts did not become visible")
    visible = page.locator(".comment-card,.scroll-comment").all_inner_texts()
    joined = "\n---\n".join(visible)
    if "無能" in joined:
        raise RuntimeError(f"Unmasked source term remained visible: {joined}")
    page.screenshot(path=str(SHOTS / "04_mask_three_projector_verified.png"), full_page=False)
    page.wait_for_timeout(8500)
    finish(ctx, page, "04_mask_three_projector_verified", "Three real dictionary-filtered posts visible together in the projector UI", started, {"sources": messages, "visible": visible})
    manifest["mask_verified"] = {"sources": messages, "visible": visible}
    return storage_state


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    storage_state = setup_organization(browser)
    pdf_path = create_pdf(browser)
    storage_state = capture_translation(browser, storage_state, pdf_path)
    capture_mask(browser, storage_state, pdf_path)
    browser.close()

convert()
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"ok": True, "translation": manifest.get("translation_verified"), "mask": manifest.get("mask_verified"), "clips": len(manifest["clips"])}, ensure_ascii=False))
