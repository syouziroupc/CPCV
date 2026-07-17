# Codex指示 第3段階B: 認証・組織API

## 開始条件

Stage 3-Aがcommit済み。全試験0 failure。

## 実装範囲

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/password/change`
- `POST /api/org/members/:userId/password-reset`
- `POST /api/auth/password/reset`
- `GET /api/org`
- member一覧。作成。変更。解除
- audit log一覧
- account limiter mock
- D1 account lock
- 最後のOwner条件付き更新

API契約は `docs/stage-03-contract-addendum.md` を優先する。

## 変更禁止

- 授業route
- 旧DB projection
- `public/**`
- legacy endpoint
- `.github/workflows/**`
- remote操作
- deploy

## 完了条件

- login。session。password。role。越境。audit試験0 failure
- raw token。password。hash。salt。生IPがlogにない
- route単位の実装報告を作成
