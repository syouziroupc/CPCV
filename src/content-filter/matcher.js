import {
  confusableSkeleton,
  hasWordBoundaries,
  mapCanonicalSpan,
  mapCompactSpan,
  maskSourceSpans,
  normalizeForFilter
} from "./normalization.js";

const MAX_TERMS = 2000;
const MAX_FUZZY_CANDIDATES = 64;
const MAX_MATCHES = 100;
const ACTION_WEIGHT = Object.freeze({ allow: 0, review: 1, mask: 2, reject: 3 });
const SPACE_DELIMITED_LANGUAGE_PREFIXES = new Set([
  "ar", "de", "en", "es", "fa", "fr", "he", "hi", "id", "it", "ms", "nl", "pl", "pt", "ru", "tr", "uk", "vi"
]);
const SPACE_DELIMITED_SCRIPTS = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}]/u;
const CJK_OR_UNSEGMENTED_SCRIPTS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

export function evaluateFilterMessage(message, context) {
  if (!context?.settings?.enabled) return emptyDecision(message, context?.settings);
  const normalized = normalizeForFilter(message);
  const policies = new Map((context.policies || []).filter((policy) => policy.enabled).map((policy) => [policy.category, policy]));
  const terms = (context.terms || []).slice(0, MAX_TERMS);
  const matches = [];
  let fuzzyCount = 0;

  for (const term of terms) {
    if (matches.length >= MAX_MATCHES) break;
    const policy = policies.get(term.category);
    if (!policy) continue;
    const compactTerm = String(term.compactTerm || "");
    if (!compactTerm) continue;

    const deterministicMatches = term.matchMode === "strict"
      ? findStrictMatches(normalized, term)
      : findNormalizedMatches(normalized, term);

    for (const match of deterministicMatches) {
      if (matches.length >= MAX_MATCHES) break;
      const policyAction = actionForSeverity(policy, term.severity);
      if (policyAction === "allow") continue;
      matches.push({
        ...match,
        category: term.category,
        severity: term.severity,
        action: policyAction,
        ambiguous: false
      });
    }

    if (deterministicMatches.length || matches.length >= MAX_MATCHES) continue;
    let ambiguousMatch = null;
    if (normalized.skeleton !== normalized.compact) ambiguousMatch = findConfusableMatch(normalized, term);
    if (!ambiguousMatch && term.fuzzyEnabled && fuzzyCount < MAX_FUZZY_CANDIDATES) {
      fuzzyCount += 1;
      ambiguousMatch = fuzzyMatch(normalized, term);
    }
    if (!ambiguousMatch) continue;
    matches.push({
      ...ambiguousMatch,
      category: term.category,
      severity: term.severity,
      action: "review",
      ambiguous: true
    });
  }

  const action = strongestAction(matches.map((match) => match.action));
  const maskSpans = matches.filter((match) => match.action === "mask" && !match.ambiguous).map((match) => match.span);
  const displayMessage = maskSpans.length ? maskSourceSpans(message, maskSpans, context.settings.maskCharacter) : null;
  const ambiguous = matches.some((match) => match.ambiguous || match.action === "review");
  const aiRequired = context.settings.aiRoutingMode === "all"
    || (context.settings.aiRoutingMode === "ambiguous" && ambiguous);
  return {
    enabled: true,
    action,
    displayMessage,
    aiRequired,
    ambiguous,
    version: Number(context.version || 1),
    matches: matches.map((match) => ({
      termId: match.term.id,
      languageCode: match.term.languageCode || "und",
      category: match.category,
      severity: match.severity,
      matchKind: match.matchKind,
      confidenceMilli: match.confidenceMilli,
      obfuscationScore: match.obfuscationScore,
      spanStart: match.span.start,
      spanEnd: match.span.end,
      action: match.action
    }))
  };
}

function findStrictMatches(normalized, term) {
  const target = String(term.normalizedTerm || "");
  const length = Array.from(target).length;
  if (!target || !length) return [];
  const matches = [];
  for (const index of allIndexes(normalized.canonical, target)) {
    const span = mapCanonicalSpan(normalized, Array.from(normalized.canonical.slice(0, index)).length, length);
    if (!span || !boundaryAllowed(normalized, span, term)) continue;
    matches.push({ term, matchKind: "strict", confidenceMilli: 1000, obfuscationScore: 0, span });
  }
  return matches;
}

