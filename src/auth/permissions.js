import { AuthError } from "./errors.js";

export const ROLES = Object.freeze(["owner", "admin", "teacher"]);

export const PERMISSIONS = Object.freeze({
  SELF_READ: "self:read",
  PASSWORD_CHANGE: "password:change",
  ORGANIZATION_READ: "organization:read",
  MEMBERS_LIST: "members:list",
  TEACHER_CREATE: "teacher:create",
  TEACHER_MANAGE: "teacher:manage",
  ADMIN_CREATE: "admin:create",
  ADMIN_MANAGE: "admin:manage",
  OWNER_CREATE: "owner:create",
  OWNER_MANAGE: "owner:manage",
  AUDIT_READ: "audit:read",
  SESSION_CREATE: "session:create",
  SESSION_READ_ALL: "session:read_all",
  SESSION_MANAGE_ALL: "session:manage_all",
  SESSION_MANAGE_OWN: "session:manage_own"
});

const MEMBER_ACTIONS = new Set(["create", "update", "suspend", "resume", "remove", "role-change", "password-reset"]);

const ROLE_PERMISSIONS = Object.freeze({
  owner: new Set(Object.values(PERMISSIONS)),
  admin: new Set([
    PERMISSIONS.SELF_READ,
    PERMISSIONS.PASSWORD_CHANGE,
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.MEMBERS_LIST,
    PERMISSIONS.TEACHER_CREATE,
    PERMISSIONS.TEACHER_MANAGE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.SESSION_CREATE,
    PERMISSIONS.SESSION_READ_ALL,
    PERMISSIONS.SESSION_MANAGE_ALL,
    PERMISSIONS.SESSION_MANAGE_OWN
  ]),
  teacher: new Set([
    PERMISSIONS.SELF_READ,
    PERMISSIONS.PASSWORD_CHANGE,
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.SESSION_CREATE,
    PERMISSIONS.SESSION_MANAGE_OWN
  ])
});

export function hasPermission(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role]?.has(permission));
}

export function requirePermission(auth, permission) {
  if (!auth || !hasPermission(auth.role, permission)) {
    throw new AuthError(403, "ROLE_FORBIDDEN");
  }
  return auth;
}

export function requireRole(auth, allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!auth || !roles.includes(auth.role)) throw new AuthError(403, "ROLE_FORBIDDEN");
  return auth;
}

export function canManageMember(actorRole, targetRole, action = "update") {
  if (!ROLES.includes(actorRole) || !ROLES.includes(targetRole) || !MEMBER_ACTIONS.has(action)) return false;
  if (actorRole === "teacher") return false;
  if (actorRole === "admin") return targetRole === "teacher";
  if (action === "password-reset") return targetRole !== "owner";
  return true;
}
