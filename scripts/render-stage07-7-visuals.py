from __future__ import annotations

import asyncio
import json
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "stage07-7-screenshots"
OUT.mkdir(parents=True, exist_ok=True)
CSS = (ROOT / "public" / "assets" / "app.css").read_text(encoding="utf-8")


def build_html() -> str:
    html = (ROOT / "public" / "admin" / "index.html").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
    for tag in list(soup.find_all("link", href=lambda value: value and "/assets/app.css" in value)):
        style = soup.new_tag("style")
        style.string = CSS
        tag.replace_with(style)
    for tag in list(soup.find_all("script")):
        tag.decompose()
    return str(soup)


async def prepare(page) -> None:
    await page.evaluate("""
    () => {
      const show = (id, visible=true) => document.getElementById(id)?.classList.toggle('hidden', !visible);
      show('loginSection', false); show('createSection', false); show('activeSessionsSection', false);
      show('notFoundSection', false); show('logoutButton', true); show('organizationManageLink', true);
      show('organizationAiSection', false); show('organizationFilterSection', true); show('sessionSection', true);
      document.querySelector('#sessionTitle').textContent = '環境政策 第8回';
      document.querySelector('#joinUrl').textContent = 'https://example.test/j/ABCD2345';
      document.querySelector('#publicCode').textContent = '合言葉: ABCD2345';
      document.querySelector('#viewerUrl').textContent = 'https://example.test/viewer/ses_demo';
      document.querySelector('#postingState').textContent = '投稿: 受付中';
      document.querySelector('#commentsState').textContent = 'コメント表示: ON';
      document.querySelector('#commentModeState').textContent = '表示方法: 3件';
      document.querySelector('#moderationModeState').textContent = '投稿承認: 自動表示';
      document.querySelector('#commentDisplayState').textContent = '表示時間: 1分';
      document.querySelector('#sessionState').textContent = '残り: 5時間20分';
      document.querySelector('#documentInfo').textContent = 'PDFは投影画面で選択します。クラウドには送りません。';
      document.querySelector('#organizationFilterStatus').textContent = '日本語39語。英語50語を登録中。上限2000語。';
      document.querySelector('#filterPackStatus').textContent = '日本語: 導入済み（ja-core-v1） / 英語: 導入済み（en-core-v1）';
      document.querySelector('#installJapaneseFilterPackButton').disabled = true;
      document.querySelector('#installEnglishFilterPackButton').disabled = true;
      const categories = [
        ['sexual','下ネタ・性的表現'],['profanity','暴言・下品な表現'],['harassment','侮辱・嫌がらせ'],
        ['discrimination','差別的表現'],['violence','暴力・脅迫'],['political','政治的発言'],
        ['personal_info','個人情報'],['spam','宣伝・スパム'],['illegal','違法行為'],['custom','独自分類']
      ];
      const category = document.querySelector('#filterTermCategory');
      for (const [id,label] of categories) category.append(new Option(label,id));
      const language = document.querySelector('#filterTermLanguage');
      for (const [id,label] of [['und','自動・指定なし'],['ja','日本語'],['en','英語']]) language.append(new Option(label,id));
      document.querySelector('#organizationFilterAdvanced').open = true;
      document.querySelector('#filterTermAdvancedDetails').open = true;
      const terms = [
        ['ちんこ','日本語','下ネタ・性的表現','3','自動','使用',true],['ass','英語','暴言・下品な表現','3','単語全体','使用',true],
        ['f-u-c-k','英語','暴言・下品な表現','3','単語全体','使用',true],['政府批判','日本語','政治的発言','5','自動','使用',false]
      ];
      const termsBody = document.querySelector('#filterTermsBody');
      for (const item of terms) {
        const row=termsBody.insertRow();
        for (const value of item.slice(0,6)) { const cell=row.insertCell(); cell.textContent=value; }
        const enabled=row.insertCell(); enabled.innerHTML=`<input type="checkbox" ${item[6]?'checked':''} aria-label="有効">`;
        const action=row.insertCell(); action.innerHTML='<div class="row-actions"><button class="button small">編集</button><button class="button small danger">削除</button></div>';
      }
      const policies = {
        sexual:[true,2,3,5], profanity:[true,2,3,5], harassment:[true,3,4,5], discrimination:[false,2,4,5],
        violence:[false,3,4,5], political:[false,3,'',''], personal_info:[true,1,2,5], spam:[false,2,3,5], illegal:[false,3,4,5], custom:[false,3,4,5]
      };
      const policyBody=document.querySelector('#filterPoliciesBody');
      for (const [id,label] of categories) {
        const values=policies[id]; const row=policyBody.insertRow(); row.dataset.category=id;
        const name=row.insertCell(); name.textContent=label;
        const on=row.insertCell(); on.innerHTML=`<input type="checkbox" ${values[0]?'checked':''}>`;
        for (const value of values.slice(1)) { const cell=row.insertCell(); const select=document.createElement('select'); select.className='select'; select.append(new Option('使用しない','')); for(let i=1;i<=5;i++)select.append(new Option(String(i),String(i))); select.value=String(value); cell.append(select); }
      }
      document.querySelector('#sessionFilterSimpleMode').value = 'recommended';
      document.querySelector('#sessionFilterAdvanced').open = true;
      document.querySelector('#sessionFilterEnabled').checked = true;
      document.querySelector('#sessionFilterAiRouting').value = 'ambiguous';
      document.querySelector('#sessionFilterMaskCharacter').value = '＊';
      document.querySelector('#sessionTranslationFilterEnabled').checked = true;
      document.querySelector('#sessionUnsupportedLanguageMode').value = 'ai_review';
      document.querySelector('#sessionFilterStatus').textContent = '有効。日本語・英語は辞書。日英以外は承認待ち＋AI参考判定。翻訳後検閲: ON';
      document.querySelector('#sessionAiSection').classList.add('hidden');
      document.querySelector('#adminLocalLogBody').closest('.local-log-section').classList.add('hidden');
      document.querySelector('#moderationStatus').textContent = '2件表示中';
      const moderation=document.querySelector('#moderationBody');
      const data=[
        ['2026/7/16 10:10','学生A','ち、んこ','投影表示: ＊＊＊＊','辞書: 伏字 / 下ネタ・性的表現','表示中'],
        ['2026/7/16 10:11','学生B','puta','','言語: 日英以外 / 承認待ち＋AI参考判定','承認待ち']
      ];
      for(const item of data){
        const row=moderation.insertRow(); row.insertCell().innerHTML='<input type="checkbox">';
        row.insertCell().textContent=item[0]; row.insertCell().textContent=item[1];
        const msg=row.insertCell(); msg.className='moderation-message'; msg.innerHTML=`<div>${item[2]}</div>${item[3]?`<div class="filter-display-message">${item[3]}</div>`:''}<div class="filter-evidence">${item[4]}</div>`;
        row.insertCell().innerHTML=`<span class="moderation-state state-${item[5]==='表示中'?'visible':'pending'}">${item[5]}</span>`;
        row.insertCell().textContent=item[5]==='承認待ち'?'AI参考: 要確認':'未実行'; row.insertCell().textContent='未実行'; row.insertCell().innerHTML='<button class="button small">承認</button>';
      }
    }
    """)


