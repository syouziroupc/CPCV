from pathlib import Path
import json
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


def regex_once(text, pattern, repl, label, flags=0):
    updated, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one regex match, got {count}')
    return updated

# 1) Public message hot path + bounded Durable Object reset retry.
path = 'src/routes/public-v2.js'
s = read(path)
s = replace_once(
    s,
    '  const publicCode = decodePublicCode(parts[3]);\n  const session = await loadPublicSession(env.DB_V2, publicCode);',
    '  const publicCode = decodePublicCode(parts[3]);\n  const messagePost = request.method === "POST" && parts[4] === "messages" && parts.length === 5;\n  const session = messagePost\n    ? await loadPublicMessageSession(env.DB_V2, publicCode)\n    : await loadPublicSession(env.DB_V2, publicCode);',
    'public message session split'
)
old_room = '''    const stub = env.COMMENT_ROOM.get(env.COMMENT_ROOM.idFromName(session.id));
    const roomResponse = await stub.fetch("https://comment-room/message", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-public-comment-verified": "true"
      },
      body: JSON.stringify({
        organizationId: session.organization_id,
        liveSessionId: session.id,
        participantTokenHash: await hashToken(participant.token),
        retentionDays: retentionDays(env),
        ...normalized
      })
    });'''
new_room = '''    const stub = env.COMMENT_ROOM.get(env.COMMENT_ROOM.idFromName(session.id));
    const roomResponse = await fetchCommentRoomMessage(stub, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-public-comment-verified": "true"
      },
      body: JSON.stringify({
        organizationId: session.organization_id,
        liveSessionId: session.id,
        participantTokenHash: await hashToken(participant.token),
        retentionDays: retentionDays(env),
        ...normalized
      })
    });'''
s = replace_once(s, old_room, new_room, 'comment room retry wrapper')
anchor = 'async function loadPublicSession(db, publicCode) {'
insert = '''const COMMENT_ROOM_RETRY_DELAYS_MS = Object.freeze([40, 120]);

async function fetchCommentRoomMessage(stub, init) {
  let lastError = null;
  for (let attempt = 0; attempt <= COMMENT_ROOM_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await stub.fetch("https://comment-room/message", init);
    } catch (error) {
      lastError = error;
      if (!isDurableObjectDeploymentReset(error) || attempt >= COMMENT_ROOM_RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, COMMENT_ROOM_RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError || new Error("COMMENT_ROOM_UNAVAILABLE");
}

function isDurableObjectDeploymentReset(error) {
  const message = String(error?.message || error || "");
  return /durable object.*reset|reset.*durable object|code was updated/i.test(message);
}

async function loadPublicMessageSession(db, publicCode) {
  return db.prepare(
    `SELECT id, organization_id, public_code, posting_enabled, status, expires_at
     FROM live_sessions WHERE public_code = ?1 LIMIT 1`
  ).bind(publicCode).first();
}

'''
if anchor not in s:
    raise SystemExit('public session anchor missing')
s = s.replace(anchor, insert + anchor, 1)
write(path, s)

