# Codex指示 第3段階C: 授業投影・UI移行

## 開始条件

Stage 3-Bがcommit済み。全試験0 failure。

## 実装範囲

- `/api/private/sessions/**`を新版middlewareへ接続
- DB_V2 `live_sessions`を正本化
- 旧DB `sessions`へ互換投影
- 作成失敗補償
- 更新rollback
- 終了・削除の安全側停止
- Admin。Master UIのCookie認証化
- LocalStorage認証token撤去
- in-memory CSRF
- `AUTH_V2_ENABLED=1`時のlegacy auth 410
- Stage 3全試験

## 変更禁止

- Student UI
- Viewer UI
- Durable Object comment protocol
- WebSocket subprotocol
- PDF.js
- `.github/workflows/**`
- remote操作
- deploy

## UI検査

ブラウザでログイン。組織選択。再読込。logout。権限別表示を確認する。変更画面はスクリーンショットで崩れを確認する。

## 完了条件

- Stage 2とStage 3全試験0 failure
- 学生投稿。Viewer。WebSocketの回帰なし
- LocalStorageに認証tokenなし
- package再展開後の再試験成功
