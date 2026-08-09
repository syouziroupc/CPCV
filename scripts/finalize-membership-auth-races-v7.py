from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}\n--- OLD ---\n{old[:1200]}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# ---------------------------------------------------------------------------
# Member mutation must be optimistic against the exact role/status/version that
# was authorized. Otherwise a concurrent Teacher->Admin promotion can be
# overwritten by an Admin's stale suspend/delete request.
# ---------------------------------------------------------------------------
replace_once(
    "src/routes/organization.js",
    '''    guardedMembershipUpdate(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role,
      status,
      removedAt: null,
      updatedAt: operationMarker
    }),''',
    '''    guardedMembershipUpdate(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role,
      status,
      removedAt: null,
      updatedAt: operationMarker,
      expectedRole: current.role,
      expectedStatus: current.status,
      expectedUpdatedAt: current.updated_at
    }),'''
)
replace_once(
    "src/routes/organization.js",
    '''    guardedMembershipUpdate(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role: current.role,
      status: "removed",
      removedAt: operationMarker,
      updatedAt: operationMarker
    }),''',
    '''    guardedMembershipUpdate(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role: current.role,
      status: "removed",
      removedAt: operationMarker,
      updatedAt: operationMarker,
      expectedRole: current.role,
      expectedStatus: current.status,
      expectedUpdatedAt: current.updated_at
    }),'''
)
replace_once(
    "src/routes/organization.js",
    '''function guardedMembershipUpdate(db, { organizationId, userId, role, status, removedAt, updatedAt }) {
  return db.prepare(
    `UPDATE organization_members
     SET role = ?1, status = ?2, updated_at = ?3, removed_at = ?4
     WHERE organization_id = ?5 AND user_id = ?6
       AND NOT (
         role = 'owner' AND status = 'active'
         AND NOT (?1 = 'owner' AND ?2 = 'active')
         AND (
           SELECT COUNT(*) FROM organization_members owners
           WHERE owners.organization_id = ?5
             AND owners.role = 'owner'
             AND owners.status = 'active'
         ) <= 1
       )`
  ).bind(role, status, updatedAt, removedAt, organizationId, userId);
}''',
    '''function guardedMembershipUpdate(db, {
  organizationId, userId, role, status, removedAt, updatedAt,
  expectedRole, expectedStatus, expectedUpdatedAt
}) {
  return db.prepare(
    `UPDATE organization_members
     SET role = ?1, status = ?2, updated_at = ?3, removed_at = ?4
     WHERE organization_id = ?5 AND user_id = ?6
       AND role = ?7 AND status = ?8 AND updated_at = ?9
       AND NOT (
         role = 'owner' AND status = 'active'
         AND NOT (?1 = 'owner' AND ?2 = 'active')
         AND (
           SELECT COUNT(*) FROM organization_members owners
           WHERE owners.organization_id = ?5
             AND owners.role = 'owner'
             AND owners.status = 'active'
         ) <= 1
       )`
  ).bind(
    role, status, updatedAt, removedAt, organizationId, userId,
    expectedRole, expectedStatus, expectedUpdatedAt
  );
}'''
)