# 2) Idempotency hot path: one lightweight lookup for normal new posts.
path = 'src/comments/repository.js'
s = read(path)
old_preflight = '''  await releaseExpiredIdempotencyKey(db, input.liveSessionId, input.idempotencyKey, nowIso);
  const existing = await findCommentByIdempotency(
    db,
    input.liveSessionId,
    input.idempotencyKey,
    input.participantTokenHash,
    nowIso
  );
  if (existing) return { comment: commentResponse(existing), duplicate: true };
  if (await activeIdempotencyKeyExists(db, input.liveSessionId, input.idempotencyKey, nowIso)) {
    throw new AuthError(409, "IDEMPOTENCY_KEY_CONFLICT");
  }
'''
new_preflight = '''  const keyState = await inspectIdempotencyKey(db, input.liveSessionId, input.idempotencyKey, nowIso);
  if (keyState?.expired) {
    await deleteExpiredIdempotencyKey(db, keyState.commentId, nowIso);
  } else if (keyState) {
    if (keyState.participantTokenHash !== input.participantTokenHash) {
      throw new AuthError(409, "IDEMPOTENCY_KEY_CONFLICT");
    }
    const existing = await findCommentById(db, keyState.commentId);
    if (existing) return { comment: commentResponse(existing), duplicate: true };
  }
'''
s = replace_once(s, old_preflight, new_preflight, 'idempotency preflight')
old_race = '''  const racedDuplicate = await findCommentByIdempotency(
    db,
    input.liveSessionId,
    input.idempotencyKey,
    input.participantTokenHash,
    nowIso
  );
  if (racedDuplicate) return { comment: commentResponse(racedDuplicate), duplicate: true };
  if (await activeIdempotencyKeyExists(db, input.liveSessionId, input.idempotencyKey, nowIso)) {
    throw new AuthError(409, "IDEMPOTENCY_KEY_CONFLICT");
  }
'''
new_race = '''  const racedKeyState = await inspectIdempotencyKey(db, input.liveSessionId, input.idempotencyKey, nowIso);
  if (racedKeyState?.expired) {
    await deleteExpiredIdempotencyKey(db, racedKeyState.commentId, nowIso);
  } else if (racedKeyState) {
    if (racedKeyState.participantTokenHash !== input.participantTokenHash) {
      throw new AuthError(409, "IDEMPOTENCY_KEY_CONFLICT");
    }
    const racedDuplicate = await findCommentById(db, racedKeyState.commentId);
    if (racedDuplicate) return { comment: commentResponse(racedDuplicate), duplicate: true };
  }
'''
s = replace_once(s, old_race, new_race, 'idempotency race check')
helper_anchor = 'async function findCommentByIdempotency(db, liveSessionId, key, participantTokenHash, nowIso) {'
helpers = '''async function inspectIdempotencyKey(db, liveSessionId, key, nowIso) {
  const row = await db.prepare(
    `SELECT c.id AS comment_id, c.retained_until, p.token_hash AS participant_token_hash
     FROM comments c
     LEFT JOIN participants p ON p.id = c.participant_id
     WHERE c.live_session_id = ?1 AND c.idempotency_key = ?2
     LIMIT 1`
  ).bind(liveSessionId, key).first();
  if (!row) return null;
  return {
    commentId: row.comment_id,
    participantTokenHash: row.participant_token_hash || "",
    expired: String(row.retained_until || "") <= nowIso
  };
}

async function deleteExpiredIdempotencyKey(db, commentId, nowIso) {
  await db.prepare(
    `DELETE FROM comments WHERE id = ?1 AND retained_until <= ?2`
  ).bind(commentId, nowIso).run();
}

'''
if helper_anchor not in s:
    raise SystemExit('idempotency helper anchor missing')
s = s.replace(helper_anchor, helpers + helper_anchor, 1)
write(path, s)

# 3) Remove one D1 read after new AI job insertion when D1 change metadata is available.
path = 'src/ai/repository.js'
s = read(path)
s = replace_once(s, '  const statements = [];\n  const unsupportedAiReview = Boolean(context.filter_enabled)', '  const plannedJobs = [];\n  const unsupportedAiReview = Boolean(context.filter_enabled)', 'AI planned jobs declaration')
s = replace_once(
    s,
    '''    statements.push(aiJobInsertStatement(db, {
      id: makeId("aij"), organizationId: input.organizationId, liveSessionId: input.liveSessionId,
      commentId: input.commentId, jobType: "moderation", targetLanguage: "", nowIso
    }));''',
    '''    plannedJobs.push({
      id: makeId("aij"), organizationId: input.organizationId, liveSessionId: input.liveSessionId,
      commentId: input.commentId, jobType: "moderation", targetLanguage: "", nowIso
    });''',
    'moderation planned job'
)
s = replace_once(
    s,
    '''    statements.push(aiJobInsertStatement(db, {
      id: makeId("aij"), organizationId: input.organizationId, liveSessionId: input.liveSessionId,
      commentId: input.commentId, jobType: "translation", targetLanguage: context.target_language, nowIso
    }));''',
    '''    plannedJobs.push({
      id: makeId("aij"), organizationId: input.organizationId, liveSessionId: input.liveSessionId,
      commentId: input.commentId, jobType: "translation", targetLanguage: context.target_language, nowIso
    });''',
    'translation planned job'
)
old_jobs_tail = '''  if (!statements.length) return [];
  await db.batch(statements);
  const result = await db.prepare(
    `SELECT id, job_type, target_language, status
     FROM ai_jobs
     WHERE comment_id = ?1 AND organization_id = ?2 AND live_session_id = ?3
       AND status IN ('queued', 'retry')
     ORDER BY created_at ASC, id ASC`
  ).bind(input.commentId, input.organizationId, input.liveSessionId).all();
  return rowsOf(result).map(jobDispatchResponse);'''
