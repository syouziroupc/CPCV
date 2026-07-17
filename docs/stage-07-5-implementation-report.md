# Stage 7.5 実装報告

## 実装単位

- `src/content-filter/normalization.js`
- `src/content-filter/matcher.js`
- `src/content-filter/validation.js`
- `src/content-filter/repository.js`
- `src/routes/content-filter.js`
- `migrations-v2/0011_dictionary_content_filter.sql`

## 接続先

- `src/realtime/comment-room.js`
- `src/comments/repository.js`
- `src/realtime/repository.js`
- `src/ai/repository.js`
- `src/ai/processor.js`
- `src/ai/provider.js`
- `src/routes/organization.js`
- `src/routes/private-v2.js`
- `public/assets/admin.js`
- `public/assets/join.js`

## 投稿処理

1. 公開投稿APIで従来の入力検証
2. Durable Objectで辞書context取得
3. 同期判定
4. rejectなら422
5. allow。mask。reviewならコメントと証拠を同一D1 batchで保存
6. visibleならRealtime event配信
7. 設定に応じてAI jobを非同期投入

## UI

組織画面:

- 用語追加
- category
- severity
- fuzzy toggle
- active toggle
- delete
- category別policy

授業画面:

- filter enable
- AI routing
- mask character

モデレーション画面:

- 原文
- 投影表示文
- 辞書action
- category
