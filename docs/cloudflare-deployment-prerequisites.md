# Cloudflare production prerequisites

実値が揃うまでdeploymentを実行しない。UUID。namespace ID。secretを推測しない。

## 必須resource

- `DB` / `class_comment_db`
- `DB_V2` / `class_comment_db_v2`
- `COMMENT_ROOM`
- `ASSETS`
- `EMAIL`
- `AI`
- `AI_JOBS_QUEUE`
- 4個のRate Limiting namespace
- Cron Trigger
- Turnstile widget
- Email Service sending domain

## 必須vars

- `APP_ENV=production`
- `AUTH_V2_ENABLED=1`
- `EMAIL_AUTH_REQUIRED=0`または`1`
- `AUTH_ORIGIN`
- `PUBLIC_ORIGIN`
- `AUTH_EMAIL_FROM`
- `AUTH_EMAIL_REPLY_TO`
- `TURNSTILE_SITE_KEY`
- AI model vars

## 必須secrets

- `AUTH_RATE_LIMIT_PEPPER`
- `PUBLIC_RATE_LIMIT_PEPPER`
- `TURNSTILE_SECRET_KEY`

## Remote準備

1. DB_V2の実UUID確認
2. Queue。AI。Email。Turnstile。limiter確認
3. D1 Time Travel bookmark記録
4. migration `0001`から`0015`を適用
5. `node scripts/verify-remote-d1.mjs`
6. Owner確認
7. staging試験
8. production deploy

## 実行前検査

```bash
npm run verify:deployment
npm run verify:ai-ready
npm run check:stage08
npm run deploy:dry-run
node scripts/verify-remote-d1.mjs
npm run verify:email-auth-ready
npm audit
npm audit --omit=dev
```

詳細は`stage-08-codex-cloudflare-deployment.md`。