new_jobs_tail = '''  if (!plannedJobs.length) return [];
  const results = await db.batch(plannedJobs.map((job) => aiJobInsertStatement(db, job)));
  const hasChangeMetadata = Array.isArray(results)
    && results.length === plannedJobs.length
    && results.every((result) => Number.isFinite(Number(result?.meta?.changes)));
  if (hasChangeMetadata) {
    return plannedJobs
      .filter((_, index) => Number(results[index]?.meta?.changes || 0) === 1)
      .map((job) => ({ id: job.id, jobType: job.jobType, targetLanguage: job.targetLanguage || null, status: "queued" }));
  }
  const result = await db.prepare(
    `SELECT id, job_type, target_language, status
     FROM ai_jobs
     WHERE comment_id = ?1 AND organization_id = ?2 AND live_session_id = ?3
       AND status IN ('queued', 'retry')
     ORDER BY created_at ASC, id ASC`
  ).bind(input.commentId, input.organizationId, input.liveSessionId).all();
  return rowsOf(result).map(jobDispatchResponse);'''
s = replace_once(s, old_jobs_tail, new_jobs_tail, 'AI insertion result fast path')
write(path, s)

# 4) Realtime translation-pending update returns the event in one D1 round trip.
path = 'src/realtime/repository.js'
s = read(path)
pattern = r'''export async function markRealtimeCommentTranslationPending\(db, input\) \{.*?\n\}\n\nexport async function getRealtimeSync'''
replacement = '''export async function markRealtimeCommentTranslationPending(db, input) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const row = await db.prepare(
    `UPDATE realtime_events
     SET payload_json = json_set(
       payload_json,
       '$.translationPending', 1,
       '$.translationTargetLanguage', ?1
     )
     WHERE organization_id = ?2 AND live_session_id = ?3
       AND source_comment_id = ?4 AND event_type = ?5
       AND expires_at > ?6
     RETURNING id, organization_id, live_session_id, sequence,
               event_type, payload_json, source_comment_id,
               created_at, expires_at`
  ).bind(
    String(input.targetLanguage || ""),
    input.organizationId,
    input.liveSessionId,
    input.commentId,
    input.eventType || "message:new",
    nowIso
  ).first();
  if (!row) throw new AuthError(404, "REALTIME_EVENT_NOT_FOUND");
  return realtimeEventResponse(row);
}

export async function getRealtimeSync'''
s = regex_once(s, pattern, replacement, 'translation pending returning', flags=re.S)
write(path, s)

