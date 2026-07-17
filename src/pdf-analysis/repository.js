import { AuthError } from "../auth/errors.js";
import { makeId } from "../auth/request.js";

const MINIMUM_GROUP_SIZE = 3;
const ANALYTICS_RETENTION_DAYS = 180;
const UNDERSTANDING_RETENTION_DAYS = 180;
const PDF_ANALYTICS_METADATA_RETENTION_DAYS = 180;
const MAX_DWELL_GAP_SECONDS = 30 * 60;
const SIGNAL_UPDATE_INTERVAL_MS = 2_000;

export async function bindPdfToSession(db, input) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const access = await db.prepare(
    `SELECT ls.id
     FROM live_sessions ls
     JOIN organization_members om
       ON om.organization_id = ls.organization_id
      AND om.user_id = ?3
      AND om.status = 'active'
     WHERE ls.id = ?1 AND ls.organization_id = ?2
       AND ls.status = 'active' AND ls.expires_at > ?4
     LIMIT 1`
  ).bind(input.liveSessionId, input.organizationId, input.userId, nowIso).first();
  if (!access) throw new AuthError(410, "SESSION_EXPIRED");

  let document = await db.prepare(
    `SELECT id, page_count, file_size_bytes, pdfjs_fingerprint
     FROM pdf_documents
     WHERE organization_id = ?1 AND sha256_hex = ?2 LIMIT 1`
  ).bind(input.organizationId, input.sha256Hex).first();

  let insertedDocumentId = null;
  if (document) {
    if (Number(document.page_count) !== input.pageCount || Number(document.file_size_bytes) !== input.fileSizeBytes) {
      throw new AuthError(409, "PDF_METADATA_CONFLICT");
    }
    await db.prepare(
      `UPDATE pdf_documents
       SET last_seen_at = ?1,
           pdfjs_fingerprint = COALESCE(pdfjs_fingerprint, ?2)
       WHERE id = ?3 AND organization_id = ?4`
    ).bind(nowIso, input.pdfjsFingerprint, document.id, input.organizationId).run();
  } else {
    const candidateId = makeId("pdf");
    await db.prepare(
      `INSERT INTO pdf_documents (
         id, organization_id, sha256_hex, pdfjs_fingerprint,
         page_count, file_size_bytes, created_by_user_id, created_at, last_seen_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
       ON CONFLICT(organization_id, sha256_hex) DO NOTHING`
    ).bind(
      candidateId,
      input.organizationId,
      input.sha256Hex,
      input.pdfjsFingerprint,
      input.pageCount,
      input.fileSizeBytes,
      input.userId,
      nowIso
    ).run();
    document = await db.prepare(
      `SELECT id, page_count, file_size_bytes, pdfjs_fingerprint
       FROM pdf_documents
       WHERE organization_id = ?1 AND sha256_hex = ?2 LIMIT 1`
    ).bind(input.organizationId, input.sha256Hex).first();
    if (!document) throw new AuthError(500, "PDF_DOCUMENT_WRITE_FAILED");
    if (Number(document.page_count) !== input.pageCount || Number(document.file_size_bytes) !== input.fileSizeBytes) {
      throw new AuthError(409, "PDF_METADATA_CONFLICT");
    }
    if (document.id === candidateId) insertedDocumentId = candidateId;
  }

  const current = await getSessionPdfState(db, input.organizationId, input.liveSessionId);
  if (current && current.pdfDocumentId === document.id) {
    return { ...current, reused: true };
  }

  const bindingId = makeId("pbd");
  const eventId = makeId("pge");
  try {
    await db.batch([
      db.prepare(
        `UPDATE session_pdf_bindings
         SET replaced_at = ?1
         WHERE organization_id = ?2 AND live_session_id = ?3 AND replaced_at IS NULL`
      ).bind(nowIso, input.organizationId, input.liveSessionId),
      db.prepare(
        `INSERT INTO session_pdf_bindings (
           id, organization_id, live_session_id, pdf_document_id,
           bound_by_user_id, bound_at, replaced_at
         )
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, NULL
         FROM live_sessions
         WHERE id = ?3 AND organization_id = ?2 AND status = 'active' AND expires_at > ?6`
      ).bind(bindingId, input.organizationId, input.liveSessionId, document.id, input.userId, nowIso),
      db.prepare(
        `INSERT INTO pdf_pages (
           pdf_document_id, page_number, organization_id, first_seen_at, last_seen_at
         ) VALUES (?1, 1, ?2, ?3, ?3)
         ON CONFLICT(pdf_document_id, page_number)
         DO UPDATE SET last_seen_at = excluded.last_seen_at`
      ).bind(document.id, input.organizationId, nowIso),
      db.prepare(
        `INSERT INTO session_pdf_state (
           organization_id, live_session_id, binding_id, pdf_document_id,
           current_page, page_count, client_version, updated_by_user_id, updated_at
         ) VALUES (?1, ?2, ?3, ?4, 1, ?5, 1, ?6, ?7)
         ON CONFLICT(live_session_id) DO UPDATE SET
           organization_id = excluded.organization_id,
           binding_id = excluded.binding_id,
           pdf_document_id = excluded.pdf_document_id,
           current_page = 1,
           page_count = excluded.page_count,
           client_version = 1,
           updated_by_user_id = excluded.updated_by_user_id,
           updated_at = excluded.updated_at`
      ).bind(input.organizationId, input.liveSessionId, bindingId, document.id, input.pageCount, input.userId, nowIso),
      db.prepare(
        `INSERT INTO pdf_page_events (
           id, organization_id, live_session_id, binding_id, pdf_document_id,
           page_number, client_version, event_type, source_user_id, occurred_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, 1, 1, 'bound', ?6, ?7)`
      ).bind(eventId, input.organizationId, input.liveSessionId, bindingId, document.id, input.userId, nowIso)
    ]);
  } catch (error) {
    if (insertedDocumentId) {
      await db.prepare(
        `DELETE FROM pdf_documents
         WHERE id = ?1 AND organization_id = ?2
           AND NOT EXISTS (SELECT 1 FROM session_pdf_bindings b WHERE b.pdf_document_id = pdf_documents.id)`
      ).bind(insertedDocumentId, input.organizationId).run().catch(() => {});
    }
    throw error;
  }

  const state = await getSessionPdfState(db, input.organizationId, input.liveSessionId);
  if (!state || state.bindingId !== bindingId) throw new AuthError(409, "PDF_BINDING_CONFLICT");
  return { ...state, reused: false };
}

