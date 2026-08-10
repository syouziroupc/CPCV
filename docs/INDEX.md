# CPCV 開発資料

## 現行正本 — Web 0.8.10 / Desktop 0.2.2

U-22凍結候補を確認するときは、次の順序を正本として扱います。

1. `../README.md` — release概要、version、現在の状態
2. `current-system.md` — 現行architectureとdata flow
3. `known-issues.md` — 凍結前に残る既知事項
4. `../wrangler.toml` — productionの非secret runtime構成
5. `../SOURCE_GIT_RECORD.txt` — source / deployment / freeze状態
6. `U22_FREEZE_READINESS.md` — U-22凍結ゲート
7. `U22_DATA_FREEZE_PLAN.md` — source / D1 / secret / sample / evidenceの凍結区分
8. `U22_CODEX_FINAL_ACCEPTANCE.md` — Codex 5.4 mini最終acceptance
9. `../desktop-overlay-poc/CONTEST-SOURCE-NOTES.md` — Desktop提出・再生成条件

現在のWeb versionは `0.8.10`、Windows Desktop versionは `0.2.2`、DB_V2 migrationは `0001`〜`0017` です。

## Stage 8.2資料の扱い

`final-stage08/` は Stage 8.2導入時に作成したdeployment hardening・監査手順の履歴資料です。そこに記録された `0.8.2`、remote未反映、pending values等は**現在のproduction状態を表しません**。

現在のresource値を確認するときは `../wrangler.toml`、現在のsystem状態は `current-system.md`、現在のdeployment/freeze状態は `../SOURCE_GIT_RECORD.txt` を使います。

Stage 8.2のmigration・security境界・44項目staging acceptance等の手順を監査するときだけ、以下を参照します。

- `final-stage08/00_INDEX.md`
- `final-stage08/19_DEPLOYMENT_FINAL_CHECKLIST.md`
- `final-stage08/20_CODEX_DEPLOY_INSTRUCTION_FINAL.md`
- `final-stage08/22_AUDIT_FIX_MATRIX.md`

## 現行release資料

- `v0.8.9-usability-release.md` — v0.8.9操作性release履歴
- `v0.8.10-debug-fixes.md` — v0.8.10修正
- `v0.8.10-security-ui-audit.md` — v0.8.10 security/UI監査
- `database-schema.md` — DB_V2 schema説明
- `release-process.md` — release運用
- `versioning-policy.md` — version規則

## 段階別履歴

`stage-*`、`stage0*`、`archive/` 配下は開発履歴・試験証跡です。現行仕様と矛盾する記述がある場合、上記「現行正本」を優先します。過去の判断・migrationの由来・回帰試験の証跡を追跡する目的で保持します。

主な段階:

- Stage 1: baseline保全
- Stage 2: DB_V2
- Stage 3: auth / organization / private API
- Stage 4: comment persistence
- Stage 5: manual moderation
- Stage 6: realtime
- Stage 6.5: email/account lifecycle
- Stage 7: AI
- Stage 7.6〜7.8: content filter / bilingual dictionary
- Stage 8: PDF metadata / anonymous analytics
- Stage 8.1〜8.2: precision audit / final integrity hardening

## 再現用依存

- `../requirements-manual.txt` — manual PDF生成・描画
- `../requirements-visual.txt` — Playwright/Chromium visual audit
- Web: root `package-lock.json`
- Desktop: `desktop-overlay-poc/package-lock.json` と `desktop-overlay-poc/src-tauri/Cargo.lock`

## 凍結bundle生成

最終exact commitで `node scripts/build-u22-freeze-bundle.mjs` を実行すると、dirty treeを拒否し、source manifestとfreeze verifierを確認したうえでtracked sourceだけのZIP・SHA-256・外部gate待ちのfreeze recordをrepository外へ生成します。

U-22提出時には履歴資料そのものを変更して現行状態に見せかけず、現行正本とfreeze recordで現在状態を明確にします。
