# 運用。監視。保守仕様

## 1. 毎日確認

- Worker error rate
- D1 error
- Queue backlog
- Queue retry
- AI job failed。stale
- Email failed
- Cron実行
- cleanup件数

## 2. 毎週確認

- active organization
- active Owner不在organization
- unverified Owner
- AI利用量
- dictionary pack version
- expired token残数
- snapshot checksum error
- audit log異常

## 3. 毎月確認

- dependency update候補
- Wrangler changelog
- D1 migration status
- Time Travel利用可能期間
- Queue retentionとretry
- Email domain DNS
- Turnstile key管理
- rate limit誤遮断
- privacy review

## 4. logとprivacy

logへfull email。full IP。raw token。PDF内容を出さない。
request ID。user ID。organization ID。action。masked emailを使う。
production logを共有する場合は追加maskする。

## 5. Queue監視

Cloudflare Queue metricsで次を確認する。

- backlog
- consumer concurrency
- successful operations
- retry
- failed delivery

現行はDLQなしである。
max retry到達messageは削除され得る。
必要性を確認した場合は別stageでDLQを追加する。

## 6. D1監視

- `PRAGMA quick_check`
- `PRAGMA foreign_key_check`
- migration status
- database size
- query error
- active Owner

Remote healthは`node scripts/verify-remote-d1.mjs`を使う。

## 7. release管理

- exact Git SHAへ固定
- source ZIP SHA-256を記録
- stagingとproduction version IDを記録
- migration outputを保存
- smoke testを保存
- rollback対象versionを記録

## 8. 次段階へ変更する場合

Stage 8完成後の変更はStage 9として扱う。
既存`0001`〜`0016`を編集しない。
新migrationは`0017`から開始する。
PDF privacy境界。手動moderation優先。organization境界を変更しない。
