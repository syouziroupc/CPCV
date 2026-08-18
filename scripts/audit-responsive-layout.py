from __future__ import annotations

import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = ROOT / "artifacts" / "responsive-layout-audit"
VIEWPORTS = (
    ("pane-280", 280, 720),
    ("phone-320", 320, 720),
    ("phone-375", 375, 812),
    ("tablet-768", 768, 1024),
    ("desktop-901", 901, 800),
    ("desktop-1024", 1024, 768),
    ("desktop-1100", 1100, 800),
    ("desktop-1440", 1440, 1000),
)
KEY_PAGES = {
    "_admin_spa.html", "admin/index.html", "_viewer_spa.html", "viewer/index.html",
    "signup/index.html", "forgot-password/index.html", "account/index.html", "master/index.html",
}


async def inspect(page, source: str, width: int) -> dict:
    return await page.evaluate(
        r"""({source, width}) => {
          const visible = (el) => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' &&
              Number(s.opacity || 1) !== 0 && r.width > .5 && r.height > .5;
          };
          const scrollAncestor = (el) => {
            for (let node = el.parentElement; node; node = node.parentElement) {
              const s = getComputedStyle(node);
              if (/(auto|scroll)/.test(s.overflowX) && node.scrollWidth > node.clientWidth + 1) return true;
            }
            return false;
          };
          const describe = (el) => ({
            tag: el.tagName,
            id: el.id || '',
            classes: typeof el.className === 'string' ? el.className.slice(0, 100) : '',
            text: String(el.textContent || el.getAttribute('aria-label') || '')
              .trim().replace(/\s+/g, ' ').slice(0, 90)
          });
          const elements = [...document.body.querySelectorAll('*')].filter(visible);
          const outside = [];
          for (const el of elements) {
            if (scrollAncestor(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.left < -1 || r.right > width + 1) {
              outside.push({...describe(el), left: r.left, right: r.right, elementWidth: r.width});
              if (outside.length >= 25) break;
            }
          }
          const authFailures = [];
          for (const shell of document.querySelectorAll('.auth-shell, .admin-login-shell')) {
            if (!visible(shell)) continue;
            const sr = shell.getBoundingClientRect();
            if (sr.left < -1 || sr.right > width + 1) {
              authFailures.push({kind: 'shell-outside', ...describe(shell), left: sr.left, right: sr.right});
            }
            for (const control of shell.querySelectorAll('input, select, textarea, button, iframe')) {
              if (!visible(control)) continue;
              const r = control.getBoundingClientRect();
              if (r.left < sr.left - 1 || r.right > sr.right + 1) {
                authFailures.push({
                  kind: 'control-outside-shell', ...describe(control),
                  left: r.left, right: r.right, shellLeft: sr.left, shellRight: sr.right
                });
              }
            }
          }
          const viewerControlFailures = [];
          const viewerTopbar = document.querySelector('.viewer-topbar');
          if (viewerTopbar && visible(viewerTopbar)) {
            const tr = viewerTopbar.getBoundingClientRect();
            if (viewerTopbar.scrollWidth > viewerTopbar.clientWidth + 1) {
              viewerControlFailures.push({kind: 'toolbar-horizontal-overflow', scrollWidth: viewerTopbar.scrollWidth, clientWidth: viewerTopbar.clientWidth});
            }
            for (const control of viewerTopbar.querySelectorAll('button, label, #connectionState, #localLogState, #pdfPageControls')) {
              if (!visible(control)) continue;
              const r = control.getBoundingClientRect();
              if (r.left < tr.left - 1 || r.right > tr.right + 1 || r.left < -1 || r.right > width + 1) {
                viewerControlFailures.push({kind: 'viewer-control-outside', ...describe(control), left: r.left, right: r.right, toolbarLeft: tr.left, toolbarRight: tr.right});
              }
            }
          }
          const accountOverlayFailures = [];
          const accountNav = document.querySelector('.account-section-nav');
          if (accountNav && visible(accountNav)) {
            const nr = accountNav.getBoundingClientRect();
            if (nr.bottom > 0 && nr.top < innerHeight) {
              for (const content of document.querySelectorAll('#organizationSettings .workspace-panel, #organizationSettings .workspace-detail, #organizationSettings .filter-editor-panel')) {
                if (!visible(content)) continue;
                const r = content.getBoundingClientRect();
                const verticalOverlap = Math.min(nr.bottom, r.bottom) - Math.max(nr.top, r.top);
                const horizontalOverlap = Math.min(nr.right, r.right) - Math.max(nr.left, r.left);
                if (verticalOverlap > 1 && horizontalOverlap > 1) {
                  accountOverlayFailures.push({
                    kind: 'account-nav-covers-settings',
                    ...describe(content),
                    navTop: nr.top, navBottom: nr.bottom, contentTop: r.top, contentBottom: r.bottom
                  });
                  break;
                }
              }
            }
          }
          return {
            source,
            viewportWidth: width,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            outside,
            authFailures,
            viewerControlFailures,
            accountOverlayFailures
          };
        }""",
        {"source": source, "width": width},
    )


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    html_files = sorted(PUBLIC.rglob("*.html"))
    failures: list[dict] = []
    checks = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = await browser.new_context(java_script_enabled=False)
        page = await context.new_page()
        for path in html_files:
            relative = path.relative_to(PUBLIC).as_posix()
            for viewport_name, width, height in VIEWPORTS:
                checks += 1
                await page.set_viewport_size({"width": width, "height": height})
                await page.goto(path.resolve().as_uri(), wait_until="load")
                await page.wait_for_timeout(80)
                if relative in {"_admin_spa.html", "admin/index.html"}:
                    await page.evaluate("""() => {
                      document.getElementById('adminBootSection')?.classList.add('hidden');
                      document.getElementById('loginSection')?.classList.add('hidden');
                      document.getElementById('adminHome')?.classList.add('hidden');
                      document.getElementById('sessionSection')?.classList.remove('hidden');
                    }""")
                if relative in {"_viewer_spa.html", "viewer/index.html"}:
                    await page.evaluate("""() => {
                      document.getElementById('topBar')?.classList.remove('hidden');
                      document.getElementById('pdfPageControls')?.classList.remove('hidden');
                    }""")
                if relative == "account/index.html":
                    await page.evaluate("""() => {
                      document.getElementById('loadingSection')?.classList.add('hidden');
                      document.getElementById('accountSection')?.classList.remove('hidden');
                      document.getElementById('organizationSettings')?.classList.remove('hidden');
                      const packStatus = document.getElementById('filterPackStatus');
                      if (packStatus) {
                        packStatus.textContent = '500語を登録中。上限2000語。 日本語基本: 導入済み v2・128語 / 英語基本: 導入済み v2・161語 / 日本語文脈注意: 導入済み v2・111語 / 英語文脈注意: 導入済み v2・100語';
                      }
                      document.body.style.paddingBottom = '1200px';
                      window.scrollTo(0, 420);
                    }""")
                    await page.wait_for_timeout(40)
                result = await inspect(page, relative, width)
                result["viewport"] = viewport_name
                result["ok"] = (
                    result["documentWidth"] <= width + 1
                    and result["bodyWidth"] <= width + 1
                    and not result["outside"]
                    and not result["authFailures"]
                    and not result["viewerControlFailures"]
                    and not result["accountOverlayFailures"]
                )
                if not result["ok"]:
                    failures.append(result)
                    safe = relative.replace("/", "__")
                    await page.screenshot(path=str(OUT / f"FAIL-{safe}-{viewport_name}.png"), full_page=True)
                elif relative in KEY_PAGES and viewport_name in {"pane-280", "phone-320", "desktop-901", "desktop-1024", "desktop-1100"}:
                    safe = relative.replace("/", "__")
                    await page.screenshot(path=str(OUT / f"PASS-{safe}-{viewport_name}.png"), full_page=True)
        await browser.close()

    summary = {
        "ok": not failures,
        "htmlFiles": len(html_files),
        "viewports": len(VIEWPORTS),
        "checks": checks,
        "failureCount": len(failures),
        "failures": failures,
    }
    (OUT / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({k: summary[k] for k in ("ok", "htmlFiles", "viewports", "checks", "failureCount")}))
    if failures:
        for failure in failures[:10]:
            print(json.dumps(failure, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
