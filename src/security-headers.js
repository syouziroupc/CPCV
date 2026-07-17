export const BASE_SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "permissions-policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "cross-origin-resource-policy": "same-origin",
  "strict-transport-security": "max-age=31536000"
});

export function applyBaseSecurityHeaders(headers, requestUrl = "") {
  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) headers.set(name, value);
  return headers;
}

export function applyHtmlSecurityHeaders(headers, requestUrl) {
  applyBaseSecurityHeaders(headers, requestUrl);
  const url = new URL(requestUrl);
  const socketOrigin = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
  headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      `connect-src 'self' ${socketOrigin}`,
      "worker-src 'self' blob:",
      "font-src 'self' data:",
      "media-src 'self' blob:",
      "manifest-src 'self'"
    ].join("; ")
  );
  headers.set("cross-origin-opener-policy", "same-origin");
  return headers;
}