# 5) Resolve the realtime event only once after AI scheduling.
path = 'src/realtime/comment-room.js'
s = read(path)
old_block = '''      const result = await persistComment(this.env.DB_V2, { ...input, filterDecision });
      let event = null;
      if (!result.duplicate && result.comment.moderationState === "visible") {
        event = await findRealtimeEventForComment(this.env.DB_V2, {
          organizationId: input.organizationId,
          liveSessionId: input.liveSessionId,
          commentId: result.comment.id,
          eventType: "message:new"
        });
        if (!event) throw new AuthError(500, "REALTIME_EVENT_MISSING");
      }

      let ai = { jobs: [], dispatched: 0 };
      if (!result.duplicate) {
        try {
          ai = await scheduleAiForComment(this.env, {
            organizationId: input.organizationId,
            liveSessionId: input.liveSessionId,
            commentId: result.comment.id
          }, { dispatch: false });
        } catch (error) {
          console.error("AI scheduling failed", String(error?.code || error?.name || "ERROR"));
        }
      }

      const translationJob = ai.jobs.find((job) => job.jobType === "translation");
      if (event && translationJob) {
        try {
          event = await markRealtimeCommentTranslationPending(this.env.DB_V2, {
            organizationId: input.organizationId,
            liveSessionId: input.liveSessionId,
            commentId: result.comment.id,
            eventType: "message:new",
            targetLanguage: translationJob.targetLanguage
          });
        } catch (error) {
          console.error("Translation pending marker failed", String(error?.code || error?.name || "ERROR"));
        }
      }
      if (event) await this.broadcastEvent(event);'''
new_block = '''      const result = await persistComment(this.env.DB_V2, { ...input, filterDecision });
      let ai = { jobs: [], dispatched: 0 };
      if (!result.duplicate) {
        try {
          ai = await scheduleAiForComment(this.env, {
            organizationId: input.organizationId,
            liveSessionId: input.liveSessionId,
            commentId: result.comment.id
          }, { dispatch: false });
        } catch (error) {
          console.error("AI scheduling failed", String(error?.code || error?.name || "ERROR"));
        }
      }

      const translationJob = ai.jobs.find((job) => job.jobType === "translation");
      let event = null;
      if (result.comment.moderationState === "visible") {
        if (!result.duplicate && translationJob) {
          try {
            event = await markRealtimeCommentTranslationPending(this.env.DB_V2, {
              organizationId: input.organizationId,
              liveSessionId: input.liveSessionId,
              commentId: result.comment.id,
              eventType: "message:new",
              targetLanguage: translationJob.targetLanguage
            });
          } catch (error) {
            console.error("Translation pending marker failed", String(error?.code || error?.name || "ERROR"));
          }
        }
        if (!event) {
          event = await findRealtimeEventForComment(this.env.DB_V2, {
            organizationId: input.organizationId,
            liveSessionId: input.liveSessionId,
            commentId: result.comment.id,
            eventType: "message:new"
          });
        }
        if (!event) throw new AuthError(500, "REALTIME_EVENT_MISSING");
      }
      if (event) await this.broadcastEvent(event);'''
s = replace_once(s, old_block, new_block, 'comment realtime reorder')
write(path, s)

# 6) Queue batches complete in one parallel wave so autoscale feedback happens sooner.
path = 'wrangler.toml'
s = read(path)
blocks = [
    ('queue = "cpcv-ai-translation-jobs"\nmax_batch_size = 6', 'queue = "cpcv-ai-translation-jobs"\nmax_batch_size = 3'),
    ('queue = "cpcv-ai-moderation-jobs"\nmax_batch_size = 6', 'queue = "cpcv-ai-moderation-jobs"\nmax_batch_size = 3'),
]
for i, (old, new) in enumerate(blocks):
    s = replace_once(s, old, new, f'queue batch {i}')
write(path, s)

# 7) Populate all backend-supported translation languages dynamically.
path = 'public/assets/admin.js'
s = read(path)
languages = ["af","am","ar","ast","az","ba","be","bg","bn","br","bs","ca","ceb","cs","cy","da","de","el","en","es","et","fa","ff","fi","fr","fy","ga","gd","gl","gu","ha","he","hi","hr","ht","hu","hy","id","ig","ilo","is","it","ja","jv","ka","kk","km","kn","ko","lb","lg","ln","lo","lt","lv","mg","mk","ml","mn","mr","ms","my","ne","nl","no","ns","oc","or","pa","pl","ps","pt","ro","ru","sd","si","sk","sl","so","sq","sr","ss","su","sv","sw","ta","th","tl","tn","tr","uk","ur","uz","vi","wo","xh","yi","yo","zh","zu"]
lang_block = f'''\nconst AI_TARGET_LANGUAGE_CODES = Object.freeze({json.dumps(languages, ensure_ascii=False, separators=(',', ':'))});
populateTranslationLanguageOptions();

function populateTranslationLanguageOptions() {{
  if (!sessionAiTargetLanguage) return;
  let displayNames = null;
  try {{
    displayNames = typeof Intl.DisplayNames === "function"
      ? new Intl.DisplayNames(["ja"], {{ type: "language" }})
      : null;
  }} catch {{}}
  sessionAiTargetLanguage.textContent = "";
  for (const code of AI_TARGET_LANGUAGE_CODES) {{
    const option = document.createElement("option");
    option.value = code;
    const label = displayNames?.of(code);
    option.textContent = label && label !== code ? `${{label}} (${{code}})` : code.toUpperCase();
    sessionAiTargetLanguage.appendChild(option);
  }}
}}
'''
s = replace_once(s, "let editingFilterTermId = '';\n", "let editingFilterTermId = '';\n" + lang_block, 'language option injection')
write(path, s)