export async function updatePdfPageState(db, input) {
  const current = await getSessionPdfState(db, input.organizationId, input.liveSessionId);
  if (!current) throw new AuthError(409, "PDF_NOT_BOUND");
  if (current.bindingId !== input.bindingId) throw new AuthError(409, "PDF_BINDING_STALE");
  if (input.pageNumber > current.pageCount) throw new AuthError(400, "PDF_PAGE_INVALID");
  if (input.clientVersion <= current.clientVersion) return { ...current, accepted: false, stale: true };

  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  if (input.pageNumber === current.currentPage) {
    await db.prepare(
      `UPDATE session_pdf_state
       SET client_version = ?1, updated_by_user_id = ?2, updated_at = ?3
       WHERE organization_id = ?4 AND live_session_id = ?5 AND binding_id = ?6
         AND client_version < ?1`
    ).bind(
      input.clientVersion,
      input.userId,
      nowIso,
      input.organizationId,
      input.liveSessionId,
      input.bindingId
    ).run();
  } else {
    const eventId = makeId("pge");
    await db.batch([
      db.prepare(
        `INSERT INTO pdf_pages (
           pdf_document_id, page_number, organization_id, first_seen_at, last_seen_at
         ) VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(pdf_document_id, page_number)
         DO UPDATE SET last_seen_at = excluded.last_seen_at`
      ).bind(current.pdfDocumentId, input.pageNumber, input.organizationId, nowIso),
      db.prepare(
        `UPDATE session_pdf_state
         SET current_page = ?1, client_version = ?2,
             updated_by_user_id = ?3, updated_at = ?4
         WHERE organization_id = ?5 AND live_session_id = ?6 AND binding_id = ?7
           AND client_version < ?2`
      ).bind(
        input.pageNumber,
        input.clientVersion,
        input.userId,
        nowIso,
        input.organizationId,
        input.liveSessionId,
        input.bindingId
      ),
      db.prepare(
        `INSERT INTO pdf_page_events (
           id, organization_id, live_session_id, binding_id, pdf_document_id,
           page_number, client_version, event_type, source_user_id, occurred_at
         )
         SELECT ?1, organization_id, live_session_id, binding_id, pdf_document_id,
                current_page, client_version, 'page_changed', ?2, ?3
         FROM session_pdf_state
         WHERE organization_id = ?4 AND live_session_id = ?5 AND binding_id = ?6
           AND client_version = ?7 AND current_page = ?8
         ON CONFLICT(binding_id, client_version) DO NOTHING`
      ).bind(
        eventId,
        input.userId,
        nowIso,
        input.organizationId,
        input.liveSessionId,
        input.bindingId,
        input.clientVersion,
        input.pageNumber
      )
    ]);
  }

  const next = await getSessionPdfState(db, input.organizationId, input.liveSessionId);
  return {
    ...next,
    accepted: Boolean(next && next.bindingId === input.bindingId && next.clientVersion === input.clientVersion),
    stale: Boolean(next && next.clientVersion > input.clientVersion)
  };
}

