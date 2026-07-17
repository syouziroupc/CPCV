from __future__ import annotations

import asyncio
import json
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "stage08-screenshots"
OUT.mkdir(parents=True, exist_ok=True)
CSS = (ROOT / "public" / "assets" / "app.css").read_text(encoding="utf-8")


def inline_html(path: Path) -> str:
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    for tag in list(soup.find_all("link", href=lambda value: value and "/assets/app.css" in value)):
        style = soup.new_tag("style")
        style.string = CSS
        tag.replace_with(style)
    for tag in list(soup.find_all("script")):
        tag.decompose()
    return str(soup)


async def prepare_admin(page) -> None:
    await page.evaluate("""
    () => {
      const show=(id,on=true)=>document.getElementById(id)?.classList.toggle('hidden',!on);
      show('loginSection',false); show('createSection',false); show('activeSessionsSection',false);
      show('notFoundSection',false); show('sessionSection',true); show('logoutButton',true);
      show('organizationAiSection',false); show('organizationFilterSection',false);
      document.querySelector('#sessionTitle').textContent='環境政策 第8回';
      document.querySelector('#joinUrl').textContent='https://example.test/j/STG888';
      document.querySelector('#publicCode').textContent='合言葉: STG888';
      document.querySelector('#viewerUrl').textContent='https://example.test/viewer/sess_stage8';
      document.querySelector('#postingState').textContent='投稿: 受付中';
      document.querySelector('#commentsState').textContent='コメント表示: ON';
      document.querySelector('#commentModeState').textContent='表示方法: 3件';
      document.querySelector('#moderationModeState').textContent='投稿承認: 自動表示';
      document.querySelector('#commentDisplayState').textContent='表示時間: 1分';
      document.querySelector('#sessionState').textContent='残り: 4時間35分';
      document.querySelector('#documentInfo').textContent='18ページ / 現在 7ページ / 2.4 MB / 識別子 aaaaaaaaaaaa…';
      document.querySelector('#sessionFilterSection').classList.add('hidden');
      document.querySelector('#sessionAiSection').classList.add('hidden');
      document.querySelector('#moderationSection').classList.add('hidden');
      document.querySelector('.local-log-section').classList.add('hidden');
      document.querySelector('#analyticsStatus').textContent='集計時点 2026/7/16 16:00:00。理解度は3人未満を非表示にします。';
      const summary=document.querySelector('#analyticsSummary'); summary.classList.remove('hidden');
      for(const [label,value] of [['総コメント','46'],['理解度回答','32'],['活動ページ','12 / 18'],['全体理解度','71.9%']]){
        const card=document.createElement('div'); card.className='analytics-summary-card';
        card.innerHTML=`<strong>${value}</strong><span class="muted">${label}</span>`; summary.append(card);
      }
      const rows=[
        [1,'1回','2分10秒','3件\\n表示3 / 承認待ち0 / 非表示0','0件','5件\\n理解4 / 不明1 / 困惑0','90%'],
        [2,'2回','4分35秒','8件\\n表示7 / 承認待ち1 / 非表示0','3件','8件\\n理解3 / 不明3 / 困惑2','56.3%'],
        [3,'1回','1分20秒','2件\\n表示2 / 承認待ち0 / 非表示0','1件','2件（内訳非表示）','—'],
        [7,'3回','6分05秒','11件\\n表示9 / 承認待ち1 / 非表示1','5件','9件\\n理解4 / 不明2 / 困惑3','55.6%']
      ];
      const body=document.querySelector('#analyticsBody');
      for(const values of rows){ const row=body.insertRow(); for(const value of values){const cell=row.insertCell();cell.textContent=value;cell.style.whiteSpace='pre-line';} }
      const select=document.querySelector('#analyticsSnapshotSelect');
      select.innerHTML='<option>2026/7/16 16:00:00 / 62ab31c24e…</option>';
      document.querySelector('#downloadAnalyticsSnapshotButton').disabled=false;
    }
    """)


async def prepare_student(page) -> None:
    await page.evaluate("""
    () => {
      document.querySelector('#classTitle').textContent='環境政策 第8回';
      document.querySelector('#postingState').textContent='投稿できます。';
      document.querySelector('#understandingSection').classList.remove('hidden');
      document.querySelector('#understandingStatus').textContent='現在のPDFページについて匿名で回答できます。';
      document.querySelector('#nickname').value='学生A';
      document.querySelector('#message').value='このページの説明をもう一度聞きたいです';
    }
    """)


async def metrics(page, selector: str) -> dict:
    return await page.evaluate("""
    selector => {
      const el=document.querySelector(selector); const r=el.getBoundingClientRect();
      const controls=[...el.querySelectorAll('button,input,select')].filter(x=>getComputedStyle(x).display!=='none').map(x=>{const q=x.getBoundingClientRect(); return {tag:x.tagName,w:q.width,h:q.height,left:q.left,right:q.right,top:q.top,bottom:q.bottom,insideScroll:Boolean(x.closest('.analytics-table-wrap'))};});
      return {viewport:{w:innerWidth,h:innerHeight}, documentWidth:document.documentElement.scrollWidth, bodyWidth:document.body.scrollWidth,
        box:{left:r.left,right:r.right,width:r.width,height:r.height}, outside:controls.filter(q=>!q.insideScroll&&(q.left<-1||q.right>innerWidth+1)),
        short:controls.filter(q=>q.h>0&&q.h<32), table:[...el.querySelectorAll('.analytics-table-wrap')].map(x=>({clientWidth:x.clientWidth,scrollWidth:x.scrollWidth}))};
    }
    """, selector)


async def capture(page, html: str, prep, name: str, selector: str, width: int, height: int) -> None:
    await page.set_viewport_size({"width":width,"height":height})
    await page.set_content(html, wait_until="load")
    await prep(page)
    await page.locator(selector).scroll_into_view_if_needed()
    await page.wait_for_timeout(150)
    data=await metrics(page,selector)
    if data['documentWidth']>width+1 or data['bodyWidth']>width+1:
        raise RuntimeError(f"{name}: page overflow {data}")
    if data['outside']:
        raise RuntimeError(f"{name}: control outside {data['outside']}")
    if data['short']:
        raise RuntimeError(f"{name}: short controls {data['short']}")
    await page.locator(selector).screenshot(path=str(OUT/f"{name}.png"))
    (OUT/f"{name}.json").write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


async def main() -> None:
    admin=inline_html(ROOT/'public'/'admin'/'index.html')
    student=inline_html(ROOT/'public'/'j'/'index.html')
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=await browser.new_page()
        await capture(page,admin,prepare_admin,'analytics-desktop','#sessionAnalyticsSection',1440,1000)
        await capture(page,admin,prepare_admin,'analytics-mobile','#sessionAnalyticsSection',390,844)
        await capture(page,student,prepare_student,'understanding-desktop','#understandingSection',1000,800)
        await capture(page,student,prepare_student,'understanding-mobile','#understandingSection',390,844)
        await browser.close()
    print(json.dumps({'ok':True,'screenshots':4,'outputDir':str(OUT)},ensure_ascii=False))

asyncio.run(main())
