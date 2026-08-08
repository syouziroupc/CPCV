from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")

replace_once(
    "scripts/test-ai-v2.mjs",
    '''  const comment = await createComment(h, "delivery_retry", "授業内容を確認しました", retryNow + 200);
  const jobs = await createAiJobsForComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, commentId: comment.id, now: retryNow + 300
  });
  const translationJob = jobs.find((job) => job.jobType === "translation");
  h.room.failuresRemaining = 1;
  const aiCallsBefore = h.ai.calls.length;
  const firstOutcome = await processAiJob(h.env, translationJob.id, { now: retryNow + 400 });
  const callsAfterFirst = h.ai.calls.length;
  check("translation delivery failure requests a delivery-only retry", firstOutcome.retry === true && firstOutcome.deliveryOnly === true && firstOutcome.realtimeDelivered === false, firstOutcome);
  check("translation is persisted before realtime delivery retry", h.row("SELECT status FROM ai_jobs WHERE id=?1", translationJob.id)?.status === "succeeded");

  const secondOutcome = await processAiJob(h.env, translationJob.id, { now: retryNow + 500 });
  check("completed translation event is redelivered", secondOutcome.redelivered === true && secondOutcome.retry === false, secondOutcome);
  check("realtime redelivery does not call the AI model twice", callsAfterFirst === aiCallsBefore + 1 && h.ai.calls.length === callsAfterFirst, { aiCallsBefore, callsAfterFirst, finalCalls: h.ai.calls.length });
''',
    '''  const transientComment = await createComment(h, "delivery_i", "授業内容を確認しました", retryNow + 200);
  const transientJobs = await createAiJobsForComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, commentId: transientComment.id, now: retryNow + 300
  });
  const transientTranslationJob = transientJobs.find((job) => job.jobType === "translation");
  h.room.failuresRemaining = 1;
  const transientRequestsBefore = h.room.requests.length;
  const transientAiCallsBefore = h.ai.calls.length;
  const transientOutcome = await processAiJob(h.env, transientTranslationJob.id, { now: retryNow + 400 });
  check("single transient translation delivery failure is recovered inside realtime dispatch",
    transientOutcome.retry === false && transientOutcome.completed === true && transientOutcome.realtimeDelivered === true
      && h.room.requests.length - transientRequestsBefore === 2,
    { transientOutcome, requests: h.room.requests.slice(transientRequestsBefore) });
  check("internal realtime delivery retry does not rerun the AI model", h.ai.calls.length === transientAiCallsBefore + 1,
    { before: transientAiCallsBefore, after: h.ai.calls.length });

  const comment = await createComment(h, "delivery_retry", "再送処理の確認をします", retryNow + 500);
  const jobs = await createAiJobsForComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, commentId: comment.id, now: retryNow + 600
  });
  const translationJob = jobs.find((job) => job.jobType === "translation");
  h.room.failuresRemaining = 3;
  const aiCallsBefore = h.ai.calls.length;
  const firstOutcome = await processAiJob(h.env, translationJob.id, { now: retryNow + 700 });
  const callsAfterFirst = h.ai.calls.length;
  check("persistent translation delivery failure requests a delivery-only retry", firstOutcome.retry === true && firstOutcome.deliveryOnly === true && firstOutcome.realtimeDelivered === false, firstOutcome);
  check("translation is persisted before realtime delivery retry", h.row("SELECT status FROM ai_jobs WHERE id=?1", translationJob.id)?.status === "succeeded");

  const secondOutcome = await processAiJob(h.env, translationJob.id, { now: retryNow + 800 });
  check("completed translation event is redelivered", secondOutcome.redelivered === true && secondOutcome.retry === false, secondOutcome);
  check("realtime redelivery does not call the AI model twice", callsAfterFirst === aiCallsBefore + 1 && h.ai.calls.length === callsAfterFirst, { aiCallsBefore, callsAfterFirst, finalCalls: h.ai.calls.length });
'''
)

replace_once(
    "scripts/test-system-hardening.mjs",
    '''  assert.equal(await dispatchRealtimeEvent(env, "sess_a", event), true);
  assert.equal(gets, 2, "a fresh Durable Object stub must be acquired for the retry");
  assert.ok(calls.every((url) => url.endsWith("/clear")));

  let overloadedGets = 0;
''',
    '''  assert.equal(await dispatchRealtimeEvent(env, "sess_a", event), true);
  assert.equal(gets, 2, "a fresh Durable Object stub must be acquired for the retry");
  assert.ok(calls.every((url) => url.endsWith("/clear")));

  const translationEvent = {
    organizationId: "org_a", liveSessionId: "sess_a", sequence: 5, type: "settings:update",
    payload: { type: "translation:ready", commentId: "cmt_a", translation: "translated" }
  };
  assert.equal(await dispatchRealtimeEvent(env, "sess_a", translationEvent), true);
  assert.ok(calls.at(-1).endsWith("/event"), "translation payloads must use the generic event endpoint");
  const settingsEvent = {
    organizationId: "org_a", liveSessionId: "sess_a", sequence: 6, type: "settings:update",
    payload: { type: "settings:update", postingEnabled: true }
  };
  assert.equal(await dispatchRealtimeEvent(env, "sess_a", settingsEvent), true);
  assert.ok(calls.at(-1).endsWith("/settings"), "real settings updates must use the settings endpoint");

  let overloadedGets = 0;
'''
)

print("Stage 7 realtime retry regressions updated")
