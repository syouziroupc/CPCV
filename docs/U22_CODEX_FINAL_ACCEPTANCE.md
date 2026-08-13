# CPCV U-22 Codex 最終acceptance指示

指定model: **5.4 mini**

目的: U-22凍結候補の最終試験を行い、コード変更ではなくPASS/FAIL evidenceを作る。

## 絶対条件

- 試験開始時にexact 40-character commit SHAを記録する。
- 最初はsourceを変更しない。
- `git status --porcelain` が空でない場合は停止する。
- production data、production D1、production Workerを試験目的で変更しない。
- secret、token、password、private keyをreportへ出力しない。
- sourceとdeploymentが一致する証拠が取れない場合は推測せずFAIL/UNVERIFIEDとする。
- 試験失敗を回避するためにthresholdやtestを弱めない。
- 不具合を発見した場合は再現手順、期待値、実測値、影響範囲を報告し、修正は別工程にする。

## Phase A — source integrity

repository rootで実行する。

```bash
git rev-parse HEAD
git status --porcelain
node --version
npm --version
npm ci
node scripts/verify-source-manifest.mjs
node scripts/verify-u22-freeze.mjs
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage08
npm run test:owner-bootstrap
npm run verify:final-docs
npm run deploy:dry-run
npm audit
npm audit --omit=dev
```

すべてexit code 0を要求する。

## Phase B — regression重点確認

自動試験結果から最低限次を個別に確認する。

- authentication / CSRF / rate limit fail-closed
- account lifecycle / email identity
- comment idempotency / retention
- manual moderation transition
- realtime sequence / catch-up / snapshot / reconnect
- Durable Object retry / auth revalidation
- AI job idempotency / bounded retry / delivery-only retry
- moderation false-positive regression
- translation language detection / Azerbaijani / Turkish / casual English
- content filter dictionary boundary
- PDF bytes/textがserverへ送信されないこと
- anonymous analytics small-group suppression
- responsive audit

FAILが1件でもあればfreeze不可。

## Phase C — Desktop reproducible build

Windowsで `desktop-overlay-poc` へ移動する。

期待toolchain:

- Node 22
- npm `10.9.8`
- rustc `1.97.1`

実行:

```powershell
node --version
npm --version
rustc --version --verbose
npm ci
npm run check:ui
npm run check:compat
npm audit --audit-level=high
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run build:release
Get-FileHash src-tauri/target/release/cpcv-desktop.exe -Algorithm SHA256
```

`check:compat` は同じcheckout内のWeb sourceを対象にしていることを確認する。外部moving masterを参照していたらFAIL。

## Phase D — Windows物理presentation試験

物理Windows、PowerPoint、可能なら外部HDMI displayを使う。利用できないhardware項目はPASSにせず `NOT_EXECUTED` とする。

1. Desktop EXE起動
2. CPCVへlogin
3. active sessionを作成または選択
4. PowerPoint slideshow開始
5. overlay開始
6. student端末/別browserからcomment送信
7. commentがPowerPointより前面に出ることを確認
8. PowerPointのmouse/keyboard操作がoverlayに奪われないことを確認
9. comment OFF → ON
10. QR OFF → ON
11. monitor切替
12. 100% / 125% / 150%の異なるDPI条件を可能な範囲で確認
13. HDMIを抜き差しして復旧確認
14. Windows sleep → resume後の復旧確認
15. networkを一時切断して再接続後の復旧確認
16. admin windowを閉じ、overlayとprocessが残存しないことを確認

各項目を `PASS / FAIL / NOT_EXECUTED` で記録する。

## Phase E — production read-only照合

Cloudflare credentialが利用でき、read-only操作が許可されている場合だけ行う。

- current Worker deployment status
- current Worker version list
- production origin smoke
- D1 read-only integrity verification

このphaseではdeploy、rollback、migration apply、secret変更をしない。

freeze candidate exact sourceとの一致が既存deployment evidenceだけでは証明できない場合は `UNVERIFIED` とする。productionへの配備は、既存manual workflowと別途の明示承認で行う。

## 最終report形式

```text
CPCV U-22 FINAL ACCEPTANCE
model=5.4 mini
commit=<40-char SHA>
working_tree_clean=YES|NO
source_manifest=PASS|FAIL
automated_regression=PASS|FAIL
dependency_audit=PASS|FAIL
desktop_build=PASS|FAIL
desktop_exe_sha256=<hash or N/A>
physical_windows=PASS|FAIL|PARTIAL|NOT_EXECUTED
production_alignment=PASS|FAIL|UNVERIFIED
critical_findings=<count>
major_findings=<count>
minor_findings=<count>
freeze_recommendation=GO|NO_GO
```

`GO` は critical/major findingが0で、必要な自動gateが全PASSし、物理Windows試験とproduction source一致が完了した場合だけ出す。
