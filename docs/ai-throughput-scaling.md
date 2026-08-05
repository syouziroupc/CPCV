# AI throughput scaling

CPCV routes translation and moderation into separate Cloudflare Queues so either workload can expand without blocking the other.

## Runtime path

- `AI_TRANSLATION_QUEUE` handles translation jobs.
- `AI_MODERATION_QUEUE` handles moderation jobs.
- `AI_JOBS_QUEUE` remains as a compatibility drain for messages created by an older deployment.
- Queue consumer `max_concurrency` is intentionally unset. Cloudflare Queues may therefore add consumer invocations when backlog grows.
- A translation consumer processes up to six messages concurrently. A moderation consumer processes up to five.
- Queue batches are deliberately small enough to finish quickly so the Queue autoscaler can react to backlog growth.

## Backpressure

Workers AI currently applies task-level request limits. CPCV uses separate Rate Limiting bindings just below those default limits before claiming a database job:

- translation: 700 calls per 60 seconds
- moderation/text generation: 290 calls per 60 seconds

If the local limiter is full, the Queue message is delayed without incrementing the AI job attempt count. Cloudflare Rate Limiting counters are permissive and location-local, so provider-side 429 responses remain authoritative. Provider rate limits, timeouts, and temporary unavailability are retried by the AI job pipeline.

For translation, the original comment is released on the first provider backpressure failure. A later successful translation can still be attached to the already displayed comment.

## Failure isolation

Dedicated queues use up to 100 delivery retries and separate dead-letter queues. Persistent translation failures cannot consume moderation retries, and moderation failures cannot block translation delivery.

## Capacity changes

If Cloudflare raises the Workers AI limits for the account, update these settings together:

1. `AI_TRANSLATION_RATE_LIMITER` and `AI_MODERATION_RATE_LIMITER` limits.
2. `AI_TRANSLATION_QUEUE_PARALLELISM` and `AI_MODERATION_QUEUE_PARALLELISM` if model latency requires more in-flight requests.
3. Queue batch sizes if a larger batch still completes quickly enough for autoscaling.

Do not add a fixed `max_concurrency` unless an upstream limit or cost ceiling requires a hard cap. Leaving it unset allows Cloudflare Queues to use the platform's supported consumer autoscaling.
