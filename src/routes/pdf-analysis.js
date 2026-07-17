import { AuthError } from "../auth/errors.js";
import { authJson } from "../auth/http.js";
import { requireUnsafeRequestProtection } from "../auth/csrf.js";
import { assertOnlyFields, readJsonObject } from "../auth/request.js";
import { BASE_SECURITY_HEADERS } from "../security-headers.js";
import {
  bindPdfToSession,
  buildSessionAnalytics,
  createAnalyticsSnapshot,
  getAnalyticsSnapshot,
  getSessionPdfState,
  listAnalyticsSnapshots,
  rollbackAnalyticsSnapshot,
  updatePdfPageState
} from "../pdf-analysis/repository.js";
import {
  normalizePdfBindingInput,
  normalizePdfPageInput,
  normalizeSnapshotId
} from "../pdf-analysis/validation.js";
import { buildAnalyticsCsv } from "../pdf-analysis/csv.js";

export async function getPrivatePdfState(env, auth, session) {
  const state = await getSessionPdfState(env.DB_V2, auth.organizationId, session.id);
  return authJson({ ok: true, state });
}

export async function bindPrivatePdf(request, env, auth, session) {
  requireActiveSession(session);
  const input = await readJsonObject(request, { maxBytes: 4096 });
  assertOnlyFields(input, ["sha256Hex", "pdfjsFingerprint", "pageCount", "fileSizeBytes"]);
  await requireUnsafeRequestProtection(request, env, auth);
  const normalized = normalizePdfBindingInput(input);
  const previousState = await getSessionPdfState(env.DB_V2, auth.organizationId, session.id);
  let previousSnapshot = null;
  if (previousState && previousState.documentSha256 !== normalized.sha256Hex) {
    previousSnapshot = await createAnalyticsSnapshot(env.DB_V2, {
      organizationId: auth.organizationId,
      liveSessionId: session.id,
      userId: auth.userId,
      audit: userAudit(auth, "analytics.snapshot_created")
    });
  }
  let state;
  try {
    state = await bindPdfToSession(env.DB_V2, {
      organizationId: auth.organizationId,
      liveSessionId: session.id,
      userId: auth.userId,
      ...normalized,
      previousSnapshotId: previousSnapshot?.id || null,
      audit: userAudit(auth, "pdf.bound")
    });
  } catch (error) {
    if (previousSnapshot) {
      try {
        await rollbackAnalyticsSnapshot(env.DB_V2, {
          organizationId: auth.organizationId,
          liveSessionId: session.id,
          snapshotId: previousSnapshot.id,
          auditId: previousSnapshot.auditId
        });
      } catch (rollbackError) {
        console.error("PDF bind snapshot rollback failed", String(rollbackError?.code || rollbackError?.name || "Error"));
        throw new AuthError(500, "PDF_BIND_ROLLBACK_FAILED");
      }
    }
    throw error;
  }
  return authJson({
    ok: true,
    state,
    previousSnapshot: previousSnapshot ? snapshotSummary(previousSnapshot) : null
  }, state.reused ? 200 : 201);
}

export async function updatePrivatePdfPage(request, env, auth, session) {
  requireActiveSession(session);
  const input = await readJsonObject(request, { maxBytes: 2048 });
  assertOnlyFields(input, ["bindingId", "pageNumber", "clientVersion"]);
  await requireUnsafeRequestProtection(request, env, auth);
  const normalized = normalizePdfPageInput(input);
  const state = await updatePdfPageState(env.DB_V2, {
    organizationId: auth.organizationId,
    liveSessionId: session.id,
    userId: auth.userId,
    ...normalized
  });
  return authJson({ ok: true, state });
}

export async function getPrivateAnalytics(env, auth, session) {
  const analytics = await buildSessionAnalytics(env.DB_V2, {
    organizationId: auth.organizationId,
    liveSessionId: session.id
  });
  return authJson({
    ok: true,
    summary: analytics.summary,
    pages: analytics.pages,
    sourceCutoffAt: analytics.sourceCutoffAt,
    minimumGroupSize: analytics.minimumGroupSize
  });
}

export async function getPrivateAnalyticsSnapshots(env, auth, session) {
  const snapshots = await listAnalyticsSnapshots(env.DB_V2, {
    organizationId: auth.organizationId,
    liveSessionId: session.id,
    limit: 20
  });
  return authJson({ ok: true, snapshots });
}

export async function createPrivateAnalyticsSnapshot(request, env, auth, session) {
  const input = await readJsonObject(request, { maxBytes: 512 });
  assertOnlyFields(input, []);
  await requireUnsafeRequestProtection(request, env, auth);
  const snapshot = await createAnalyticsSnapshot(env.DB_V2, {
    organizationId: auth.organizationId,
    liveSessionId: session.id,
    userId: auth.userId,
    audit: userAudit(auth, "analytics.snapshot_created")
  });
  return authJson({
    ok: true,
    snapshot: snapshotSummary(snapshot),
    exportUrl: `/api/private/sessions/${encodeURIComponent(session.id)}/analytics/snapshots/${encodeURIComponent(snapshot.id)}/export`
  }, 201);
}

export async function exportPrivateAnalyticsSnapshot(env, auth, session, rawSnapshotId) {
  const snapshotId = normalizeSnapshotId(rawSnapshotId);
  const snapshot = await getAnalyticsSnapshot(env.DB_V2, {
    organizationId: auth.organizationId,
    liveSessionId: session.id,
    snapshotId
  });
  const csv = buildAnalyticsCsv(snapshot);
  const headers = new Headers({
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="analytics-${session.id}-${snapshot.id}.csv"`,
    "cache-control": "no-store",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-cpcv-analytics-checksum": snapshot.checksumSha256,
    ...BASE_SECURITY_HEADERS
  });
  return new Response(csv, { status: 200, headers });
}

function snapshotSummary(snapshot) {
  return {
    id: snapshot.id,
    sourceCutoffAt: snapshot.sourceCutoffAt,
    minimumGroupSize: snapshot.minimumGroupSize,
    checksumSha256: snapshot.checksumSha256,
    createdAt: snapshot.createdAt,
    retainedUntil: snapshot.retainedUntil
  };
}

function requireActiveSession(session) {
  if (session.status !== "active" || Date.parse(session.expires_at) <= Date.now()) {
    throw new AuthError(410, "SESSION_EXPIRED");
  }
}

function userAudit(auth, action) {
  return {
    organizationId: auth.organizationId,
    actorType: "user",
    actorUserId: auth.userId,
    actorRole: auth.role,
    action
  };
}