function findNormalizedMatches(normalized, term) {
  const target = String(term.compactTerm || "");
  const targetLength = Array.from(target).length;
  if (!target || !targetLength) return [];
  const matches = [];
  for (const compactIndex of allCodePointIndexes(normalized.compact, target)) {
    const span = mapCompactSpan(normalized, compactIndex, targetLength);
    if (!span || !boundaryAllowed(normalized, span, term)) continue;
    const inserted = Math.max(0, span.end - span.start - targetLength);
    matches.push({
      term,
      matchKind: inserted > 0 ? "compact" : "strict",
      confidenceMilli: 1000,
      obfuscationScore: Math.min(100, inserted * 25),
      span
    });
  }
  return matches;
}

function findConfusableMatch(normalized, term) {
  const termSkeleton = confusableSkeleton(String(term.compactTerm || ""));
  const targetLength = Array.from(termSkeleton).length;
  for (const skeletonIndex of allCodePointIndexes(normalized.skeleton, termSkeleton)) {
    const span = mapCompactSpan(normalized, skeletonIndex, targetLength);
    if (!span || !boundaryAllowed(normalized, span, term)) continue;
    return { term, matchKind: "confusable", confidenceMilli: 780, obfuscationScore: 70, span };
  }
  return null;
}

function fuzzyMatch(normalized, term) {
  const target = Array.from(String(term.compactTerm || ""));
  if (target.length < 4 || !normalized.compact) return null;
  const source = Array.from(normalized.compact);
  const maxDistance = target.length >= 8 ? 2 : 1;
  const minWindow = Math.max(1, target.length - maxDistance);
  const maxWindow = target.length + maxDistance;
  let best = null;
  for (let start = 0; start < source.length; start += 1) {
    for (let size = minWindow; size <= maxWindow && start + size <= source.length; size += 1) {
      const distance = boundedLevenshtein(target, source.slice(start, start + size), maxDistance);
      if (distance > maxDistance) continue;
      const span = mapCompactSpan(normalized, start, size);
      if (!span || !boundaryAllowed(normalized, span, term)) continue;
      if (!best || distance < best.distance) best = { start, size, distance, span };
      if (distance === 0) break;
    }
  }
  if (!best) return null;
  return {
    term,
    matchKind: "fuzzy",
    confidenceMilli: best.distance === 1 ? 780 : 660,
    obfuscationScore: best.distance === 1 ? 60 : 85,
    span: best.span
  };
}

function boundaryAllowed(normalized, span, term) {
  const mode = term.boundaryMode || "auto";
  if (mode === "substring") return true;
  if (mode === "word") return hasWordBoundaries(normalized, span);
  return requiresWordBoundary(term) ? hasWordBoundaries(normalized, span) : true;
}

function requiresWordBoundary(term) {
  const language = String(term.languageCode || "und").toLowerCase().split("-")[0];
  if (SPACE_DELIMITED_LANGUAGE_PREFIXES.has(language)) return true;
  const compact = String(term.compactTerm || "");
  return SPACE_DELIMITED_SCRIPTS.test(compact) && !CJK_OR_UNSEGMENTED_SCRIPTS.test(compact);
}

function allIndexes(source, target) {
  const output = [];
  let offset = 0;
  while (offset <= source.length - target.length) {
    const index = source.indexOf(target, offset);
    if (index < 0) break;
    output.push(index);
    offset = index + Math.max(1, target.length);
  }
  return output;
}

function allCodePointIndexes(source, target) {
  const sourceChars = Array.from(source);
  const targetChars = Array.from(target);
  const output = [];
  for (let index = 0; index <= sourceChars.length - targetChars.length; index += 1) {
    let same = true;
    for (let cursor = 0; cursor < targetChars.length; cursor += 1) {
      if (sourceChars[index + cursor] !== targetChars[cursor]) { same = false; break; }
    }
    if (same) {
      output.push(index);
      index += Math.max(0, targetChars.length - 1);
    }
  }
  return output;
}

function boundedLevenshtein(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[b.length];
}

function actionForSeverity(policy, severity) {
  if (policy.rejectMinSeverity != null && severity >= policy.rejectMinSeverity) return "reject";
  if (policy.maskMinSeverity != null && severity >= policy.maskMinSeverity) return "mask";
  if (policy.reviewMinSeverity != null && severity >= policy.reviewMinSeverity) return "review";
  return "allow";
}

function strongestAction(actions) {
  return (actions || []).reduce((best, action) => ACTION_WEIGHT[action] > ACTION_WEIGHT[best] ? action : best, "allow");
}

function emptyDecision(message, settings = {}) {
  return {
    enabled: false,
    action: "allow",
    displayMessage: null,
    aiRequired: false,
    ambiguous: false,
    version: 0,
    matches: [],
    maskCharacter: settings.maskCharacter || "＊",
    message
  };
}
