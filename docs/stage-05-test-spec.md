# Stage 5 試験仕様

## Schema

- 追加tableとINDEX
- 外部キー
- CHECK制約
- 不正state遷移
- timestamp非前進
- deletedからvisibleへの直接復元拒否
- 無効moderation mode拒否

## 投稿

- offではvisible
- preではpendingと202
- pendingはbroadcastしない
- idempotent replayで再broadcastしない

## 操作

- 全合法遷移
- 全不正遷移
- 理由の正規化と長さ
- expected timestamp形式
- optimistic conflict
- 同時操作で一件だけ成功

## 権限

- Teacherは自分の授業だけ
- OwnerとAdminは自組織
- 他組織は404
- Durable Object内部endpointはinternal token必須

## 一括

- 最大25
- comment ID重複拒否
- 部分成功
- 予期しないitem障害後も継続

## Rollback

- action insert失敗
- audit失敗
- comment state。event。auditが部分保存されない

## Viewer

- removeでqueue。DOM。IndexedDBから除去
- restoreで全文再表示
- pendingは表示しない

## 回帰

Stage 2。3-A。3-B。3-C。4の全試験を実行する。後続migrationによる正常なschema追加を旧試験が誤拒否しないことも確認する。
