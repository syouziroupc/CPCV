import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ORIGIN = String(process.env.STAGING_ORIGIN || 'https://class-pdf-comment-viewer-v01-staging.syouziroupc.workers.dev').replace(/\/$/, '');
const CONFIG = String(process.env.STAGING_WRANGLER_CONFIG || '.load-staging.wrangler.toml');
const DATABASE = String(process.env.STAGING_DB_V2_NAME || 'class_comment_db_v2_staging');
const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const TEST_PREFIX = `load-${RUN_ID}`;
const ORG_ID = `org_${TEST_PREFIX}`;
const SESSION_ID = `sess_${TEST_PREFIX}`;
const PUBLIC_CODE = randomPublicCode();
const REPORT = {
  runId: RUN_ID,
  origin: ORIGIN,
  database: DATABASE,
  startedAt: new Date().toISOString(),
  phases: [],
  invariants: {},
  errors: []
};
let ownerUserId = null;
let cleaned = false;

try {
  await preflight();
  await seedIsolatedSession();
  await assertPublicSession();
  await runAiPhase({ name: 'warmup_fast', quality: 'fast', count: 12, concurrency: 4, timeoutMs: 120_000 });
  await runAiPhase({ name: 'fast_burst', quality: 'fast', count: 120, concurrency: 60, timeoutMs: 180_000 });
  await runAiPhase({ name: 'balanced_contention', quality: 'balanced', count: 180, concurrency: 90, timeoutMs: 300_000 });
  await runAiPhase({ name: 'accurate_small', quality: 'accurate', count: 20, concurrency: 10, timeoutMs: 300_000 });
  await runReadStorm({ count: 600, concurrency: 100 });
  REPORT.invariants = await auditInvariants();
  const failures = invariantFailures(REPORT.invariants);
  if (failures.length) throw new Error(`Invariant failures: ${failures.join(', ')}`);
} catch (error) {
  REPORT.errors.push({ message: String(error?.message || error), stack: String(error?.stack || '') });
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
    cleaned = true;
  } catch (error) {
    REPORT.errors.push({ message: `Cleanup failed: ${String(error?.message || error)}` });
    process.exitCode = 1;
  }
  REPORT.cleaned = cleaned;
  REPORT.finishedAt = new Date().toISOString();
  await writeFile('load-test-report.json', JSON.stringify(REPORT, null, 2));
  await writeFile('load-test-summary.md', renderMarkdown(REPORT));
  console.log(JSON.stringify(REPORT, null, 2));
}

async function preflight() {
  const health = await d1(`SELECT
      (SELECT COUNT(*) FROM users WHERE status='active') AS active_users,
      (SELECT COUNT(*) FROM organizations WHERE status='active') AS active_orgs,
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('comments','ai_jobs','translations','realtime_events')) AS core_tables`);
  const row = health[0] || {};
  if (Number(row.active_users) < 1 || Number(row.active_orgs) < 1 || Number(row.core_tables) !== 4) {
    throw new Error(`Staging preflight failed: ${JSON.stringify(row)}`);
  }
  REPORT.preflight = row;
}

