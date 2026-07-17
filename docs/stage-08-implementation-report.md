# Stage 8 実装報告

## 完了内容

- browser内PDF SHA-256計算
- PDF metadataだけの授業binding
- page状態と単調増加version
- コメントとserver現在pageの原子的な紐付け
- Student理解度三択
- page変更競合の拒否
- page別匿名集計
- 小人数抑制
- display event由来の滞在時間
- 集計snapshot
- SHA-256 checksum
- 匿名CSV export
- 180日retention
- migration前互換
- 管理画面とStudent画面
- Cloudflare Remote D1検査のStage 8対応

## 主な実装場所

```text
migrations-v2/0015_pdf_page_analytics.sql
src/pdf-analysis/**
src/routes/pdf-analysis.js
src/routes/private-v2.js
src/routes/public-v2.js
src/comments/repository.js
src/comments/csv.js
src/realtime/edge-rate-limit.js
src/index.js
public/assets/viewer.js
public/assets/admin.js
public/assets/join.js
public/admin/index.html
public/j/index.html
scripts/test-pdf-analysis-v2.mjs
scripts/verify-stage08-boundaries.mjs
scripts/render-stage08-visuals.py
scripts/test-stage08-all.mjs
```

## 完了判定

Stage 8のローカル実装は完了。
GitHub push。Remote D1 migration。staging。production deployは未実施。
Cloudflare反映は`stage-08-codex-cloudflare-deployment.md`に従ってCodexが実施する。
