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
OUT = Path("u22-mask-three-evidence")
RAW = OUT / "raw"
MP4 = OUT / "mp4"
SHOTS = OUT / "screenshots"
for d in (OUT, RAW, MP4, SHOTS): d.mkdir(parents=True, exist_ok=True)
manifest = {"origin": ORIGIN, "clips": [], "sources": [], "visible": []}


def record_context(browser, name, width=1920, height=1080, storage_state=None):
    c = browser.new_context(viewport={"width":width,"height":height}, record_video_dir=str(RAW), record_video_size={"width":width,"height":height}, storage_state=storage_state, locale="ja-JP")
    return c, c.new_page()


def finish(ctx, page, name, purpose, started, extra=None):
    video = page.video
    page.screenshot(path=str(SHOTS/f"{name}.png"), full_page=False)
    elapsed=time.monotonic()-started
    ctx.close()
    src=Path(video.path()); dst=RAW/f"{name}.webm"; shutil.copy2(src,dst)
    manifest["clips"].append({"name":name,"purpose":purpose,"seconds":round(elapsed,3),**(extra or {})})


def login(page):
    page.goto(ORIGIN+"/admin",wait_until="domcontentloaded",timeout=30000)
    page.locator("#teacherLoginForm").wait_for(state="visible",timeout=30000)
    page.locator("#teacherLoginId").fill(LOGIN_ID); page.locator("#teacherPassword").fill(PASSWORD); page.locator("#loginButton").click()
    page.locator("#createSection").wait_for(state="visible",timeout=30000)


def private(page,method,path,payload=None):
    r=page.evaluate("""async ({method,path,payload})=>{const sr=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});const s=await sr.json();if(!sr.ok||!s.csrfToken)return{ok:false,status:sr.status,text:JSON.stringify(s)};const o={method,credentials:'same-origin',cache:'no-store',headers:{'x-csrf-token':s.csrfToken}};if(payload!==null){o.headers['content-type']='application/json';o.body=JSON.stringify(payload)}const x=await fetch(path,o);return{ok:x.ok,status:x.status,text:await x.text()}}""",{"method":method,"path":path,"payload":payload})
    if not r.get("ok"): raise RuntimeError(f"private API failed: {r}")


def setup(browser):
    c=browser.new_context(viewport={"width":1440,"height":1000},locale="ja-JP"); p=c.new_page(); login(p)
    p.goto(ORIGIN+"/account#organizationSettings",wait_until="domcontentloaded",timeout=30000)
    p.locator("#organizationSettings").wait_for(state="visible",timeout=30000)
    strict=p.locator('[data-filter-preset="strict"]'); strict.wait_for(state="visible",timeout=30000)
    if strict.get_attribute("aria-pressed")!="true":
        strict.click(); p.wait_for_function("() => document.querySelector('[data-filter-preset=\"strict\"]')?.getAttribute('aria-pressed')==='true'",timeout=60000)
    p.wait_for_timeout(1500)
    status=p.locator("#filterPackStatus").inner_text()
    if "日本語基本: 導入済み" not in status: raise RuntimeError(status)
    st=c.storage_state(); c.close(); return st


def create_pdf(browser):
    path=OUT/"lesson.pdf"; c=browser.new_context(); p=c.new_page(); p.set_content("""<!doctype html><meta charset=utf-8><style>@page{size:13.333in 7.5in;margin:0}body{margin:0;font-family:'Noto Sans JP','IPA Gothic',sans-serif;color:#17211d}section{box-sizing:border-box;width:100%;height:100vh;padding:72px 86px;background:#fcfbf8}small{font-size:18px;color:#1f5b4f;font-weight:700;letter-spacing:.1em}h1{font-size:50px;margin:18px 0 28px}p{font-size:29px;line-height:1.65}</style><section><small>CPCV DEMO LESSON</small><h1>地域文化と観光</h1><p>地域の文化は、観光によってどのように変化するのでしょうか。</p></section>"""); p.pdf(path=str(path),width="13.333in",height="7.5in",print_background=True); c.close(); return path


