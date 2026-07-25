# Cloudflare production設定状態

2026-07-25のproduction release候補で外部値を確定した。

## 設定済み

- DB_V2: class_comment_db_v2 / 8315a076-67ad-44e6-8286-11887af52ad3
- Rate Limiting namespace: 826071901から826071904
- AUTH_EMAIL_FROM: noreply@szworld.uk
- AUTH_EMAIL_REPLY_TO: noreply@szworld.uk
- TURNSTILE_SITE_KEY: 0x4AAAAAAD9zOVz8FBcawf0n
- EMAIL.allowed_sender_addresses: noreply@szworld.uk
- Queue: cpcv-ai-jobs
- AUTH_RATE_LIMIT_PEPPER: Worker secretとしてrelease時に設定
- PUBLIC_RATE_LIMIT_PEPPER: Worker secretとしてrelease時に設定
- TURNSTILE_SECRET_KEY: Worker secretとしてrelease時に設定

## release gate

このcommitは全回帰。D1 migration。remote schema検査。production deploy。外部smoke testが合格した場合だけmasterへ反映する。
