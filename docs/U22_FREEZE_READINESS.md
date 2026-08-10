# CPCV U-22 凍結準備記録

対象: Web `0.8.10` / Windows Desktop `0.2.2`

この文書は「凍結してよいか」を判定するためのcurrent release gateです。自動試験の結果はGitHub Actionsを正本とし、この文書へ手作業でPASSを捏造しません。

## 凍結対象

- Web application source一式
- Cloudflare Worker / D1 migrations / Durable Object / Queue / Workers AI integration
- public Web UIとstatic assets
- Windows Desktop source一式
- Windows Release EXEとSHA-256
- source manifest
- U-22提出用のURL、実行手順、login手順、sample data

## 自動凍結ゲート

最終commitで以下がすべて成功していること。

### Web

- source SHA-256 manifest
- `node scripts/verify-u22-freeze.mjs`
- static/project/documentation checks
- 全implemented Stage regression
- DB schema / auth / account / comment / moderation / realtime / AI / filter / PDF analytics regression
- Owner bootstrap regression
- Wrangler deploy dry-run
- `npm audit`
- `npm audit --omit=dev`

### Desktop

- bundled Web `0.8.10` contract check
- JavaScript syntax check
- Desktop npm audit
- Rustfmt
- Clippy `-D warnings`
- Rust unit tests
- Windows Release EXE build
- 20秒launch smoke
- EXE SHA-256生成
- build environment記録

## 再現性ゲート

- Web Node major: 22
- Web npm: `11.18.0`
- Web dependencies: root `package-lock.json`
- Desktop Node major: 22
- Desktop npm: `10.9.8`
- Desktop Rust: `1.97.1`
- Desktop dependencies: `desktop-overlay-poc/package-lock.json` と `desktop-overlay-poc/src-tauri/Cargo.lock`
- Desktop compatibility testは外部のmoving `master`ではなく、同一freeze checkout内のWeb sourceを検査する
- Windows CI OS generationはWindows Server 2025系に固定する

GitHub hosted runner imageのpatch revisionや外部package registry自体は第三者管理です。lockfile、compiler/npm version、build environment記録で再生成条件を固定します。

## source hygieneゲート

凍結commitに以下を入れません。

- `.env*` / `.dev.vars*`
- secret/private key/certificate実体
- local D1 / SQLite DB
- `.wrangler/`
- `node_modules/`
- Rust `target/`
- production deployment evidenceのruntime working directory
- Windows EXE / ZIP binary

実行ファイルはGitへ直接commitせず、最終CI artifactと提出storageへ固定します。

## 外部最終ゲート — 自動CIだけでは完了しない

### 1. Web production一致

最後に完全なproduction成功記録があるsourceとU-22 freeze candidateには差分があります。最終exact commitをisolated stagingで既存の44項目受入手順に従って検証し、その**同一commit**をmanual production workflowで配備します。

記録するもの:

- exact freeze commit SHA
- staging Worker deployment/version ID
- staging acceptance record SHA-256
- staging config SHA-256
- production Worker deployment/version ID
- production smoke result
- D1 integrity result

productionをread-onlyで確認するだけではsource一致を証明できない場合、推測せず「未確認」とします。

### 2. Windows物理acceptance

最終CI artifactを実際のWindows presentation端末で確認します。

- PowerPoint slideshow最前面
- mouse / keyboard click-through
- comment ON/OFF
- QR ON/OFF
- active session discovery
- monitor自動選択と手動切替
- 100% / 125% / 150%等の異なるDPI組み合わせ
- HDMI抜き差し
- sleep / resume
- admin window終了時のoverlay/process終了
- network一時切断後の復旧

この試験をCodexへ任せる場合は `U22_CODEX_FINAL_ACCEPTANCE.md` を使用し、指定modelは **5.4 mini** とします。

### 3. 提出bundle固定

外部ゲート合格後に、次を同じfreeze revisionへ紐付けます。

- source ZIP
- source ZIP SHA-256
- Desktop EXE
- Desktop EXE SHA-256
- Web URL
- login / demo手順
- sample PDF
- sample PDF SHA-256
- freeze commit SHA
- production Worker version ID

## 凍結後ルール

freeze commitを後から書き換えません。締切後・審査中の変更は原則停止します。

重大な障害またはsecurity対応が必要になった場合:

1. frozen commitは保存する
2. 新しい修正commitを作る
3. 全自動gateを最初から実行する
4. Desktop EXEを再buildする
5. staging/production一致を再確認する
6. 新しいSHA-256と提出revisionを記録する

単なる文言、見た目、追加機能のために凍結を解除しません。
