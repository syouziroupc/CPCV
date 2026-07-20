globalThis.cpcvTurnstileReady = () => {
  globalThis.dispatchEvent(new Event("cpcv:turnstile-ready"));
};
