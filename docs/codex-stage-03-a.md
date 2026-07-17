# Codex指示 第3段階A: 認証基盤

## 基準

- `docs/stage-03-spec.md`
- `docs/stage-03-contract-addendum.md`
- `docs/stage-03-test-spec.md`
- Stage 2の全試験が0 failure

## 実装範囲

1. `migrations-v2/0002_auth_security.sql`
2. Cookie utility
3. token生成・hash・constant-time比較
4. password hash・verify・rehash判定
5. Origin検査
6. CSRF検査
7. permission matrix
8. auth session lookup middleware
9. 上記だけのunit。schema。integration test

## 変更禁止

- API routeの追加・置換
- `public/**`
- 旧DB projection
- legacy endpoint
- `.github/workflows/**`
- remote操作
- deploy

## 完了条件

- Stage 2試験維持
- migration再適用no-op
- utility test 0 failure
- middleware test 0 failure
- routeとUIのdiffなし
- 実装報告。試験結果。変更一覧を作成
