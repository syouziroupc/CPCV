from __future__ import annotations

import asyncio
import json
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "stage07-screenshots"
OUT.mkdir(parents=True, exist_ok=True)
CSS = (ROOT / "public" / "assets" / "app.css").read_text(encoding="utf-8")


def build_html(path: str) -> str:
    html = (ROOT / "public" / path).read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
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
      const show = (id, visible=true) => document.getElementById(id)?.classList.toggle('hidden', !visible);
      show('loginSection', false);
      show('createSection', false);
      show('activeSessionsSection', false);
      show('notFoundSection', false);
      show('logoutButton', true);
      show('organizationManageLink', true);
      show('organizationAiSection', true);
      show('sessionSection', true);
      document.querySelector('#sessionTitle').textContent = '環境政策 第8回';
      document.querySelector('#joinUrl').textContent = 'https://example.test/j/ABCD2345';
      document.querySelector('#publicCode').textContent = '授業コード: ABCD2345';
      document.querySelector('#viewerUrl').textContent = 'https://example.test/viewer/ses_demo';
      document.querySelector('#postingState').textContent = '投稿: ON';
      document.querySelector('#commentsState').textContent = '投影表示: ON';
      document.querySelector('#commentModeState').textContent = '表示方法: 3件';
      document.querySelector('#moderationModeState').textContent = '投稿承認: 承認後に表示';
      document.querySelector('#commentDisplayState').textContent = '表示時間: 30秒';
      document.querySelector('#sessionState').textContent = '状態: 進行中';
      document.querySelector('#documentInfo').textContent = 'PDFはこの端末だけで表示します。サーバーへ保存しません。';
      document.querySelector('#organizationAiEnabled').checked = true;
      document.querySelector('#aiModerationDailyLimit').value = '500';
      document.querySelector('#aiTranslationDailyLimit').value = '500';
      document.querySelector('#organizationAiStatus').textContent = '現在: 有効。設定変更はOwnerだけができます。';
      document.querySelector('#sessionAiModerationEnabled').checked = true;
      document.querySelector('#sessionAiTranslationEnabled').checked = true;
      document.querySelector('#sessionAiTargetLanguage').value = 'en';
      document.querySelector('#sessionAiStatus').textContent = '組織AIは有効です。AI判定は参考情報として表示します。';
      document.querySelector('#moderationStatus').textContent = '3件を表示しています。';
      document.querySelector('#adminLocalLogBody').closest('.local-log-section').classList.add('hidden');
      const tbody = document.querySelector('#moderationBody');
      const rows = [
        {time:'2026/7/15 20:21', name:'学生A', msg:'この制度は地域格差を広げませんか。', state:'表示中', stateClass:'visible', rec:'AI参考: 要確認', recClass:'review', detail:'確信度 78% / policy-risk', tr:'AI翻訳 (英語)', text:'Could this policy widen regional disparities?'},
        {time:'2026/7/15 20:22', name:'学生B', msg:'具体的な費用の根拠を知りたいです。', state:'承認待ち', stateClass:'pending', rec:'AI参考: 問題なし', recClass:'allow', detail:'確信度 94%', tr:'AI翻訳 (英語)', text:'I would like to know the basis for the estimated cost.'},
        {time:'2026/7/15 20:23', name:'匿名', msg:'連絡先 example@example.com を見てください。', state:'承認待ち', stateClass:'pending', rec:'AI参考: 要確認', recClass:'review', detail:'個人情報を検出。外部AIへ未送信', tr:'未実行', text:'PII_DETECTED'}
      ];
      for (const item of rows) {
        const row = tbody.insertRow();
        const select = row.insertCell(); select.innerHTML = '<input type="checkbox" class="moderation-select" aria-label="選択">';
        for (const value of [item.time, item.name, item.msg]) { const td=row.insertCell(); td.textContent=value; }
        const state=row.insertCell(); state.innerHTML=`<span class="moderation-state state-${item.stateClass}">${item.state}</span>`;
        const ai=row.insertCell(); ai.className='ai-result-cell'; ai.innerHTML=`<span class="ai-result-badge ai-${item.recClass}">${item.rec}</span><small class="muted ai-result-detail">${item.detail}</small>`;
        const trans=row.insertCell(); trans.className='ai-result-cell'; trans.innerHTML=item.tr==='未実行' ? `<span class="muted">${item.tr} (${item.text})</span>` : `<strong>${item.tr}</strong><span class="ai-translation-text">${item.text}</span>`;
        const actions=row.insertCell(); actions.className='moderation-actions'; actions.innerHTML='<button class="button small">承認</button><button class="button small">非表示</button>';
      }
    }
    """)


async def prepare_viewer(page) -> None:
    await page.evaluate("""
    () => {
      document.querySelector('#viewerLogin').classList.add('hidden');
      document.querySelector('#emptyDocument').classList.add('hidden');
      document.querySelector('#pdfStage').classList.remove('hidden');
      document.querySelector('#topBar').classList.remove('hidden');
      document.querySelector('#commentPanel').classList.remove('hidden');
      document.querySelector('#commentPanel').classList.add('mode-stack3');
      document.querySelector('#viewerTitle').textContent = '環境政策 第8回';
      document.querySelector('#connectionState').textContent = '接続済み';
      document.querySelector('#localLogState').textContent = 'ログ 3件';
      const stage = document.querySelector('#pdfStage');
      stage.innerHTML = '<div style="width:min(76vw,900px);height:min(78vh,650px);background:#fff;color:#111;padding:7vh 7vw;box-shadow:0 12px 50px rgba(0,0,0,.45);font-family:sans-serif"><p style="font-size:18px;font-weight:700;margin:0 0 16px">環境政策 第8回</p><h1 style="font-size:clamp(28px,5vw,58px);line-height:1.15;margin:0 0 28px">地域政策の費用と公平性</h1><p style="font-size:clamp(18px,2.2vw,30px);line-height:1.5">政策効果だけでなく。地域間の負担差と実施費用を検討します。</p></div>';
      const list = document.querySelector('#commentList');
      const add=(name,msg,tr)=>{
        const card=document.createElement('div'); card.className='comment-card';
        card.innerHTML=`<span class="comment-name">${name}:</span><span>${msg}</span><span class="comment-translation">AI翻訳: ${tr}</span>`;
        list.append(card);
      };
      add('学生A','この制度は地域格差を広げませんか。','Could this policy widen regional disparities?');
      add('学生B','費用の根拠を知りたいです。','I would like to know the basis for the cost.');
    }
    """)


async def metrics(page, kind: str) -> dict:
    return await page.evaluate("""
    (kind) => {
      const visible = (el) => el && getComputedStyle(el).display !== 'none' && !el.classList.contains('hidden');
      const rect = (el) => { const r=el.getBoundingClientRect(); return {id:el.id, cls:el.className, type:el.type || '', left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height}; };
      const ids = kind === 'admin'
        ? ['organizationAiSection','sessionAiSection','moderationSection']
        : ['viewerStage','topBar','commentPanel'];
      const keyRects = ids.map(id => document.getElementById(id)).filter(visible).map(rect);
      const outside = keyRects.filter(r => r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > document.documentElement.scrollHeight + 1);
      const controls = [...document.querySelectorAll('button,input,select')].filter(visible).map(rect);
      const shortControls = controls.filter(r => r.height > 0 && r.height < 32 && r.type !== 'checkbox');
      return {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        keyRects,
        outside,
        shortControls,
        moderationScrollWidth: document.querySelector('.moderation-table-wrap')?.scrollWidth || 0,
        moderationClientWidth: document.querySelector('.moderation-table-wrap')?.clientWidth || 0,
        topBarScrollWidth: document.querySelector('#topBar')?.scrollWidth || 0,
        topBarClientWidth: document.querySelector('#topBar')?.clientWidth || 0
      };
    }
    """, kind)


async def render(page, kind: str, viewport: str, width: int, height: int) -> None:
    source = 'admin/index.html' if kind == 'admin' else 'viewer/index.html'
    await page.set_viewport_size({'width': width, 'height': height})
    await page.set_content(build_html(source), wait_until='load')
    if kind == 'admin':
        await prepare_admin(page)
    else:
        await prepare_viewer(page)
    await page.wait_for_timeout(300)
    data = await metrics(page, kind)
    if data['documentWidth'] > width + 1 or data['bodyWidth'] > width + 1:
        raise RuntimeError(f'{kind}-{viewport}: horizontal document overflow: {data}')
    if data['outside']:
        raise RuntimeError(f'{kind}-{viewport}: key container outside viewport: {data["outside"]}')
    if kind == 'admin' and data['shortControls']:
        raise RuntimeError(f'{kind}-{viewport}: controls below 35px: {data["shortControls"]}')
    stem = f'{kind}-{viewport}'
    await page.screenshot(path=str(OUT / f'{stem}.png'), full_page=(kind == 'admin'))
    (OUT / f'{stem}.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


async def render_admin_mobile_ai(page) -> None:
    await page.set_viewport_size({'width': 390, 'height': 844})
    await page.set_content(build_html('admin/index.html'), wait_until='load')
    await prepare_admin(page)
    await page.evaluate("""() => { const wrap=document.querySelector('.moderation-table-wrap'); wrap.scrollLeft=Math.min(260, Math.max(0, wrap.scrollWidth-wrap.clientWidth)); }""")
    await page.wait_for_timeout(300)
    await page.locator('#moderationSection').screenshot(path=str(OUT / 'admin-mobile-ai-columns.png'))
    data = await metrics(page, 'admin')
    (OUT / 'admin-mobile-ai-columns.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
        page = await browser.new_page()
        for kind in ('admin','viewer'):
            await render(page, kind, 'desktop', 1440, 1000)
            await render(page, kind, 'mobile', 390, 844)
        await render_admin_mobile_ai(page)
        await browser.close()
    print(json.dumps({'ok': True, 'outputDir': str(OUT), 'screenshots': 5}, ensure_ascii=False))


asyncio.run(main())
