# Production release status

2026-07-25のrelease候補でproduction用Cloudflare資源を実値設定した。

- DB_V2: `class_comment_db_v2`
- Queue: `cpcv-ai-jobs`
- Turnstile: `CPCV Production`
- Email sender: `noreply@szworld.uk`
- Rate Limiting binding: production専用の4 namespace
- AI翻訳: `@cf/meta/m2m100-1.2b`。5秒primary。5秒fallback

新規DBへの初回releaseではOwnerが存在しない。schemaとmigrationを検証してdeployした後。公開`/signup`から最初のOwnerを作成する。通常の`verify-remote-d1.mjs`はOwner作成後に厳格合格させる。