async function seedIsolatedSession() {
  const owner = await d1(`SELECT om.user_id
    FROM organization_members om
    JOIN users u ON u.id=om.user_id AND u.status='active'
    JOIN organizations o ON o.id=om.organization_id AND o.status='active'
    WHERE om.role='owner' AND om.status='active'
    ORDER BY om.created_at ASC LIMIT 1`);
  ownerUserId = owner[0]?.user_id;
  if (!ownerUserId) throw new Error('No active staging Owner is available for isolated fixture creation.');
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  await d1(`INSERT INTO organizations (id,name,status,created_at,updated_at,deleted_at)
            VALUES (?1,?2,'active',?3,?3,NULL)`, [ORG_ID, `[LOADTEST] ${RUN_ID}`, now]);
  await d1(`INSERT INTO organization_members (organization_id,user_id,role,status,created_at,updated_at,removed_at)
            VALUES (?1,?2,'owner','active',?3,?3,NULL)`, [ORG_ID, ownerUserId, now]);
  await d1(`INSERT OR IGNORE INTO organization_ai_settings
            (organization_id,enabled,moderation_daily_limit,translation_daily_limit,updated_by_user_id,created_at,updated_at)
            VALUES (?1,1,5000,5000,?2,?3,?3)`, [ORG_ID, ownerUserId, now]);
  await d1(`UPDATE organization_ai_settings SET enabled=1,moderation_daily_limit=5000,translation_daily_limit=5000,
            updated_by_user_id=?2,updated_at=?3 WHERE organization_id=?1`, [ORG_ID, ownerUserId, now]);
  await d1(`INSERT INTO live_sessions
            (id,organization_id,created_by_user_id,public_code,title,posting_enabled,comments_visible,
             comment_display_seconds,comment_display_mode,status,created_at,updated_at,started_at,expires_at,ended_at,deleted_at)
            VALUES (?1,?2,?3,?4,?5,1,1,60,'scroll','active',?6,?6,?6,?7,NULL,NULL)`,
            [SESSION_ID, ORG_ID, ownerUserId, PUBLIC_CODE, `[LOADTEST] ${RUN_ID}`, now, expires]);
  await d1(`INSERT OR IGNORE INTO session_ai_settings
            (organization_id,live_session_id,moderation_enabled,translation_enabled,target_language,translation_quality,updated_by_user_id,created_at,updated_at)
            VALUES (?1,?2,1,1,'ja','fast',?3,?4,?4)`, [ORG_ID, SESSION_ID, ownerUserId, now]);
  await d1(`UPDATE session_ai_settings SET moderation_enabled=1,translation_enabled=1,target_language='ja',
            translation_quality='fast',updated_by_user_id=?3,updated_at=?4
            WHERE organization_id=?1 AND live_session_id=?2`, [ORG_ID, SESSION_ID, ownerUserId, now]);
  await d1(`UPDATE session_content_filter_settings SET enabled=0,updated_at=?3
            WHERE organization_id=?1 AND live_session_id=?2`, [ORG_ID, SESSION_ID, now]);
  REPORT.fixture = { organizationId: ORG_ID, liveSessionId: SESSION_ID, publicCode: PUBLIC_CODE };
}

async function assertPublicSession() {
  const response = await fetch(`${ORIGIN}/api/public/sessions/${PUBLIC_CODE}`, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true || !body?.postingEnabled) {
    throw new Error(`Public fixture is unusable: ${response.status} ${JSON.stringify(body)}`);
  }
}

async function runAiPhase({ name, quality, count, concurrency, timeoutMs }) {
  const marker = `${name}-${RUN_ID}`;
  const now = new Date().toISOString();
  await d1(`UPDATE session_ai_settings SET translation_quality=?3,updated_at=?4
            WHERE organization_id=?1 AND live_session_id=?2`, [ORG_ID, SESSION_ID, quality, now]);
  if (await phaseJobCount(marker)) throw new Error(`${name}: marker collision`);
  const started = Date.now();
  const posts = await runPool(count, concurrency, (i) => postComment(marker, i));
  const phase = {
    name, quality, count, concurrency,
    accepted: posts.filter((x) => x.ok).length,
    postElapsedMs: Date.now() - started,
    postLatencyMs: distribution(posts.map((x) => x.latencyMs)),
    httpStatusCounts: countBy(posts, (x) => String(x.status)),
    httpFailureSamples: posts.filter((x) => !x.ok).slice(0, 10),
    ai: null
  };
  REPORT.phases.push(phase);
  if (phase.accepted !== count) throw new Error(`${name}: only ${phase.accepted}/${count} comments were accepted`);
  phase.ai = await waitForAi(marker, phase.accepted * 2, timeoutMs);
  if (phase.ai.totalJobs !== phase.accepted * 2) throw new Error(`${name}: expected ${phase.accepted * 2} AI jobs, found ${phase.ai.totalJobs}`);
  if (phase.ai.nonTerminal !== 0) throw new Error(`${name}: ${phase.ai.nonTerminal} AI jobs remained non-terminal after timeout`);
  if (phase.ai.failed > 0) throw new Error(`${name}: ${phase.ai.failed} AI jobs failed`);
}

