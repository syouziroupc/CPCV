# Stage 7.8 実装報告

## 変更内容

- 日本語基本パックを39語から128語へ拡充
- 英語基本パックを50語から161語へ拡充
- 日本語文脈注意パック101語を追加
- 英語文脈注意パック110語を追加
- 推奨設定は基本パックだけを導入
- 厳格設定は4パックを導入
- 個別パック操作を詳細設定へ格納
- pack version更新機能を実装
- 手動編集の保護
- 削除済み語の非復活
- source pack keyの部分UNIQUE INDEX追加
- CSVとpack summary更新
- 辞書専用監査と更新試験を追加

## DB

追加migration:

```text
migrations-v2/0014_filter_pack_expansion.sql
```

既存migrationは変更しない。

## 主要ファイル

- `src/content-filter/packs.js`
- `src/content-filter/repository.js`
- `data/content-filter-packs/*.csv`
- `data/content-filter-packs/pack-summary.json`
- `public/admin/index.html`
- `public/_admin_spa.html`
- `public/assets/admin.js`
- `scripts/audit-filter-packs.mjs`
- `scripts/test-filter-pack-upgrade-v2.mjs`
- `scripts/verify-stage07-8-boundaries.mjs`
