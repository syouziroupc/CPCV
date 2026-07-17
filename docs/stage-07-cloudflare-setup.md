# Stage 7 Cloudflare設定手順

## 1. Queue

Wrangler設定名:

```text
cpcv-ai-jobs
```

作成例:

```bash
npx wrangler queues create cpcv-ai-jobs
```

producer bindingは`AI_JOBS_QUEUE`です。consumerは同じWorkerです。

## 2. Workers AI

binding:

```toml
[ai]
binding = "AI"
```

既定model:

```text
AI_MODERATION_MODEL=@cf/zai-org/glm-4.7-flash
AI_MODERATION_FALLBACK_MODEL=@cf/qwen/qwen3-30b-a3b-fp8
AI_TRANSLATION_MODEL=@cf/zai-org/glm-4.7-flash
AI_TRANSLATION_FALLBACK_MODEL=@cf/qwen/qwen3-30b-a3b-fp8
AI_TIMEOUT_MS=12000
```

model IDはdeploy前にCloudflare accountで利用可能か確認します。

## 3. AI Gateway

任意です。使用時だけ`AI_GATEWAY_ID`を設定します。cacheは使用しません。

## 4. D1

Remoteへ`0010_ai_moderation_translation.sql`を適用します。

```bash
npx wrangler d1 migrations apply class_comment_db_v2 --remote
```

適用前にremote backupとmigration一覧を確認します。

## 5. 安全な切替

1. Queue作成
2. migration 0010適用
3. WorkerをAI無効状態でdeploy
4. `npm run verify:ai-ready`
5. stagingで合成コメントを使い動作確認
6. Ownerが小さい日次上限を設定
7. 一授業だけ有効化
8. Queue backlog。AI error。usageを監視
9. 問題がなければ対象を拡大

本成果物はremote操作を行っていません。
