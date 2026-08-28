from __future__ import annotations
import json, os, shutil, subprocess, time
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

ORIGIN=os.environ['STAGING_ORIGIN'].rstrip('/')
LOGIN_ID=os.environ['CAPTURE_LOGIN_ID']; PASSWORD=os.environ['CAPTURE_PASSWORD']
OUT=Path('u22-mask-fixed-evidence'); RAW=OUT/'raw'; MP4=OUT/'mp4'; SHOTS=OUT/'screenshots'
for d in (OUT,RAW,MP4,SHOTS): d.mkdir(parents=True,exist_ok=True)
manifest={'origin':ORIGIN,'policy':['Live staging only','Current CPCV UI only','No DOM replacement','Result accepted only when the visible projector text is masked by the real dictionary filter'],'clips':[]}

def ctx(browser,name,w=1920,h=1080,state=None):
    c=browser.new_context(viewport={'width':w,'height':h},record_video_dir=str(RAW),record_video_size={'width':w,'height':h},storage_state=state,locale='ja-JP'); return c,c.new_page()

def finish(c,p,name,purpose,start,extra=None):
    v=p.video
    try:p.screenshot(path=str(SHOTS/f'{name}.png'),full_page=False)
    except:pass
    elapsed=time.monotonic()-start; c.close(); src=Path(v.path()); dst=RAW/f'{name}.webm'; shutil.copy2(src,dst)
    manifest['clips'].append({'name':name,'purpose':purpose,'seconds':round(elapsed,3),**(extra or {})})

def api(p,method,path,payload):
    r=p.evaluate('''async ({method,path,payload})=>{const sr=await fetch('/api/auth/session',{cache:'no-store',credentials:'same-origin'});const s=await sr.json();if(!sr.ok||!s.csrfToken)return{ok:false,status:sr.status,text:JSON.stringify(s)};const x=await fetch(path,{method,cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':s.csrfToken},body:JSON.stringify(payload)});return{ok:x.ok,status:x.status,text:await x.text()};}''',{'method':method,'path':path,'payload':payload})
    if not r['ok']: raise RuntimeError(f'API failed: {r}')
    return json.loads(r['text'] or '{}')

def login(p):
    p.goto(ORIGIN+'/admin',wait_until='domcontentloaded',timeout=30000);p.locator('#teacherLoginForm').wait_for(state='visible',timeout=30000)
    p.locator('#teacherLoginId').fill(LOGIN_ID);p.locator('#teacherPassword').fill(PASSWORD);p.locator('#loginButton').click();p.locator('#createSection').wait_for(state='visible',timeout=30000)

def setup(browser):
    c=browser.new_context(viewport={'width':1440,'height':1000},locale='ja-JP');p=c.new_page();login(p)
    p.goto(ORIGIN+'/account#organizationSettings',wait_until='domcontentloaded',timeout=30000);p.locator('#organizationSettings').wait_for(state='visible',timeout=30000)
    strict=p.locator('[data-filter-preset="strict"]');strict.wait_for(state='visible',timeout=30000)
    if strict.get_attribute('aria-pressed')!='true':
        strict.click();p.wait_for_function("() => document.querySelector('[data-filter-preset=\"strict\"]')?.getAttribute('aria-pressed')==='true'",timeout=60000)
    p.wait_for_timeout(1200); status=p.locator('#filterPackStatus').inner_text()
    if '日本語基本: 導入済み' not in status: raise RuntimeError('Japanese pack not installed: '+status)
    state=c.storage_state();c.close();return state

def make_pdf(browser):
    path=OUT/'lesson.pdf';c=browser.new_context();p=c.new_page();p.set_content("""<!doctype html><meta charset='utf-8'><style>@page{size:13.333in 7.5in;margin:0}body{margin:0;font-family:'IPA Gothic',sans-serif;color:#17211d}section{box-sizing:border-box;width:100%;height:100vh;padding:72px 86px;background:#fcfbf8}small{font-size:18px;color:#1f5b4f;font-weight:700}h1{font-size:50px;margin:18px 0 28px}p{font-size:29px}</style><section><small>CPCV DEMO LESSON</small><h1>地域文化と観光</h1><p>地域の文化は、観光によってどのように変化するのでしょうか。</p></section>""");p.pdf(path=str(path),width='13.333in',height='7.5in',print_background=True);c.close();return path

def create_session(browser,state):
    c=browser.new_context(viewport={'width':1440,'height':1000},storage_state=state,locale='ja-JP');p=c.new_page();p.goto(ORIGIN+'/admin',wait_until='domcontentloaded',timeout=30000);p.locator('#createSection').wait_for(state='visible',timeout=30000)
    p.locator('#newTitle').fill('U22 伏字 実機確認');p.locator('#createButton').click();p.wait_for_url(ORIGIN+'/admin/*',timeout=30000);p.locator('#sessionSection').wait_for(state='visible',timeout=30000)
    s={'id':p.url.rstrip('/').split('/')[-1],'admin':p.url,'join':p.locator('#joinUrl').inner_text().strip(),'viewer':p.locator('#viewerUrl').inner_text().strip()};state=c.storage_state();c.close();return s,state

