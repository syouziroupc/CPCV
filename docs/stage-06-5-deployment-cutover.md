# Stage 6.5 本番切替手順

## 切替前

- remote D1 backupまたはbookmarkを記録
- `0008`と`0009`の適用結果を保存
- Email Service sender domainを確認
- Turnstile実keyを確認
- 4個のRate Limiting namespaceを確認
- stagingで実メール到達を確認

## 移行期間

`EMAIL_AUTH_REQUIRED=0`を維持する。

既存Ownerは旧login IDでログインできる。`/account`からメールを登録する。

## 必須化

全active Ownerが確認済みメールを持った後に次を行う。

```bash
npm run verify:email-auth-ready
```

成功後だけ`EMAIL_AUTH_REQUIRED=1`へ変更する。

## Rollback

Worker versionを戻してもD1 migrationは戻らない。`0008`と`0009`は追加型である。緊急時は`EMAIL_AUTH_REQUIRED=0`へ戻し、旧login IDによる移行経路を再開する。
