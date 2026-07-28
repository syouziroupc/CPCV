import json
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

origin = os.environ["ORIGIN"]
label = os.environ["LABEL"]
out = Path(os.environ["EVIDENCE_DIR"]) / label
out.mkdir(parents=True, exist_ok=True)

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
        page = browser.new_page(viewport={"width": width, "height": 1100})
        state = {"policies": [dict(item) for item in base_policies]}

        def handler(route, request):
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
                    "packs": [
                        {"id": "ja-core-v1", "installed": True, "version": 1, "installedVersion": 1, "termCount": 10},
                        {"id": "en-core-v1", "installed": True, "version": 1, "installedVersion": 1, "termCount": 10},
                        {"id": "ja-context-v1", "installed": False, "version": 1, "termCount": 5},
                        {"id": "en-context-v1", "installed": False, "version": 1, "termCount": 5},
                    ],
                    "termLimit": 2000,
                }
            elif path == "/api/org/content-filter/policies" and request.method == "PATCH":
                body = json.loads(request.post_data or "{}")
                state["policies"] = body.get("policies", state["policies"])
                data = {"ok": True}
            elif path.startswith("/api/org/content-filter/packs/") and request.method == "POST":
                data = {"ok": True}
            else:
                data = {"ok": True}
            route.fulfill(status=200, content_type="application/json", body=json.dumps(data, ensure_ascii=False))

        page.route("**/api/**", handler)
        response = page.goto(origin + "/account?release=" + os.environ["CANDIDATE_COMMIT"], wait_until="domcontentloaded", timeout=90000)
        assert response and response.status < 400
        page.wait_for_selector("#organizationFilterSection:not(.hidden)", timeout=30000)
        page.wait_for_timeout(500)
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        assert page.locator("[data-filter-preset]").count() == 3
        assert page.locator("#bulkReviewMinSeverity").count() == 1
        assert page.locator("#bulkMaskMinSeverity").count() == 1
        assert page.locator("#bulkRejectMinSeverity").count() == 1
        assert page.locator("#organizationFilterModeLabel").inner_text() == "推奨"
        page.locator("#categoryPolicyDetails").evaluate("element => element.open = true")
        first = page.locator("#filterPoliciesBody tr").first
        first.locator(".filter-policy-mask").select_option("4")
        assert page.locator("#organizationFilterModeLabel").inner_text() == "カスタム"
        assert page.locator("#organizationFilterDirtyState:not(.hidden)").count() == 1
        page.screenshot(path=str(out / f"filter-settings-{width}.png"), full_page=True)
        results.append({"width": width, "status": response.status, "overflow": False, "presetButtons": 3})
        page.close()
    browser.close()

(out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(results, ensure_ascii=False))
