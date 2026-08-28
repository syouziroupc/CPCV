from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Callable

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

ORIGIN = os.environ["STAGING_ORIGIN"].rstrip("/")
LOGIN_ID = os.environ["CAPTURE_LOGIN_ID"]
PASSWORD = os.environ["CAPTURE_PASSWORD"]
OUT = Path("u22-real-evidence")
RAW = OUT / "raw"
MP4 = OUT / "mp4"
SHOTS = OUT / "screenshots"
for directory in (OUT, RAW, MP4, SHOTS):
    directory.mkdir(parents=True, exist_ok=True)

manifest: dict = {
    "origin": ORIGIN,
    "login_id": LOGIN_ID,
    "recording_policy": [
        "Live staging only",
        "Current CPCV source UI only",
        "No DOM replacement or fake application screens",
        "Workers AI translation result must be returned by staging before capture is accepted",
        "Dictionary mask result must be returned by staging before capture is accepted",
    ],
    "clips": [],
    "sessions": {},
}


def log(message: str) -> None:
    print(message, flush=True)


def wait_visible(page, selector: str, timeout: int = 30000):
    return page.locator(selector).wait_for(state="visible", timeout=timeout)


def record_context(browser, name: str, *, width: int = 1920, height: int = 1080, storage_state=None):
    context = browser.new_context(
        viewport={"width": width, "height": height},
        record_video_dir=str(RAW),
        record_video_size={"width": width, "height": height},
        storage_state=storage_state,
        locale="ja-JP",
    )
    page = context.new_page()
    return context, page


def finish_recording(context, page, name: str, purpose: str, started: float, extra: dict | None = None) -> Path:
    video = page.video
    elapsed = time.monotonic() - started
    try:
        page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=False)
    except Exception:
        pass
    context.close()
    source = Path(video.path())
    target = RAW / f"{name}.webm"
    shutil.copy2(source, target)
    manifest["clips"].append({"name": name, "purpose": purpose, "raw_seconds": round(elapsed, 3), **(extra or {})})
    return target


def convert_videos() -> None:
    for source in sorted(RAW.glob("*.webm")):
        target = MP4 / f"{source.stem}.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(source), "-an", "-c:v", "libx264", "-preset", "medium",
            "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target)
        ], check=True)


def login(page) -> None:
    page.goto(f"{ORIGIN}/admin", wait_until="domcontentloaded", timeout=30000)
    wait_visible(page, "#teacherLoginForm")
    page.locator("#teacherLoginId").fill(LOGIN_ID)
    page.locator("#teacherPassword").fill(PASSWORD)
    page.locator("#loginButton").click()
    page.locator("#createSection").wait_for(state="visible", timeout=30000)


def setup_organization(browser):
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ja-JP")
    page = context.new_page()
    login(page)
    state = context.storage_state()

    page.goto(f"{ORIGIN}/account#organizationSettings", wait_until="domcontentloaded", timeout=30000)
    page.locator("#organizationSettings").wait_for(state="visible", timeout=30000)
    page.locator("#organizationAiEnabled").wait_for(state="visible", timeout=30000)
    if not page.locator("#organizationAiEnabled").is_checked():
        page.locator("#organizationAiEnabled").check()
        page.locator("#saveOrganizationAiButton").click()
        page.wait_for_function("() => document.querySelector('#organizationAiStatus')?.textContent.includes('保存しました')", timeout=30000)
    log("organization AI enabled")

    # Strict preset installs the real Japanese/English filter packs and saves real policies.
    strict = page.locator('[data-filter-preset="strict"]')
    strict.wait_for(state="visible", timeout=30000)
    if strict.get_attribute("aria-pressed") != "true":
        strict.click()
        page.wait_for_function("() => document.querySelector('[data-filter-preset=\"strict\"]')?.getAttribute('aria-pressed') === 'true'", timeout=60000)
    page.wait_for_timeout(1500)
    filter_status = page.locator("#filterPackStatus").inner_text()
    log(f"filter packs: {filter_status}")
    if "日本語基本: 導入済み" not in filter_status:
        raise RuntimeError(f"Japanese filter pack was not installed: {filter_status}")

    state = context.storage_state()
    context.close()
    return state