def create_session(browser,st):
    c=browser.new_context(viewport={"width":1440,"height":1000},storage_state=st,locale="ja-JP"); p=c.new_page(); p.goto(ORIGIN+"/admin",wait_until="domcontentloaded",timeout=30000); p.locator("#createSection").wait_for(state="visible",timeout=30000); p.locator("#newTitle").fill("U22 伏字 複数投稿 実機デモ"); p.locator("#createButton").click(); p.wait_for_url(ORIGIN+"/admin/*",timeout=30000); p.locator("#sessionSection").wait_for(state="visible",timeout=30000)
    s={"id":p.url.rstrip('/').split('/')[-1],"admin_url":p.url,"join_url":p.locator('#joinUrl').inner_text().strip(),"viewer_url":p.locator('#viewerUrl').inner_text().strip()}; st=c.storage_state(); c.close(); return s,st


def configure(browser,st,s):
    c=browser.new_context(viewport={"width":1440,"height":1000},storage_state=st,locale="ja-JP"); p=c.new_page(); p.goto(s['admin_url'],wait_until='domcontentloaded',timeout=30000); p.locator('#sessionFilterSimpleMode').wait_for(state='visible',timeout=30000)
    private(p,'PATCH',f"/api/private/sessions/{s['id']}/filter-settings",{"enabled":True,"aiRoutingMode":"off","maskCharacter":"＊","translationFilterEnabled":True,"unsupportedLanguageMode":"review_only"})
    private(p,'POST',f"/api/private/sessions/{s['id']}/settings",{"postingEnabled":True,"commentsVisible":True,"commentDisplaySeconds":300,"commentDisplayMode":"stack3","moderationMode":"off","status":"active"}); c.close()


def send_three(browser,s):
    messages=["この説明は無能だと思います","その言い方はきもいです","この表現はうざいと感じます"]
    c,p=record_context(browser,'01_mask_three_student_posts',430,932); started=time.monotonic(); p.goto(s['join_url'],wait_until='domcontentloaded',timeout=30000); p.locator('#message').wait_for(state='visible',timeout=30000)
    accepted=[]
    for i,m in enumerate(messages):
        p.locator('#message').fill(m); p.wait_for_timeout(500); p.locator('#sendButton').click(); p.wait_for_timeout(1700); status=p.locator('#status').inner_text().strip(); accepted.append({"message":m,"status":status})
        if '連投制限' in status: raise RuntimeError(status)
        if i<2: p.wait_for_timeout(11200)
    p.wait_for_timeout(1600); finish(c,p,'01_mask_three_student_posts','Three distinct real student comments containing three installed Japanese filter terms',started,{"accepted":accepted}); return messages


def capture(browser,st,s,pdf,messages):
    c,p=record_context(browser,'02_mask_three_projector_verified',1920,1080,st); started=time.monotonic(); p.goto(s['viewer_url'],wait_until='domcontentloaded',timeout=30000); p.locator('#topBar').wait_for(state='visible',timeout=30000); p.locator("input[type=file][accept='application/pdf']").set_input_files(str(pdf)); p.locator('#pdfStage').wait_for(state='visible',timeout=30000); p.wait_for_function("() => !document.querySelector('#pdfPageState')?.textContent.startsWith('0')",timeout=30000)
    try:
        p.wait_for_function("() => { const cards=[...document.querySelectorAll('.comment-card,.scroll-comment')]; if(cards.length<3)return false; const t=cards.map(x=>x.textContent||'').join(' '); const masks=t.match(/[＊*]{2,}/g)||[]; return masks.length>=3 && !t.includes('無能') && !t.includes('きもい') && !t.includes('うざい'); }",timeout=45000)
    except PlaywrightTimeoutError:
        p.screenshot(path=str(SHOTS/'mask_three_timeout.png'),full_page=False); raise
    visible=p.locator('.comment-card,.scroll-comment').all_inner_texts(); joined='\n---\n'.join(visible)
    for term in ('無能','きもい','うざい'):
        if term in joined: raise RuntimeError(f'unmasked term {term}: {joined}')
    manifest['sources']=messages; manifest['visible']=visible; p.wait_for_timeout(8500); finish(c,p,'02_mask_three_projector_verified','Three distinct genuine dictionary-masked comments visible together in the real projector UI',started,{"sources":messages,"visible":visible})


def convert():
    for src in RAW.glob('*.webm'):
        subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(src),'-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(MP4/f'{src.stem}.mp4')],check=True)

with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage']); st=setup(b); pdf=create_pdf(b); s,st=create_session(b,st); configure(b,st,s); msgs=send_three(b,s); capture(b,st,s,pdf,msgs); b.close()
convert(); (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps({"ok":True,"sources":manifest['sources'],"visible":manifest['visible']},ensure_ascii=False))
