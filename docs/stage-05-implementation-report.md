# Stage 5 実装報告

## 実装

- `0006_manual_moderation.sql`
- 授業単位の`off`・`pre`設定
- 単一moderation API
- 最大25件のbulk API
- moderation履歴API
- optimistic concurrency
- moderation action監査
- Viewer撤回と復元event
- Adminのstate filter。単一操作。一括操作
- URL検出強化
- remote D1のStage 5 migration確認

## 主要判断

- defaultは既存互換の`off`
- 論理削除した本文はretentionまで保持する
- deletedの復元はhiddenへ戻す
- Realtime障害でDB stateをrollbackしない
- 一括操作はitem単位の結果を返す

## 外部環境

GitHub。Cloudflare remote。production deployは実行していない。