export async function getSessionPdfState(db, organizationId, liveSessionId) {
  const row = await db.prepare(
    `SELECT s.binding_id, s.pdf_document_id, s.current_page, s.page_count,
            s.client_version, s.updated_at, d.sha256_hex, d.pdfjs_fingerprint,
            d.file_size_bytes, b.bound_at
     FROM session_pdf_state s
     JOIN session_pdf_bindings b
       ON b.id = s.binding_id
      AND b.organization_id = s.organization_id
      AND b.live_session_id = s.live_session_id
      AND b.pdf_document_id = s.pdf_document_id
     JOIN pdf_documents d
       ON d.id = s.pdf_document_id
      AND d.organization_id = s.organization_id
     WHERE s.organization_id = ?1 AND s.live_session_id = ?2
       AND b.replaced_at IS NULL
     LIMIT 1`
  ).bind(organizationId, liveSessionId).first();
  if (!row) return null;
  return {
    bindingId: row.binding_id,
    pdfDocumentId: row.pdf_document_id,
    documentSha256: row.sha256_hex,
    pdfjsFingerprint: row.pdfjs_fingerprint || null,
    fileSizeBytes: Number(row.file_size_bytes),
    currentPage: Number(row.current_page),
    pageCount: Number(row.page_count),
    clientVersion: Number(row.client_version),
    boundAt: row.bound_at,
    updatedAt: row.updated_at
  };
}

export function commentPageLinkStatement(db, input) {
  return db.prepare(
    `INSERT INTO comment_page_links (
       comment_id, organization_id, live_session_id, binding_id,
       pdf_document_id, page_number, state_client_version, link_method, linked_at
     )
     SELECT c.id, c.organization_id, c.live_session_id, s.binding_id,
            s.pdf_document_id, s.current_page, s.client_version,
            'server_current_page', c.created_at
     FROM comments c
     JOIN session_pdf_state s
       ON s.organization_id = c.organization_id AND s.live_session_id = c.live_session_id
     JOIN session_pdf_bindings b
       ON b.id = s.binding_id
      AND b.organization_id = s.organization_id
      AND b.live_session_id = s.live_session_id
      AND b.pdf_document_id = s.pdf_document_id
      AND b.replaced_at IS NULL
     WHERE c.id = ?1 AND c.organization_id = ?2 AND c.live_session_id = ?3
     ON CONFLICT(comment_id) DO NOTHING`
  ).bind(input.commentId, input.organizationId, input.liveSessionId);
}