def load_pdf(p,url,path):
    p.goto(url,wait_until='domcontentloaded',timeout=30000);p.locator('#emptyDocument').wait_for(state='visible',timeout=30000);p.locator("input[type=file][accept='application/pdf']").set_input_files(str(path));p.locator('#pdfStage').wait_for(state='visible',timeout=30000);p.wait_for_timeout(1400)

def configure(browser,state,s):
    c,p=ctx(browser,'01_mask_settings_verified',state=state);start=time.monotonic();p.goto(s['admin'],wait_until='domcontentloaded',timeout=30000);p.locator('#sessionFilterSimpleMode').wait_for(state='visible',timeout=30000);p.locator('#sessionFilterSimpleMode').scroll_into_view_if_needed();p.locator('#sessionFilterSimpleMode').select_option('dictionary')
    api(p,'PATCH',f"/api/private/sessions/{s['id']}/filter-settings",{'enabled':True,'aiRoutingMode':'off','maskCharacter':'＊','translationFilterEnabled':True,'unsupportedLanguageMode':'review_only'})
    api(p,'POST',f"/api/private/sessions/{s['id']}/settings",{'postingEnabled':True,'commentsVisible':True,'commentDisplaySeconds':300,'commentDisplayMode':'stack3','moderationMode':'off','status':'active'})
    p.reload(wait_until='domcontentloaded',timeout=30000);p.locator('#sessionFilterSimpleMode').wait_for(state='visible',timeout=30000);p.locator('#sessionFilterSimpleMode').scroll_into_view_if_needed();p.wait_for_timeout(1000)
    if p.locator('#sessionFilterSimpleMode').input_value()!='dictionary': raise RuntimeError('dictionary setting not persisted')
    p.wait_for_timeout(2200);finish(c,p,'01_mask_settings_verified','Backend-persisted real dictionary filter settings in current CPCV UI',start)

def post(browser,s):
    c,p=ctx(browser,'02_mask_student_post',430,932);start=time.monotonic();p.goto(s['join'],wait_until='domcontentloaded',timeout=30000);p.locator('#message').wait_for(state='visible',timeout=30000);source='この説明は無能だと思います';p.locator('#message').fill(source);p.wait_for_timeout(900);p.locator('#sendButton').click();p.wait_for_timeout(2200);finish(c,p,'02_mask_student_post','Real student posts a term contained in the installed Japanese dictionary',start,{'source':source});return source

def is_masked_text(t): return ('*' in t or '＊' in t) and '無能' not in t

def record_result(browser,state,s,pdf,source):
    pc=browser.new_context(viewport={'width':1920,'height':1080},storage_state=state,locale='ja-JP');pp=pc.new_page();load_pdf(pp,s['viewer'],pdf)
    try: pp.wait_for_function("() => {const t=(document.querySelector('#commentList')?.innerText||'')+(document.querySelector('#scrollCommentLayer')?.innerText||'');return (t.includes('*')||t.includes('＊'))&&!t.includes('無能');}",timeout=30000)
    except PlaywrightTimeoutError: pp.screenshot(path=str(SHOTS/'mask_timeout.png'),full_page=False);raise RuntimeError('Visible real mask not found')
    visible=(pp.locator('#commentList').inner_text()+'\n'+pp.locator('#scrollCommentLayer').inner_text()).strip();pc.close()
    if not is_masked_text(visible): raise RuntimeError('mask check failed: '+visible)
    c,p=ctx(browser,'03_mask_projector_verified',state=state);start=time.monotonic();load_pdf(p,s['viewer'],pdf);p.wait_for_function("() => {const t=(document.querySelector('#commentList')?.innerText||'')+(document.querySelector('#scrollCommentLayer')?.innerText||'');return (t.includes('*')||t.includes('＊'))&&!t.includes('無能');}",timeout=30000);visible=(p.locator('#commentList').inner_text()+'\n'+p.locator('#scrollCommentLayer').inner_text()).strip();p.wait_for_timeout(8000);finish(c,p,'03_mask_projector_verified','Real projector visibly shows dictionary-masked text',start,{'source':source,'visible':visible});manifest['mask_verified']={'source':source,'visible':visible}

with sync_playwright() as q:
    b=q.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);state=setup(b);pdf=make_pdf(b);s,state=create_session(b,state);configure(b,state,s);source=post(b,s);record_result(b,state,s,pdf,source);b.close()
for src in sorted(RAW.glob('*.webm')):
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(src),'-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(MP4/f'{src.stem}.mp4')],check=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(manifest['mask_verified'],ensure_ascii=False))
