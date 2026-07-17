# Stage 7 DB仕様

Migration: `migrations-v2/0010_ai_moderation_translation.sql`

## `organization_ai_settings`

組織AIの有効状態と日次上限を保存します。組織作成triggerで無効状態を作成します。

## `session_ai_settings`

授業単位のmoderation。translation。対象言語を保存します。授業作成triggerで無効状態を作成します。

## `ai_jobs`

D1をjob状態の正本とします。

status:

- queued
- processing
- retry
- succeeded
- failed
- skipped

`comment_id + job_type + target_language`を一意にします。

## `ai_results`

AI判定助言を保存します。`source`はproviderまたはlocal privacy guardです。

## `translations`

原文と分離して翻訳を保存します。`comment_id + target_language`を一意にします。

## `ai_usage_events`

外部model呼出し一回ごとに一行を保存します。primaryとfallbackを別々に数えます。Queue再試行でも実際の外部呼出しごとに数えます。

## 原子性

- claimは状態条件付き更新
- moderation結果とjob完了を一つのbatch
- translation。usage更新。job完了。Realtime eventを一つのbatch
- batch失敗時は部分保存しない

## quota

D1 triggerで組織。日。job typeごとの呼出し件数を強制します。