# 8) Simplify management HTML while preserving controls and status nodes.
path = 'public/_admin_spa.html'
s = read(path)
s = s.replace('<p>授業の作成、参加リンクの共有、投影、承認、翻訳をここから操作します。</p>\n', '')
s = s.replace('        <p class="muted small-text">授業名を入力すると、学生用リンクと合言葉を発行します。</p>\n', '')
s = s.replace('                <p class="muted small-text">投影表示・フィルター・AI補助を確認し、下部のボタンでまとめて保存します。</p>\n', '')
s = s.replace('<label class="toggle-row" for="sessionAiModerationEnabled"><span><strong>AI判定</strong><small>辞書で判断しにくい投稿の参考判定</small></span><input id="sessionAiModerationEnabled" type="checkbox"></label>', '<label class="toggle-row" for="sessionAiModerationEnabled"><span><strong>AI判定</strong></span><input id="sessionAiModerationEnabled" type="checkbox"></label>')
s = s.replace('<label class="toggle-row" for="sessionAiTranslationEnabled"><span><strong>AI翻訳</strong><small>原文を残したまま翻訳を追加</small></span><input id="sessionAiTranslationEnabled" type="checkbox"></label>', '<label class="toggle-row" for="sessionAiTranslationEnabled"><span><strong>AI翻訳</strong></span><input id="sessionAiTranslationEnabled" type="checkbox"></label>')
s = regex_once(s, r'<select id="sessionAiTargetLanguage" class="select">.*?</select>', '<select id="sessionAiTargetLanguage" class="select"></select>', 'translation language select simplification', flags=re.S)
s = s.replace('<option value="fast">高速。既知言語を最短で翻訳</option>', '<option value="fast">高速</option>')
s = s.replace('<option value="balanced">標準。速度と精度を両立</option>', '<option value="balanced">標準</option>')
s = s.replace('<option value="accurate">高精度。大型AIで慎重に翻訳</option>', '<option value="accurate">高精度</option>')
s = s.replace('<label class="field-control" for="sessionUnsupportedLanguageMode">日本語・英語以外', '<label class="field-control" for="sessionUnsupportedLanguageMode">未判定言語')
s = s.replace('<div><strong>授業設定をまとめて保存</strong><small>投影表示、投稿承認、フィルター、AI補助を一括反映します。</small></div>', '<strong>授業設定</strong>')
s = s.replace('            <p class="muted">承認。非表示。削除。AI結果の確認をここで行います。</p>\n', '')
s = s.replace('<div class="row between wrap"><p class="muted">ページ番号。コメント数。匿名の理解度を集計します。PDF本体は送信しません。</p><div class="row wrap">', '<div class="row wrap">')
s = s.replace('</div></div>\n          <p id="analyticsStatus"', '</div>\n          <p id="analyticsStatus"', 1)
s = s.replace('<div class="row between wrap"><p class="muted">投影画面を開いた同じPCのブラウザに保存されたコメントです。上限は2,000件です。</p><button id="refreshLocalLogButton" class="button" type="button">更新</button></div>', '<div class="row wrap"><button id="refreshLocalLogButton" class="button" type="button">更新</button></div>')
s = s.replace('app.css?v=0.8.10-nav1', 'app.css?v=0.8.10-min1')
s = s.replace('admin.js?v=0.8.10-nav1', 'admin.js?v=0.8.10-min1')
write(path, s)
write('public/admin/index.html', s)

