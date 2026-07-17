const LETTER_NUMBER_OR_MARK = /[\p{L}\p{N}\p{M}]/u;
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;
const FORMAT = /\p{Cf}/u;
const PROLONGED_MARKS = new Set(["ー", "ｰ"]);

const CONFUSABLE_MAP = new Map(Object.entries({
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j",
  "Α": "a", "Β": "b", "Ε": "e", "Ζ": "z", "Η": "h", "Ι": "i", "Κ": "k", "Μ": "m", "Ν": "n", "Ο": "o", "Ρ": "p", "Τ": "t", "Υ": "y", "Χ": "x",
  "α": "a", "β": "b", "ε": "e", "ι": "i", "κ": "k", "ο": "o", "ρ": "p", "τ": "t", "υ": "y", "χ": "x"
}));

export function normalizeFilterTerm(value) {
  const term = String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001F\u007F-\u009F]/gu, " ").replace(/\s+/gu, " ").trim();
  const chars = Array.from(term);
  if (!chars.length || chars.length > 80) return null;
  const normalized = normalizeForFilter(term);
  if (!normalized.compact || Array.from(normalized.compact).length > 160) return null;
  return { term, normalizedTerm: normalized.canonical, compactTerm: normalized.compact };
}

export function normalizeForFilter(value) {
  const original = String(value ?? "");
  const originalChars = Array.from(original);
  const sourceChars = [];
  const sourceToOriginal = [];
  let originalOffset = 0;

  for (const segment of graphemeSegments(original)) {
    const segmentLength = Array.from(segment).length;
    const mappedSegment = segment.normalize("NFKC").toLowerCase();
    for (const char of Array.from(mappedSegment)) {
      sourceChars.push(katakanaToHiragana(char));
      sourceToOriginal.push({ start: originalOffset, end: originalOffset + segmentLength });
    }
    originalOffset += segmentLength;
  }

  const canonicalChars = [];
  const compactChars = [];
  const canonicalToOriginal = [];
  const compactToOriginal = [];
  let removedCount = 0;

  for (let index = 0; index < sourceChars.length; index += 1) {
    const mapped = sourceChars[index];
    if (isIgnorable(mapped) || isControl(mapped)) {
      removedCount += 1;
      continue;
    }
    canonicalChars.push(mapped);
    canonicalToOriginal.push(sourceToOriginal[index]);
    if (LETTER_NUMBER_OR_MARK.test(mapped) && !PROLONGED_MARKS.has(mapped)) {
      compactChars.push(mapped);
      compactToOriginal.push(sourceToOriginal[index]);
    } else {
      removedCount += 1;
    }
  }

  const compact = compactChars.join("");
  const skeleton = Array.from(compact).map((char) => CONFUSABLE_MAP.get(char) || char).join("");
  return {
    source: original,
    sourceChars: originalChars,
    canonical: canonicalChars.join(""),
    compact,
    skeleton,
    canonicalToOriginal,
    compactToOriginal,
    removedCount
  };
}

export function maskSourceSpans(source, spans, maskCharacter = "＊") {
  const chars = Array.from(String(source ?? ""));
  const mask = Array.from(String(maskCharacter || "＊"))[0] || "＊";
  for (const span of mergeSpans(spans)) {
    for (let index = span.start; index < span.end && index < chars.length; index += 1) {
      if (!/\s/u.test(chars[index])) chars[index] = mask;
    }
  }
  return chars.join("");
}

export function mapCompactSpan(normalized, start, length) {
  return mapIndexedSpan(normalized.compactToOriginal, start, length);
}

export function mapCanonicalSpan(normalized, start, length) {
  return mapIndexedSpan(normalized.canonicalToOriginal, start, length);
}

export function confusableSkeleton(value) {
  return Array.from(String(value || "")).map((char) => CONFUSABLE_MAP.get(char) || char).join("");
}

export function hasWordBoundaries(normalized, span) {
  const before = previousSignificant(normalized.sourceChars, span.start - 1);
  const after = nextSignificant(normalized.sourceChars, span.end);
  return !isWordCharacter(before) && !isWordCharacter(after);
}

function mapIndexedSpan(indexMap, start, length) {
  const first = indexMap[start];
  const last = indexMap[start + length - 1];
  if (!first || !last) return null;
  return { start: first.start, end: last.end };
}

function graphemeSegments(value) {
  if (!value) return [];
  try {
    const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), (item) => item.segment);
  } catch {
    return Array.from(value);
  }
}

function katakanaToHiragana(char) {
  const code = char.codePointAt(0);
  if (code >= 0x30A1 && code <= 0x30F6) return String.fromCodePoint(code - 0x60);
  if (code === 0x30FD || code === 0x30FE) return String.fromCodePoint(code - 0x60);
  return char;
}

function isIgnorable(char) {
  const code = char.codePointAt(0);
  return FORMAT.test(char)
    || (code >= 0xFE00 && code <= 0xFE0F)
    || (code >= 0xE0100 && code <= 0xE01EF);
}

function isControl(char) {
  const code = char.codePointAt(0);
  return (code >= 0 && code <= 0x1F) || (code >= 0x7F && code <= 0x9F);
}

function previousSignificant(chars, index) {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const char = chars[cursor];
    if (!isIgnorable(char) && !isControl(char)) return char;
  }
  return null;
}

function nextSignificant(chars, index) {
  for (let cursor = index; cursor < chars.length; cursor += 1) {
    const char = chars[cursor];
    if (!isIgnorable(char) && !isControl(char)) return char;
  }
  return null;
}

function isWordCharacter(char) {
  return Boolean(char && (LETTER_OR_NUMBER.test(char) || /\p{M}/u.test(char)));
}

function mergeSpans(spans) {
  const sorted = (Array.isArray(spans) ? spans : [])
    .filter((span) => Number.isInteger(span?.start) && Number.isInteger(span?.end) && span.end > span.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const span of sorted) {
    const previous = merged.at(-1);
    if (!previous || span.start > previous.end) merged.push({ start: span.start, end: span.end });
    else previous.end = Math.max(previous.end, span.end);
  }
  return merged;
}