export async function persistUnderstandingSignal(db, input) {
  const state = await getSessionPdfState(db, input.organizationId, input.liveSessionId);
  if (!state) throw new AuthError(409, "PDF_PAGE_NOT_ACTIVE");
  if (state.bindingId !== input.bindingId) throw new AuthError(409, "PDF_BINDING_STALE");
  if (state.currentPage !== input.pageNumber || state.clientVersion !== input.clientVersion) {
    throw new AuthError(409, "PDF_PAGE_CHANGED");
  }

  const now = new Date(input.now ?? Date.now());
  const nowIso = now.toISOString();
  const retainedUntil = new Date(now.getTime() + UNDERSTANDING_RETENTION_DAYS * 86_400_000).toISOString();
  const existing = await db.prepare(
    `SELECT us.signal, us.updated_at, us.retained_until
     FROM understanding_signals us
     JOIN participants p
       ON p.id = us.participant_id
      AND p.organization_id = us.organization_id
      AND p.live_session_id = us.live_session_id
     WHERE us.organization_id = ?1 AND us.live_session_id = ?2
       AND us.binding_id = ?3 AND us.page_number = ?4
       AND p.token_hash = ?5 AND p.status = 'active'
     LIMIT 1`
  ).bind(
    input.organizationId,
    input.liveSessionId,
    input.bindingId,
    input.pageNumber,
    input.participantTokenHash
  ).first();
  const existingIsRetained = existing && Date.parse(existing.retained_until) > now.getTime();
  if (existingIsRetained) {
    if (existing.signal === input.signal) return { signal: input.signal, duplicate: true };
    const elapsed = now.getTime() - Date.parse(existing.updated_at);
    if (Number.isFinite(elapsed) && elapsed < SIGNAL_UPDATE_INTERVAL_MS) {
      throw new AuthError(429, "SIGNAL_RATE_LIMITED");
    }
  }

  const participantId = makeId("part");
  const signalId = makeId("sig");
  await db.batch([
    db.prepare(
      `INSERT INTO participants (
         id, organization_id, live_session_id, token_hash, status,
         post_claim_id, next_post_at, created_at, last_seen_at, deleted_at
       )
       SELECT ?1, ?2, ?3, ?4, 'active', NULL, ?5, ?5, ?5, NULL
       FROM live_sessions
       WHERE id = ?3 AND organization_id = ?2
         AND status = 'active' AND expires_at > ?5
       ON CONFLICT(live_session_id, token_hash)
       DO UPDATE SET last_seen_at = excluded.last_seen_at`
    ).bind(participantId, input.organizationId, input.liveSessionId, input.participantTokenHash, nowIso),
    db.prepare(
      `INSERT INTO understanding_signals (
         id, organization_id, live_session_id, participant_id,
         binding_id, pdf_document_id, page_number, signal,
         created_at, updated_at, retained_until
       )
       SELECT ?1, p.organization_id, p.live_session_id, p.id,
              s.binding_id, s.pdf_document_id, s.current_page, ?2,
              ?3, ?3, ?4
       FROM participants p
       JOIN session_pdf_state s
         ON s.organization_id = p.organization_id AND s.live_session_id = p.live_session_id
       JOIN session_pdf_bindings b
         ON b.id = s.binding_id
        AND b.organization_id = s.organization_id
        AND b.live_session_id = s.live_session_id
        AND b.pdf_document_id = s.pdf_document_id
        AND b.replaced_at IS NULL
       WHERE p.organization_id = ?5 AND p.live_session_id = ?6
         AND p.token_hash = ?7 AND p.status = 'active'
         AND s.binding_id = ?8 AND s.current_page = ?9 AND s.client_version = ?10
       ON CONFLICT(live_session_id, participant_id, binding_id, page_number)
       DO UPDATE SET signal = excluded.signal,
                     updated_at = excluded.updated_at,
                     retained_until = excluded.retained_until`
    ).bind(
      signalId,
      input.signal,
      nowIso,
      retainedUntil,
      input.organizationId,
      input.liveSessionId,
      input.participantTokenHash,
      input.bindingId,
      input.pageNumber,
      input.clientVersion
    )
  ]);

  const stored = await db.prepare(
    `SELECT us.signal
     FROM understanding_signals us
     JOIN participants p
       ON p.id = us.participant_id
      AND p.organization_id = us.organization_id
      AND p.live_session_id = us.live_session_id
     WHERE us.organization_id = ?1 AND us.live_session_id = ?2
       AND us.binding_id = ?3 AND us.page_number = ?4
       AND p.token_hash = ?5 AND p.status = 'active'
       AND us.signal = ?6 AND us.updated_at = ?7 AND us.retained_until = ?8
     LIMIT 1`
  ).bind(
    input.organizationId,
    input.liveSessionId,
    input.bindingId,
    input.pageNumber,
    input.participantTokenHash,
    input.signal,
    nowIso,
    retainedUntil
  ).first();
  if (!stored) throw new AuthError(409, "UNDERSTANDING_WRITE_CONFLICT");
  return { signal: stored.signal, duplicate: false };
}