async def get_metrics(page, selector: str) -> dict:
    return await page.evaluate("""
    (selector) => {
      const el=document.querySelector(selector); const r=el.getBoundingClientRect();
      const controls=[...el.querySelectorAll('button,input,select')].filter(x=>getComputedStyle(x).display!=='none').map(x=>{const q=x.getBoundingClientRect();return {tag:x.tagName,type:x.type||'',w:q.width,h:q.height,left:q.left,right:q.right,top:q.top,bottom:q.bottom,scrollable:Boolean(x.closest('.filter-table-wrap,.moderation-table-wrap'))}});
      return {viewport:{w:innerWidth,h:innerHeight}, documentWidth:document.documentElement.scrollWidth, bodyWidth:document.body.scrollWidth,
        section:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},
        outside:controls.filter(q=>!q.scrollable&&(q.left<-1||q.right>innerWidth+1)), short:controls.filter(q=>q.type!=='checkbox'&&q.h>0&&q.h<32),
        tableWraps:[...el.querySelectorAll('.filter-table-wrap,.moderation-table-wrap')].map(x=>({clientWidth:x.clientWidth,scrollWidth:x.scrollWidth}))};
    }
    """, selector)


async def capture(page, name: str, selector: str, width: int, height: int) -> None:
    await page.set_viewport_size({'width':width,'height':height})
    await page.set_content(build_html(), wait_until='load')
    await prepare(page)
    await page.locator(selector).scroll_into_view_if_needed()
    await page.wait_for_timeout(200)
    metrics=await get_metrics(page, selector)
    if metrics['documentWidth'] > width + 1 or metrics['bodyWidth'] > width + 1:
        raise RuntimeError(f'{name}: page overflow {metrics}')
    if metrics['outside']:
        raise RuntimeError(f'{name}: control outside viewport {metrics["outside"]}')
    if metrics['short']:
        raise RuntimeError(f'{name}: short controls {metrics["short"]}')
    await page.locator(selector).screenshot(path=str(OUT/f'{name}.png'))
    (OUT/f'{name}.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


async def main() -> None:
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=await browser.new_page()
        await capture(page,'dictionary-desktop','#organizationFilterSection',1440,1000)
        await capture(page,'dictionary-mobile','#organizationFilterSection',390,844)
        await capture(page,'session-filter-desktop','#sessionFilterSection',1440,1000)
        await capture(page,'session-filter-mobile','#sessionFilterSection',390,844)
        await capture(page,'moderation-filter-desktop','#moderationSection',1440,1000)
        await capture(page,'moderation-filter-mobile','#moderationSection',390,844)
        await browser.close()
    print(json.dumps({'ok':True,'screenshots':6,'outputDir':str(OUT)},ensure_ascii=False))

asyncio.run(main())
