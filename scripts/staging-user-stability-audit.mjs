import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const mode = process.argv[2] || 'seed';
const origin = String(process.env.STAGING_ORIGIN || '').replace(/\/$/, '');
const config = process.env.STAGING_WRANGLER_CONFIG || '.staging-stability.wrangler.toml';
const rawSessionToken = process.env.STABILITY_SESSION_TOKEN || '';
const rawCsrfToken = process.env.STABILITY_CSRF_TOKEN || '';
const dbName = 'class_comment_db_v2_staging';
const secretPath = '/tmp/cpcv-stability-secret.json';
const publicPath = 'stability-fixture.json';
const reportPath = 'stability-runtime-report.json';
const marker = 'stabilityalbatross';
const testTitle = 'Stability audit class';

if (!origin || !rawSessionToken || !rawCsrfToken) throw new Error('staging audit environment is incomplete');

function quote(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function hashToken(value) { return createHash('sha256').update(value).digest('base64url'); }
function fingerprint(row) {
  return createHash('sha256').update(JSON.stringify([row.password_hash, row.password_salt, row.password_changed_at])).digest('hex');
}
function d1(sql) {
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', dbName, '--remote', '--config', config, '--command', sql, '--json'], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`D1 failed: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout || '[]');
  const packets = Array.isArray(parsed) ? parsed : [parsed];
  const rows = [];
  for (const packet of packets) {
    if (Array.isArray(packet?.results)) rows.push(...packet.results);
    else if (Array.isArray(packet?.result?.[0]?.results)) rows.push(...packet.result[0].results);
  }
  return rows;
}
async function api(path, { method = 'GET', body, cookie = true } = {}) {
  const headers = { accept: 'application/json', origin };
  if (cookie) headers.cookie = `__Host-cpcv_session=${rawSessionToken}`;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['x-csrf-token'] = rawCsrfToken;
  }
  const response = await fetch(`${origin}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual'
  });
  let data = null;
  try { data = await response.json(); } catch { data = { raw: await response.text().catch(() => '') }; }
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data)}`);
  return { response, data };
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function seed() {
  // Remove only artifacts created by this audit harness in earlier interrupted runs.
  d1("DELETE FROM auth_sessions WHERE id LIKE 'as_stability_%'");

  const owners = d1(`SELECT om.organization_id, om.user_id, u.password_hash, u.password_salt, u.password_changed_at
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    JOIN users u ON u.id = om.user_id
    WHERE om.role='owner' AND om.status='active' AND o.status='active' AND u.status='active'
    ORDER BY o.created_at ASC LIMIT 1`);
  if (owners.length !== 1) throw new Error('No active Owner is available in staging');
  const owner = owners[0];
  const authSessionId = `as_stability_${randomBytes(8).toString('hex')}`;
  const now = new Date();
  const createdAt = now.toISOString();
  const idleExpiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const absoluteExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  d1(`INSERT INTO auth_sessions (id, organization_id, user_id, token_hash, csrf_token_hash, created_at, last_seen_at, idle_expires_at, absolute_expires_at, revoked_at)
      VALUES (${quote(authSessionId)}, ${quote(owner.organization_id)}, ${quote(owner.user_id)}, ${quote(hashToken(rawSessionToken))}, ${quote(hashToken(rawCsrfToken))}, ${quote(createdAt)}, ${quote(createdAt)}, ${quote(idleExpiresAt)}, ${quote(absoluteExpiresAt)}, NULL)`);

  // Clean stale audit classes through the application so the legacy projection is cleaned too.
  const staleSessions = d1(`SELECT id FROM live_sessions WHERE organization_id=${quote(owner.organization_id)} AND status='active' AND title=${quote(testTitle)} ORDER BY created_at`);
  for (const stale of staleSessions) {
    await api(`/api/private/sessions/${encodeURIComponent(stale.id)}`, { method: 'DELETE', body: {} });
  }

  const passwordFingerprint = fingerprint(owner);
  const sessionResult = await api('/api/private/sessions', { method: 'POST', body: { title: testTitle, moderationMode: 'off' } });
  const liveSessionId = String(sessionResult.data.sessionId || '');
  const publicCode = String(sessionResult.data.publicCode || '');
  if (!liveSessionId || !publicCode) throw new Error(`temporary session creation failed: ${JSON.stringify(sessionResult.data)}`);

  // Persist cleanup metadata immediately. Any later failure can now remove both the auth row and class.
  writeFileSync(secretPath, JSON.stringify({ authSessionId, userId: owner.user_id, organizationId: owner.organization_id, passwordFingerprint, liveSessionId, publicCode }, null, 2));
  writeFileSync(publicPath, JSON.stringify({ liveSessionId, publicCode }, null, 2));
  writeFileSync(reportPath, JSON.stringify({ seeded: false, liveSessionId, publicCode }, null, 2));

  await api('/api/org/ai-settings', {
    method: 'PATCH', body: { enabled: true, moderationDailyLimit: 1000, translationDailyLimit: 1000 }
  });
  await api(`/api/private/sessions/${encodeURIComponent(liveSessionId)}/ai-settings`, {
    method: 'PATCH', body: { moderationEnabled: false, translationEnabled: true, targetLanguage: 'ja', translationQuality: 'fast' }
  });

  const messages = [
    `Energy markets change during classroom discussion ${marker} cedar.`,
    `Energy policy can change during classroom discussion ${marker} maple.`,
    `La energía solar es importante para el futuro ${marker} olivo.`,
    `La energía eólica puede ayudar al futuro ${marker} roble.`
  ];
  for (let index = 0; index < messages.length; index += 1) {
    const getResponse = await fetch(`${origin}/api/public/sessions/${publicCode}`, { headers: { accept: 'application/json' } });
    if (!getResponse.ok) throw new Error(`public participant bootstrap failed ${getResponse.status}`);
    const participantCookie = getResponse.headers.get('set-cookie') || '';
    if (!participantCookie) throw new Error('participant cookie was not issued');
    const post = await fetch(`${origin}/api/public/sessions/${publicCode}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: participantCookie.split(';')[0] },
      body: JSON.stringify({ nickname: `tester${String.fromCharCode(97 + index)}`, message: messages[index], idempotencyKey: `stable-${marker}-${String.fromCharCode(97 + index)}`, clientId: `browser-${String.fromCharCode(97 + index)}` })
    });
    const body = await post.json().catch(() => ({}));
    if (!post.ok) throw new Error(`public post failed ${post.status}: ${JSON.stringify(body)}`);
  }

  let languageRows = [];
  let jobRows = [];
  const deadline = Date.now() + 75_000;
  while (Date.now() < deadline) {
    languageRows = d1(`SELECT id, detected_language FROM comments WHERE live_session_id=${quote(liveSessionId)} AND message LIKE ${quote(`%${marker}%`)} ORDER BY created_at`);
    jobRows = d1(`SELECT j.id, j.job_type, j.status, j.attempt_count, j.last_error_code,
        (SELECT u.model FROM ai_usage_events u WHERE u.job_id=j.id ORDER BY u.created_at DESC LIMIT 1) AS model
      FROM ai_jobs j
      WHERE j.live_session_id=${quote(liveSessionId)} AND j.comment_id IN (SELECT id FROM comments WHERE live_session_id=${quote(liveSessionId)} AND message LIKE ${quote(`%${marker}%`)})
      ORDER BY j.created_at`);
    const translations = jobRows.filter((row) => row.job_type === 'translation');
    const terminal = translations.length >= 4 && translations.every((row) => ['succeeded','failed','skipped'].includes(String(row.status)));
    if (languageRows.length === 4 && terminal) break;
    await sleep(2000);
  }

  const languages = languageRows.map((row) => String(row.detected_language));
  const translations = jobRows.filter((row) => row.job_type === 'translation');
  if (languages.filter((value) => value === 'en').length !== 2) throw new Error(`English routing failed: ${JSON.stringify(languageRows)}`);
  if (languages.filter((value) => value === 'es').length !== 2) throw new Error(`Spanish routing failed: ${JSON.stringify(languageRows)}`);
  if (translations.length !== 4 || translations.some((row) => row.status !== 'succeeded')) throw new Error(`translation jobs failed: ${JSON.stringify(jobRows)}`);
  if (translations.some((row) => row.model !== '@cf/meta/m2m100-1.2b')) throw new Error(`fast multilingual routing did not stay on M2M100: ${JSON.stringify(jobRows)}`);
  if (translations.some((row) => Number(row.attempt_count) !== 1)) throw new Error(`translation retried unexpectedly: ${JSON.stringify(jobRows)}`);

  writeFileSync(reportPath, JSON.stringify({ seeded: true, publicPosts: messages.length, languages, translationJobs: translations.length, translationModel: '@cf/meta/m2m100-1.2b' }, null, 2));
  console.log(JSON.stringify({ ok: true, liveSessionId, publicCode, languages, translationJobs: translations.length }));
}

async function verify() {
  const secret = JSON.parse(readFileSync(secretPath, 'utf8'));
  const rows = d1(`SELECT password_hash, password_salt, password_changed_at FROM users WHERE id=${quote(secret.userId)} LIMIT 1`);
  if (rows.length !== 1) throw new Error('Owner disappeared during staging audit');
  const unchanged = fingerprint(rows[0]) === secret.passwordFingerprint;
  if (!unchanged) throw new Error('Password material changed during ordinary authenticated navigation');
  const current = JSON.parse(readFileSync(reportPath, 'utf8'));
  writeFileSync(reportPath, JSON.stringify({ ...current, passwordUnchangedAcrossNavigation: true }, null, 2));
  console.log(JSON.stringify({ ok: true, passwordUnchangedAcrossNavigation: true }));
}

async function cleanup() {
  let secret;
  try { secret = JSON.parse(readFileSync(secretPath, 'utf8')); } catch {
    try { d1("DELETE FROM auth_sessions WHERE id LIKE 'as_stability_%'"); } catch (error) { console.error(String(error)); }
    return;
  }
  try { await api(`/api/private/sessions/${encodeURIComponent(secret.liveSessionId)}`, { method: 'DELETE', body: {} }); } catch (error) { console.error(String(error)); }
  try { d1(`DELETE FROM auth_sessions WHERE id=${quote(secret.authSessionId)}`); } catch (error) { console.error(String(error)); }
}

if (mode === 'seed') await seed();
else if (mode === 'verify') await verify();
else if (mode === 'cleanup') await cleanup();
else throw new Error(`unknown mode: ${mode}`);
