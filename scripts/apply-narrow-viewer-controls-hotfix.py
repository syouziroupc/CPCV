from pathlib import Path

css = Path("public/assets/app.css")
text = css.read_text()
marker = "/* Narrow viewer controls: keep every operation visible without horizontal scrolling. */"
if marker not in text:
    text += r'''

/* Narrow viewer controls: keep every operation visible without horizontal scrolling. */
@media (max-width: 720px) {
  .viewer-topbar {
    left: 12px;
    right: 12px;
    top: auto;
    bottom: 12px;
    width: auto;
    max-width: none;
    flex-wrap: wrap;
    justify-content: flex-start;
    align-items: center;
    align-content: flex-start;
    overflow: visible;
  }
  .viewer-topbar > * {
    flex: 0 0 auto;
    min-width: 0;
    max-width: 100%;
  }
  .viewer-topbar #viewerTitle {
    flex: 1 0 100%;
    max-width: 100%;
  }
  .viewer-topbar .local-log-state,
  .viewer-topbar #connectionState {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .viewer-topbar .pdf-page-controls {
    flex-wrap: nowrap;
  }
  .comment-panel {
    bottom: 150px;
    max-height: calc(100vh - 174px);
  }
  .comment-panel.scroll-mode {
    inset: 54px 0 150px;
  }
}

@media (max-width: 420px) {
  .viewer-topbar {
    left: 8px;
    right: 8px;
    bottom: 8px;
    gap: 4px;
    padding: 5px 6px;
    font-size: 12px;
  }
  .viewer-file-button {
    padding: 4px 6px;
  }
  .comment-panel {
    left: 8px;
    right: 8px;
    bottom: 170px;
    max-height: calc(100vh - 190px);
  }
  .comment-panel.scroll-mode {
    inset: 48px 0 170px;
  }
}
'''
    css.write_text(text)

audit = Path("scripts/audit-responsive-layout.py")
text = audit.read_text()
text = text.replace(
    '    ("phone-320", 320, 720),\n',
    '    ("pane-280", 280, 720),\n    ("phone-320", 320, 720),\n',
    1,
)
text = text.replace(
    '    "_admin_spa.html", "admin/index.html", "signup/index.html",\n'
    '    "forgot-password/index.html", "account/index.html", "master/index.html",\n',
    '    "_admin_spa.html", "admin/index.html", "_viewer_spa.html", "viewer/index.html",\n'
    '    "signup/index.html", "forgot-password/index.html", "account/index.html", "master/index.html",\n',
    1,
)
text = text.replace(
    '''          return {
            source,
            viewportWidth: width,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            outside,
            authFailures
          };
''',
    '''          const viewerControlFailures = [];
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
          return {
            source,
            viewportWidth: width,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            outside,
            authFailures,
            viewerControlFailures
          };
''',
    1,
)
text = text.replace(
    '''                result = await inspect(page, relative, width)
                result["viewport"] = viewport_name
''',
    '''                if relative in {"_admin_spa.html", "admin/index.html"}:
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
                result = await inspect(page, relative, width)
                result["viewport"] = viewport_name
''',
    1,
)
text = text.replace(
    '''                    and not result["outside"]
                    and not result["authFailures"]
''',
    '''                    and not result["outside"]
                    and not result["authFailures"]
                    and not result["viewerControlFailures"]
''',
    1,
)
text = text.replace(
    '''                elif relative in KEY_PAGES and viewport_name in {"phone-320", "desktop-1024"}:
''',
    '''                elif relative in KEY_PAGES and viewport_name in {"pane-280", "phone-320", "desktop-1024"}:
''',
    1,
)
audit.write_text(text)

# Stage compatibility is a historical-boundary check. Inspect declared package
# dependencies only; later test-script names containing "translation" are not dependencies.
compat = Path("scripts/stage-compatibility-checks.mjs")
text = compat.read_text()
old = '''    check("Stage 5 does not add AI or translation dependencies", !/openai|anthropic|translate|translation/i.test(read("package.json")));
'''
new = '''    const packageJson = JSON.parse(read("package.json"));
    const declaredDependencies = JSON.stringify({
      dependencies: packageJson.dependencies || {},
      devDependencies: packageJson.devDependencies || {},
      optionalDependencies: packageJson.optionalDependencies || {},
      peerDependencies: packageJson.peerDependencies || {}
    });
    check("Stage 5 does not add AI or translation dependencies", !/openai|anthropic|translate|translation/i.test(declaredDependencies));
'''
if old not in text:
    raise SystemExit("Stage 5 dependency compatibility assertion shape changed")
compat.write_text(text.replace(old, new, 1))
