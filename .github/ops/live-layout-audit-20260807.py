from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

origin, output, release = sys.argv[1:4]
out = Path(output)
out.mkdir(parents=True, exist_ok=True)
paths = (
    "/", "/admin", "/signup", "/forgot-password", "/account",
    "/master", "/about", "/guide", "/privacy"
)
viewports = ((320, 720), (375, 812), (768, 1024), (1024, 768), (1440, 1000))


async def main() -> None:
    failures: list[dict] = []
    checks = 0
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = await browser.new_page()
        for path in paths:
            for width, height in viewports:
                checks += 1
                await page.set_viewport_size({"width": width, "height": height})
                separator = "&" if "?" in path else "?"
                await page.goto(
                    f"{origin}{path}{separator}release={release}",
                    wait_until="domcontentloaded",
                    timeout=30_000,
                )
                await page.wait_for_timeout(700)
                result = await page.evaluate(
                    """
                    (width) => {
                      const visible = (element) => {
                        const style = getComputedStyle(element);
                        const rect = element.getBoundingClientRect();
                        return style.display !== 'none' && style.visibility !== 'hidden' &&
                          Number(style.opacity || 1) !== 0 && rect.width > .5 && rect.height > .5;
                      };
                      const scrollParent = (element) => {
                        for (let node = element.parentElement; node; node = node.parentElement) {
                          const style = getComputedStyle(node);
                          if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) return true;
                        }
                        return false;
                      };
                      const outside = [];
                      for (const element of [...document.body.querySelectorAll('*')].filter(visible)) {
                        if (scrollParent(element)) continue;
                        const rect = element.getBoundingClientRect();
                        if (rect.left < -1 || rect.right > width + 1) {
                          outside.push({
                            tag: element.tagName,
                            id: element.id || '',
                            className: String(element.className || '').slice(0, 80),
                            left: rect.left,
                            right: rect.right,
                          });
                          if (outside.length >= 20) break;
                        }
                      }
                      const auth = [];
                      for (const shell of document.querySelectorAll('.auth-shell,.admin-login-shell')) {
                        if (!visible(shell)) continue;
                        const shellRect = shell.getBoundingClientRect();
                        for (const element of shell.querySelectorAll('input,select,textarea,button,iframe')) {
                          if (!visible(element)) continue;
                          const rect = element.getBoundingClientRect();
                          if (rect.left < shellRect.left - 1 || rect.right > shellRect.right + 1) {
                            auth.push({
                              tag: element.tagName,
                              id: element.id || '',
                              left: rect.left,
                              right: rect.right,
                              shellLeft: shellRect.left,
                              shellRight: shellRect.right,
                            });
                          }
                        }
                      }
                      return {
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth,
                        outside,
                        auth,
                      };
                    }
                    """,
                    width,
                )
                ok = (
                    result["documentWidth"] <= width + 1
                    and result["bodyWidth"] <= width + 1
                    and not result["outside"]
                    and not result["auth"]
                )
                if not ok:
                    item = {"path": path, "width": width, **result}
                    failures.append(item)
                    safe = path.strip("/").replace("/", "_") or "home"
                    await page.screenshot(
                        path=str(out / f"FAIL-{safe}-{width}.png"),
                        full_page=True,
                    )
                elif path in ("/admin", "/signup", "/forgot-password") and width in (320, 1024):
                    safe = path.strip("/")
                    await page.screenshot(
                        path=str(out / f"PASS-{safe}-{width}.png"),
                        full_page=True,
                    )
        await browser.close()

    summary = {
        "ok": not failures,
        "checks": checks,
        "failureCount": len(failures),
        "failures": failures,
    }
    (out / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": summary["ok"], "checks": checks, "failureCount": len(failures)}))
    if failures:
        for item in failures[:10]:
            print(json.dumps(item, ensure_ascii=False))
        raise SystemExit(1)


asyncio.run(main())
