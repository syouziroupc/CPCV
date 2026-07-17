export class AuthError extends Error {
  constructor(status, code, options = {}) {
    super(code, options);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
    this.headers = Object.freeze({ ...(options.headers || {}) });
    this.expose = Boolean(options.expose);
  }
}

export function assertAuth(condition, status, code) {
  if (!condition) throw new AuthError(status, code);
}

export function isAuthError(error) {
  return error instanceof AuthError;
}
