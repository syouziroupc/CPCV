# Stage 7.5 変更ファイル

## 新規

- `migrations-v2/0011_dictionary_content_filter.sql`
- `src/content-filter/normalization.js`
- `src/content-filter/matcher.js`
- `src/content-filter/validation.js`
- `src/content-filter/repository.js`
- `src/routes/content-filter.js`
- `scripts/test-content-filter-v2.mjs`
- `scripts/verify-stage07-5-boundaries.mjs`
- `scripts/render-stage07-5-visuals.py`
- `docs/stage-07-5-*.md`
- `docs/stage07-5-screenshots/*`
- `docs/stage07-5-test-logs/*`

## 変更

- AI job routing
- コメント保存
- Realtime投稿とsnapshot
- 組織API
- 授業API
- 管理画面
- 学生投稿画面
- CI
- 本番deploy検査
- Stage 4からStage 7の試験harness
- package version
- 現行システム文書

## 変更なし

- 旧D1 migration
- Stage 1からStage 7の既存migration本文
- role構成
- session認証契約
- Student匿名参加
- PDF local-only方針
- WebSocket message sequence契約
