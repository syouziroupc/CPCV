# Stage 7.5 試験仕様

## DB

- migration 0001から0011
- foreign_key_check 0
- quick_check ok
- 新規組織policy初期化
- 新規授業setting初期化

## Matching

- NFKC
- 片仮名と平仮名
- 記号挿入
- zero-width
- confusable
- fuzzy一文字差
- category disabled
- severity policy
- reject非保存
- mask表示

## AI routing

- off
- ambiguous
- all
- safe commentのAI省略
- ambiguous commentだけmoderation job

## Persistence

- 原文と表示文の分離
- match evidence
- Realtimeへ表示文だけ
- 教員画面へ原文と証拠

## Regression

- 認証
- メール認証
- account lifecycle
- 投稿
- moderation
- Realtime
- AI
- deployment dry-run

## Visual

- 辞書管理 PC。390px
- 授業設定 PC。390px
- moderation 390px
- page-level overflow 0
- control重なり 0