# Account: remove duplicated instructional panels; keep destructive/security warnings.
path = 'public/account/index.html'
s = read(path)
s = regex_once(s, r'\n        <div class="info-box">\n          <p class="eyebrow">設定の場所</p>.*?</div>\n      </section>', '\n      </section>', 'account duplicate info box', flags=re.S)
s = s.replace('        <a href="#emailSettings">メール</a>\n        <a href="#loginSettings">ログイン状態</a>', '        <a href="#emailSettings">メール</a>\n        <a href="#passwordSettings">パスワード</a>\n        <a href="#loginSettings">ログイン状態</a>')
s = s.replace('            <p class="muted small-text">授業でAI判定や翻訳を使えるか。1日の上限を決めます。</p>\n', '')
s = s.replace('<label class="toggle-row" for="organizationAiEnabled"><span><strong>AI機能を許可</strong><small>各授業でONにした場合だけ動作</small></span><input id="organizationAiEnabled" type="checkbox"></label>', '<label class="toggle-row" for="organizationAiEnabled"><span><strong>AI機能を許可</strong></span><input id="organizationAiEnabled" type="checkbox"></label>')
s = s.replace('                <p class="muted small-text">通常は「推奨」で十分です。ボタンを押すと、辞書パックと種類別の処理基準まで自動設定して保存します。</p>\n', '')
s = s.replace('<button class="filter-preset-button" data-filter-preset="standard" type="button" aria-pressed="false"><strong>推奨</strong><span>迷う投稿は確認し、強い表現は伏字、最重大だけ投稿拒否にします。</span></button>', '<button class="filter-preset-button" data-filter-preset="standard" type="button" aria-pressed="false"><strong>推奨</strong></button>')
s = s.replace('<button class="filter-preset-button" data-filter-preset="strict" type="button" aria-pressed="false"><strong>厳格</strong><span>軽い表現から早めに確認し、伏字の範囲も広げます。</span></button>', '<button class="filter-preset-button" data-filter-preset="strict" type="button" aria-pressed="false"><strong>厳格</strong></button>')
s = s.replace('<button class="filter-preset-button" data-filter-preset="off" type="button" aria-pressed="false"><strong>無効</strong><span>辞書による承認待ち・伏字・投稿拒否を停止します。</span></button>', '<button class="filter-preset-button" data-filter-preset="off" type="button" aria-pressed="false"><strong>無効</strong></button>')
s = s.replace('<div><h3>語句を追加</h3><p class="muted small-text">追加した語句は組織内の授業で共通利用できます。</p></div>', '<h3>語句を追加</h3>')
s = s.replace('              <p class="muted small-text">有効・無効は変えず、承認待ち・伏字・投稿拒否のレベルだけを全種類へそろえます。</p>\n', '')
s = s.replace('            <p class="muted small-text policy-order-help">基準は「承認待ち ≤ 伏字 ≤ 投稿拒否」の順にします。数字が小さいほど厳しい設定です。</p>\n', '')
s = s.replace('              <p class="muted small-text">ここを変更すると現在の設定は「カスタム・未保存」になります。通常は一括設定だけで十分です。</p>\n', '')
s = s.replace('<p class="muted">このフォームを送信した場合だけパスワードを変更します。通常のログインや画面移動でパスワードが変更されることはありません。</p>', '<p class="muted">このフォームを送信した場合だけ変更されます。</p>')
s = s.replace('          <p class="muted">この端末からログアウトします。</p>\n', '')
s = s.replace('app.css?v=0.8.10-nav1', 'app.css?v=0.8.10-min1')
write(path, s)

