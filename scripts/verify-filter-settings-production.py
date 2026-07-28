import json
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

origin = os.environ["PRODUCTION_ORIGIN"]
out = Path(os.environ["EVIDENCE_DIR"]) / "production-final"
out.mkdir(parents=True, exist_ok=True)
account_html = Path(os.environ["LIVE_ACCOUNT_FILE"]).read_text(encoding="utf-8")
app_css = Path(os.environ["LIVE_CSS_FILE"]).read_text(encoding="utf-8")
organization_js = Path(os.environ["LIVE_JS_FILE"]).read_text(encoding="utf-8")
assert 'data-filter-preset="standard"' in account_html
assert "v0.8.10 filter preset and batch policy UX" in app_css
assert "async function applyPreset(name, buttonNode)" in organization_js

base_policies = [
    {"category": "sexual", "enabled": True, "reviewMinSeverity": 2, "maskMinSeverity": 3, "rejectMinSeverity": 5},
    {"category": "profanity", "enabled": True, "reviewMinSeverity": 2, "maskMinSeverity": 3, "rejectMinSeverity": 5},
    {"category": "harassment", "enabled": True, "reviewMinSeverity": 3, "maskMinSeverity": 4, "rejectMinSeverity": 5},
    {"category": "discrimination", "enabled": True, "reviewMinSeverity": 2, "maskMinSeverity": 4, "rejectMinSeverity": 5},
    {"category": "violence", "enabled": True, "reviewMinSeverity": 3, "maskMinSeverity": 4, "rejectMinSeverity": 5},
    {"category": "personal_info", "enabled": True, "reviewMinSeverity": 1, "maskMinSeverity": 2, "rejectMinSeverity": 5},
    {"category": "spam", "enabled": True, "reviewMinSeverity": 2, "maskMinSeverity": 3, "rejectMinSeverity": 5},
    {"category": "illegal", "enabled": True, "reviewMinSeverity": 3, "maskMinSeverity": 4, "rejectMinSeverity": 5},
    {"category": "custom", "enabled": True, "reviewMinSeverity": 3, "maskMinSeverity": 4, "rejectMinSeverity": 5},
]
labels = {
    "sexual": "性的表現",
    "profanity": "暴言",
    "harassment": "嫌がらせ",
    "discrimination": "差別",
    "violence": "暴力",
    "personal_info": "個人情報",
    "spam": "迷惑投稿",
    "illegal": "違法行為",
    "custom": "追加語句",
}
categories = [{"id": item["category"], "label": labels[item["category"]]} for item in base_policies]
results = []

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for width in (320, 390, 768, 1440):
        context = browser.new_context(
            viewport={"width": width, "height": 1100},
            extra_http_headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
        )
        page = context.new_page()
        state = {
            "policies": [dict(item) for item in base_policies],
            "packs": [
                {"id": "ja-core-v1", "installed": True, "version": 1, "installedVersion": 1, "termCount": 10},
                {"id": "en-core-v1", "installed": True, "version": 1, "installedVersion": 1, "termCount": 10},
                {"id": "ja-context-v1", "installed": False, "version": 1, "termCount": 5},
                {"id": "en-context-v1", "installed": False, "version": 1, "termCount": 5},
            ],
            "patches": [],
        }

        def api_handler(route, request):
            path = urlparse(request.url).path
            if path == "/api/auth/session":
                data = {"ok": True, "csrfToken": "test", "user": {"id": "u1"}, "organization": {"id": "o1", "name": "検証組織", "role": "owner"}}
            elif path == "/api/auth/account":
                data = {"ok": True, "user": {"displayName": "検証Owner", "email": "owner@example.test", "emailVerified": True}, "organizations": [{"name": "検証組織", "role": "owner", "status": "active"}]}
            elif path == "/api/org/ai-settings":
                data = {"ok": True, "settings": {"enabled": True, "moderationDailyLimit": 1000, "translationDailyLimit": 1000}}
            elif path == "/api/org/content-filter" and request.method == "GET":
                data = {
                    "ok": True,
                    "categories": categories,
                    "languages": [{"id": "und", "label": "自動"}],
                    "policies": state["policies"],
                    "terms": [],
                    "packs": state["packs"],
                    "termLimit": 2000,
                }
            elif path == "/api/org/content-filter/policies" and request.method == "PATCH":
                body = json.loads(request.post_data or "{}")
                state["policies"] = body.get("policies", state["policies"])
                state["patches"].append([dict(item) for item in state["policies"]])
                data = {"ok": True}
            elif path.startswith("/api/org/content-filter/packs/") and request.method == "POST":
                pack_id = path.rsplit("/", 2)[-2]
                for pack in state["packs"]:
                    if pack["id"] == pack_id:
                        pack["installed"] = True
                        pack["installedVersion"] = pack["version"]
                data = {"ok": True}
            else:
                data = {"ok": True}
            route.fulfill(status=200, content_type="application/json", body=json.dumps(data, ensure_ascii=False))

        page.route("**/api/**", api_handler)
        page.route("**/assets/app.css*", lambda route: route.fulfill(status=200, content_type="text/css; charset=utf-8", body=app_css))
        page.route("**/assets/organization-settings.js*", lambda route: route.fulfill(status=200, content_type="application/javascript; charset=utf-8", body=organization_js))
        page.route(origin + "/account*", lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=account_html))

        response = page.goto(origin + f"/account?final={os.environ['CANDIDATE_COMMIT']}-{width}", wait_until="domcontentloaded", timeout=90000)
        assert response and response.status < 400
        page.wait_for_selector("#organizationFilterSection:not(.hidden)", timeout=30000)
        page.wait_for_timeout(300)
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        assert page.locator("[data-filter-preset]").count() == 3
        assert page.locator("#organizationFilterModeLabel").inner_text() == "推奨"
        page.screenshot(path=str(out / f"filter-settings-initial-{width}.png"), full_page=True)

        page.locator('[data-filter-preset="strict"]').click()
        page.wait_for_function("document.getElementById('organizationFilterModeLabel')?.textContent === '厳格'")
        assert state["patches"]
        strict_policies = state["patches"][-1]
        assert strict_policies[0]["reviewMinSeverity"] == 1
        assert strict_policies[0]["maskMinSeverity"] == 2
        assert strict_policies[0]["rejectMinSeverity"] == 5

        page.locator("#bulkMaskMinSeverity").select_option("4")
        page.locator("#bulkRejectMinSeverity").select_option("5")
        assert page.locator("#organizationFilterModeLabel").inner_text() == "カスタム"
        assert page.locator("#organizationFilterDirtyState:not(.hidden)").count() == 1
        page.locator("#applyBulkPolicyButton").click()
        page.wait_for_function("document.getElementById('organizationFilterStatus')?.textContent.includes('全種類へ適用')")
        bulk_policies = state["patches"][-1]
        assert all(item["maskMinSeverity"] == 4 for item in bulk_policies)
        assert all(item["rejectMinSeverity"] == 5 for item in bulk_policies)
        assert all(item["enabled"] for item in bulk_policies)

        page.locator("#categoryPolicyDetails").evaluate("element => element.open = true")
        page.locator("#filterPoliciesBody tr").first.locator(".filter-policy-mask").select_option("3")
        assert page.locator("#organizationFilterModeLabel").inner_text() == "カスタム"
        assert page.locator("#organizationFilterDirtyState:not(.hidden)").count() == 1
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        page.screenshot(path=str(out / f"filter-settings-custom-{width}.png"), full_page=True)
        results.append({
            "width": width,
            "status": response.status,
            "overflow": False,
            "presets": 3,
            "strictApplied": True,
            "bulkApplied": True,
            "manualMarkedCustom": True,
        })
        context.close()
    browser.close()

(out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(results, ensure_ascii=False))
