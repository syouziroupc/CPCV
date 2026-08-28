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
OUT = Path("u22-translation-mask-evidence")
RAW = OUT / "raw"
MP4 = OUT / "mp4"
SHOTS = OUT / "screenshots"
for directory in (OUT, RAW, MP4, SHOTS):
    directory.mkdir(parents=True, exist_ok=True)

manifest = {
    "origin": ORIGIN,
    "policy": [
        "Live Cloudflare staging only",
        "Current CPCV UI only",
        "No DOM replacement and no fabricated result text",
        "Translation clip accepted only after Workers AI result is present in the real viewer",
        "Mask clip accepted only after dictionary-filtered text is present in the real viewer"
    ],
    "clips": [],
    "sessions": {}
}


def record_context(browser, name: str, *, width=1920, height=1080, storage_state=None):
    ctx = browser.new_context(
        viewport={"width": width, "height": height},
        record_video_dir=str(RAW),
        record_video_size={"width": width, "height": height},
        storage_state=storage_state,
        locale="ja-JP"
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
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst)
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
    page.wait_for_timeout(1500)
    pack_status = page.locator("#filterPackStatus").inner_text()
    if "日本語基本: 導入済み" not in pack_status:
        raise RuntimeError(f"Japanese filter pack is not installed: {pack_status}")
    state = ctx.storage_state()
    ctx.close()
    return state


