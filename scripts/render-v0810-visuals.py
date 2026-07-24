from __future__ import annotations

import asyncio
import json
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "v0.8.10-screenshots"
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


async def noop(page) -> None:
    return None


async def prepare_admin(page) -> None:
    await page.evaluate("""
    () => {
      const show=(id,on=true)=>document.getElementById(id)?.classList.toggle('hidden',!on);
      show('loginSection',false); show('adminHome',false); show('notFoundSection',false); show('sessionSection',true); show('logoutButton',true);
      document.querySelector('#sessionTitle').textContent='観光文化論 第4回';
      document.querySelector('#sessionState').textContent='残り4時間35分';
      document.querySelector('#postingState').textContent='投稿: 受付中';
      document.querySelector('#commentsState').textContent='コメント表示: ON';
      document.querySelector('#commentModeState').textContent='表示方法: 5件';
      document.querySelector('#moderationModeState').textContent='投稿承認: 承認後';
      document.querySelector('#commentDisplayState').textContent='表示時間: 1分';
      document.querySelector('#publicCode').textContent='STG888';
      document.querySelector('#joinUrl').textContent='https://example.test/j/STG888';
      document.querySelector('#viewerUrl').textContent='https://example.test/viewer/sess_demo';
      document.querySelector('#documentInfo').textContent='18ページ / 現在7ページ';
      document.querySelector('#sessionFilterSimpleMode').value='recommended';
      document.querySelector('#sessionAiModerationEnabled').checked=true;
      document.querySelector('#sessionAiTranslationEnabled').checked=true;
      document.querySelector('#sessionAiTargetLanguage').value='en';
      const detail=document.querySelector('#moderationSection'); detail.open=true;
      document.querySelector('#moderationStatus').textContent='2件を表示しています。';
      const body=document.querySelector('#moderationBody'); body.textContent='';
      const rows=[
        ['','2026/7/23 20:31','学生A','この説明をもう一度聞きたいです','承認待ち','確認推奨 78%','I would like to hear this explanation again.','承認 / 非表示'],
        ['','2026/7/23 20:32','匿名','具体例が分かりやすかったです','表示中','問題なし 96%','The example was easy to understand.','非表示 / 削除']
      ];
      for(const values of rows){
        const row=body.insertRow();
        values.forEach((value,index)=>{
          const cell=row.insertCell();
          if(index===0){const input=document.createElement('input');input.type='checkbox';input.setAttribute('aria-label','選択');cell.append(input);}
          else if(index===7){const wrap=document.createElement('div');wrap.className='row-actions';for(const label of value.split(' / ')){const b=document.createElement('button');b.type='button';b.className='button small';b.textContent=label;wrap.append(b);}cell.append(wrap);}
          else cell.textContent=value;
        });
      }
      document.querySelector('#sessionAnalyticsSection').open=false;
      document.querySelector('.local-log-section').open=false;
    }
    """)


async def prepare_account(page) -> None:
    await page.evaluate("""
    () => {
      document.querySelector('#loadingSection').classList.add('hidden');
      document.querySelector('#accountSection').classList.remove('hidden');
      document.querySelector('#organizationSettings').classList.remove('hidden');
      document.querySelector('#displayName').textContent='管理者';
      document.querySelector('#emailState').textContent='owner@example.test';
      document.querySelector('#organizationState').textContent='CPCVデモ組織 / Admin';
      document.querySelector('#organizationRoleStatus').textContent='語句の追加と編集ができます。';
      document.querySelector('#organizationAiEnabled').checked=true;
      document.querySelector('#aiModerationDailyLimit').value='500';
      document.querySelector('#aiTranslationDailyLimit').value='500';
      document.querySelector('#organizationFilterStatus').textContent='3語を登録中。';
      const body=document.querySelector('#filterTermsBody'); body.textContent='';
      const rows=[
        ['例示語句A','日本語','嫌がらせ','3','自動','使用','有効','編集 / 削除'],
        ['example term','English','spam','2','単語','不使用','有効','編集 / 削除'],
        ['文脈確認語','日本語','文脈注意','1','部分','使用','無効','編集 / 削除']
      ];
      for(const values of rows){
        const row=body.insertRow();
        values.forEach((value,index)=>{
          const cell=row.insertCell();
          if(index===6){const input=document.createElement('input');input.type='checkbox';input.checked=value==='有効';input.setAttribute('aria-label','有効');cell.append(input);}
          else if(index===7){const wrap=document.createElement('div');wrap.className='row-actions';for(const label of value.split(' / ')){const b=document.createElement('button');b.type='button';b.className='button small';b.textContent=label;wrap.append(b);}cell.append(wrap);}
          else cell.textContent=value;
        });
      }
      const policyDetail=[...document.querySelectorAll('details.workspace-detail')].find(x=>x.textContent.includes('種類別の処理基準'));
      if(policyDetail) policyDetail.open=true;
      const policies=document.querySelector('#filterPoliciesBody'); policies.textContent='';
      for(const values of [['嫌がらせ','使用','3','4','5'],['スパム','使用','2','4','5']]){
        const row=policies.insertRow();
        values.forEach((value,index)=>{const cell=row.insertCell(); if(index===1){const input=document.createElement('input');input.type='checkbox';input.checked=true;input.setAttribute('aria-label',`${values[0]}を使用`);cell.append(input);}else cell.textContent=value;});
      }
    }
    """)


