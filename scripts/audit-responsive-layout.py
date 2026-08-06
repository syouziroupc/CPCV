from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = ROOT / "artifacts" / "responsive-layout-audit"
VIEWPORTS = (
    ("phone-320", 320, 720),
    ("phone-375", 375, 812),
    ("tablet-768", 768, 1024),
    ("desktop-1024", 1024, 768),
    ("desktop-1440", 1440, 1000),
)
KEY_SCREENSHOTS = {
    "index.html",
    "_admin_spa.html",
    "admin/index.html",
    "signup/index.html",
    "forgot-password/index.html",
    "account/index.html",
    "master/index.html",
}


def local_css(href: str) -> Path | None:
    clean = href.split("?", 1)[0]
    if not clean.startswith("/assets/") or not clean.endswith(".css"):
        return None
    path = PUBLIC / clean.removeprefix("/")
    return path if path.exists() else None


def inline_document(path: Path) -> str:
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    for tag in list(soup.find_all("link", href=True)):
        css_path = local_css(str(tag.get("href", "")))
        if css_path:
            style = soup.new_tag("style")
            style.string = css_path.read_text(encoding="utf-8")
            tag.replace_with(style)
    for tag in list(soup.find_all("script")):
        tag.decompose()
    return str(soup)


def page_name(path: Path) -> str:
    return path.relative_to(PUBLIC).as_posix().replace("/", "__")


async def inspect(page, source: str, width: int) -> dict:
    return await page.evaluate(
        """
        ({source, width}) => {
          const visible = (el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' &&
              Number(style.opacity || 1) !== 0 && rect.width > .5 && rect.height > .5;
          };
          const hasScrollAncestor = (el) => {
            for (let node = el.parentElement; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) return true;
            }
            return false;
          };
          const describe = (el) => ({
            tag: el.tagName,
            id: el.id || '',
            classes: typeof el.className === 'string' ? el.className.slice(0, 100) : '',
            text: String(el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 90),
          });
          const all = [...document.body.querySelectorAll('*')].filter(visible);
          const outside = [];
          for (const el of all) {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (style.position === 'fixed' && el.closest('.viewer-stage')) continue;
            if ((rect.left < -1 || rect.right > width + 1) && !hasScrollAncestor(el)) {
              outside.push({...describe(el), left: rect.left, right: rect.right, elementWidth: rect.width});
              if (outside.length >= 30) break;
            }
          }
          const clippedText = [];
          for (const el of all) {
            if (!/^(H1|H2|H3|P|LABEL|BUTTON|A|SUMMARY|TH|TD|SMALL|STRONG)$/.test(el.tagName)) continue;
            const style = getComputedStyle(el);
            if (hasScrollAncestor(el)) continue;
            const clipsX = el.scrollWidth > el.clientWidth + 2 && !/(auto|scroll)/.test(style.overflowX);
            const clipsY = el.scrollHeight > el.clientHeight + 2 && !/(auto|scroll)/.test(style.overflowY) && style.webkitLineClamp === 'none';
            if (clipsX || clipsY) {
              clippedText.push({...describe(el), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
                clientHeight: el.clientHeight, scrollHeight: el.scrollHeight});
              if (clippedText.length >= 30) break;
            }
          }
          const authFailures = [];
          for (const shell of document.querySelectorAll('.auth-shell, .admin-login-shell')) {
            if (!visible(shell)) continue;
            const shellRect = shell.getBoundingClientRect();
            if (shellRect.left < -1 || shellRect.right > width + 1) {
              authFailures.push({kind: 'shell-outside', ...describe(shell), left: shellRect.left, right: shellRect.right});
            }
            for (const control of shell.querySelectorAll('input, select, textarea, button, iframe')) {
              if (!visible(control)) continue;
              const rect = control.getBoundingClientRect();
              if (rect.left < shellRect.left - 1 || rect.right > shellRect.right + 1) {
                authFailures.push({kind: 'control-outside-shell', ...describe(control), left: rect.left, right: rect.right,
                  shellLeft: shellRect.left, shellRight: shellRect.right});
              }
            }
          }
          return {
            source,
            viewportWidth: width,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            outside,
            clippedText,
            authFailures,
          };
        }
        """,
        {"source": source, "width": width},
    )


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    html_files = sorted(PUBLIC.rglob("*.html"))
    if not html_files:
        raise SystemExit("No public HTML files found")

    failures: list[dict] = []
    results: list[dict] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        page = await browser.new_page()
        for path in html_files:
            html = inline_document(path)
            relative = path.relative_to(PUBLIC).as_posix()
            for viewport_name, width, height in VIEWPORTS:
                await page.set_viewport_size({"width": width, "height": height})
                await page.set_content(html, wait_until="load")
                await page.wait_for_timeout(30)
                result = await inspect(page, relative, width)
                result["viewport"] = viewport_name
                result["ok"] = (
                    result["documentWidth"] <= width + 1
                    and result["bodyWidth"] <= width + 1
                    and not result["outside"]
                    and not result["clippedText"]
                    and not result["authFailures"]
                )
                results.append(result)
                if not result["ok"]:
                    failures.append(result)
                    await page.screenshot(
                        path=str(OUT / f"FAIL-{page_name(path)}-{viewport_name}.png"), full_page=True
                    )
                elif relative in KEY_SCREENSHOTS and viewport_name in {"phone-320", "desktop-1024"}:
                    await page.screenshot(
                        path=str(OUT / f"PASS-{page_name(path)}-{viewport_name}.png"), full_page=True
                    )
        await browser.close()

    summary = {
        "ok": not failures,
        "htmlFiles": len(html_files),
        "viewports": len(VIEWPORTS),
        "checks": len(results),
        "failureCount": len(failures),
        "failures": failures,
    }
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("ok", "htmlFiles", "viewports", "checks", "failureCount")}, ensure_ascii=False))
    if failures:
        for failure in failures[:12]:
            print(json.dumps(failure, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
