# 運用と監視

## scheduled jobs

- `*/5 * * * *`: AI recovery。stale processing回収。再dispatch
- `17 3 * * *`: retention。expired auth data。Realtime data。PDF analytics data

CronはUTCです。

## 日常監視

- Worker error率
- D1 errorとlatency
- Queue backlogとretry
- AI quotaとprovider error
- Email delivery attemptのpending残留
- Rate Limiting unavailable audit
- WebSocket auth revalidation failure
- projection inconsistency audit
- retention backlog

## 定期検査

- `node scripts/verify-remote-d1.mjs`
- `PRAGMA foreign_key_check`
- `PRAGMA quick_check`
- active Owner count
- unverified Owner count
- `d1_migrations`が`0017`まで存在
- Stage 8.2永続trigger 42本

## migration規則

`0001`〜`0017`を編集しません。次の変更は`0018`以降へ追加します。

## incident

- authまたはdata境界異常は新規書込を停止する
- limiter outageをfail openへ変更しない
- production dataを直接修正しない
- evidenceを保存する
- reviewed repair SQLをstaging copyで検証する
- production実行前にbookmarkと明示承認を得る