async def metrics(page) -> dict:
    return await page.evaluate("""
    () => {
      const visible = el => {
        const s=getComputedStyle(el); const r=el.getBoundingClientRect();
        return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0;
      };
      const controls=[...document.querySelectorAll('button,input,select,textarea,a')].filter(visible);
      const outside=controls.map(el=>{const r=el.getBoundingClientRect();return {
        text:el.textContent?.trim().slice(0,40)||el.getAttribute('aria-label')||el.getAttribute('name')||el.tagName,
        left:r.left,right:r.right,top:r.top,width:r.width,height:r.height
      };}).filter(r=>r.left < -1 || r.right > innerWidth + 1);
      const clipped=[...document.querySelectorAll('h1,h2,h3,p,li,button,label,summary,td,th')]
        .filter(visible)
        .filter(el=>el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'auto')
        .slice(0,20)
        .map(el=>({tag:el.tagName,text:el.textContent?.trim().slice(0,60),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}));
      return {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        outside,
        clipped,
        controls: controls.length
      };
    }
    """)


async def capture(page, path: Path, prep, name: str, width: int, height: int) -> dict:
    await page.set_viewport_size({"width": width, "height": height})
    await page.set_content(inline_html(path), wait_until="load")
    await prep(page)
    await page.wait_for_timeout(100)
    data=await metrics(page)
    if data['documentWidth'] > width + 1 or data['bodyWidth'] > width + 1 or data['outside']:
        raise RuntimeError(f"{name} overflow: {data}")
    await page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
    (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    return data


async def main() -> None:
    targets = [
      ('admin-desktop', ROOT/'public/admin/index.html', prepare_admin, 1440, 1000),
      ('admin-tablet', ROOT/'public/admin/index.html', prepare_admin, 768, 1024),
      ('admin-mobile', ROOT/'public/admin/index.html', prepare_admin, 390, 844),
      ('account-desktop', ROOT/'public/account/index.html', prepare_account, 1440, 1000),
      ('account-tablet', ROOT/'public/account/index.html', prepare_account, 768, 1024),
      ('account-mobile', ROOT/'public/account/index.html', prepare_account, 390, 844),
      ('home-desktop', ROOT/'public/index.html', noop, 1440, 1000),
      ('home-mobile', ROOT/'public/index.html', noop, 390, 844),
      ('about-desktop', ROOT/'public/about/index.html', noop, 1440, 1000),
      ('about-mobile', ROOT/'public/about/index.html', noop, 390, 844),
      ('guide-mobile', ROOT/'public/guide/index.html', noop, 390, 844),
      ('privacy-mobile', ROOT/'public/privacy/index.html', noop, 390, 844),
      ('join-mobile', ROOT/'public/j/index.html', noop, 390, 844),
      ('viewer-desktop', ROOT/'public/viewer/index.html', noop, 1440, 1000),
      ('viewer-mobile', ROOT/'public/viewer/index.html', noop, 390, 844),
    ]
    results={}
    async with async_playwright() as p:
      browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
      page=await browser.new_page()
      for name,path,prep,width,height in targets:
        results[name]=await capture(page,path,prep,name,width,height)
      await browser.close()
    summary={'ok':True,'screenshots':len(targets),'outputDir':str(OUT),'results':results}
    (OUT/'visual-metrics.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'ok':True,'screenshots':len(targets),'outputDir':str(OUT)},ensure_ascii=False))


asyncio.run(main())