export async function buildSessionAnalytics(db, input) {
  const state = await getSessionPdfState(db, input.organizationId, input.liveSessionId);
  if (!state) throw new AuthError(409, "PDF_NOT_BOUND");
  const session = await db.prepare(
    `SELECT title, status, started_at, expires_at, ended_at
     FROM live_sessions
     WHERE id = ?1 AND organization_id = ?2 LIMIT 1`
  ).bind(input.liveSessionId, input.organizationId).first();
  if (!session) throw new AuthError(404, "SESSION_NOT_FOUND");

  const evaluationNowMs = Number(input.now ?? Date.now());
  const evaluationNowIso = new Date(evaluationNowMs).toISOString();
  const metadataRetentionCutoffIso = new Date(evaluationNowMs - PDF_ANALYTICS_METADATA_RETENTION_DAYS * 86_400_000).toISOString();
  const requestedCutoff = input.cutoffAt ? Date.parse(input.cutoffAt) : evaluationNowMs;
  const endedAt = Date.parse(session.ended_at || "");
  const expiresAt = Date.parse(session.expires_at || "");
  const cutoffMs = Math.min(
    Number.isFinite(requestedCutoff) ? requestedCutoff : Date.now(),
    Number.isFinite(endedAt) ? endedAt : Number.POSITIVE_INFINITY,
    Number.isFinite(expiresAt) ? expiresAt : Number.POSITIVE_INFINITY
  );
  const sourceCutoffAt = new Date(cutoffMs).toISOString();

  const results = await db.batch([
    db.prepare(
      `SELECT l.page_number,
              COUNT(*) AS comment_count,
              SUM(CASE WHEN c.moderation_state = 'visible' THEN 1 ELSE 0 END) AS visible_count,
              SUM(CASE WHEN c.moderation_state = 'pending' THEN 1 ELSE 0 END) AS pending_count,
              SUM(CASE WHEN c.moderation_state = 'hidden' THEN 1 ELSE 0 END) AS hidden_count,
              SUM(CASE WHEN instr(c.message, '?') > 0 OR instr(c.message, '？') > 0 THEN 1 ELSE 0 END) AS question_mark_count,
              COUNT(DISTINCT c.participant_id) AS unique_commenters
       FROM comment_page_links l
       JOIN comments c
         ON c.id = l.comment_id
        AND c.organization_id = l.organization_id
        AND c.live_session_id = l.live_session_id
       WHERE l.organization_id = ?1 AND l.live_session_id = ?2
         AND l.binding_id = ?3 AND c.moderation_state <> 'deleted'
         AND c.created_at <= ?4 AND c.retained_until > ?5
       GROUP BY l.page_number`
    ).bind(input.organizationId, input.liveSessionId, state.bindingId, sourceCutoffAt, evaluationNowIso),
    db.prepare(
      `SELECT page_number, COUNT(*) AS signal_total,
              SUM(CASE WHEN signal = 'understood' THEN 1 ELSE 0 END) AS understood_count,
              SUM(CASE WHEN signal = 'unsure' THEN 1 ELSE 0 END) AS unsure_count,
              SUM(CASE WHEN signal = 'confused' THEN 1 ELSE 0 END) AS confused_count
       FROM understanding_signals
       WHERE organization_id = ?1 AND live_session_id = ?2
         AND binding_id = ?3 AND updated_at <= ?4 AND retained_until > ?5
       GROUP BY page_number`
    ).bind(input.organizationId, input.liveSessionId, state.bindingId, sourceCutoffAt, evaluationNowIso),
    db.prepare(
      `SELECT page_number, client_version, event_type, occurred_at
       FROM pdf_page_events
       WHERE organization_id = ?1 AND live_session_id = ?2
         AND binding_id = ?3 AND occurred_at <= ?4 AND occurred_at > ?5
       ORDER BY occurred_at ASC, client_version ASC, id ASC`
    ).bind(input.organizationId, input.liveSessionId, state.bindingId, sourceCutoffAt, metadataRetentionCutoffIso),
    db.prepare(
      `SELECT COUNT(DISTINCT participant_id) AS respondent_count
       FROM understanding_signals
       WHERE organization_id = ?1 AND live_session_id = ?2
         AND binding_id = ?3 AND updated_at <= ?4 AND retained_until > ?5`
    ).bind(input.organizationId, input.liveSessionId, state.bindingId, sourceCutoffAt, evaluationNowIso)
  ]);
  const [commentResult, signalResult, eventResult, respondentResult] = results;

  const comments = new Map(rowsOf(commentResult).map((row) => [Number(row.page_number), row]));
  const signals = new Map(rowsOf(signalResult).map((row) => [Number(row.page_number), row]));
  const dwell = calculateDwell(rowsOf(eventResult), cutoffMs);
  const pages = [];
  for (let pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
    const comment = comments.get(pageNumber) || {};
    const signal = signals.get(pageNumber) || {};
    const signalTotal = Number(signal.signal_total || 0);
    const uniqueCommentersRaw = Number(comment.unique_commenters || 0);
    const suppressed = signalTotal > 0 && signalTotal < MINIMUM_GROUP_SIZE;
    const understood = Number(signal.understood_count || 0);
    const unsure = Number(signal.unsure_count || 0);
    const confused = Number(signal.confused_count || 0);
    pages.push({
      pageNumber,
      viewCount: dwell.get(pageNumber)?.viewCount || 0,
      dwellSeconds: dwell.get(pageNumber)?.seconds || 0,
      commentCount: Number(comment.comment_count || 0),
      visibleCommentCount: Number(comment.visible_count || 0),
      pendingCommentCount: Number(comment.pending_count || 0),
      hiddenCommentCount: Number(comment.hidden_count || 0),
      questionMarkCommentCount: Number(comment.question_mark_count || 0),
      uniqueCommenters: uniqueCommentersRaw >= MINIMUM_GROUP_SIZE ? uniqueCommentersRaw : null,
      signalTotal,
      understoodCount: suppressed ? null : understood,
      unsureCount: suppressed ? null : unsure,
      confusedCount: suppressed ? null : confused,
      understandingScore: suppressed || signalTotal === 0
        ? null
        : roundOne(((understood * 100) + (unsure * 50)) / signalTotal),
      suppressed
    });
  }

  const signalTotal = pages.reduce((sum, page) => sum + page.signalTotal, 0);
  const understoodTotal = rowsOf(signalResult).reduce((sum, row) => sum + Number(row.understood_count || 0), 0);
  const unsureTotal = rowsOf(signalResult).reduce((sum, row) => sum + Number(row.unsure_count || 0), 0);
  const overallRespondentCount = Number(rowsOf(respondentResult)[0]?.respondent_count || 0);
  const overallSuppressed = signalTotal > 0 && overallRespondentCount < MINIMUM_GROUP_SIZE;
  const summary = {
    sessionTitle: session.title,
    sessionStatus: session.status,
    documentSha256: state.documentSha256,
    pageCount: state.pageCount,
    bindingId: state.bindingId,
    boundAt: state.boundAt,
    sourceCutoffAt,
    minimumGroupSize: MINIMUM_GROUP_SIZE,
    totalComments: pages.reduce((sum, page) => sum + page.commentCount, 0),
    totalSignals: signalTotal,
    pagesWithActivity: pages.filter((page) => page.commentCount || page.signalTotal || page.viewCount).length,
    overallUnderstandingScore: overallSuppressed || signalTotal === 0
      ? null
      : roundOne(((understoodTotal * 100) + (unsureTotal * 50)) / signalTotal),
    overallSuppressed
  };
  return { state, summary, pages, sourceCutoffAt, minimumGroupSize: MINIMUM_GROUP_SIZE };
}

