from __future__ import annotations

import asyncio
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = ROOT / "artifacts" / "admin-midwidth-audit"
WIDTHS = (920, 940, 950, 960, 980, 1000, 1024, 1048, 1050, 1080, 1100, 1120, 1150, 1180, 1181, 1200)
HEIGHT = 773
PAGES = ("_admin_spa.html", "admin/index.html")
SCREENSHOT_WIDTHS = {950, 1048, 1150, 1180, 1181}

REQUIRED_CONTROLS = (
    "togglePostingButton", "toggleCommentsButton", "clearCommentsButton",
    "publicCode", "joinUrl", "copyJoinButton",
    "viewerUrl", "openViewerButton", "documentInfo",
    "endSessionButton", "deleteSessionButton",
    "commentDisplayMode", "commentDisplaySeconds", "moderationMode",
    "sessionFilterSimpleMode", "sessionAiModerationEnabled",
    "sessionAiTranslationEnabled", "sessionAiTargetLanguage",
    "sessionAiTranslationQuality", "saveSessionSettingsButton",
    "moderationStateFilter", "refreshModerationButton",
    "bulkApproveButton", "bulkHideButton", "bulkRestoreButton", "bulkDeleteButton",
    "refreshAnalyticsButton", "createAnalyticsSnapshotButton",
    "analyticsSnapshotSelect", "downloadAnalyticsSnapshotButton",
    "refreshLocalLogButton",
)


class QuietStaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        pass


def start_static_server() -> tuple[ThreadingHTTPServer, threading.Thread, str]:
    handler = partial(QuietStaticHandler, directory=str(PUBLIC))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address[:2]
    return server, thread, f"http://{host}:{port}"


async def prepare_admin(page) -> None:
    await page.evaluate(
        """() => {
          document.getElementById('adminBootSection')?.classList.add('hidden');
          document.getElementById('loginSection')?.classList.add('hidden');
          document.getElementById('adminHome')?.classList.add('hidden');
          document.getElementById('sessionSection')?.classList.remove('hidden');

          for (const details of document.querySelectorAll('#sessionSection details')) {
            details.open = true;
          }

          const text = {
            sessionTitle: 'レスポンシブ回帰テスト授業',
            postingState: '投稿受付中',
            commentsState: 'コメント表示中',
            commentModeState: '表示方法 5件',
            moderationModeState: '投稿承認 自動表示',
            commentDisplayState: '表示時間 1分',
            publicCode: 'X25948',
            joinUrl: 'https://class-pdf-comment-viewer-v01-staging.syouziroupc.workers.dev/j/X25948',
            viewerUrl: 'https://class-pdf-comment-viewer-v01-staging.syouziroupc.workers.dev/viewer/sess_8ce4cc4a9ad6430d904f65b49275fc01',
            documentInfo: '未選択。投影画面でPDFを選ぶとページ連動を開始します。PDF本体とファイル名は送信しません。',
            sessionAiStatus: 'AI補助の設定を確認できます。',
            sessionFilterStatus: 'コメントフィルターの状態を確認できます。',
            moderationStatus: 'コメント管理を確認できます。',
            analyticsStatus: '投影画面でPDFを選ぶと集計を開始します。',
            adminLocalLogState: 'この端末の受信ログを確認できます。'
          };
          for (const [id, value] of Object.entries(text)) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
          }

          document.body.style.paddingBottom = '800px';
          window.scrollTo(0, 0);
        }"""
    )


