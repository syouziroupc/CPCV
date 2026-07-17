const JAPANESE_KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN = /\p{Script=Han}/u;
const LATIN = /\p{Script=Latin}/u;
const ASCII_LETTER = /[A-Za-z]/u;
const NON_ASCII_LATIN = /[\p{Script=Latin}&&[^\x00-\x7F]]/v;
const OTHER_LETTER_SCRIPTS = /[\p{L}&&[^\p{Script=Latin}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]]/v;
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;

const ENGLISH_COMMON = new Set(`a an and are as at be because but by can class comment could did do does for from good had has have he hello her here him his how i if in interesting is it its like may me my no not of on one or our she should so student teacher than that the their them there they this to very was we were what when where which who why will with would yes you your agree disagree thanks thank ok okay lol`.split(/\s+/));
const ENGLISH_STRONG = new Set(`and are because but can class comment could did does for from good has have hello here how if interesting is it like not should student teacher than that the their them there they this very was were what when where which who why will with would yes you your agree disagree thanks thank`.split(/\s+/));
const JAPANESE_HAN_ONLY = new Set(`賛成 反対 同意 質問 回答 先生 学生 日本 社会 政治 政府批判 経済 環境 授業 課題 意見 原因 結果 問題 改善 必要 不要 可能 不可能 良い 悪い 重要 理由`.split(/\s+/));

export function detectCommentLanguage(value) {
  const text = String(value ?? '').normalize('NFKC').trim();
  const letters = Array.from(text).filter((char) => LETTER_OR_MARK.test(char));
  if (!letters.length) return decision('neutral', 1000, true, 'no_letters');
  if (JAPANESE_KANA.test(text)) return decision('ja', 1000, true, 'kana');
  if (OTHER_LETTER_SCRIPTS.test(text)) return decision('other', 980, false, 'unsupported_script');
  if (HAN.test(text)) {
    const compact = text.replace(/[\p{P}\p{S}\p{Z}\p{N}]/gu, '');
    if (JAPANESE_HAN_ONLY.has(compact)) return decision('ja', 880, true, 'japanese_han_whitelist');
    return decision('other', 650, false, 'han_ambiguous');
  }
  if (NON_ASCII_LATIN.test(text)) return decision('other', 850, false, 'non_ascii_latin');
  if (LATIN.test(text) || ASCII_LETTER.test(text)) {
    const tokens = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
    if (!tokens.length) return decision('other', 500, false, 'latin_unresolved');
    const common = tokens.filter((token) => ENGLISH_COMMON.has(token)).length;
    const strong = tokens.filter((token) => ENGLISH_STRONG.has(token)).length;
    const score = common / tokens.length;
    const strongScore = strong / tokens.length;
    if (strong >= 1 && (tokens.length <= 5 || strongScore >= 0.2)) {
      return decision('en', Math.round(760 + Math.min(220, strongScore * 300)), true, 'english_strong_words');
    }
    if (common >= 2 && score >= 0.5) {
      return decision('en', Math.round(700 + Math.min(180, score * 180)), true, 'english_words');
    }
    return decision('other', tokens.length <= 3 ? 650 : 550, false, 'latin_ambiguous');
  }
  return decision('other', 500, false, 'unresolved');
}

export function isSupportedFilterLanguage(code) {
  return code === 'ja' || code === 'en' || code === 'neutral';
}

function decision(code, confidenceMilli, supported, reason) {
  return { code, confidenceMilli, supported, reason, aiRequired: !supported };
}