# ---------------------------------------------------------------------------
# Manager-issued reset must revalidate the exact organization membership and
# role that was authorized at request time. This blocks Admin->Teacher reset
# after a concurrent Teacher->Admin promotion or membership removal.
# ---------------------------------------------------------------------------
replace_once(
    "src/routes/account-lifecycle.js",
    '''         AND (SELECT COUNT(*) FROM organization_members WHERE user_id = ?2 AND status = 'active') <= 1`
    ).bind(nowIso, target.user_id, target.email),''',
    '''         AND (SELECT COUNT(*) FROM organization_members WHERE user_id = ?2 AND status = 'active') <= 1
         AND EXISTS (
           SELECT 1 FROM organization_members m
           WHERE m.organization_id = ?4 AND m.user_id = ?2
             AND m.role = ?5 AND m.status = 'active'
         )`
    ).bind(nowIso, target.user_id, target.email, auth.organizationId, target.role),'''
)
replace_once(
    "src/routes/account-lifecycle.js",
    '''         AND (SELECT COUNT(*) FROM organization_members WHERE user_id = ?2 AND status = 'active') <= 1`
    ).bind(tokenId, target.user_id, tokenHash, auth.userId, nowIso, expiresAt, target.email),''',
    '''         AND (SELECT COUNT(*) FROM organization_members WHERE user_id = ?2 AND status = 'active') <= 1
         AND EXISTS (
           SELECT 1 FROM organization_members m
           WHERE m.organization_id = ?8 AND m.user_id = ?2
             AND m.role = ?9 AND m.status = 'active'
         )`
    ).bind(
      tokenId, target.user_id, tokenHash, auth.userId, nowIso, expiresAt, target.email,
      auth.organizationId, target.role
    ),'''
)
replace_once(
    "src/routes/account-lifecycle.js",
    '''  if (!created) {
    const memberships = await env.DB_V2.prepare(
      `SELECT COUNT(*) AS count FROM organization_members WHERE user_id = ?1 AND status = 'active'`
    ).bind(target.user_id).first();
    if (Number(memberships?.count || 0) > 1) throw new AuthError(409, "RESET_REQUIRES_SYSTEM_OPERATOR");
    const current = await env.DB_V2.prepare(
      `SELECT email, email_verified_at, status FROM users WHERE id = ?1 LIMIT 1`
    ).bind(target.user_id).first();
    if (!current || current.status !== "active" || !current.email_verified_at
        || normalizeEmail(current.email) !== normalizeEmail(target.email)) {
      throw new AuthError(409, "MEMBER_EMAIL_REQUIRED");
    }
    throw new AuthError(409, "RESET_UPDATE_CONFLICT");
  }''',
    '''  if (!created) {
    const freshMember = await env.DB_V2.prepare(
      `SELECT m.role, m.status, u.email, u.email_verified_at, u.status AS user_status
       FROM organization_members m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ?1 AND m.user_id = ?2 LIMIT 1`
    ).bind(auth.organizationId, target.user_id).first();
    if (!freshMember || freshMember.status !== "active" || freshMember.user_status !== "active") {
      throw new AuthError(404, "MEMBER_NOT_FOUND");
    }
    requireRoleAssignment(auth.role, freshMember.role);
    const memberships = await env.DB_V2.prepare(
      `SELECT COUNT(*) AS count FROM organization_members WHERE user_id = ?1 AND status = 'active'`
    ).bind(target.user_id).first();
    if (Number(memberships?.count || 0) > 1) throw new AuthError(409, "RESET_REQUIRES_SYSTEM_OPERATOR");
    if (!freshMember.email_verified_at
        || normalizeEmail(freshMember.email) !== normalizeEmail(target.email)) {
      throw new AuthError(409, "MEMBER_EMAIL_REQUIRED");
    }
    throw new AuthError(409, "RESET_UPDATE_CONFLICT");
  }'''
)

