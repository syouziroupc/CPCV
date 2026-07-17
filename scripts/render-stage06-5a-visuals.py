from __future__ import annotations
import asyncio
import json
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "stage06-5a-screenshots"
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
    challenge = soup.find(id="turnstile")
    if challenge is not None:
        challenge["style"] = "display:flex;align-items:center;justify-content:center;border:1px solid #d1d5db;background:#f9fafb;color:#6b7280;font-size:14px;"
        challenge.string = "セキュリティ確認"
    return str(soup)


async def render(page, page_name: str, viewport_name: str, width: int, height: int) -> None:
    await page.set_viewport_size({"width": width, "height": height})
    await page.set_content(build_html(page_name), wait_until="load")
    metrics = await page.evaluate("""
      () => ({
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        card: (() => { const r=document.querySelector('.card')?.getBoundingClientRect(); return r ? {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null; })(),
        submit: (() => { const r=document.querySelector('.auth-submit')?.getBoundingClientRect(); return r ? {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null; })()
      })
    """)
    if metrics["documentWidth"] > width + 1 or metrics["bodyWidth"] > width + 1:
        raise RuntimeError(f"{page_name}-{viewport_name} horizontal overflow: {metrics}")
    card = metrics["card"]
    if card and (card["left"] < -1 or card["right"] > width + 1):
        raise RuntimeError(f"{page_name}-{viewport_name} card outside viewport: {metrics}")
    submit = metrics["submit"]
    if submit and submit["height"] < 40:
        raise RuntimeError(f"{page_name}-{viewport_name} submit target too short: {metrics}")
    stem = f"{page_name}-{viewport_name}"
    await page.screenshot(path=str(OUT / f"{stem}.png"), full_page=True)
    (OUT / f"{stem}.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        page = await browser.new_page()
        for page_name in ["signup", "forgot-password", "reset-password", "verify-email"]:
            await render(page, page_name, "desktop", 1440, 1000)
            await render(page, page_name, "mobile", 390, 844)
        await browser.close()
    print(json.dumps({"ok": True, "outputDir": str(OUT), "screenshots": 8}, ensure_ascii=False))


asyncio.run(main())