export async function createAnalyticsSnapshot(db, input) {
  const analytics = await buildSessionAnalytics(db, input);
  const id = makeId("anl");
  const now = new Date(input.now ?? Date.now());
  const createdAt = now.toISOString();
  const retainedUntil = new Date(now.getTime() + ANALYTICS_RETENTION_DAYS * 86_400_000).toISOString();
  const payload = {
    schemaVersion: 1,
    sourceCutoffAt: analytics.sourceCutoffAt,
    minimumGroupSize: analytics.minimumGroupSize,
    summary: analytics.summary,
    pages: analytics.pages
  };
  const checksumSha256 = await sha256Hex(stableStringify(payload));
  await db.prepare(
    `INSERT INTO analytics_snapshots (
       id, organization_id, live_session_id, binding_id, pdf_document_id,
       source_cutoff_at, minimum_group_size, schema_version,
       summary_json, pages_json, checksum_sha256,
       created_by_user_id, created_at, retained_until
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?10, ?11, ?12, ?13)`
  ).bind(
    id,
    input.organizationId,
    input.liveSessionId,
    analytics.state.bindingId,
    analytics.state.pdfDocumentId,
    analytics.sourceCutoffAt,
    analytics.minimumGroupSize,
    JSON.stringify(analytics.summary),
    JSON.stringify(analytics.pages),
    checksumSha256,
    input.userId,
    createdAt,
    retainedUntil
  ).run();
  return {
    id,
    organizationId: input.organizationId,
    liveSessionId: input.liveSessionId,
    bindingId: analytics.state.bindingId,
    pdfDocumentId: analytics.state.pdfDocumentId,
    sourceCutoffAt: analytics.sourceCutoffAt,
    minimumGroupSize: analytics.minimumGroupSize,
    schemaVersion: 1,
    summary: analytics.summary,
    pages: analytics.pages,
    checksumSha256,
    createdAt,
    retainedUntil
  };
}