def create_pdf(browser) -> Path:
    pdf_path = OUT / "u22-demo-lesson.pdf"
    context = browser.new_context()
    page = context.new_page()
    page.set_content("""
<!doctype html><meta charset='utf-8'>
<style>
@page { size: 13.333in 7.5in; margin: 0; }
body { margin:0; font-family: Arial, 'Noto Sans JP', sans-serif; color:#17211d; }
section { box-sizing:border-box; width:100%; height:100vh; padding:70px 86px; page-break-after:always; background:#fcfbf8; }
h1 { font-size:48px; margin:0 0 28px; } p { font-size:28px; line-height:1.6; }
.k { font-size:18px; letter-spacing:.12em; color:#1f5b4f; font-weight:700; }
</style>
<section><div class='k'>CPCV DEMO LESSON / 1</div><h1>地域文化と観光</h1><p>地域の文化は、観光によってどのように変化するのでしょうか。</p></section>
<section><div class='k'>CPCV DEMO LESSON / 2</div><h1>地域資源と来訪者</h1><p>地域資源・来訪者・地域社会の関係を考えます。</p></section>
<section><div class='k'>CPCV DEMO LESSON / 3</div><h1>今日のまとめ</h1><p>学生の反応を確認しながら、授業内容を振り返ります。</p></section>
""")
    page.pdf(path=str(pdf_path), width="13.333in", height="7.5in", print_background=True)
    context.close()
    return pdf_path


def read_session(page) -> dict:
    wait_visible(page, "#sessionSection", 30000)
    page.locator("#publicCode").wait_for(state="visible", timeout=30000)
    return {
        "admin_url": page.url,
        "session_id": page.url.rstrip("/").split("/")[-1],
        "public_code": page.locator("#publicCode").inner_text().strip(),
        "join_url": page.locator("#joinUrl").inner_text().strip(),
        "viewer_url": page.locator("#viewerUrl").inner_text().strip(),
        "title": page.locator("#sessionTitle").inner_text().strip(),
    }


def create_session(browser, storage_state, title: str, record_name: str | None = None) -> tuple[dict, dict]:
    if record_name:
        context, page = record_context(browser, record_name, storage_state=storage_state)
        started = time.monotonic()
    else:
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, storage_state=storage_state, locale="ja-JP")
        page = context.new_page()
        started = time.monotonic()
    page.goto(f"{ORIGIN}/admin", wait_until="domcontentloaded", timeout=30000)
    page.locator("#createSection").wait_for(state="visible", timeout=30000)
    if record_name:
        page.wait_for_timeout(1200)
    page.locator("#newTitle").fill(title)
    page.locator("#createButton").click()
    page.wait_for_url(f"{ORIGIN}/admin/*", timeout=30000)
    session = read_session(page)
    page.wait_for_timeout(1800)
    state = context.storage_state()
    if record_name:
        finish_recording(context, page, record_name, "Teacher creates a real live session on staging", started, session)
    else:
        context.close()
    return session, state


def load_pdf_on_viewer(page, viewer_url: str, pdf_path: Path) -> None:
    page.goto(viewer_url, wait_until="domcontentloaded", timeout=30000)
    page.locator("input[type=file][accept='application/pdf']").set_input_files(str(pdf_path))
    page.locator("#pdfStage").wait_for(state="visible", timeout=30000)
    page.wait_for_function("() => !document.querySelector('#pdfPageState')?.textContent.startsWith('0')", timeout=30000)
    page.wait_for_timeout(1200)


def send_comment(page, join_url: str, message: str) -> None:
    page.goto(join_url, wait_until="domcontentloaded", timeout=30000)
    page.locator("#message").wait_for(state="visible", timeout=30000)
    page.locator("#message").fill(message)
    page.locator("#sendButton").click()
    page.wait_for_function("() => /送信|投稿/.test(document.querySelector('#status')?.textContent || '')", timeout=30000)


def record_code_join(browser, code: str):
    context, page = record_context(browser, "03_code_join_real", width=430, height=932)
    started = time.monotonic()
    page.goto(ORIGIN + "/", wait_until="domcontentloaded", timeout=30000)
    page.locator("#homePublicCode").wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(1000)
    page.locator("#homePublicCode").fill(code)
    page.locator("#homeJoinButton").click()
    page.locator("#message").wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(1800)
    finish_recording(context, page, "03_code_join_real", "Student enters the real six-character code and reaches the real posting UI", started, {"public_code": code})


