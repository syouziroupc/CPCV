const JAPANESE_KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN = /\p{Script=Han}/u;
const LATIN = /\p{Script=Latin}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
const AZERBAIJANI_DISTINCTIVE = /[əƏ]/u;
const TURKIC_SHARED_DISTINCTIVE = /[çğıöşüÇĞİÖŞÜ]/u;
const UKRAINIAN_DISTINCTIVE = /[іїєґІЇЄҐ]/u;
const RUSSIAN_DISTINCTIVE = /[ыэёъЫЭЁЪ]/u;

const SCRIPT_LANGUAGES = [
  [/\p{Script=Hangul}/u, 'ko', 'hangul'],
  [/\p{Script=Thai}/u, 'th', 'thai_script'],
  [/\p{Script=Hebrew}/u, 'he', 'hebrew_script'],
  [/\p{Script=Greek}/u, 'el', 'greek_script'],
  [/\p{Script=Georgian}/u, 'ka', 'georgian_script'],
  [/\p{Script=Armenian}/u, 'hy', 'armenian_script'],
  [/\p{Script=Khmer}/u, 'km', 'khmer_script'],
  [/\p{Script=Lao}/u, 'lo', 'lao_script'],
  [/\p{Script=Myanmar}/u, 'my', 'myanmar_script'],
  [/\p{Script=Sinhala}/u, 'si', 'sinhala_script'],
  [/\p{Script=Bengali}/u, 'bn', 'bengali_script'],
  [/\p{Script=Gujarati}/u, 'gu', 'gujarati_script'],
  [/\p{Script=Gurmukhi}/u, 'pa', 'gurmukhi_script'],
  [/\p{Script=Kannada}/u, 'kn', 'kannada_script'],
  [/\p{Script=Malayalam}/u, 'ml', 'malayalam_script'],
  [/\p{Script=Tamil}/u, 'ta', 'tamil_script']
];

const JAPANESE_HAN_ONLY = new Set(`賛成 反対 同意 質問 回答 先生 学生 日本 社会 政治 政府批判 経済 環境 授業 課題 意見 原因 結果 問題 改善 必要 不要 可能 不可能 良い 悪い 重要 理由`.split(/\s+/));
const RUSSIAN_COMMON = new Set(`и в не на что я с он как это по но они мы к у вы за от о из для так да нет есть был быть урок студент учитель спасибо`.split(/\s+/));
const UKRAINIAN_COMMON = new Set(`і в не на що я з він як це але вони ми ви для так так ні є був бути урок студент вчитель дякую`.split(/\s+/));
const ENGLISH_CASUAL = new Set(`aint ain't arent aren't cant can't couldnt couldn't didnt didn't doesnt doesn't dont don't gonna gotta wanna yall y'all idk imo imho ngl tbh btw rn lol lmao wtf bro dude lowkey highkey kinda sorta cuz bc pls plz thx yep yeah nah`.split(/\s+/));

const LATIN_HINTS = Object.freeze({
  en: new Set(`a an and are as at be because but by can could did do does during for from had has have he her here how i if in into is it its may my no not of on or our over she should so than that the their them there they this through to very was we were what when where which who why will with without would you your classroom discussion`.split(/\s+/)),
  es: new Set(`a al algo ayudar como con de del el ella en energía eólica es esta este futuro hay importante la las lo los más no para pero por puede que se si sin solar su sus un una y yo gracias hola clase estudiante profesor`.split(/\s+/)),
  fr: new Set(`à au aux avec ce ces comme dans de des du elle en est et il la le les mais ne nous ou pas pour que qui sans se son sur un une vous merci bonjour classe étudiant professeur`.split(/\s+/)),
  de: new Set(`aber als am an auch auf aus bei das dem den der die ein eine einer eines er es für hat ich im in ist mit nicht oder sie sind und von was wir zu zum zur danke hallo klasse student lehrer`.split(/\s+/)),
  it: new Set(`a al alla che con da del della di e è gli ha il in io la le ma non o per più questo se si sono su un una grazie ciao classe studente insegnante`.split(/\s+/)),
  pt: new Set(`a ao com da de do e ela ele em é eu não o os para por que se sem sua um uma você nós mas obrigado olá aula estudante professor`.split(/\s+/)),
  tr: new Set(`ama ben bir bu çok da de değil ders evet hayır için ile iyi katılıyorum merhaba mi nasıl ne neden o olarak öğrenci öğretmen siz teşekkür var yok çünkü bence anlamadım hocam`.split(/\s+/)),
  az: new Set(`mən sən biz onlar və amma bəli xeyr niyə necə görə tələbə müəllim təşəkkür yaxşı pis başa düşmədim dərsdir fikrimcə`.split(/\s+/)),
  id: new Set(`ada adalah aku anda atau dengan di dan dari ini itu karena ke kelas mahasiswa tidak untuk yang guru saya kami mereka terima kasih`.split(/\s+/)),
  ms: new Set(`ada adalah aku anda atau dengan di dan dari ini itu kerana ke kelas pelajar tidak untuk yang guru saya kami mereka terima kasih`.split(/\s+/)),
  vi: new Set(`và là của không một cho với trong tôi bạn chúng lớp sinh viên giáo viên cảm ơn`.split(/\s+/))
});

