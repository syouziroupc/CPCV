from __future__ import annotations
import asyncio
import json
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "stage06-5-screenshots"
OUT.mkdir(parents=True, exist_ok=True)
CSS = (ROOT / "public" / "assets" / "app.css").read_text(encoding="utf-8")


def build_html(page_name: str) -> str:
    html = (ROOT / "public" / page_name / "index.html").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
    for tag in list(soup.find_all("link", href=lambda value: value and "/assets/app.css" in value)):
        style = soup.new_tag("style")
        style.string = CSS
        tag.replace_with(style)
    for tag in list(soup.find_all("script")):
        tag.decompose()
    return str(soup)


async def prepare(page, scenario: str) -> None:
    if scenario == "account":
        await page.evaluate("""
        () => {
          document.querySelector('#loadingSection').classList.add('hidden');
          document.querySelector('#accountSection').classList.remove('hidden');
          document.querySelector('#displayName').textContent = '吉田 渚音';
          document.querySelector('#emailState').textContent = 'owner@example.jp（確認済み）';
          document.querySelector('#organizationState').textContent = '正二郎商事 / Owner / 有効\\n共同授業プロジェクト / Teacher / 有効';
          document.querySelector('#pendingEmail').textContent = '確認待ち: new-owner@example.jp / 有効期限 2026/7/15 17:00';
          document.querySelector('#status').textContent = '現在のメールアドレスは確認済みです。';
        }
        """)
    elif scenario == "invite-new":
        await page.evaluate("""
        () => {
          const info=document.querySelector('#invitationInfo'); info.classList.remove('hidden');
          info.textContent='正二郎商事 / Teacher / 招待先 n***@example.jp';
          document.querySelector('#newSection').classList.remove('hidden');
          document.querySelector('#status').textContent='アカウントを作成して招待を承認します。';
          document.querySelector('#displayName').value='山田 花子';
        }
        """)
    elif scenario == "invite-existing":
        await page.evaluate("""
        () => {
          const info=document.querySelector('#invitationInfo'); info.classList.remove('hidden');
          info.textContent='共同授業プロジェクト / Admin / 招待先 o***@example.jp';
          document.querySelector('#existingSection').classList.remove('hidden');
          document.querySelector('#status').textContent='ログイン後に招待を承認します。';
          document.querySelector('#loginEmail').value='owner@example.jp';
        }
        """)
    elif scenario == "confirm-email":
        await page.evaluate("""
        () => {
          document.querySelector('#status').textContent='メールアドレスを確認しました。';
          document.querySelector('#detail').textContent='new-owner@example.jp でログインしてください。安全のため全端末からログアウトしました。';
          document.querySelector('#loginLink').classList.remove('hidden');
        }
        """)
    elif scenario == "master":
        await page.evaluate("""
        () => {
          document.querySelector('#masterLoginSection').classList.add('hidden');
          document.querySelector('#masterPanel').classList.remove('hidden');
          document.querySelector('#masterLogoutButton').classList.remove('hidden');
          document.querySelector('#organizationName').textContent='正二郎商事';
          document.querySelector('#organizationRole').textContent='吉田 渚音 / Owner';
          document.querySelector('#masterTimeLeft').textContent='Session残り 11時間42分';
          document.querySelector('#quotaStatus').textContent='メンバー 3 / 25　未承認招待 2 / 25　今日の招待メール 4 / 50';
          document.querySelector('#memberEmail').value='teacher@example.jp';
          const make=(title, detail, buttons=[])=>{
            const item=document.createElement('div'); item.className='teacher-item';
            const summary=document.createElement('div'); const strong=document.createElement('strong'); strong.textContent=title;
            const sub=document.createElement('div'); sub.className='muted break'; sub.textContent=detail; summary.append(strong,sub); item.append(summary);
            const actions=document.createElement('div'); actions.className='row wrap'; for(const label of buttons){const b=document.createElement('button');b.className=label==='取消'?'button danger':'button';b.textContent=label;actions.append(b);} item.append(actions); return item;
          };
          const invites=document.querySelector('#invitationList'); invites.append(
            make('teacher@example.jp','Teacher / 有効期限 2026/7/21 17:00',['再送','取消']),
            make('admin@example.jp','Admin / 有効期限 2026/7/20 10:00',['再送','取消'])
          );
          const members=document.querySelector('#memberList'); members.append(
            make('吉田 渚音','owner@example.jp / Owner / 有効'),
            make('山田 花子','teacher@example.jp / Teacher / 有効',['停止','再設定メール','解除'])
          );
          document.querySelector('#masterSessionList').append(make('環境政策 第8回','作成者: owner_01 / 2026/7/14 13:00',['開く','終了','削除']));
          document.querySelector('#auditList').append(make('organization.invitation.created','2026/7/14 16:20 / owner / teacher@example.jp'));
          document.querySelector('#masterStatus').textContent='メール招待方式へ移行済みです。';
        }
        """)


async def render(page, page_name: str, scenario: str, viewport_name: str, width: int, height: int) -> None:
    await page.set_viewport_size({"width": width, "height": height})
    await page.set_content(build_html(page_name), wait_until="load")
    await prepare(page, scenario)
    metrics = await page.evaluate("""
      () => {
        const visible = (el) => el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
        const rect = (el) => { const r=el.getBoundingClientRect(); return {tag:el.tagName,id:el.id,className:el.className,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
        const candidates=[...document.querySelectorAll('.card,.info-box,.teacher-item,input,select,button,a.button')].filter(visible);
        return {
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
          bodyWidth: document.body.scrollWidth,
          outside: candidates.map(rect).filter(r => r.left < -1 || r.right > innerWidth + 1),
          shortTargets: candidates.map(rect).filter(r => ['BUTTON','INPUT','SELECT'].includes(r.tag) && r.height < 39),
          visibleCount: candidates.length
        };
      }
    """)
    if metrics["documentWidth"] > width + 1 or metrics["bodyWidth"] > width + 1:
        raise RuntimeError(f"{scenario}-{viewport_name} horizontal overflow: {metrics}")
    if metrics["outside"]:
        raise RuntimeError(f"{scenario}-{viewport_name} elements outside viewport: {metrics['outside']}")
    if metrics["shortTargets"]:
        raise RuntimeError(f"{scenario}-{viewport_name} short input/button targets: {metrics['shortTargets']}")
    stem = f"{scenario}-{viewport_name}"
    await page.screenshot(path=str(OUT / f"{stem}.png"), full_page=True)
    (OUT / f"{stem}.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def main() -> None:
    cases = [
      ("account", "account"),
      ("accept-invitation", "invite-new"),
      ("accept-invitation", "invite-existing"),
      ("confirm-email-change", "confirm-email"),
      ("master", "master")
    ]
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        page = await browser.new_page()
        for page_name, scenario in cases:
            await render(page, page_name, scenario, "desktop", 1440, 1000)
            await render(page, page_name, scenario, "mobile", 390, 844)
        await browser.close()
    print(json.dumps({"ok": True, "outputDir": str(OUT), "screenshots": len(cases) * 2}, ensure_ascii=False))


asyncio.run(main())
