from __future__ import annotations
import asyncio
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "stage06-screenshots"
OUT.mkdir(parents=True, exist_ok=True)
BASE_HTML = (ROOT / "public" / "_viewer_spa.html").read_text(encoding="utf-8")
CSS = (ROOT / "public" / "assets" / "app.css").read_text(encoding="utf-8")


def build_html() -> str:
    soup = BeautifulSoup(BASE_HTML, "html.parser")
    for tag in list(soup.find_all("link", href=re.compile(r"/assets/app\.css"))):
        style = soup.new_tag("style")
        style.string = CSS
        tag.replace_with(style)
    for tag in list(soup.find_all("script")):
        tag.decompose()
    extra = soup.new_tag("style")
    extra.string = """
      #viewerLogin,#qrOverlay,#pdfStage { display:none !important; }
      #topBar,#commentPanel,#emptyDocument,#qrCorner { display:flex !important; }
      #commentPanel { position:absolute; inset:auto 18px 18px auto; width:min(560px,calc(100% - 36px)); }
      #commentList { display:flex; flex-direction:column; gap:10px; width:100%; }
      .comment-card { display:block !important; opacity:1 !important; transform:none !important; }
      #qrCorner { background:#fff; }
      #qrCorner::before { content:'QR'; font:700 24px sans-serif; color:#111; margin:auto; }
      #qrCorner img { display:none; }
      @media (max-width:720px) {
        .viewer-topbar { gap:6px; }
        .viewer-file-button { font-size:12px; padding:6px 8px; }
        #commentPanel { inset:auto 8px 64px 8px; width:auto; }
      }
    """
    soup.head.append(extra)
    soup.find(id="viewerTitle").string = "Stage 6 リアルタイム投影"
    soup.find(id="connectionState").string = "コメント接続済み"
    soup.find(id="localLogState").string = "再接続復元済み"
    empty = soup.find(id="emptyDocument")
    empty.find("h1").string = "PDFを選択してください"
    empty.find("p").string = "PDFはこの端末だけで表示します。コメント接続は復元できます。"
    lst = soup.find(id="commentList")
    lst.clear()
    for name, msg in [
        ("Aki", "再接続後も順番通りに表示されます"),
        ("Mina", "同じコメントは二重表示されません"),
        ("", "授業終了時は自動で再接続を停止します"),
    ]:
        card = soup.new_tag("div", attrs={"class": "comment-card"})
        if name:
            span = soup.new_tag("span", attrs={"class": "comment-name"})
            span.string = f"{name}:"
            card.append(span)
        txt = soup.new_tag("span")
        txt.string = msg
        card.append(txt)
        lst.append(card)
    return str(soup)


async def render(page, name: str, width: int, height: int) -> None:
    await page.set_viewport_size({"width": width, "height": height})
    await page.set_content(build_html(), wait_until="load")
    await page.evaluate("""
      () => {
        const bar = document.getElementById('topBar');
        if (bar) bar.scrollLeft = 0;
      }
    """)
    metrics = await page.evaluate("""
      () => {
        const rect = (id) => {
          const value = document.getElementById(id)?.getBoundingClientRect();
          return value ? { left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height } : null;
        };
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
          bodyWidth: document.body.scrollWidth,
          topbarClientWidth: document.getElementById('topBar')?.clientWidth || 0,
          topbarScrollWidth: document.getElementById('topBar')?.scrollWidth || 0,
          topbar: rect('topBar'),
          commentPanel: rect('commentPanel'),
          qrCorner: rect('qrCorner')
        };
      }
    """)
    if metrics["documentWidth"] > width + 1 or metrics["bodyWidth"] > width + 1:
        raise RuntimeError(f"{name} page overflow: {metrics}")
    if width <= 720:
        topbar = metrics["topbar"]
        panel = metrics["commentPanel"]
        qr = metrics["qrCorner"]
        if panel and topbar and panel["bottom"] > topbar["top"] - 3:
            raise RuntimeError(f"{name} comment panel overlaps toolbar: {metrics}")
        if panel and qr and not (qr["bottom"] <= panel["top"] or qr["top"] >= panel["bottom"] or qr["right"] <= panel["left"] or qr["left"] >= panel["right"]):
            raise RuntimeError(f"{name} QR overlaps comment panel: {metrics}")
    await page.screenshot(path=str(OUT / f"{name}.png"), full_page=False)
    (OUT / f"{name}.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="/usr/bin/chromium",
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = await browser.new_page()
        await render(page, "viewer-realtime-desktop", 1440, 1000)
        await render(page, "viewer-realtime-mobile", 390, 844)
        await browser.close()
    print(json.dumps({"ok": True, "outputDir": str(OUT)}, ensure_ascii=False, indent=2))


asyncio.run(main())
