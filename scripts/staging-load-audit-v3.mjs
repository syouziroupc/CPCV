import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';

const execFileAsync = promisify(execFile);
const ORIGIN = String(process.env.STAGING_ORIGIN || '').replace(/\/$/, '');
const CONFIG = String(process.env.STAGING_WRANGLER_CONFIG || '.staging-load.wrangler.toml');
const DB = 'DB_V2';
const RUN_TAG = [...randomBytes(8)].map((b) => String.fromCharCode(97 + (b % 26))).join('');
const ORG_ID = `org_load_${RUN_TAG}`;
const SESSION_ID = `sess_load_${RUN_TAG}`;
const PUBLIC_CODE = publicCode();
const report = { runTag: RUN_TAG, origin: ORIGIN, startedAt: new Date().toISOString(), phases: [], errors: [] };
let ownerUserId = null;

if (!ORIGIN) throw new Error('STAGING_ORIGIN is required');

try {
  await preflight();
  await seed();
  await assertPublicSession();

  await setAi(false, 'fast');
  await phase({ name: 'baseline_no_ai', kind: 'en', count: 40, concurrency: 10, expectedJobsPerComment: 0, timeoutMs: 30_000 });

  await setAi(true, 'fast');
  await phase({ name: 'warmup_fast_en', kind: 'en', count: 12, concurrency: 4, expectedJobsPerComment: 2, timeoutMs: 150_000 });
  await phase({ name: 'fast_burst_en', kind: 'en', count: 120, concurrency: 60, expectedJobsPerComment: 2, timeoutMs: 240_000 });

  await sleep(65_000);
  await setAi(true, 'balanced');
  await phase({ name: 'balanced_unknown_es', kind: 'es', count: 100, concurrency: 50, expectedJobsPerComment: 2, timeoutMs: 300_000 });

  await sleep(65_000);
  await setAi(true, 'accurate');
  await phase({ name: 'accurate_unknown_es', kind: 'es', count: 40, concurrency: 20, expectedJobsPerComment: 2, timeoutMs: 300_000 });

  await readStorm(600, 100);
  report.invariants = await invariants();
} catch (error) {
  report.errors.push(errorRecord(error));
  process.exitCode = 1;
} finally {
  try { await cleanup(); report.cleaned = true; }
  catch (error) { report.cleaned = false; report.errors.push({ phase: 'cleanup', ...errorRecord(error) }); process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  await writeFile('load-v3-report.json', JSON.stringify(report, null, 2));
  await writeFile('load-v3-summary.md', markdown(report));
  console.log(JSON.stringify(report, null, 2));
}

async function preflight() {
  const rows = await d1(`SELECT
    (SELECT COUNT(*) FROM users WHERE status='active') AS active_users,
    (SELECT COUNT(*) FROM organizations WHERE status='active') AS active_orgs,
    (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('comments','ai_jobs','translations','realtime_events')) AS core_tables`);
  const row = rows[0] || {};
  report.preflight = row;
  if (Number(row.active_users) < 1 || Number(row.active_orgs) < 1 || Number(row.core_tables) !== 4) {
    throw new Error(`staging preflight failed: ${JSON.stringify(row)}`);
  }
}

async function seed() {
  const owner = await d1(`SELECT om.user_id FROM organization_members om
    JOIN users u ON u.id=om.user_id AND u.status='active'
    JOIN organizations o ON o.id=om.organization_id AND o.status='active'
    WHERE om.role='owner' AND om.status='active' ORDER BY om.created_at LIMIT 1`);
  ownerUserId = owner[0]?.user_id;
  if (!ownerUserId) throw new Error('no active staging Owner');
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
  await d1(`INSERT INTO organizations (id,name,status,created_at,updated_at,deleted_at) VALUES (?1,?2,'active',?3,?3,NULL)`, [ORG_ID, `[LOADTEST] ${RUN_TAG}`, now]);
  await d1(`INSERT INTO organization_members (organization_id,user_id,role,status,created_at,updated_at,removed_at) VALUES (?1,?2,'owner','active',?3,?3,NULL)`, [ORG_ID, ownerUserId, now]);
  await d1(`INSERT OR IGNORE INTO organization_ai_settings (organization_id,enabled,moderation_daily_limit,translation_daily_limit,updated_by_user_id,created_at,updated_at) VALUES (?1,1,5000,5000,?2,?3,?3)`, [ORG_ID, ownerUserId, now]);
  await d1(`UPDATE organization_ai_settings SET enabled=1,moderation_daily_limit=5000,translation_daily_limit=5000,updated_by_user_id=?2,updated_at=?3 WHERE organization_id=?1`, [ORG_ID, ownerUserId, now]);
  await d1(`INSERT INTO live_sessions (id,organization_id,created_by_user_id,public_code,title,posting_enabled,comments_visible,comment_display_seconds,comment_display_mode,status,created_at,updated_at,started_at,expires_at,ended_at,deleted_at) VALUES (?1,?2,?3,?4,?5,1,1,60,'scroll','active',?6,?6,?6,?7,NULL,NULL)`, [SESSION_ID, ORG_ID, ownerUserId, PUBLIC_CODE, `[LOADTEST] ${RUN_TAG}`, now, expires]);
  await d1(`INSERT OR IGNORE INTO session_ai_settings (organization_id,live_session_id,moderation_enabled,translation_enabled,target_language,translation_quality,updated_by_user_id,created_at,updated_at) VALUES (?1,?2,1,1,'ja','fast',?3,?4,?4)`, [ORG_ID, SESSION_ID, ownerUserId, now]);
  await d1(`UPDATE session_ai_settings SET moderation_enabled=1,translation_enabled=1,target_language='ja',translation_quality='fast',updated_by_user_id=?3,updated_at=?4 WHERE organization_id=?1 AND live_session_id=?2`, [ORG_ID, SESSION_ID, ownerUserId, now]);
  await d1(`UPDATE session_content_filter_settings SET enabled=0,translation_filter_enabled=0,updated_at=?3 WHERE organization_id=?1 AND live_session_id=?2`, [ORG_ID, SESSION_ID, now]);
  report.fixture = { organizationId: ORG_ID, sessionId: SESSION_ID, publicCode: PUBLIC_CODE };
}

async function assertPublicSession() {
  const r = await fetch(`${ORIGIN}/api/public/sessions/${PUBLIC_CODE}`, { cache: 'no-store' });
  const body = await r.json().catch(() => null);
  if (!r.ok || body?.ok !== true || !body?.postingEnabled) throw new Error(`fixture unavailable ${r.status} ${JSON.stringify(body)}`);
}

async function setAi(enabled, quality) {
  const now = new Date().toISOString();
  await d1(`UPDATE organization_ai_settings SET enabled=?2,updated_at=?3 WHERE organization_id=?1`, [ORG_ID, enabled ? 1 : 0, now]);
  await d1(`UPDATE session_ai_settings SET moderation_enabled=1,translation_enabled=1,translation_quality=?3,updated_at=?4 WHERE organization_id=?1 AND live_session_id=?2`, [ORG_ID, SESSION_ID, quality, now]);
}

async function phase({ name, kind, count, concurrency, expectedJobsPerComment, timeoutMs }) {
  const marker = `${name.replaceAll('_','')}${RUN_TAG}`;
  const started = Date.now();
  const posts = await pool(count, concurrency, (i) => post(kind, marker, i));
  const accepted = posts.filter((x) => x.ok).length;
  const result = {
    name, kind, count, concurrency, accepted, rejected: count - accepted,
    elapsedMs: Date.now() - started,
    postLatencyMs: distribution(posts.map((x) => x.latencyMs)),
    httpStatusCounts: counts(posts, (x) => String(x.status)),
    failures: posts.filter((x) => !x.ok).slice(0, 20)
  };
  report.phases.push(result);
  if (accepted === 0) { result.error = 'no accepted comments'; return; }
  if (expectedJobsPerComment === 0) {
    await sleep(2500);
    result.ai = await aiSnapshot(marker);
    return;
  }
  result.ai = await waitAi(marker, accepted * expectedJobsPerComment, timeoutMs);
}

async function post(kind, marker, i) {
  const t = performance.now();
  const suffix = alpha(i);
  const message = kind === 'es'
    ? `La energía solar es importante para el futuro. referencia ${marker}${suffix}.`
    : `Energy markets change during classroom discussion. reference ${marker}${suffix}.`;
  try {
    const r = await fetch(`${ORIGIN}/api/public/sessions/${PUBLIC_CODE}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'CPCV-load-audit-v3' },
      body: JSON.stringify({ nickname: `load${suffix}`, message, idempotencyKey: randomUUID() })
    });
    const body = await r.json().catch(() => null);
    return { ok: r.status === 201 && body?.ok === true, status: r.status, latencyMs: Math.round(performance.now() - t), error: body?.error || null, requestId: body?.requestId || null };
  } catch (error) {
    return { ok: false, status: 0, latencyMs: Math.round(performance.now() - t), error: String(error?.message || error) };
  }
}

async function waitAi(marker, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let snap = {};
  while (Date.now() < deadline) {
    snap = await aiSnapshot(marker);
    if (snap.totalJobs >= expected && snap.nonTerminal === 0) break;
    await sleep(3000);
  }
  snap = await aiSnapshot(marker);
  const rows = await d1(`SELECT j.job_type,j.status,j.attempt_count,j.last_error_code,
    CAST((julianday(COALESCE(j.finished_at,j.updated_at))-julianday(j.created_at))*86400000 AS INTEGER) AS latency_ms
    FROM ai_jobs j JOIN comments c ON c.id=j.comment_id
    WHERE j.live_session_id=?1 AND c.message LIKE ?2 ORDER BY j.created_at,j.id`, [SESSION_ID, `%${marker}%`]);
  const usage = await d1(`SELECT job_type,model,COUNT(*) AS calls,SUM(input_characters) AS input_characters,SUM(output_characters) AS output_characters
    FROM ai_usage_events WHERE job_id IN (SELECT j.id FROM ai_jobs j JOIN comments c ON c.id=j.comment_id WHERE j.live_session_id=?1 AND c.message LIKE ?2)
    GROUP BY job_type,model ORDER BY job_type,model`, [SESSION_ID, `%${marker}%`]);
  const translations = await d1(`SELECT COUNT(*) AS n FROM translations t JOIN ai_jobs j ON j.id=t.job_id JOIN comments c ON c.id=j.comment_id WHERE j.live_session_id=?1 AND c.message LIKE ?2`, [SESSION_ID, `%${marker}%`]);
  return {
    ...snap,
    expectedJobs: expected,
    translations: Number(translations[0]?.n || 0),
    latencyByType: {
      moderation: distribution(rows.filter((r) => r.job_type === 'moderation').map((r) => Number(r.latency_ms))),
      translation: distribution(rows.filter((r) => r.job_type === 'translation').map((r) => Number(r.latency_ms)))
    },
    attempts: counts(rows, (r) => `${r.job_type}:${r.attempt_count}`),
    errorCodes: counts(rows.filter((r) => r.last_error_code), (r) => `${r.job_type}:${r.last_error_code}`),
    modelCalls: usage
  };
}

async function aiSnapshot(marker) {
  const rows = await d1(`SELECT COUNT(*) AS total_jobs,
    SUM(CASE WHEN j.status='succeeded' THEN 1 ELSE 0 END) AS succeeded,
    SUM(CASE WHEN j.status='failed' THEN 1 ELSE 0 END) AS failed,
    SUM(CASE WHEN j.status='skipped' THEN 1 ELSE 0 END) AS skipped,
    SUM(CASE WHEN j.status NOT IN ('succeeded','failed','skipped') THEN 1 ELSE 0 END) AS non_terminal,
    SUM(CASE WHEN j.attempt_count>1 THEN 1 ELSE 0 END) AS retried, MAX(j.attempt_count) AS max_attempts
    FROM ai_jobs j JOIN comments c ON c.id=j.comment_id WHERE j.live_session_id=?1 AND c.message LIKE ?2`, [SESSION_ID, `%${marker}%`]);
  const r = rows[0] || {};
  return { totalJobs:Number(r.total_jobs||0), succeeded:Number(r.succeeded||0), failed:Number(r.failed||0), skipped:Number(r.skipped||0), nonTerminal:Number(r.non_terminal||0), retried:Number(r.retried||0), maxAttempts:Number(r.max_attempts||0) };
}

async function readStorm(count, concurrency) {
  const started = Date.now();
  const rows = await pool(count, concurrency, async () => {
    const t = performance.now();
    try { const r = await fetch(`${ORIGIN}/api/public/sessions/${PUBLIC_CODE}`, { cache:'no-store' }); await r.arrayBuffer(); return { ok:r.status===200,status:r.status,latencyMs:Math.round(performance.now()-t) }; }
    catch (error) { return { ok:false,status:0,latencyMs:Math.round(performance.now()-t),error:String(error?.message||error) }; }
  });
  report.phases.push({ name:'read_storm',count,concurrency,accepted:rows.filter((x)=>x.ok).length,elapsedMs:Date.now()-started,latencyMs:distribution(rows.map((x)=>x.latencyMs)),httpStatusCounts:counts(rows,(x)=>String(x.status)),failures:rows.filter((x)=>!x.ok).slice(0,20) });
}

async function invariants() {
  const phaseComments = report.phases.filter((p) => p.name !== 'read_storm').reduce((n,p)=>n+(p.accepted||0),0);
  const aiComments = report.phases.filter((p) => p.ai && p.name !== 'baseline_no_ai').reduce((n,p)=>n+(p.accepted||0),0);
  const comments = Number((await d1(`SELECT COUNT(*) AS n FROM comments WHERE live_session_id=?1`, [SESSION_ID]))[0]?.n||0);
  const jobs = Number((await d1(`SELECT COUNT(*) AS n FROM ai_jobs WHERE live_session_id=?1`, [SESSION_ID]))[0]?.n||0);
  const stuck = Number((await d1(`SELECT COUNT(*) AS n FROM ai_jobs WHERE live_session_id=?1 AND status IN ('queued','retry','processing')`, [SESSION_ID]))[0]?.n||0);
  const orphan = Number((await d1(`SELECT COUNT(*) AS n FROM ai_jobs j LEFT JOIN comments c ON c.id=j.comment_id WHERE j.live_session_id=?1 AND c.id IS NULL`, [SESSION_ID]))[0]?.n||0);
  const seq=(await d1(`SELECT COUNT(*) AS n,COUNT(DISTINCT sequence) AS d,MIN(sequence) AS mi,MAX(sequence) AS ma FROM realtime_events WHERE live_session_id=?1`,[SESSION_ID]))[0]||{};
  const quick=(await d1('PRAGMA quick_check'))[0]||{};
  const fk=await d1('PRAGMA foreign_key_check');
  const n=Number(seq.n||0), d=Number(seq.d||0), mi=seq.mi==null?null:Number(seq.mi), ma=seq.ma==null?null:Number(seq.ma);
  return { comments,expectedComments:phaseComments,jobs,expectedJobs:aiComments*2,stuck,orphan,realtimeEvents:n,realtimeGapless:n===0||(d===n&&mi===1&&ma===n),quickCheck:quick.quick_check||Object.values(quick)[0]||null,foreignKeyViolations:fk.length };
}

async function cleanup() {
  if (!ownerUserId) return;
  const now=new Date().toISOString();
  await d1(`UPDATE live_sessions SET posting_enabled=0,comments_visible=0,status='deleted',updated_at=?2,ended_at=COALESCE(ended_at,?2),deleted_at=?2 WHERE id=?1`,[SESSION_ID,now]);
  await d1(`UPDATE organization_members SET status='removed',updated_at=?3,removed_at=?3 WHERE organization_id=?1 AND user_id=?2 AND status='active'`,[ORG_ID,ownerUserId,now]);
  await d1(`UPDATE organizations SET status='deleted',updated_at=?2,deleted_at=?2 WHERE id=?1 AND status='active'`,[ORG_ID,now]);
}

async function d1(sql, params=[]) {
  const command=bindSql(sql,params);
  const {stdout}=await execFileAsync('npx',['wrangler','d1','execute',DB,'--remote','--yes','--config',CONFIG,'--command',command,'--json'],{env:process.env,maxBuffer:32*1024*1024});
  const parsed=JSON.parse(stdout); const blocks=Array.isArray(parsed)?parsed:[parsed];
  for(const b of blocks) if(b?.success===false) throw new Error(`D1 query failed ${JSON.stringify(b)}`);
  return blocks.flatMap((b)=>Array.isArray(b?.results)?b.results:[]);
}
function bindSql(sql,params){let out=String(sql);for(let i=params.length;i>=1;i--)out=out.replace(new RegExp(`\\?${i}(?!\\d)`,'g'),literal(params[i-1]));if(/\?\d+/.test(out))throw new Error(`unbound sql ${out}`);return out;}
function literal(v){if(v==null)return'NULL';if(typeof v==='number'&&Number.isFinite(v))return String(v);return `'${String(v).replaceAll("'","''")}'`;}
async function pool(count,concurrency,fn){const out=new Array(count);let cursor=0;await Promise.all(Array.from({length:Math.min(count,concurrency)},async()=>{while(true){const i=cursor++;if(i>=count)return;out[i]=await fn(i);}}));return out;}
function distribution(values){const a=values.map(Number).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return{count:0,min:null,p50:null,p95:null,p99:null,max:null,mean:null};const q=(p)=>a[Math.min(a.length-1,Math.floor((a.length-1)*p))];return{count:a.length,min:a[0],p50:q(.5),p95:q(.95),p99:q(.99),max:a.at(-1),mean:Math.round(a.reduce((x,y)=>x+y,0)/a.length)};}
function counts(rows,key){const out={};for(const r of rows){const k=key(r);out[k]=(out[k]||0)+1;}return out;}
function alpha(i){let n=i+1,s='';while(n){n--;s=String.fromCharCode(97+n%26)+s;n=Math.floor(n/26);}return s;}
function publicCode(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',b=randomBytes(6);return[...b].map((x)=>a[x%a.length]).join('');}
function sleep(ms){return new Promise((r)=>setTimeout(r,ms));}
function errorRecord(error){return{message:String(error?.message||error),stack:String(error?.stack||'')};}
function markdown(r){return `# CPCV staging load audit v3\n\nRun: ${r.runTag}\n\n## Phases\n\n${r.phases.map((p)=>`### ${p.name}\n\n\`\`\`json\n${JSON.stringify(p,null,2)}\n\`\`\``).join('\n\n')}\n\n## Invariants\n\n\`\`\`json\n${JSON.stringify(r.invariants||{},null,2)}\n\`\`\`\n\n## Errors\n\n\`\`\`json\n${JSON.stringify(r.errors||[],null,2)}\n\`\`\`\n`;}