# Master: remove role explainer card and redundant helper prose.
path = 'public/master/index.html'
s = read(path)
s = s.replace('        <p>メンバー、権限、招待、組織内の授業を管理します。授業を作成するだけの場合は授業管理を使用してください。</p>\n', '')
s = s.replace('          <p class="muted small-text">確認メールを送り、承認後に組織へ追加します。</p>\n', '')
s = regex_once(s, r'\n        <section class="workspace-panel">\n          <h2>権限の目安</h2>.*?</section>', '', 'master role explainer', flags=re.S)
s = s.replace('<div><h2>進行中の授業</h2><p class="muted small-text">OwnerとAdminは組織内の全授業を操作できます。</p></div>', '<h2>進行中の授業</h2>')
s = s.replace('<div class="detail-body"><div class="row between wrap"><p class="muted small-text">直近50件を表示します。</p><button id="refreshAuditButton" class="button">再読み込み</button></div><div id="auditList" class="teacher-list"></div></div>', '<div class="detail-body"><div class="row wrap"><button id="refreshAuditButton" class="button">再読み込み</button></div><div id="auditList" class="teacher-list"></div></div>')
s = s.replace('app.css?v=0.8.10-nav1', 'app.css?v=0.8.10-min1')
write(path, s)

# Home: keep hero, join, concise capabilities; remove repeated role/flow/CTA blocks.
path = 'public/index.html'
s = read(path)
s = s.replace('<p class="clear-lead">学生は登録せずに参加できます。先生はコメントの受付、表示、承認、翻訳を授業ごとに切り替えられます。</p>', '<p class="clear-lead">匿名コメントをリアルタイムに共有。承認・翻訳は授業ごとに切り替えられます。</p>')
s = regex_once(s, r'\n        <dl class="clear-facts">.*?</dl>', '', 'home facts', flags=re.S)
s = regex_once(s, r'\n      <div class="role-entry-grid".*?</div>\n    </section>', '\n    </section>', 'home role cards', flags=re.S)
s = s.replace('        <p>6文字の合言葉を半角英数字で入力してください。</p>\n', '')
s = regex_once(s, r'\n    <section class="clear-section" aria-labelledby="flowHeading">.*?</section>', '', 'home flow', flags=re.S)
s = regex_once(s, r'\n    <section class="clear-bottom-cta">.*?</section>', '', 'home bottom cta', flags=re.S)
s = s.replace('app.css?v=0.8.10-nav1', 'app.css?v=0.8.10-min1')
write(path, s)

# Bump shared CSS query on remaining HTML pages to avoid stale cached styling.
for html in (ROOT / 'public').rglob('*.html'):
    text = html.read_text(encoding='utf-8')
    updated = re.sub(r'app\.css\?v=[A-Za-z0-9._-]+', 'app.css?v=0.8.10-min1', text)
    if updated != text:
        html.write_text(updated, encoding='utf-8')

# Flat, high-contrast, low-decoration finish.
path = 'public/assets/app.css'
s = read(path)
minimal_css = '''\n\n/* Minimal application finish: fewer decorative layers, clearer hierarchy. */
.app-topbar, .clear-site-header, .compact-public-header {
  box-shadow: none !important;
  border-bottom: 1px solid #d9d9d9;
  background: #fff;
}
.brand-mark, .button, .input, .select, .textarea,
.workspace-panel, .workspace-detail, .section, .info-box,
.state-tile, .filter-preset-button, .auth-shell, .auth-form-panel {
  border-radius: 0 !important;
  box-shadow: none !important;
}
.admin-page .workspace-panel, .admin-page .workspace-detail,
.account-page .workspace-panel, .account-page .workspace-detail,
.internal-page .workspace-panel, .internal-page .workspace-detail,
.account-page .section, .internal-page .section {
  border: 1px solid #dedede;
  background: #fff;
}
.workspace-panel-primary { border-color: #111 !important; }
.state-tile { background: #f7f7f7 !important; }
.admin-page .eyebrow, .account-page .eyebrow, .internal-page .eyebrow { display: none; }
.admin-home-grid, .session-workspace, #accountSection, .internal-content { margin-top: 18px; }
.workspace-panel, .detail-body { padding: clamp(16px, 2.2vw, 24px); }
.settings-group { padding-block: 16px; }
.internal-two-column { grid-template-columns: minmax(0, 1fr); }
.account-summary-grid { grid-template-columns: minmax(0, 1fr); }
.filter-preset-actions { gap: 8px; }
.filter-preset-button { min-height: 44px; }
.session-settings-savebar { border-top: 1px solid #dedede; padding-top: 16px; }
.clear-public-page .clear-hero { grid-template-columns: minmax(0, 1fr); max-width: 920px; }
.clear-public-page .clear-hero-copy { max-width: 760px; }
.clear-public-page .clear-feature-grid article { border-radius: 0; box-shadow: none; }
.clear-public-page .clear-section, .home-join-panel { box-shadow: none; border-radius: 0; }
'''
if '/* Minimal application finish:' not in s:
    s += minimal_css
