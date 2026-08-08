import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dispatchRealtimeEvent } from "../src/realtime/dispatch.js";
import { sendTransactionalEmail } from "../src/auth/email-service.js";

async function testRealtimeRetry() {
  let gets = 0;
  const calls = [];
  const env = {
    COMMENT_ROOM: {
      idFromName(value) { return value; },
      get() {
        gets += 1;
        const attempt = gets;
        return { async fetch(url) { calls.push(url); return new Response("", { status: attempt === 1 ? 503 : 200 }); } };
      }
    }
  };
  const event = { organizationId: "org_a", liveSessionId: "sess_a", sequence: 4, type: "message:clear", payload: { type: "message:clear" } };
  assert.equal(await dispatchRealtimeEvent(env, "sess_a", event), true);
  assert.equal(gets, 2, "a fresh Durable Object stub must be acquired for the retry");
  assert.ok(calls.every((url) => url.endsWith("/clear")));

  let overloadedGets = 0;
  const overloaded = new Error("overloaded"); overloaded.overloaded = true; overloaded.retryable = true;
  const overloadedEnv = { COMMENT_ROOM: { idFromName(v) { return v; }, get() { overloadedGets += 1; return { async fetch() { throw overloaded; } }; } } };
  assert.equal(await dispatchRealtimeEvent(overloadedEnv, "sess_a", event), false);
  assert.equal(overloadedGets, 1, "overloaded Durable Objects must not be retried");

  let retryableGets = 0;
  const retryableEnv = { COMMENT_ROOM: { idFromName(v) { return v; }, get() { retryableGets += 1; const n = retryableGets; return { async fetch() { if (n === 1) { const error = new Error("reset"); error.retryable = true; throw error; } return new Response("", { status: 200 }); } }; } } };
  assert.equal(await dispatchRealtimeEvent(retryableEnv, "sess_a", event), true);
  assert.equal(retryableGets, 2);
}

async function testEmailStatusPersistenceDoesNotRewriteDeliveryOutcome() {
  let sent = 0;
  const db = {
    prepare(sql) {
      return { bind() { return { async run() {
        if (sql.includes("INSERT INTO email_delivery_attempts")) return { meta: { changes: 1 } };
        throw new Error("simulated status write outage");
      } }; } };
    }
  };
  const env = {
    DB_V2: db,
    AUTH_EMAIL_FROM: "noreply@example.com",
    AUTH_RATE_LIMIT_PEPPER: "pepper",
    EMAIL: { async send() { sent += 1; return { messageId: "msg-1" }; } }
  };
  const result = await sendTransactionalEmail(env, {
    kind: "test", to: "person@example.com", subject: "Test", text: "x", html: "<p>x</p>", requestId: "req_1"
  });
  assert.equal(sent, 1);
  assert.equal(result.ok, true, "provider acceptance must remain success even if bookkeeping update fails");
  assert.equal(result.statusPersisted, false);
}

function testStaticHardening() {
  const privateRoute = readFileSync(new URL("../src/routes/private-v2.js", import.meta.url), "utf8");
  const room = readFileSync(new URL("../src/realtime/comment-room.js", import.meta.url), "utf8");
  const comments = readFileSync(new URL("../src/comments/repository.js", import.meta.url), "utf8");
  const join = readFileSync(new URL("../public/assets/join.js", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../public/assets/admin.js", import.meta.url), "utf8");
  const authPublic = readFileSync(new URL("../public/assets/auth-public.js", import.meta.url), "utf8");
  const invitation = readFileSync(new URL("../public/assets/accept-invitation.js", import.meta.url), "utf8");
  const account = readFileSync(new URL("../public/assets/account.js", import.meta.url), "utf8");
  const master = readFileSync(new URL("../public/assets/master.js", import.meta.url), "utf8");
  const organization = readFileSync(new URL("../public/assets/organization-settings.js", import.meta.url), "utf8");
  const viewer = readFileSync(new URL("../public/assets/viewer.js", import.meta.url), "utf8");
  const smoke = readFileSync(new URL("./smoke-production.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(privateRoute, /void scheduleAiForComment/);
  assert.match(privateRoute, /ctx\.waitUntil\(task\)/);
  assert.match(privateRoute, /from "\.\.\/realtime\/dispatch\.js"/);
  assert.match(room, /storage\.getAlarm\(\)/);
  assert.match(room, /Number\(current\) <= target/);
  assert.doesNotMatch(comments, /function findCommentByIdempotency/);
  assert.doesNotMatch(comments, /function activeIdempotencyKeyExists/);
  assert.doesNotMatch(comments, /function releaseExpiredIdempotencyKey/);
  assert.match(join, /sessionRefreshRunning/);
  assert.match(join, /sessionLoadedOnce/);
  assert.match(admin, /if \(!localLogChannel\) \{\s*setInterval/);
  for (const source of [authPublic, invitation, account, master, organization, viewer]) {
    assert.match(source, /http-client\.js/);
  }
  assert.match(invitation, /session\.response\.status !== 401/);
  assert.match(account, /error\?\.status === 401/);
  assert.equal((smoke.match(/AbortSignal\.timeout\(10_000\)/g) || []).length, 2);
}

await testRealtimeRetry();
await testEmailStatusPersistenceDoesNotRewriteDeliveryOutcome();
testStaticHardening();
console.log("System-wide reliability hardening regression tests passed");