async function postComment(marker, i) {
  const started = performance.now();
  const message = `This classroom translation load test ${marker} sentence ${String(i + 1).padStart(4, '0')} explains a simple topic about energy, markets, and public policy for students.`;
  try {
    const response = await fetch(`${ORIGIN}/api/public/sessions/${PUBLIC_CODE}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'CPCV-staging-load-test/2.0' },
      body: JSON.stringify({ nickname: `load-${i + 1}`, message, idempotencyKey: randomUUID() })
    });
    const body = await response.json().catch(() => null);
    return { ok: response.status === 201 && body?.ok === true, status: response.status,
      latencyMs: Math.round(performance.now() - started), error: body?.error || null };
  } catch (error) {
    return { ok: false, status: 0, latencyMs: Math.round(performance.now() - started), error: String(error?.message || error) };
  }
}

async function waitForAi(marker, expectedJobs, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let snapshot;
  do {
    snapshot = await aiSnapshot(marker);
    if (snapshot.totalJobs >= expectedJobs && snapshot.nonTerminal === 0) break;
    await sleep(2500);
  } while (Date.now() < deadline);
  snapshot = await aiSnapshot(marker);
  const rows = await d1(`SELECT j.job_type,j.status,j.attempt_count,j.last_error_code,
      CAST((julianday(COALESCE(j.finished_at,j.updated_at))-julianday(j.created_at))*86400000 AS INTEGER) AS latency_ms
    FROM ai_jobs j JOIN comments c ON c.id=j.comment_id
    WHERE j.live_session_id=?1 AND c.message LIKE ?2 ORDER BY j.created_at,j.id`, [SESSION_ID, `%${marker}%`]);
  const usage = await d1(`SELECT job_type,model,COUNT(*) AS calls,SUM(input_characters) AS input_characters,
      SUM(output_characters) AS output_characters FROM ai_usage_events WHERE job_id IN (
      SELECT j.id FROM ai_jobs j JOIN comments c ON c.id=j.comment_id
      WHERE j.live_session_id=?1 AND c.message LIKE ?2)
    GROUP BY job_type,model ORDER BY job_type,model`, [SESSION_ID, `%${marker}%`]);
  const latencyByType = {};
  for (const type of ['moderation', 'translation']) {
    latencyByType[type] = distribution(rows.filter((r) => r.job_type === type).map((r) => Number(r.latency_ms)).filter(Number.isFinite));
  }
  return { ...snapshot, latencyByType,
    attemptCounts: countBy(rows, (r) => `${r.job_type}:${r.attempt_count}`),
    errorCodes: countBy(rows.filter((r) => r.last_error_code), (r) => `${r.job_type}:${r.last_error_code}`),
    modelCalls: usage };
}

async function aiSnapshot(marker) {
  const rows = await d1(`SELECT COUNT(*) AS total_jobs,
      SUM(CASE WHEN j.status='succeeded' THEN 1 ELSE 0 END) AS succeeded,
      SUM(CASE WHEN j.status='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN j.status NOT IN ('succeeded','failed','skipped') THEN 1 ELSE 0 END) AS non_terminal,
      SUM(CASE WHEN j.attempt_count>1 THEN 1 ELSE 0 END) AS retried,
      MAX(j.attempt_count) AS max_attempts
    FROM ai_jobs j JOIN comments c ON c.id=j.comment_id
    WHERE j.live_session_id=?1 AND c.message LIKE ?2`, [SESSION_ID, `%${marker}%`]);
  const r = rows[0] || {};
  return { totalJobs: Number(r.total_jobs || 0), succeeded: Number(r.succeeded || 0), failed: Number(r.failed || 0),
    nonTerminal: Number(r.non_terminal || 0), retried: Number(r.retried || 0), maxAttempts: Number(r.max_attempts || 0) };
}

async function phaseJobCount(marker) {
  return Number((await d1(`SELECT COUNT(*) AS n FROM ai_jobs j JOIN comments c ON c.id=j.comment_id
    WHERE j.live_session_id=?1 AND c.message LIKE ?2`, [SESSION_ID, `%${marker}%`]))[0]?.n || 0);
}

async function runReadStorm({ count, concurrency }) {
  const started = Date.now();
  const rows = await runPool(count, concurrency, async () => {
    const t = performance.now();
    try {
      const response = await fetch(`${ORIGIN}/api/public/sessions/${PUBLIC_CODE}`, { cache: 'no-store' });
      await response.arrayBuffer();
      return { ok: response.status === 200, status: response.status, latencyMs: Math.round(performance.now() - t) };
    } catch (error) {
      return { ok: false, status: 0, latencyMs: Math.round(performance.now() - t), error: String(error?.message || error) };
    }
  });
  const phase = { name: 'read_storm', count, concurrency, accepted: rows.filter((x) => x.ok).length,
    elapsedMs: Date.now() - started, latencyMs: distribution(rows.map((x) => x.latencyMs)),
    httpStatusCounts: countBy(rows, (x) => String(x.status)), failureSamples: rows.filter((x) => !x.ok).slice(0, 10) };
  REPORT.phases.push(phase);
  if (phase.accepted !== count) throw new Error(`read_storm: ${count - phase.accepted} requests failed`);
}

async function auditInvariants() {
  const comments = Number((await d1(`SELECT COUNT(*) AS n FROM comments WHERE live_session_id=?1`, [SESSION_ID]))[0]?.n || 0);
  const jobs = Number((await d1(`SELECT COUNT(*) AS n FROM ai_jobs WHERE live_session_id=?1`, [SESSION_ID]))[0]?.n || 0);
  const expectedComments = REPORT.phases.filter((p) => p.ai).reduce((sum, p) => sum + p.accepted, 0);
  const expectedJobs = expectedComments * 2;
  const orphanJobs = Number((await d1(`SELECT COUNT(*) AS n FROM ai_jobs j LEFT JOIN comments c ON c.id=j.comment_id
    WHERE j.live_session_id=?1 AND c.id IS NULL`, [SESSION_ID]))[0]?.n || 0);
  const badTranslations = Number((await d1(`SELECT COUNT(*) AS n FROM translations t JOIN ai_jobs j ON j.id=t.job_id
    WHERE j.live_session_id=?1 AND (j.status<>'succeeded' OR j.job_type<>'translation')`, [SESSION_ID]))[0]?.n || 0);
  const stuck = Number((await d1(`SELECT COUNT(*) AS n FROM ai_jobs WHERE live_session_id=?1 AND status IN ('queued','retry','processing')`, [SESSION_ID]))[0]?.n || 0);
  const sequence = (await d1(`SELECT COUNT(*) AS n,COUNT(DISTINCT sequence) AS distinct_n,MIN(sequence) AS min_seq,MAX(sequence) AS max_seq
    FROM realtime_events WHERE live_session_id=?1`, [SESSION_ID]))[0] || {};
  const seqCount = Number(sequence.n || 0), seqDistinct = Number(sequence.distinct_n || 0);
  const seqMin = sequence.min_seq == null ? null : Number(sequence.min_seq), seqMax = sequence.max_seq == null ? null : Number(sequence.max_seq);
  const quick = (await d1(`PRAGMA quick_check`))[0];
  const foreign = await d1(`PRAGMA foreign_key_check`);
  return { comments,expectedComments,jobs,expectedJobs,orphanJobs,badTranslations,stuck,
    realtimeEvents:seqCount,realtimeDistinctSequences:seqDistinct,realtimeMinSequence:seqMin,realtimeMaxSequence:seqMax,
    realtimeGapless: seqCount === 0 || (seqDistinct === seqCount && seqMin === 1 && seqMax === seqCount),
    quickCheck: quick?.quick_check || Object.values(quick || {})[0] || null, foreignKeyViolations: foreign.length };
}

function invariantFailures(inv) {
  const failures = [];
  if (inv.comments !== inv.expectedComments) failures.push(`comments ${inv.comments}/${inv.expectedComments}`);
  if (inv.jobs !== inv.expectedJobs) failures.push(`jobs ${inv.jobs}/${inv.expectedJobs}`);
  if (inv.orphanJobs) failures.push(`orphanJobs=${inv.orphanJobs}`);
  if (inv.badTranslations) failures.push(`badTranslations=${inv.badTranslations}`);
  if (inv.stuck) failures.push(`stuck=${inv.stuck}`);
  if (!inv.realtimeGapless) failures.push('realtime sequence gap');
  if (String(inv.quickCheck).toLowerCase() !== 'ok') failures.push(`quickCheck=${inv.quickCheck}`);
  if (inv.foreignKeyViolations) failures.push(`foreignKeyViolations=${inv.foreignKeyViolations}`);
  return failures;
}

async function cleanup() {
  if (!ownerUserId) return;
  const now = new Date().toISOString();
  await d1(`UPDATE live_sessions SET posting_enabled=0,comments_visible=0,status='deleted',updated_at=?2,ended_at=?2,deleted_at=?2
            WHERE id=?1 AND status='active'`, [SESSION_ID, now]);
  await d1(`UPDATE organization_members SET status='removed',updated_at=?3,removed_at=?3
            WHERE organization_id=?1 AND user_id=?2 AND status='active'`, [ORG_ID, ownerUserId, now]);
  await d1(`UPDATE organizations SET status='deleted',updated_at=?2,deleted_at=?2 WHERE id=?1 AND status='active'`, [ORG_ID, now]);
}

async function d1(sql, params = []) {
  const rendered = renderSql(sql, params);
  const { stdout } = await execFileAsync('npx', ['wrangler', 'd1', 'execute', DATABASE, '--remote', '--config', CONFIG, '--command', rendered, '--json'], {
    env: process.env, maxBuffer: 16 * 1024 * 1024
  });
  let parsed;
  try { parsed = JSON.parse(stdout); }
  catch { throw new Error(`Unable to parse Wrangler D1 JSON output: ${stdout.slice(0, 1000)}`); }
  const blocks = Array.isArray(parsed) ? parsed : [parsed];
  for (const block of blocks) if (block?.success === false) throw new Error(`D1 query failed: ${JSON.stringify(block)}`);
  return blocks.flatMap((block) => Array.isArray(block?.results) ? block.results : []);
}

function renderSql(sql, params) {
  let out = String(sql);
  for (let i = params.length; i >= 1; i -= 1) out = out.replace(new RegExp(`\\?${i}(?!\\d)`, 'g'), sqlLiteral(params[i - 1]));
  if (/\?\d+/.test(out)) throw new Error(`Unbound SQL parameter in: ${out}`);
  return out;
}
function sqlLiteral(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function runPool(count, concurrency, fn) {
  const results = new Array(count); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(count, concurrency) }, async () => {
    while (true) { const i = cursor++; if (i >= count) return; results[i] = await fn(i); }
  }));
  return results;
}
function distribution(values) {
  const nums = values.map(Number).filter(Number.isFinite).sort((a,b) => a-b);
  if (!nums.length) return { count:0,min:null,p50:null,p95:null,p99:null,max:null,mean:null };
  const at = (p) => nums[Math.min(nums.length-1, Math.floor((nums.length-1)*p))];
  return { count:nums.length,min:nums[0],p50:at(.5),p95:at(.95),p99:at(.99),max:nums.at(-1),mean:Math.round(nums.reduce((a,b)=>a+b,0)/nums.length) };
}
function countBy(rows, keyFn) { const out={}; for (const row of rows) { const key=keyFn(row); out[key]=(out[key]||0)+1; } return out; }
function renderMarkdown(report) {
  const lines=[`# CPCV staging AI load test`,``,`Run: \`${report.runId}\``,`Started: ${report.startedAt}`,`Finished: ${report.finishedAt||''}`,``];
  for (const phase of report.phases) lines.push(`## ${phase.name}`,'','```json',JSON.stringify(phase,null,2),'```','');
  lines.push('## Invariants','','```json',JSON.stringify(report.invariants,null,2),'```','');
  if (report.errors.length) lines.push('## Errors','','```json',JSON.stringify(report.errors,null,2),'```');
  return lines.join('\n');
}
function randomPublicCode() { const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=randomBytes(6); return [...bytes].map((b)=>alphabet[b%alphabet.length]).join(''); }
function sleep(ms) { return new Promise((resolve)=>setTimeout(resolve,ms)); }
