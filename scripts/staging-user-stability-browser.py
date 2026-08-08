import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

origin = os.environ['STAGING_ORIGIN'].rstrip('/')
token = os.environ['STABILITY_SESSION_TOKEN']
fixture = json.loads(Path('stability-fixture.json').read_text())
session_id = fixture['liveSessionId']
host = urlparse(origin).hostname
out = Path('stability-browser')
out.mkdir(exist_ok=True)

observer = r'''
(() => {
  window.__cpcvLoginEverUnhidden = false;
  const check = () => {
    for (const id of ['loginSection', 'masterLoginSection']) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) window.__cpcvLoginEverUnhidden = true;
    }
  };
  new MutationObserver(check).observe(document, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
  addEventListener('DOMContentLoaded', check);
  setInterval(check, 10);
})();
'''

results = []

def audit_page(context, path, ready_selector, screenshot_name, login_selector=None):
    page = context.new_page()
    requests = []
    page.on('request', lambda request: requests.append(request.url) if '/api/auth/session' in request.url else None)
    started = time.monotonic()
    page.goto(origin + path, wait_until='domcontentloaded', timeout=30000)
    dom_ms = round((time.monotonic() - started) * 1000)
    page.locator(ready_selector).wait_for(state='visible', timeout=30000)
    ready_ms = round((time.monotonic() - started) * 1000)
    page.wait_for_timeout(300)
    login_seen = page.evaluate('window.__cpcvLoginEverUnhidden === true')
    if login_seen:
        raise AssertionError(f'login UI became unhidden during authenticated load: {path}')
    if login_selector and not page.locator(login_selector).evaluate('(el) => el.classList.contains("hidden")'):
        raise AssertionError(f'login section is visible after authenticated load: {path}')
    auth_count = len(requests)
    if auth_count != 1:
        raise AssertionError(f'{path} requested /api/auth/session {auth_count} times, expected 1')
    page.screenshot(path=str(out / screenshot_name), full_page=True)
    results.append({
        'path': path,
        'authSessionRequests': auth_count,
        'loginEverUnhidden': login_seen,
        'domContentLoadedMs': dom_ms,
        'readyMs': ready_ms
    })
    return page

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 900})
    context.add_init_script(observer)
    context.add_cookies([{
        'name': '__Host-cpcv_session', 'value': token, 'domain': host, 'path': '/',
        'secure': True, 'httpOnly': True, 'sameSite': 'Strict'
    }])

    admin = audit_page(context, '/admin', '#activeSessionsSection', 'admin-authenticated.png', '#loginSection')
    admin.close()
    master = audit_page(context, '/master', '#masterPanel', 'master-authenticated.png', '#masterLoginSection')
    master.close()
    account = audit_page(context, '/account', '#accountSection', 'account-authenticated.png')
    password_form = account.locator('#passwordForm')
    if password_form.count() != 1:
        raise AssertionError('explicit password change form is missing')
    account.close()

    page = context.new_page()
    started = time.monotonic()
    page.goto(f'{origin}/admin/{session_id}', wait_until='domcontentloaded', timeout=30000)
    page.locator('#sessionSection').wait_for(state='visible', timeout=30000)
    session_ready_ms = round((time.monotonic() - started) * 1000)
    checkboxes = page.locator('#moderationBody input[type="checkbox"]')
    deadline = 15000
    waited = 0
    while checkboxes.count() < 1 and waited < deadline:
        page.wait_for_timeout(500)
        waited += 500
    if checkboxes.count() < 1:
        raise AssertionError('no moderation checkbox appeared for staging comments')
    first = checkboxes.first
    value = first.get_attribute('value')
    first.check()
    if not first.is_checked():
        raise AssertionError('checkbox could not be selected')
    page.wait_for_timeout(6500)
    same = page.locator(f'#moderationBody input[type="checkbox"][value="{value}"]')
    if same.count() != 1 or not same.is_checked():
        raise AssertionError('moderation selection was lost after automatic refresh')
    page.screenshot(path=str(out / 'admin-selection-after-refresh.png'), full_page=True)
    results.append({
        'path': f'/admin/{session_id}',
        'readyMs': session_ready_ms,
        'selectionPersistedAfterMs': 6500,
        'selectionPersisted': True
    })
    page.close()
    browser.close()

Path('stability-browser-report.json').write_text(json.dumps({'ok': True, 'results': results}, ensure_ascii=False, indent=2))
print(json.dumps({'ok': True, 'results': results}, ensure_ascii=False))
