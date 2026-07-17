# CPCV Stage 1〜8 統合仕様書

文書release: `stage08-final-spec-1`  
作成日: `2026-07-16`  
対象code version: `0.8.1`  
基準Git commit: `7d740e699ec4661cf3ec35f5bd4a86a2887422c9`

## 読む順序

1. `01_STAGE01_TO_STAGE08_MASTER_SPEC.md`
2. `02_CURRENT_ARCHITECTURE.md`
3. `03_DATA_AND_MIGRATION_SPEC.md`
4. `04_SECURITY_AUTHORIZATION_SPEC.md`
5. `05_API_REALTIME_UI_SPEC.md`
6. `06_MODERATION_AI_TRANSLATION_FILTER_SPEC.md`
7. `07_PDF_ANALYTICS_PRIVACY_SPEC.md`
8. `08_CLOUDFLARE_RESOURCE_SPEC.md`
9. `09_CODEX_CLOUDFLARE_RUNBOOK.md`
10. `10_STAGING_ACCEPTANCE_TEST.md`
11. `11_PRODUCTION_CUTOVER_AND_ROLLBACK.md`
12. `12_OPERATIONS_MONITORING.md`
13. `13_CONFIGURATION_WORKSHEET.md`
14. `14_CODEX_COPY_PASTE_INSTRUCTION.md`
15. `15_REFERENCES.md`
16. `16_DOCUMENTATION_VALIDATION.md`
17. `17_CLOUDFLARE_PENDING_VALUES.md`

## 文書の位置付け

- 本フォルダはStage 1〜8.1の統合正本である。
- 既存の段階別資料は設計履歴と試験証跡として残す。
- 実装と文書が矛盾した場合は現行source。migration。自動試験を優先する。
- Cloudflare実値は本書へ記入してからCodexへ渡す。
- UUID。secret。namespace ID。domainは推測しない。
- PDF本体をCloudflareへ送る変更は禁止する。
