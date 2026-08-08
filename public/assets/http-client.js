export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  let timedOut = false;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener?.("abort", onExternalAbort, { once: true });
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, Number(timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS));
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw codedRequestError("REQUEST_TIMEOUT", error);
    if (externalSignal?.aborted) throw error;
    if (error instanceof TypeError) throw codedRequestError("NETWORK_ERROR", error);
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    externalSignal?.removeEventListener?.("abort", onExternalAbort);
  }
}

function codedRequestError(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}