export function detectCommentLanguage(value) {
  const text = String(value ?? '').normalize('NFKC').trim();
  const letters = Array.from(text).filter((char) => LETTER_OR_MARK.test(char));
  if (!letters.length) return decision('neutral', 1000, true, 'no_letters');
  if (JAPANESE_KANA.test(text)) return decision('ja', 1000, true, 'kana');

  for (const [pattern, code, reason] of SCRIPT_LANGUAGES) {
    if (pattern.test(text)) return decision(code, 980, false, reason);
  }

  if (CYRILLIC.test(text)) return detectCyrillic(text);

  if (HAN.test(text)) {
    const compact = text.replace(/[\p{P}\p{S}\p{Z}\p{N}]/gu, '');
    if (JAPANESE_HAN_ONLY.has(compact)) return decision('ja', 880, true, 'japanese_han_whitelist');
    return decision('other', 650, false, 'han_ambiguous');
  }

  if (LATIN.test(text)) return detectLatin(text);
  return decision('other', 700, false, 'unsupported_or_ambiguous_script');
}

function detectCyrillic(text) {
  if (UKRAINIAN_DISTINCTIVE.test(text)) return decision('uk', 980, false, 'ukrainian_distinctive');
  if (RUSSIAN_DISTINCTIVE.test(text)) return decision('ru', 940, false, 'russian_distinctive');
  const tokens = text.toLocaleLowerCase().match(/\p{Script=Cyrillic}+/gu) || [];
  const uk = tokens.filter((token) => UKRAINIAN_COMMON.has(token)).length;
  const ru = tokens.filter((token) => RUSSIAN_COMMON.has(token)).length;
  if (uk >= 2 && uk > ru) return decision('uk', 860, false, 'ukrainian_words');
  if (ru >= 2 && ru > uk) return decision('ru', 860, false, 'russian_words');
  return decision('other', 650, false, 'cyrillic_ambiguous');
}

function detectLatin(text) {
  const lower = text.toLocaleLowerCase();
  if (/[ñ¿¡]/u.test(lower)) return decision('es', 960, false, 'spanish_distinctive');
  if (/ß/u.test(lower)) return decision('de', 960, false, 'german_distinctive');
  if (/[ãõ]/u.test(lower)) return decision('pt', 950, false, 'portuguese_distinctive');
  const tokens = lower.match(/\p{Script=Latin}+(?:['’]\p{Script=Latin}+)?/gu) || [];
  if (!tokens.length) return decision('other', 500, false, 'latin_unresolved');

  const casualHits = tokens.filter((token) => ENGLISH_CASUAL.has(token)).length;
  if (casualHits >= 2) return decision('en', 950, true, 'en_casual_words');
  if (casualHits === 1 && tokens.length <= 4) return decision('en', 860, true, 'en_casual_hint');

  const ranked = Object.entries(LATIN_HINTS)
    .map(([code, words]) => ({ code, hits: tokens.filter((token) => words.has(token)).length }))
    .sort((a, b) => b.hits - a.hits || a.code.localeCompare(b.code));
  const best = ranked[0];
  const second = ranked[1];
  if (best.hits >= 2 && best.hits > second.hits) {
    return decision(best.code, Math.min(960, 760 + best.hits * 45), best.code === 'en', `${best.code}_words`);
  }
  if (best.hits === 1 && second.hits === 0 && (tokens.length <= 3 || best.code === 'en')) {
    return decision(best.code, best.code === 'en' ? 760 : 720, best.code === 'en', `${best.code}_hint`);
  }
  if (AZERBAIJANI_DISTINCTIVE.test(lower)) return decision('az', 920, false, 'azerbaijani_distinctive');
  if (TURKIC_SHARED_DISTINCTIVE.test(lower)) return decision('other', 650, false, 'turkic_latin_ambiguous');
  return decision('other', 600, false, 'latin_ambiguous');
}

export function isSupportedFilterLanguage(code) {
  return code === 'ja' || code === 'en' || code === 'neutral';
}

function decision(code, confidenceMilli, supported, reason) {
  return { code, confidenceMilli, supported, reason, aiRequired: !supported };
}
