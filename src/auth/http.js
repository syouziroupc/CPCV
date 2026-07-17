import { BASE_SECURITY_HEADERS } from "../security-headers.js";

export const AUTH_JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  ...BASE_SECURITY_HEADERS
});

export function authJson(body, status = 200, extraHeaders = {}) {
  const headers = new Headers(AUTH_JSON_HEADERS);
  for (const [name, value] of Object.entries(extraHeaders || {})) {
    if (value !== undefined && value !== null && value !== "") headers.set(name, String(value));
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}