export async function getAnalyticsSnapshot(db, input) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const row = await db.prepare(
    `SELECT id, organization_id, live_session_id, binding_id, pdf_document_id,
            source_cutoff_at, minimum_group_size, schema_version,
            summary_json, pages_json, checksum_sha256, created_at, retained_until
     FROM analytics_snapshots
     WHERE id = ?1 AND organization_id = ?2 AND live_session_id = ?3
       AND retained_until > ?4
     LIMIT 1`
  ).bind(input.snapshotId, input.organizationId, input.liveSessionId, nowIso).first();
  if (!row) throw new AuthError(404, "ANALYTICS_SNAPSHOT_NOT_FOUND");
  const summary = parseObjectStrict(row.summary_json);
  const pages = parseArrayStrict(row.pages_json);
  const payload = {
    schemaVersion: Number(row.schema_version),
    sourceCutoffAt: row.source_cutoff_at,
    minimumGroupSize: Number(row.minimum_group_size),
    summary,
    pages
  };
  const calculatedChecksum = await sha256Hex(stableStringify(payload));
  if (calculatedChecksum !== row.checksum_sha256) {
    throw new AuthError(500, "ANALYTICS_SNAPSHOT_CORRUPT");
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    liveSessionId: row.live_session_id,
    bindingId: row.binding_id,
    pdfDocumentId: row.pdf_document_id,
    sourceCutoffAt: row.source_cutoff_at,
    minimumGroupSize: Number(row.minimum_group_size),
    schemaVersion: Number(row.schema_version),
    summary,
    pages,
    checksumSha256: row.checksum_sha256,
    createdAt: row.created_at,
    retainedUntil: row.retained_until
  };
}

export async function listAnalyticsSnapshots(db, input) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const result = await db.prepare(
    `SELECT id, source_cutoff_at, minimum_group_size, checksum_sha256, created_at
     FROM analytics_snapshots
     WHERE organization_id = ?1 AND live_session_id = ?2 AND retained_until > ?3
     ORDER BY created_at DESC, id DESC LIMIT ?4`
  ).bind(input.organizationId, input.liveSessionId, nowIso, input.limit || 20).all();
  return rowsOf(result).map((row) => ({
    id: row.id,
    sourceCutoffAt: row.source_cutoff_at,
    minimumGroupSize: Number(row.minimum_group_size),
    checksumSha256: row.checksum_sha256,
    createdAt: row.created_at
  }));
}