async def inspect(page, width: int, phase: str) -> dict:
    return await page.evaluate(
        """({width, phase, requiredControls}) => {
          const visible = (el) => {
            if (!el) return false;
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' &&
              Number(s.opacity || 1) !== 0 && r.width > .5 && r.height > .5;
          };
          const describe = (el) => ({
            tag: el?.tagName || '',
            id: el?.id || '',
            classes: typeof el?.className === 'string' ? el.className.slice(0, 120) : '',
            text: String(el?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120)
          });
          const intersects = (a, b) =>
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;

          const live = document.querySelector('.lesson-live-column');
          const settings = document.querySelector('.lesson-settings-column');
          const command = document.querySelector('.session-command-center');
          const failures = [];

          if (!visible(live) || !visible(settings) || !visible(command)) {
            failures.push({kind: 'admin-columns-not-visible'});
          } else {
            const liveStyle = getComputedStyle(live);
            const commandStyle = getComputedStyle(command);
            const liveRect = live.getBoundingClientRect();
            const settingsRect = settings.getBoundingClientRect();

            if (width <= 1180) {
              if (liveStyle.position !== 'static') {
                failures.push({
                  kind: 'live-column-not-static',
                  position: liveStyle.position,
                  phase
                });
              }
              if (commandStyle.display === 'grid') {
                const cols = commandStyle.gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
                if (cols.length > 1) {
                  failures.push({
                    kind: 'midwidth-command-center-still-multicolumn',
                    gridTemplateColumns: commandStyle.gridTemplateColumns,
                    phase
                  });
                }
              }
              if (phase === 'top' && settingsRect.top < liveRect.bottom - 1) {
                failures.push({
                  kind: 'settings-start-before-live-column-ends',
                  liveBottom: liveRect.bottom,
                  settingsTop: settingsRect.top
                });
              }
            }

            const livePanels = [...live.querySelectorAll('.workspace-panel')].filter(visible);
            const settingPanels = [...settings.querySelectorAll('.workspace-panel, .settings-group')].filter(visible);
            for (const left of livePanels) {
              const leftRect = left.getBoundingClientRect();
              if (leftRect.bottom < 0 || leftRect.top > innerHeight) continue;
              for (const right of settingPanels) {
                const rightRect = right.getBoundingClientRect();
                if (rightRect.bottom < 0 || rightRect.top > innerHeight) continue;
                if (intersects(leftRect, rightRect)) {
                  failures.push({
                    kind: 'live-settings-visual-overlap',
                    phase,
                    live: describe(left),
                    settings: describe(right),
                    liveRect: {left: leftRect.left, top: leftRect.top, right: leftRect.right, bottom: leftRect.bottom},
                    settingsRect: {left: rightRect.left, top: rightRect.top, right: rightRect.right, bottom: rightRect.bottom}
                  });
                  break;
                }
              }
              if (failures.some((item) => item.kind === 'live-settings-visual-overlap')) break;
            }
          }

          const missing = [];
          for (const id of requiredControls) {
            const el = document.getElementById(id);
            if (!visible(el)) missing.push(id);
          }
          if (missing.length) failures.push({kind: 'required-information-hidden', ids: missing});

          const outside = [];
          for (const el of document.querySelectorAll('#sessionSection button, #sessionSection select, #sessionSection input, #sessionSection a, #sessionSection p, #sessionSection h2, #sessionSection h3, #sessionSection h4')) {
            if (!visible(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.left < -1 || r.right > width + 1) {
              outside.push({...describe(el), left: r.left, right: r.right});
              if (outside.length >= 20) break;
            }
          }
          if (outside.length) failures.push({kind: 'session-content-outside-viewport', items: outside});

          return {
            width,
            phase,
            scrollY,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            failures
          };
        }""",
        {"width": width, "phase": phase, "requiredControls": REQUIRED_CONTROLS},
    )


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    failures: list[dict] = []
    checks = 0
    server, thread, base_url = start_static_server()
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
            context = await browser.new_context(java_script_enabled=False)
            page = await context.new_page()

            for source in PAGES:
                for width in WIDTHS:
                    await page.set_viewport_size({"width": width, "height": HEIGHT})
                    await page.goto(f"{base_url}/{source}", wait_until="load")
                    await prepare_admin(page)
                    await page.wait_for_timeout(50)

                    top_result = await inspect(page, width, "top")
                    checks += 1
                    if top_result["documentWidth"] > width + 1 or top_result["bodyWidth"] > width + 1:
                        top_result["failures"].append({
                            "kind": "page-horizontal-overflow",
                            "documentWidth": top_result["documentWidth"],
                            "bodyWidth": top_result["bodyWidth"]
                        })
                    if top_result["failures"]:
                        failures.append({"source": source, **top_result})

                    settings_y = await page.evaluate(
                        """() => {
                          const el = document.querySelector('.lesson-settings-column');
                          const r = el.getBoundingClientRect();
                          return Math.max(0, r.top + scrollY - 180);
                        }"""
                    )
                    await page.evaluate("(y) => window.scrollTo(0, y)", settings_y)
                    await page.wait_for_timeout(50)

                    scroll_result = await inspect(page, width, "near-settings")
                    checks += 1
                    if scroll_result["documentWidth"] > width + 1 or scroll_result["bodyWidth"] > width + 1:
                        scroll_result["failures"].append({
                            "kind": "page-horizontal-overflow",
                            "documentWidth": scroll_result["documentWidth"],
                            "bodyWidth": scroll_result["bodyWidth"]
                        })
                    if scroll_result["failures"]:
                        failures.append({"source": source, **scroll_result})

                    if source == "admin/index.html" and width in SCREENSHOT_WIDTHS:
                        await page.screenshot(
                            path=str(OUT / f"admin-{width}-near-settings.png"),
                            full_page=False,
                        )
                        await page.evaluate("() => window.scrollTo(0, 0)")
                        await page.screenshot(
                            path=str(OUT / f"admin-{width}-full.png"),
                            full_page=True,
                        )

            await browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)

    summary = {
        "ok": not failures,
        "pages": len(PAGES),
        "widths": list(WIDTHS),
        "checks": checks,
        "failureCount": len(failures),
        "failures": failures,
    }
    (OUT / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({key: summary[key] for key in ("ok", "pages", "checks", "failureCount")}))
    if failures:
        for failure in failures[:20]:
            print(json.dumps(failure, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