# ---------------------------------------------------------------------------
# Dedicated races: an Admin authorization snapshot may not mutate or reset a
# target after an Owner concurrently promotes that Teacher to Admin.
# ---------------------------------------------------------------------------
replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''  await testInvitationAuthorizationAndQuotas();
  await testEmailIdentityInvariants();''',
    '''  await testInvitationAuthorizationAndQuotas();
  await testMembershipAuthorizationRaces();
  await testEmailIdentityInvariants();'''
)

marker = '''async function testEmailIdentityInvariants() {\n'''
addition = r'''async function testMembershipAuthorizationRaces() {
  const h = createHarness();
  try {
    const owner = await register(h, "race-owner@example.com", "Race Owner");

    let response = await h.api("/api/org/invitations", {
      method: "POST", auth: owner, body: { email: "race-admin@example.com", role: "admin" }
    });
    check("authorization-race Admin invitation is created", response.status === 202);
    await h.drain();
    let token = tokenFromMessage(h.emails.at(-1), "accept-invitation");
    response = await h.api("/api/auth/invitations/accept", {
      method: "POST", body: { token, displayName: "Race Admin", password: PASSWORD }
    });
    const adminData = await response.json();
    const admin = { data: adminData, cookie: cookieFrom(response), csrf: adminData.csrfToken };
    check("authorization-race Admin account is active", response.status === 201 && adminData.organization.role === "admin");

    async function inviteTeacher(email, displayName) {
      let r = await h.api("/api/org/invitations", {
        method: "POST", auth: owner, body: { email, role: "teacher" }
      });
      if (r.status !== 202) throw new Error(`teacher invitation failed ${r.status}`);
      await h.drain();
      const inviteToken = tokenFromMessage(h.emails.at(-1), "accept-invitation");
      r = await h.api("/api/auth/invitations/accept", {
        method: "POST", body: { token: inviteToken, displayName, password: PASSWORD }
      });
      const data = await r.json();
      if (r.status !== 201) throw new Error(`teacher acceptance failed ${r.status}: ${JSON.stringify(data)}`);
      return data;
    }

    const updateTarget = await inviteTeacher("race-update@example.com", "Race Update Teacher");
    const updateTargetId = updateTarget.user.id;
    h.db.beforeBatch = (statements) => {
      if (!statements.some((statement) => statement.sql.includes("UPDATE organization_members")
          && statement.sql.includes("SET role = ?1, status = ?2"))) return false;
      const changedAt = new Date(Date.now() + 5000).toISOString();
      h.sqlite.prepare(
        "UPDATE organization_members SET role = 'admin', updated_at = ? WHERE organization_id = ? AND user_id = ?"
      ).run(changedAt, owner.data.organization.id, updateTargetId);
      return true;
    };
    response = await h.api(`/api/org/members/${encodeURIComponent(updateTargetId)}`, {
      method: "PATCH", auth: admin, body: { status: "suspended" }
    });
    check("stale Admin member update is rejected after concurrent Teacher-to-Admin promotion", response.status === 409,
      await response.clone().json());
    const afterUpdateRace = h.row(
      "SELECT role,status FROM organization_members WHERE organization_id = ?1 AND user_id = ?2",
      owner.data.organization.id, updateTargetId
    );
    check("stale member update cannot overwrite the concurrent promotion",
      afterUpdateRace?.role === "admin" && afterUpdateRace?.status === "active", afterUpdateRace);

    const deleteTarget = await inviteTeacher("race-delete@example.com", "Race Delete Teacher");
    const deleteTargetId = deleteTarget.user.id;
    h.db.beforeBatch = (statements) => {
      if (!statements.some((statement) => statement.sql.includes("UPDATE organization_members")
          && statement.sql.includes("SET role = ?1, status = ?2"))) return false;
      const changedAt = new Date(Date.now() + 6000).toISOString();
      h.sqlite.prepare(
        "UPDATE organization_members SET role = 'admin', updated_at = ? WHERE organization_id = ? AND user_id = ?"
      ).run(changedAt, owner.data.organization.id, deleteTargetId);
      return true;
    };
    response = await h.api(`/api/org/members/${encodeURIComponent(deleteTargetId)}`, {
      method: "DELETE", auth: admin
    });
    check("stale Admin member removal is rejected after concurrent Teacher-to-Admin promotion", response.status === 409,
      await response.clone().json());
    const afterDeleteRace = h.row(
      "SELECT role,status FROM organization_members WHERE organization_id = ?1 AND user_id = ?2",
      owner.data.organization.id, deleteTargetId
    );
    check("stale member removal cannot remove the concurrently promoted Admin",
      afterDeleteRace?.role === "admin" && afterDeleteRace?.status === "active", afterDeleteRace);

    const resetTarget = await inviteTeacher("race-reset@example.com", "Race Reset Teacher");
    const resetTargetId = resetTarget.user.id;
    const emailsBeforeResetRace = h.emails.length;
    h.db.beforeBatch = (statements) => {
      if (!statements.some((statement) => statement.sql.includes("INSERT INTO password_reset_tokens"))) return false;
      const changedAt = new Date(Date.now() + 7000).toISOString();
      h.sqlite.prepare(
        "UPDATE organization_members SET role = 'admin', updated_at = ? WHERE organization_id = ? AND user_id = ?"
      ).run(changedAt, owner.data.organization.id, resetTargetId);
      return true;
    };
    response = await h.api(`/api/org/members/${encodeURIComponent(resetTargetId)}/password-reset`, {
      method: "POST", auth: admin, body: {}
    });
    const resetRaceBody = await response.clone().json();
    check("manager reset revalidates target role at token-write time",
      response.status === 403 && resetRaceBody.error === "ROLE_FORBIDDEN", resetRaceBody);
    await h.drain();
    check("lost manager-reset authorization creates no reset token or email",
      h.emails.length === emailsBeforeResetRace
        && h.row("SELECT COUNT(*) AS count FROM password_reset_tokens WHERE user_id = ?1", resetTargetId)?.count === 0);
  } finally { h.close(); }
}

'''
path = ROOT / "scripts/test-account-lifecycle-v2.mjs"
text = path.read_text(encoding="utf-8")
if text.count(marker) != 1:
    raise SystemExit("test insertion marker not unique")
path.write_text(text.replace(marker, addition + marker, 1), encoding="utf-8")

print("Membership mutation and manager-reset authorization races hardened")