write(path, s)

# 9) Permanent regression for load hardening + full language UI + simplified markup.
test_path = ROOT / 'scripts/test-load-hardening.mjs'
test_path.write_text('''import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nimport { AI_TARGET_LANGUAGES } from "../src/ai/validation.js";\n\nconst read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");\nconst publicRoute = read("src/routes/public-v2.js");\nconst comments = read("src/comments/repository.js");\nconst realtime = read("src/realtime/repository.js");\nconst room = read("src/realtime/comment-room.js");\nconst aiRepository = read("src/ai/repository.js");\nconst wrangler = read("wrangler.toml");\nconst adminJs = read("public/assets/admin.js");\nconst adminHtml = read("public/_admin_spa.html");\nconst accountHtml = read("public/account/index.html");\nconst homeHtml = read("public/index.html");\n\nassert.match(publicRoute, /loadPublicMessageSession/);\nassert.match(publicRoute, /COMMENT_ROOM_RETRY_DELAYS_MS = Object\\.freeze\\(\\[40, 120\\]\\)/);\nassert.match(publicRoute, /code was updated/i);\nassert.match(comments, /inspectIdempotencyKey/);\nassert.match(realtime, /UPDATE realtime_events[\\s\\S]*RETURNING id, organization_id/);\nassert.match(room, /if \\(!event\\) \\{[\\s\\S]*findRealtimeEventForComment/);\nassert.match(aiRepository, /hasChangeMetadata/);\n\nconst translationConsumer = wrangler.match(/queue = "cpcv-ai-translation-jobs"[\\s\\S]*?dead_letter_queue = "cpcv-ai-translation-dlq"/)?.[0] || "";\nconst moderationConsumer = wrangler.match(/queue = "cpcv-ai-moderation-jobs"[\\s\\S]*?dead_letter_queue = "cpcv-ai-moderation-dlq"/)?.[0] || "";\nassert.match(translationConsumer, /max_batch_size = 3/);\nassert.match(moderationConsumer, /max_batch_size = 3/);\n\nconst languageMatch = adminJs.match(/AI_TARGET_LANGUAGE_CODES = Object\\.freeze\\((\\[[^\\n]+\\])\\);/);\nassert.ok(languageMatch, "admin language list must be present");\nassert.deepEqual(JSON.parse(languageMatch[1]), [...AI_TARGET_LANGUAGES]);\nassert.match(adminHtml, /<select id="sessionAiTargetLanguage" class="select"><\\/select>/);\nassert.doesNotMatch(adminHtml, /既知言語を最短|速度と精度を両立|大型AIで慎重/);\nassert.doesNotMatch(accountHtml, /設定の場所/);\nassert.doesNotMatch(homeHtml, /授業開始までの3段階/);\nassert.doesNotMatch(homeHtml, /role-entry-grid/);\nconsole.log("load hardening and minimal UI regression passed");\n''', encoding='utf-8')

# Add the permanent regression to the standard v0.8.10 gate.
path = 'package.json'
data = json.loads(read(path))
old = data['scripts']['check:v0810']
if 'test-load-hardening.mjs' not in old:
    data['scripts']['check:v0810'] = old + ' && node scripts/test-load-hardening.mjs'
write(path, json.dumps(data, ensure_ascii=False, indent=2) + '\n')

print('final load/UI patch applied')