def record_qr_overlay(browser, storage_state, session: dict, pdf_path: Path):
    context, page = record_context(browser, "02_qr_overlay_real", storage_state=storage_state)
    started = time.monotonic()
    load_pdf_on_viewer(page, session["viewer_url"], pdf_path)
    page.locator("#qrButton").click()
    page.locator("#qrOverlay").wait_for(state="visible", timeout=10000)
    page.wait_for_timeout(2800)
    finish_recording(context, page, "02_qr_overlay_real", "Real viewer displays the session QR overlay", started, {"public_code": session["public_code"]})


def record_pdf_load(browser, storage_state, session: dict, pdf_path: Path):
    context, page = record_context(browser, "04_pdf_load_real", storage_state=storage_state)
    started = time.monotonic()
    page.goto(session["viewer_url"], wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(1000)
    page.locator("input[type=file][accept='application/pdf']").set_input_files(str(pdf_path))
    page.locator("#pdfStage").wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(2500)
    finish_recording(context, page, "04_pdf_load_real", "Teacher selects a real PDF in the current viewer UI", started)


def configure_scroll_record(browser, storage_state, session: dict):
    context, page = record_context(browser, "07_teacher_projection_settings_real", storage_state=storage_state)
    started = time.monotonic()
    page.goto(session["admin_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#sessionSection").wait_for(state="visible", timeout=30000)
    page.locator("#commentDisplayMode").scroll_into_view_if_needed()
    page.wait_for_timeout(900)
    page.locator("#commentDisplayMode").select_option("scroll")
    page.locator("#commentDisplaySeconds").select_option("30")
    page.locator("#saveSessionSettingsButton").click()
    page.wait_for_timeout(2200)
    finish_recording(context, page, "07_teacher_projection_settings_real", "Teacher changes the real projection mode to scrolling comments and saves it", started)


def record_normal_comment(browser, session: dict):
    context, page = record_context(browser, "05_student_comment_real", width=430, height=932)
    started = time.monotonic()
    page.goto(session["join_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#message").wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(1000)
    page.locator("#message").fill("この部分をもう一度説明してほしいです")
    page.wait_for_timeout(600)
    page.locator("#sendButton").click()
    page.wait_for_timeout(2200)
    finish_recording(context, page, "05_student_comment_real", "Student sends a real comment from the current mobile UI", started)


def record_comment_burst(browser, storage_state, session: dict, pdf_path: Path):
    viewer_ctx, viewer = record_context(browser, "06_projector_comment_burst_real", storage_state=storage_state)
    started = time.monotonic()
    load_pdf_on_viewer(viewer, session["viewer_url"], pdf_path)
    viewer.wait_for_timeout(1400)
    messages = [
        "この部分をもう一度説明してほしいです",
        "ここまでは理解できました",
        "具体例があると分かりやすいです",
        "この図の意味を質問したいです",
        "前の内容との違いは何ですか",
    ]
    for message in messages:
        ctx = browser.new_context(viewport={"width": 430, "height": 932}, locale="ja-JP")
        p = ctx.new_page()
        send_comment(p, session["join_url"], message)
        ctx.close()
        viewer.wait_for_timeout(650)
    viewer.wait_for_function("() => document.querySelectorAll('.scroll-comment').length > 0 || document.querySelectorAll('.comment-card').length > 0", timeout=30000)
    viewer.wait_for_timeout(7000)
    finish_recording(viewer_ctx, viewer, "06_projector_comment_burst_real", "Five real student posts arrive through realtime and move across the real projector UI", started, {"messages": messages})


def prepare_persistent_viewer(browser, storage_state, session: dict, pdf_path: Path):
    context = browser.new_context(viewport={"width": 1920, "height": 1080}, storage_state=storage_state, locale="ja-JP")
    page = context.new_page()
    load_pdf_on_viewer(page, session["viewer_url"], pdf_path)
    return context, page


def record_understanding(browser, session: dict):
    context, page = record_context(browser, "08_understanding_real", width=430, height=932)
    started = time.monotonic()
    page.goto(session["join_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#understandingSection").wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(1000)
    page.locator('[data-signal="understood"]').click()
    page.wait_for_timeout(2200)
    finish_recording(context, page, "08_understanding_real", "Student sends a real page-level understanding signal with one tap", started)


def record_teacher_live_controls(browser, storage_state, session: dict):
    context, page = record_context(browser, "09_teacher_live_controls_real", storage_state=storage_state)
    started = time.monotonic()
    page.goto(session["admin_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#sessionSection").wait_for(state="visible", timeout=30000)
    page.locator("#toggleCommentsButton").scroll_into_view_if_needed()
    page.wait_for_timeout(1000)
    page.locator("#toggleCommentsButton").click()
    page.wait_for_timeout(1600)
    page.locator("#toggleCommentsButton").click()
    page.wait_for_timeout(1800)
    finish_recording(context, page, "09_teacher_live_controls_real", "Teacher hides and restores projected comments using the real live controls", started)


def populate_analytics(browser, session: dict, viewer_page):
    # page 1
    ctx1 = browser.new_context(viewport={"width": 430, "height": 932}, locale="ja-JP")
    p1 = ctx1.new_page(); p1.goto(session["join_url"], wait_until="domcontentloaded", timeout=30000)
    p1.locator("#understandingSection").wait_for(state="visible", timeout=30000)
    p1.locator("#message").fill("1ページ目は理解できました"); p1.locator("#sendButton").click(); p1.wait_for_timeout(700)
    p1.locator('[data-signal="understood"]').click(); p1.wait_for_timeout(700); ctx1.close()

    viewer_page.locator("#nextPageButton").click(); viewer_page.wait_for_timeout(1800)
    ctx2 = browser.new_context(viewport={"width": 430, "height": 932}, locale="ja-JP")
    p2 = ctx2.new_page(); p2.goto(session["join_url"], wait_until="domcontentloaded", timeout=30000)
    p2.locator("#understandingSection").wait_for(state="visible", timeout=30000)
    p2.locator("#message").fill("2ページ目をもう一度見たいです"); p2.locator("#sendButton").click(); p2.wait_for_timeout(700)
    p2.locator('[data-signal="unsure"]').click(); p2.wait_for_timeout(700); ctx2.close()

    viewer_page.locator("#nextPageButton").click(); viewer_page.wait_for_timeout(1800)
    ctx3 = browser.new_context(viewport={"width": 430, "height": 932}, locale="ja-JP")
    p3 = ctx3.new_page(); p3.goto(session["join_url"], wait_until="domcontentloaded", timeout=30000)
    p3.locator("#understandingSection").wait_for(state="visible", timeout=30000)
    p3.locator("#message").fill("3ページ目がわかりません"); p3.locator("#sendButton").click(); p3.wait_for_timeout(700)
    p3.locator('[data-signal="confused"]').click(); p3.wait_for_timeout(700); ctx3.close()


def record_analytics(browser, storage_state, session: dict):
    context, page = record_context(browser, "10_page_analytics_real", storage_state=storage_state)
    started = time.monotonic()
    page.goto(session["admin_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#sessionAnalyticsSection").wait_for(state="visible", timeout=30000)
    page.locator("#sessionAnalyticsSection").scroll_into_view_if_needed()
    page.locator("#sessionAnalyticsSection").evaluate("el => el.open = true")
    page.locator("#refreshAnalyticsButton").click()
    page.wait_for_timeout(2500)
    rows = page.locator("#analyticsBody tr").count()
    if rows < 1:
        raise RuntimeError("Real analytics returned no page rows")
    page.wait_for_timeout(3200)
    finish_recording(context, page, "10_page_analytics_real", "Real page analytics after comments and understanding signals on three PDF pages", started, {"analytics_rows": rows})


def configure_translation_record(browser, storage_state, session: dict):
    context, page = record_context(browser, "11_translation_settings_real", storage_state=storage_state)
    started = time.monotonic()
    page.goto(session["admin_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#sessionAiTranslationEnabled").wait_for(state="visible", timeout=30000)
    page.locator("#sessionAiTranslationEnabled").scroll_into_view_if_needed()
    page.wait_for_timeout(900)
    if page.locator("#sessionAiTranslationEnabled").is_disabled():
        raise RuntimeError("Real staging organization AI is disabled")
    page.locator("#sessionAiTranslationEnabled").check()
    page.locator("#sessionAiTargetLanguage").select_option("ja")
    page.locator("#sessionAiTranslationQuality").select_option("fast")
    page.locator("#saveSessionSettingsButton").click()
    page.wait_for_timeout(2600)
    if not page.locator("#sessionAiTranslationEnabled").is_checked():
        raise RuntimeError("Translation setting did not remain enabled")
    finish_recording(context, page, "11_translation_settings_real", "Teacher enables actual Workers AI translation for this session", started)


def record_translation_flow(browser, storage_state, session: dict, pdf_path: Path):
    viewer_ctx, viewer = record_context(browser, "13_translation_projector_real", storage_state=storage_state)
    viewer_started = time.monotonic()
    load_pdf_on_viewer(viewer, session["viewer_url"], pdf_path)
    viewer.wait_for_timeout(1200)

    student_ctx, student = record_context(browser, "12_translation_student_real", width=430, height=932)
    student_started = time.monotonic()
    student.goto(session["join_url"], wait_until="domcontentloaded", timeout=30000)
    student.locator("#message").wait_for(state="visible", timeout=30000)
    english = "Could you explain this point again?"
    student.locator("#message").fill(english)
    student.wait_for_timeout(600)
    send_time = time.monotonic()
    student.locator("#sendButton").click()
    student.wait_for_timeout(2400)
    finish_recording(student_ctx, student, "12_translation_student_real", "Student submits a real English comment to the translation-enabled session", student_started, {"source_text": english})

    try:
        viewer.wait_for_function("() => { const e=document.querySelector('.comment-translation'); return !!e && (e.textContent || '').trim().length > 0; }", timeout=120000)
    except PlaywrightTimeoutError:
        viewer.screenshot(path=str(SHOTS / "translation_timeout.png"), full_page=False)
        raise RuntimeError("Workers AI translation did not appear in the real viewer within 120 seconds")
    translated = viewer.locator(".comment-translation").last.inner_text().strip()
    source_visible = viewer.locator(".comment-card,.scroll-comment").last.inner_text().strip()
    translation_elapsed = time.monotonic() - send_time
    if not translated:
        raise RuntimeError("Translation element appeared but contained no real translated text")
    viewer.screenshot(path=str(SHOTS / "13_translation_projector_verified.png"), full_page=False)
    viewer.wait_for_timeout(5500)
    finish_recording(viewer_ctx, viewer, "13_translation_projector_real", "Real Workers AI translation appears in the real projector UI", viewer_started, {"source_text": english, "translated_text": translated, "translation_wait_seconds": round(translation_elapsed, 3), "visible_comment": source_visible})
    manifest["translation_verified"] = {"source": english, "translated": translated, "wait_seconds": round(translation_elapsed, 3)}


def record_translation_moderation(browser, storage_state, session: dict):
    context, page = record_context(browser, "14_translation_moderation_real", storage_state=storage_state)
    started = time.monotonic()
    page.goto(session["admin_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#moderationSection").wait_for(state="visible", timeout=30000)
    page.locator("#moderationSection").scroll_into_view_if_needed()
    page.locator("#moderationSection").evaluate("el => el.open = true")
    page.locator("#refreshModerationButton").click()
    page.wait_for_timeout(2800)
    text = page.locator("#moderationBody").inner_text()
    if "Could you explain this point again?" not in text:
        raise RuntimeError("Translated source comment was not present in real moderation table")
    page.wait_for_timeout(2500)
    finish_recording(context, page, "14_translation_moderation_real", "Real moderation table shows the submitted comment and its AI translation state", started)


def configure_filter_record(browser, storage_state, session: dict):
    context, page = record_context(browser, "15_filter_settings_real", storage_state=storage_state)
    started = time.monotonic()
    page.goto(session["admin_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#sessionFilterSimpleMode").wait_for(state="visible", timeout=30000)
    page.locator("#sessionFilterSimpleMode").scroll_into_view_if_needed()
    page.wait_for_timeout(900)
    page.locator("#sessionFilterSimpleMode").select_option("dictionary")
    page.locator("#saveSessionSettingsButton").click()
    page.wait_for_timeout(2600)
    if page.locator("#sessionFilterSimpleMode").input_value() != "dictionary":
        raise RuntimeError("Dictionary-only session filter setting was not retained")
    finish_recording(context, page, "15_filter_settings_real", "Teacher enables the real dictionary filter for this session", started)


def record_mask_flow(browser, storage_state, session: dict, pdf_path: Path):
    viewer_ctx, viewer = record_context(browser, "17_masked_projector_real", storage_state=storage_state)
    viewer_started = time.monotonic()
    load_pdf_on_viewer(viewer, session["viewer_url"], pdf_path)
    viewer.wait_for_timeout(1200)

    student_ctx, student = record_context(browser, "16_masked_student_real", width=430, height=932)
    student_started = time.monotonic()
    student.goto(session["join_url"], wait_until="domcontentloaded", timeout=30000)
    student.locator("#message").wait_for(state="visible", timeout=30000)
    source = "不適切な例として『無能』という表現があります"
    student.locator("#message").fill(source)
    student.wait_for_timeout(600)
    student.locator("#sendButton").click()
    student.wait_for_timeout(2300)
    finish_recording(student_ctx, student, "16_masked_student_real", "Student submits a real comment containing a term from the installed Japanese filter pack", student_started, {"source_text": source})

    try:
        viewer.wait_for_function("() => { const t=(document.querySelector('#commentList')?.textContent || '') + (document.querySelector('#scrollCommentLayer')?.textContent || ''); return t.includes('＊') && !t.includes('無能'); }", timeout=30000)
    except PlaywrightTimeoutError:
        viewer.screenshot(path=str(SHOTS / "mask_timeout.png"), full_page=False)
        raise RuntimeError("Real dictionary mask result did not appear in the viewer")
    visible = (viewer.locator("#commentList").inner_text() + "\n" + viewer.locator("#scrollCommentLayer").inner_text()).strip()
    viewer.screenshot(path=str(SHOTS / "17_masked_projector_verified.png"), full_page=False)
    viewer.wait_for_timeout(5000)
    finish_recording(viewer_ctx, viewer, "17_masked_projector_real", "Real dictionary filter masks the matched term in the projector UI", viewer_started, {"source_text": source, "visible_text": visible})
    manifest["mask_verified"] = {"source": source, "visible": visible}


def record_end_session(browser, storage_state, session: dict):
    context, page = record_context(browser, "18_end_session_real", storage_state=storage_state)
    started = time.monotonic()
    page.on("dialog", lambda dialog: dialog.accept())
    page.goto(session["admin_url"], wait_until="domcontentloaded", timeout=30000)
    page.locator("#endSessionButton").wait_for(state="visible", timeout=30000)
    page.locator("#endSessionButton").scroll_into_view_if_needed()
    page.wait_for_timeout(900)
    page.locator("#endSessionButton").click()
    page.wait_for_timeout(3000)
    finish_recording(context, page, "18_end_session_real", "Teacher ends the real live session", started)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    storage_state = setup_organization(browser)
    pdf_path = create_pdf(browser)

    core, storage_state = create_session(browser, storage_state, "U22 実機デモ授業", "01_create_session_real")
    manifest["sessions"]["core"] = core
    record_qr_overlay(browser, storage_state, core, pdf_path)
    record_code_join(browser, core["public_code"])
    record_pdf_load(browser, storage_state, core, pdf_path)

    core_viewer_ctx, core_viewer = prepare_persistent_viewer(browser, storage_state, core, pdf_path)
    record_normal_comment(browser, core)
    configure_scroll_record(browser, storage_state, core)
    record_comment_burst(browser, storage_state, core, pdf_path)
    record_understanding(browser, core)
    record_teacher_live_controls(browser, storage_state, core)
    populate_analytics(browser, core, core_viewer)
    record_analytics(browser, storage_state, core)
    core_viewer_ctx.close()

    translation, _ = create_session(browser, storage_state, "U22 AI翻訳 実機デモ")
    manifest["sessions"]["translation"] = translation
    configure_translation_record(browser, storage_state, translation)
    record_translation_flow(browser, storage_state, translation, pdf_path)
    record_translation_moderation(browser, storage_state, translation)

    masked, _ = create_session(browser, storage_state, "U22 伏字 実機デモ")
    manifest["sessions"]["mask"] = masked
    configure_filter_record(browser, storage_state, masked)
    record_mask_flow(browser, storage_state, masked, pdf_path)

    record_end_session(browser, storage_state, core)
    browser.close()

convert_videos()
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
log(json.dumps({"ok": True, "translation": manifest.get("translation_verified"), "mask": manifest.get("mask_verified"), "clip_count": len(manifest["clips"])}, ensure_ascii=False))