def create_pdf(browser):
    path = OUT / "lesson.pdf"
    ctx = browser.new_context()
    page = ctx.new_page()
    page.set_content("""<!doctype html><meta charset='utf-8'><style>
@page { size: 13.333in 7.5in; margin:0; } body{margin:0;font-family:'Noto Sans JP','IPA Gothic',sans-serif;color:#17211d}
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
        "public_code": page.locator("#publicCode").inner_text().strip()[-6:]
    }
    state = ctx.storage_state()
    ctx.close()
    return session, state


def private_request(page, method, path, payload=None):
    result = page.evaluate("""async ({method,path,payload}) => {
      const sr = await fetch('/api/auth/session', {cache:'no-store', credentials:'same-origin'});
      const s = await sr.json();
      if (!sr.ok || !s.csrfToken) return {ok:false,status:sr.status,text:JSON.stringify(s)};
      const opts = {method, cache:'no-store', credentials:'same-origin', headers:{'x-csrf-token':s.csrfToken}};
      if (payload !== null) { opts.headers['content-type']='application/json'; opts.body=JSON.stringify(payload); }
      const r = await fetch(path, opts);
      return {ok:r.ok,status:r.status,text:await r.text()};
    }""", {"method": method, "path": path, "payload": payload})
    if not result.get("ok"):
        raise RuntimeError(f"private API failed {method} {path}: {result}")
    try:
        return json.loads(result.get("text") or "{}")
    except Exception:
        return {"raw": result.get("text", "")}


def load_pdf(page, viewer_url, pdf_path):
    page.goto(viewer_url, wait_until="domcontentloaded", timeout=30000)
    page.locator("#emptyDocument").wait_for(state="visible", timeout=30000)
    page.locator("#topBar").wait_for(state="visible", timeout=30000)
    page.locator("input[type=file][accept='application/pdf']").set_input_files(str(pdf_path))
    page.locator("#pdfStage").wait_for(state="visible", timeout=30000)
    page.wait_for_function("() => !document.querySelector('#pdfPageState')?.textContent.startsWith('0')", timeout=30000)
    page.wait_for_timeout(1200)


def set_long_display(page, session):
    private_request(page, "POST", f"/api/private/sessions/{session['id']}/settings", {
        "postingEnabled": True,
        "commentsVisible": True,
        "commentDisplaySeconds": 300,
        "commentDisplayMode": "stack3",
        "moderationMode": "off",
        "status": "active"
    })


def configure_translation(browser, storage_state, session):
    ctx, page = record_context(browser, "01_translation_settings_verified", storage_state=storage_state)
    started = time.monotonic()
    page.goto(session["admin_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#sessionAiTranslationEnabled").wait_for(state="visible", timeout=30000)
    page.locator("#sessionAiTranslationEnabled").scroll_into_view_if_needed()
    if page.locator("#sessionAiTranslationEnabled").is_disabled():
        raise RuntimeError("Organization AI is disabled")
    page.locator("#sessionAiTranslationEnabled").check()
    page.locator("#sessionAiTargetLanguage").select_option("ja")
    page.locator("#sessionAiTranslationQuality").select_option("fast")
    private_request(page, "PATCH", f"/api/private/sessions/{session['id']}/ai-settings", {
        "moderationEnabled": False,
        "translationEnabled": True,
        "targetLanguage": "ja",
        "translationQuality": "fast"
    })
    set_long_display(page, session)
    page.reload(wait_until="domcontentloaded", timeout=30000)
    page.locator("#sessionAiTranslationEnabled").wait_for(state="visible", timeout=30000)
    page.locator("#sessionAiTranslationEnabled").scroll_into_view_if_needed()
    page.wait_for_timeout(1000)
    if not page.locator("#sessionAiTranslationEnabled").is_checked():
        raise RuntimeError("Translation was not persisted")
    if page.locator("#sessionAiTargetLanguage").input_value() != "ja":
        raise RuntimeError("Translation target was not persisted")
    if page.locator("#sessionAiTranslationQuality").input_value() != "fast":
        raise RuntimeError("Translation mode was not persisted")
    page.wait_for_timeout(2500)
    finish(ctx, page, "01_translation_settings_verified", "Real CPCV admin UI after backend-confirmed AI translation settings", started)


def post_translation(browser, session):
    ctx, page = record_context(browser, "02_translation_student_post", width=430, height=932)
    started = time.monotonic()
    page.goto(session["join_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#message").wait_for(state="visible", timeout=30000)
    source = "Could you explain this point again?"
    page.locator("#message").fill(source)
    page.wait_for_timeout(900)
    page.locator("#sendButton").click()
    page.wait_for_timeout(2400)
    finish(ctx, page, "02_translation_student_post", "Real student UI submits the English source comment", started, {"source": source})
    return source


def verify_and_record_translation(browser, storage_state, session, pdf_path, source):
    probe_ctx = browser.new_context(viewport={"width":1920,"height":1080}, storage_state=storage_state, locale="ja-JP")
    probe = probe_ctx.new_page()
    load_pdf(probe, session["viewer_url"], pdf_path)
    try:
        probe.wait_for_function("() => { const e=document.querySelector('.comment-translation'); return !!e && (e.textContent||'').trim().length>0; }", timeout=120000)
    except PlaywrightTimeoutError:
        probe.screenshot(path=str(SHOTS / "translation_timeout.png"), full_page=False)
        raise RuntimeError("Real Workers AI translation did not appear")
    translated = probe.locator(".comment-translation").last.inner_text().strip()
    if not translated:
        raise RuntimeError("Translation element was empty")
    probe_ctx.close()

    ctx, page = record_context(browser, "03_translation_projector_verified", storage_state=storage_state)
    started = time.monotonic()
    load_pdf(page, session["viewer_url"], pdf_path)
    page.wait_for_function("() => { const e=document.querySelector('.comment-translation'); return !!e && (e.textContent||'').trim().length>0; }", timeout=30000)
    visible = page.locator(".comment-card,.scroll-comment").last.inner_text().strip()
    if source not in visible or translated not in visible:
        raise RuntimeError(f"Source/translation not both visible: {visible}")
    page.wait_for_timeout(7500)
    finish(ctx, page, "03_translation_projector_verified", "Real projector UI visibly shows the English source and genuine Workers AI Japanese translation", started, {"source": source, "translated": translated, "visible": visible})
    manifest["translation_verified"] = {"source": source, "translated": translated, "visible": visible}


def configure_mask(browser, storage_state, session):
    ctx, page = record_context(browser, "04_mask_settings_verified", storage_state=storage_state)
    started = time.monotonic()
    page.goto(session["admin_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#sessionFilterSimpleMode").wait_for(state="visible", timeout=30000)
    page.locator("#sessionFilterSimpleMode").scroll_into_view_if_needed()
    page.locator("#sessionFilterSimpleMode").select_option("dictionary")
    private_request(page, "PATCH", f"/api/private/sessions/{session['id']}/filter-settings", {
        "enabled": True,
        "aiRoutingMode": "off",
        "maskCharacter": "＊",
        "translationFilterEnabled": True,
        "unsupportedLanguageMode": "review_only"
    })
    set_long_display(page, session)
    page.reload(wait_until="domcontentloaded", timeout=30000)
    page.locator("#sessionFilterSimpleMode").wait_for(state="visible", timeout=30000)
    page.locator("#sessionFilterSimpleMode").scroll_into_view_if_needed()
    page.wait_for_timeout(1000)
    if page.locator("#sessionFilterSimpleMode").input_value() != "dictionary":
        raise RuntimeError("Dictionary filter was not persisted")
    page.wait_for_timeout(2500)
    finish(ctx, page, "04_mask_settings_verified", "Real CPCV admin UI after backend-confirmed dictionary masking settings", started)


def post_mask(browser, session):
    ctx, page = record_context(browser, "05_mask_student_post", width=430, height=932)
    started = time.monotonic()
    page.goto(session["join_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#message").wait_for(state="visible", timeout=30000)
    source = "この説明は無能だと思います"
    page.locator("#message").fill(source)
    page.wait_for_timeout(900)
    page.locator("#sendButton").click()
    page.wait_for_timeout(2400)
    finish(ctx, page, "05_mask_student_post", "Real student UI submits a comment containing an installed Japanese dictionary term", started, {"source": source})
    return source


def verify_and_record_mask(browser, storage_state, session, pdf_path, source):
    probe_ctx = browser.new_context(viewport={"width":1920,"height":1080}, storage_state=storage_state, locale="ja-JP")
    probe = probe_ctx.new_page()
    load_pdf(probe, session["viewer_url"], pdf_path)
    try:
        probe.wait_for_function("() => { const t=(document.querySelector('#commentList')?.textContent||'')+(document.querySelector('#scrollCommentLayer')?.textContent||''); return t.includes('＊') && !t.includes('無能'); }", timeout=30000)
    except PlaywrightTimeoutError:
        probe.screenshot(path=str(SHOTS / "mask_timeout.png"), full_page=False)
        raise RuntimeError("Real dictionary mask did not appear")
    probe_ctx.close()

    ctx, page = record_context(browser, "06_mask_projector_verified", storage_state=storage_state)
    started = time.monotonic()
    load_pdf(page, session["viewer_url"], pdf_path)
    page.wait_for_function("() => { const t=(document.querySelector('#commentList')?.textContent||'')+(document.querySelector('#scrollCommentLayer')?.textContent||''); return t.includes('＊') && !t.includes('無能'); }", timeout=30000)
    visible = (page.locator("#commentList").inner_text() + "\n" + page.locator("#scrollCommentLayer").inner_text()).strip()
    if "＊" not in visible or "無能" in visible:
        raise RuntimeError(f"Mask verification failed: {visible}")
    page.wait_for_timeout(7500)
    finish(ctx, page, "06_mask_projector_verified", "Real projector UI visibly shows the dictionary-masked comment", started, {"source": source, "visible": visible})
    manifest["mask_verified"] = {"source": source, "visible": visible}


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    storage_state = setup_organization(browser)
    pdf_path = create_pdf(browser)

    translation, storage_state = create_session(browser, storage_state, "U22 AI翻訳 実機確認")
    manifest["sessions"]["translation"] = translation
    configure_translation(browser, storage_state, translation)
    source_en = post_translation(browser, translation)
    verify_and_record_translation(browser, storage_state, translation, pdf_path, source_en)

    mask, storage_state = create_session(browser, storage_state, "U22 伏字 実機確認")
    manifest["sessions"]["mask"] = mask
    configure_mask(browser, storage_state, mask)
    source_mask = post_mask(browser, mask)
    verify_and_record_mask(browser, storage_state, mask, pdf_path, source_mask)

    browser.close()

convert()
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"ok": True, "translation": manifest.get("translation_verified"), "mask": manifest.get("mask_verified"), "clips": len(manifest["clips"])}, ensure_ascii=False, indent=2))
