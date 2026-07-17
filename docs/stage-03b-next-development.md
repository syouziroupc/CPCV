# Stage 3-B以降の開発引継ぎ

## 次の実装

Stage 3-Cを実装する。

- 現行授業APIを新版Cookie認証へ接続
- `DB_V2.live_sessions`を権限上の正本にする
- 旧`DB.sessions`へ互換投影する
- 跨DB失敗時の補償処理
- Admin UIのCookie認証化
- Master UIの組織管理画面化
- LocalStorage・Bearer認証の撤去
- `AUTH_V2_ENABLED=1`時のlegacy認証endpoint 410化
- Student UI。Viewer。WebSocketの互換維持

## 外部環境へ反映する前に必要な値

- `DB_V2.database_id`の実UUID
- `AUTH_ORIGIN`
- `AUTH_RATE_LIMIT_PEPPER` secret
- `AUTH_LOGIN_IP_LIMITER` namespace
- `AUTH_LOGIN_ACCOUNT_LIMITER` namespace

架空値を設定してはならない。これらは最終デプロイ時にCodexが実環境を確認して設定する。

## デプロイ禁止条件

次の状態では本番デプロイしない。

- Stage 3-C未完了
- `DB_V2`実UUID未設定
- Rate Limiting binding未設定
- staging試験未完了
- rollback基準未記録
