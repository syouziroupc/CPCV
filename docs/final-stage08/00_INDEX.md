# CPCV Stage 8.2 最終統合正本

文書release: `stage08-final-spec-2`
対象code version: `0.8.2`
対象migration: `0001`〜`0017`
Cloudflare remote変更: 未実施

## 正本の優先順位

1. 現行sourceとappend-only migration
2. 自動試験と検査script
3. 本フォルダのStage 8.2文書
4. 段階別の旧文書と過去log

旧文書に`0.8.1`。`0016`。Stage 8.1と書かれていても履歴記録です。deploy手順として使用しません。

## 読む順序

1. `20_CODEX_DEPLOY_INSTRUCTION_FINAL.md`
2. `17_CLOUDFLARE_PENDING_VALUES.md`
3. `19_DEPLOYMENT_FINAL_CHECKLIST.md`
4. `18_STAGE82_FINAL_HARDENING.md`
5. `02_CURRENT_ARCHITECTURE.md`
6. `03_DATA_AND_MIGRATION_SPEC.md`
7. `04_SECURITY_AUTHORIZATION_SPEC.md`
8. `05_API_REALTIME_UI_SPEC.md`
9. `06_MODERATION_AI_TRANSLATION_FILTER_SPEC.md`
10. `07_PDF_ANALYTICS_PRIVACY_SPEC.md`
11. `08_CLOUDFLARE_RESOURCE_SPEC.md`
12. `09_CODEX_CLOUDFLARE_RUNBOOK.md`
13. `10_STAGING_ACCEPTANCE_TEST.md`
14. `11_PRODUCTION_CUTOVER_AND_ROLLBACK.md`
15. `12_OPERATIONS_MONITORING.md`
16. `13_CONFIGURATION_WORKSHEET.md`
17. `21_FINAL_VERIFICATION_REPORT.md`
18. `15_REFERENCES.md`

## 絶対条件

- UUID。namespace ID。secret。domainを推測しない。
- `0001`〜`0017`を編集しない。
- productionとstagingのD1。Queue。Workerを共有しない。
- PDF bytes。filename。page text。画像をCloudflareへ送らない。
- dirty tree。hash不一致。試験失敗。config検査失敗で停止する。
- staging合格記録がないcommitをproductionへdeployしない。
- Time Travel restoreは破壊的操作として明示承認なしに実行しない。
- `22_AUDIT_FIX_MATRIX.md` / `.csv`: 元監査71件の修正対応表
