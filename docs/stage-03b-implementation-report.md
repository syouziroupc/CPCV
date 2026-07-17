# CPCV Stage 3-B 実装報告書

## 1. 状態

Stage 3-Bのローカル実装は完了した。GitHub。Cloudflare remote。実デプロイは実行していない。

## 2. 実装API

### 認証

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/password/change`
- `POST /api/auth/password/reset`

### 組織

- `GET /api/org`
- `GET /api/org/members`
- `POST /api/org/members`
- `PATCH /api/org/members/:userId`
- `DELETE /api/org/members/:userId`
- `POST /api/org/members/:userId/password-reset`
- `GET /api/org/audit-logs`

旧案の`POST /api/auth/password/reset/request`は実装していない。

## 3. 実装内容

- HttpOnly Cookieによるsession認証
- GET session時のCSRF token回転
- Origin完全一致とCSRF検査
- user。organization。membershipのactive状態確認
- login IDとIPのRate Limiting抽象化
- D1による5回失敗・15分account lock
- user不存在時のdummy password hash
- 複数組織選択
- 旧PBKDF2 schemeのlogin時rehash
- password変更後の全session・reset token失効
- 一回限りpassword reset token
- Owner・Admin・Teacher権限境界
- 最後のactive Owner保護
- member変更時の対象組織session失効
- 組織固定pagination
- audit log記録と機密field除去
- 認証APIのno-store security header

## 4. transaction設計

次は同じD1 batch内へまとめた。

- member role・status変更
- member解除
- 対象session失効
- member監査ログ
- password変更
- reset token消費
- password更新
- session失効
- reset監査ログ

監査ログ書込みを意図的に失敗させる試験を追加した。途中失敗時に主要更新がrollbackされることを確認した。

## 5. 変更禁止範囲

次は変更していない。

- `public/**`
- `migrations/**`
- `src/routes/master.js`
- 既存授業route
- 旧DB投影
- `.github/workflows/**`
- remote D1
- Cloudflare Worker

## 6. 完了判定

- Stage 2回帰試験: 154件成功
- Stage 3-A試験: 120件成功
- Stage 3-B API・rollback試験: 109件成功
- 合計: 383件成功。失敗0件
- Worker dry-run: 成功
- production依存監査: 0件

Stage 3-Bは完了。次はStage 3-Cで授業API。旧DB投影。Admin・Master UIのCookie認証化。legacy認証停止を実装する。
