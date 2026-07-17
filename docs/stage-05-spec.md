# CPCV Stage 5 正式仕様: 手動モデレーション

## 1. 目的

Stage 4で永続化したコメントへ手動モデレーションを追加する。認証。組織境界。匿名参加者。comment ID。idempotency。retentionは変更しない。

## 2. 授業ごとの承認方式

`session_moderation_settings.moderation_mode`を正本とする。

- `off`: 保存成功後に`visible`として即時表示
- `pre`: 保存時は`pending`。先生の承認後に表示

defaultは`off`。Teacherは自分の授業だけ変更できる。OwnerとAdminは自組織の授業を変更できる。

## 3. 状態遷移

| 現在 | 操作 | 次状態 | Viewer |
|---|---|---|---|
| pending | approve | visible | 全文を配信 |
| pending | hide | hidden | 配信しない |
| pending | delete | deleted | 配信しない |
| visible | hide | hidden | 撤回event |
| visible | delete | deleted | 撤回event |
| hidden | restore | visible | 全文を再配信 |
| hidden | delete | deleted | 撤回状態を維持 |
| deleted | restore | hidden | 表示しない |

`deleted -> visible`は一回で行わない。最初の復元は`hidden`へ戻す。再表示にはもう一度`restore`する。DB triggerでも不正遷移を拒否する。

## 4. 競合制御

clientは`expectedUpdatedAt`を送る。UPDATEは現在のstateと`updated_at`を条件にする。先に別操作が成功した場合は`409 COMMENT_VERSION_CONFLICT`を返す。

同じcommentと同じresult timestampのactionはUNIQUE制約で重複を拒否する。

## 5. API

### 単一操作

`POST /api/private/sessions/:sessionId/comments/:commentId/moderate`

```json
{
  "action": "approve | hide | delete | restore",
  "expectedUpdatedAt": "2026-07-13T00:00:00.000Z",
  "reason": "任意。200 Unicode code points以内"
}
```

### 一括操作

`POST /api/private/sessions/:sessionId/comments/moderate-bulk`

- 1回1〜25件
- 同じcomment IDを重複指定できない
- 各itemは独立して処理する
- 成功。version conflict。権限。内部障害をitemごとに返す
- 一件の失敗で他の既確定結果を失わない

### 履歴

`GET /api/private/sessions/:sessionId/comments/:commentId/moderation`

最新100件を返す。comment本文はmoderation action tableへ複製しない。

## 6. 監査

各操作で次を同一DB batchへ含める。

1. comment state更新
2. `comment_moderation_actions`
3. 必要な`comment_events`
4. generic `audit_logs`

いずれかが失敗した場合は全体をrollbackする。generic auditへcomment本文を入れない。

## 7. Realtime

- `approve`と`hidden -> visible restore`: `message:restore`
- `hide`と`delete`: `message:remove`
- pending保存時: broadcastしない

DB更新後にRealtime配信が失敗した場合はDB状態を戻さない。失敗を監査し、Stage 6のcatch-upで回復可能にする。

## 8. UI

管理画面へ次を追加する。

- 承認方式切替
- state filter
- 単一操作
- 一括操作
- state badge
- 再読込み

「表示コメントを消す」は一時的な画面clearである。保存stateは変更しない。

## 9. 入力防御

- reasonはNFKC
- control文字を空白へ整理
- 200 Unicode code points
- URL拒否をscheme。www。domain。IPv4へ拡張
- 生IP。User-Agent。端末指紋は保存しない

## 10. 変更しない範囲

- 認証方式
- role matrix
- PDF処理
- WebSocket transportとsequence
- AI判定
- 翻訳
- remote deploy
