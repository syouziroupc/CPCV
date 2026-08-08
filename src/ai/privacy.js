const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const URL_PATTERN = /\bhttps?:\/\/[^\s]+/i;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const JAPAN_POSTAL_PATTERN = /\b\d{3}-\d{4}\b/;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/;
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s+prompt/i,
  /developer\s+message/i,
  /jailbreak/i,
  /指示を無視/i,
  /システムプロンプト/i,
  /前の指示/i
];

export function inspectCommentPrivacy(textValue) {
  const text = String(textValue || "");
  const reasons = [];
  if (EMAIL_PATTERN.test(text)) reasons.push("email");
  if (URL_PATTERN.test(text)) reasons.push("url");
  if (looksLikePhoneNumber(text)) reasons.push("phone");
  if (JAPAN_POSTAL_PATTERN.test(text)) reasons.push("postal_code");
  if (looksLikePaymentCard(text)) reasons.push("payment_card");
  return {
    sensitive: reasons.length > 0,
    reasons,
    promptInjection: PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text))
  };
}

function looksLikePhoneNumber(text) {
  for (const match of text.matchAll(PHONE_PATTERN)) {
    const raw = String(match[0] || "").trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) continue;
    if (raw.startsWith("+")) return true;
    if (/^0\d{9,10}$/.test(digits)) return true;
    if (/[\s().-]/.test(raw) && digits.length >= 10) return true;
  }
  return false;
}

function looksLikePaymentCard(text) {
  const match = text.match(CARD_PATTERN)?.[0];
  if (!match) return false;
  const digits = match.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alternate = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}