export async function runPdfAnalyticsRetention(db, options = {}) {
  const now = new Date(options.now ?? Date.now());
  const nowIso = now.toISOString();
  const metadataCutoffIso = new Date(now.getTime() - PDF_ANALYTICS_METADATA_RETENTION_DAYS * 86_400_000).toISOString();
  const limit = Math.min(5000, Math.max(1, Number(options.limit || 500)));
  const results = await db.batch([
    db.prepare(
      `DELETE FROM understanding_signals
       WHERE id IN (
         SELECT id FROM understanding_signals
         WHERE retained_until <= ?1
         ORDER BY retained_until ASC, id ASC LIMIT ?2
       )`
    ).bind(nowIso, limit),
    db.prepare(
      `DELETE FROM analytics_snapshots
       WHERE id IN (
         SELECT id FROM analytics_snapshots
         WHERE retained_until <= ?1
         ORDER BY retained_until ASC, id ASC LIMIT ?2
       )`
    ).bind(nowIso, limit),
    db.prepare(
      `DELETE FROM pdf_page_events
       WHERE id IN (
         SELECT id FROM pdf_page_events
         WHERE occurred_at <= ?1
         ORDER BY occurred_at ASC, id ASC LIMIT ?2
       )`
    ).bind(metadataCutoffIso, limit),
    db.prepare(
      `DELETE FROM session_pdf_bindings
       WHERE id IN (
         SELECT b.id
         FROM session_pdf_bindings b
         JOIN live_sessions ls
           ON ls.id = b.live_session_id AND ls.organization_id = b.organization_id
         WHERE COALESCE(ls.ended_at, ls.expires_at) <= ?1
           AND NOT EXISTS (SELECT 1 FROM comment_page_links l WHERE l.binding_id = b.id)
           AND NOT EXISTS (SELECT 1 FROM understanding_signals u WHERE u.binding_id = b.id)
           AND NOT EXISTS (SELECT 1 FROM analytics_snapshots a WHERE a.binding_id = b.id)
         ORDER BY COALESCE(b.replaced_at, b.bound_at) ASC, b.id ASC LIMIT ?2
       )`
    ).bind(metadataCutoffIso, limit),
    db.prepare(
      `DELETE FROM pdf_documents
       WHERE id IN (
         SELECT d.id FROM pdf_documents d
         WHERE NOT EXISTS (SELECT 1 FROM session_pdf_bindings b WHERE b.pdf_document_id = d.id)
           AND d.last_seen_at <= ?1
         ORDER BY d.last_seen_at ASC, d.id ASC LIMIT ?2
       )`
    ).bind(metadataCutoffIso, limit)
  ]);
  return {
    understandingSignalsDeleted: changesOf(results?.[0]),
    analyticsSnapshotsDeleted: changesOf(results?.[1]),
    pageEventsDeleted: changesOf(results?.[2]),
    bindingsDeleted: changesOf(results?.[3]),
    pdfDocumentsDeleted: changesOf(results?.[4]),
    limit
  };
}

function calculateDwell(events, cutoffMs) {
  const map = new Map();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const start = Date.parse(event.occurred_at);
    const nextStart = index + 1 < events.length ? Date.parse(events[index + 1].occurred_at) : cutoffMs;
    const rawSeconds = Number.isFinite(start) && Number.isFinite(nextStart)
      ? Math.max(0, Math.floor((nextStart - start) / 1000))
      : 0;
    const seconds = Math.min(rawSeconds, MAX_DWELL_GAP_SECONDS);
    const page = Number(event.page_number);
    const current = map.get(page) || { viewCount: 0, seconds: 0 };
    current.viewCount += 1;
    current.seconds += seconds;
    map.set(page, current);
  }
  return map;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseObjectStrict(value) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && !Array.isArray(parsed) && typeof parsed === "object") return parsed;
  } catch {}
  throw new AuthError(500, "ANALYTICS_SNAPSHOT_CORRUPT");
}

function parseArrayStrict(value) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  throw new AuthError(500, "ANALYTICS_SNAPSHOT_CORRUPT");
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function changesOf(result) {
  return Number(result?.meta?.changes || 0);
}
