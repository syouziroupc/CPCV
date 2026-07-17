// Stage 7.8 built-in content-filter packs.
// Core packs are high precision. Context packs are review-oriented and used by strict mode.
export const BUILT_IN_FILTER_PACKS = Object.freeze(
[
  {
    "id": "ja-core-v1",
    "version": 2,
    "languageCode": "ja",
    "name": "日本語 基本検閲パック",
    "description": "高精度の罵倒、露骨な性的俗語、脅迫、差別的蔑称を中心にした基本辞書。政治語は含まない。",
    "terms": [
      {
        "term": "ちんこ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-001"
      },
      {
        "term": "ちんぽ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-002"
      },
      {
        "term": "まんこ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-003"
      },
      {
        "term": "まんげ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-004"
      },
      {
        "term": "きんたま",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-005"
      },
      {
        "term": "たまきん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-006"
      },
      {
        "term": "おっぱい",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-007"
      },
      {
        "term": "せっくす",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-008"
      },
      {
        "term": "ぺにす",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-009"
      },
      {
        "term": "ばぎな",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-010"
      },
      {
        "term": "ふぇら",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-011"
      },
      {
        "term": "くんに",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-012"
      },
      {
        "term": "やりまん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-013"
      },
      {
        "term": "やりちん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-014"
      },
      {
        "term": "びっち",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-015"
      },
      {
        "term": "くそ",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-016"
      },
      {
        "term": "ちくしょう",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-017"
      },
      {
        "term": "ふざけんな",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-018"
      },
      {
        "term": "だまれ",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-019"
      },
      {
        "term": "ばか",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-020"
      },
      {
        "term": "あほ",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-021"
      },
      {
        "term": "きもい",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-022"
      },
      {
        "term": "うざい",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-023"
      },
      {
        "term": "くず",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-024"
      },
      {
        "term": "かす",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-025"
      },
      {
        "term": "しね",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-026"
      },
      {
        "term": "死ね",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-027"
      },
      {
        "term": "ぶす",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-028"
      },
      {
        "term": "でぶ",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-029"
      },
      {
        "term": "無能",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-030"
      },
      {
        "term": "消えろ",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-031"
      },
      {
        "term": "殺す",
        "languageCode": "ja",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-032"
      },
      {
        "term": "ぶっ殺す",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-033"
      },
      {
        "term": "殴るぞ",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-034"
      },
      {
        "term": "殺してやる",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-035"
      },
      {
        "term": "がいじ",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-036"
      },
      {
        "term": "ちょん",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-037"
      },
      {
        "term": "にがー",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-038"
      },
      {
        "term": "おかま",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-039"
      },
      {
        "term": "ちんちん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-040"
      },
      {
        "term": "おちんちん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-041"
      },
      {
        "term": "ぽこちん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-042"
      },
      {
        "term": "でかちん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-043"
      },
      {
        "term": "粗ちん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-044"
      },
      {
        "term": "おまんこ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-045"
      },
      {
        "term": "おめこ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-046"
      },
      {
        "term": "まんまん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-047"
      },
      {
        "term": "けつまんこ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-048"
      },
      {
        "term": "おなにー",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-049"
      },
      {
        "term": "せんずり",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-050"
      },
      {
        "term": "ふぇらちお",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-051"
      },
      {
        "term": "くんにりんぐす",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-052"
      },
      {
        "term": "ぱいずり",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-053"
      },
      {
        "term": "手こき",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-054"
      },
      {
        "term": "手まん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-055"
      },
      {
        "term": "足こき",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-056"
      },
      {
        "term": "顔射",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-057"
      },
      {
        "term": "中出し",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-058"
      },
      {
        "term": "生はめ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-059"
      },
      {
        "term": "はめ撮り",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-060"
      },
      {
        "term": "口内射精",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-061"
      },
      {
        "term": "あなるせっくす",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-062"
      },
      {
        "term": "でぃーぷすろーと",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-063"
      },
      {
        "term": "いらまちお",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-064"
      },
      {
        "term": "でぃるど",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-065"
      },
      {
        "term": "おなほ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-066"
      },
      {
        "term": "おなほーる",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-067"
      },
      {
        "term": "ざーめん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-068"
      },
      {
        "term": "肉便器",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-069"
      },
      {
        "term": "ぶっかけ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-070"
      },
      {
        "term": "すかとろ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-071"
      },
      {
        "term": "食糞",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-072"
      },
      {
        "term": "飲尿",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-073"
      },
      {
        "term": "乱交",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-074"
      },
      {
        "term": "児童ぽるの",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-075"
      },
      {
        "term": "ろりこん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-076"
      },
      {
        "term": "くそくらえ",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-077"
      },
      {
        "term": "糞食らえ",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-078"
      },
      {
        "term": "くそ野郎",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-079"
      },
      {
        "term": "くそがき",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-080"
      },
      {
        "term": "くそあま",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-081"
      },
      {
        "term": "くそごみ",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-082"
      },
      {
        "term": "豚野郎",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-083"
      },
      {
        "term": "馬鹿野郎",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-084"
      },
      {
        "term": "ばかやろう",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-085"
      },
      {
        "term": "あほんだら",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-086"
      },
      {
        "term": "うるせえ",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-087"
      },
      {
        "term": "ごみくず",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-088"
      },
      {
        "term": "かす野郎",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-089"
      },
      {
        "term": "ぼけなす",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-090"
      },
      {
        "term": "このくず",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-091"
      },
      {
        "term": "このかす",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-092"
      },
      {
        "term": "だまれくず",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-093"
      },
      {
        "term": "黙れくず",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-094"
      },
      {
        "term": "失せろ",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-095"
      },
      {
        "term": "雑魚すぎ",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-096"
      },
      {
        "term": "ざこすぎ",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-097"
      },
      {
        "term": "ぶすだな",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-098"
      },
      {
        "term": "でぶだな",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-099"
      },
      {
        "term": "はげだな",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-100"
      },
      {
        "term": "お前終わってる",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-101"
      },
      {
        "term": "生きる価値ない",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-102"
      },
      {
        "term": "存在価値ない",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-103"
      },
      {
        "term": "誰もお前を必要としてない",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-104"
      },
      {
        "term": "誰にも必要とされてない",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-105"
      },
      {
        "term": "お前なんかいらない",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-106"
      },
      {
        "term": "人間のくず",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-107"
      },
      {
        "term": "頭おかしい",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-108"
      },
      {
        "term": "気持ち悪い",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-109"
      },
      {
        "term": "顔がきもい",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-110"
      },
      {
        "term": "声がきもい",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-111"
      },
      {
        "term": "死んだほうがいい",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-112"
      },
      {
        "term": "自殺しろ",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-113"
      },
      {
        "term": "首つれ",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-114"
      },
      {
        "term": "首吊れ",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-115"
      },
      {
        "term": "殺すぞ",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-116"
      },
      {
        "term": "ぶん殴る",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-117"
      },
      {
        "term": "ぼこぼこにする",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-118"
      },
      {
        "term": "刺すぞ",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-119"
      },
      {
        "term": "撃つぞ",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-120"
      },
      {
        "term": "燃やすぞ",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-121"
      },
      {
        "term": "爆破するぞ",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-122"
      },
      {
        "term": "爆破予告",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-123"
      },
      {
        "term": "殺害予告",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-124"
      },
      {
        "term": "れいぷするぞ",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-125"
      },
      {
        "term": "犯すぞ",
        "languageCode": "ja",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-126"
      },
      {
        "term": "池沼",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-127"
      },
      {
        "term": "きちがい",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "substring",
        "key": "ja-128"
      }
    ]
  },
  {
    "id": "ja-context-v1",
    "version": 1,
    "languageCode": "ja",
    "name": "日本語 文脈注意パック",
    "description": "教育、報道、引用では正当な場合がある性的・解剖学的語や旧来の差別的不快語を、厳格設定で原則「確認待ち」にする補助辞書。",
    "terms": [
      {
        "term": "えっち",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-001"
      },
      {
        "term": "えろ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-002"
      },
      {
        "term": "えろい",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-003"
      },
      {
        "term": "ぽるの",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-004"
      },
      {
        "term": "ぽるのぐらふぃー",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-005"
      },
      {
        "term": "あだるとびでお",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-006"
      },
      {
        "term": "AV女優",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-007"
      },
      {
        "term": "成人向け",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-008"
      },
      {
        "term": "ぬーど",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-009"
      },
      {
        "term": "裸",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-010"
      },
      {
        "term": "乳房",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-011"
      },
      {
        "term": "乳首",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-012"
      },
      {
        "term": "陰茎",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-013"
      },
      {
        "term": "陰部",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-014"
      },
      {
        "term": "陰毛",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-015"
      },
      {
        "term": "陰唇",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-016"
      },
      {
        "term": "陰核",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-017"
      },
      {
        "term": "陰嚢",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-018"
      },
      {
        "term": "睾丸",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-019"
      },
      {
        "term": "亀頭",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-020"
      },
      {
        "term": "膣",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-021"
      },
      {
        "term": "くりとりす",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-022"
      },
      {
        "term": "性交",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-023"
      },
      {
        "term": "性行為",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-024"
      },
      {
        "term": "性欲",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-025"
      },
      {
        "term": "射精",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-026"
      },
      {
        "term": "精液",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-027"
      },
      {
        "term": "おーがずむ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-028"
      },
      {
        "term": "自慰",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-029"
      },
      {
        "term": "ますたーべーしょん",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-030"
      },
      {
        "term": "こんどーむ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-031"
      },
      {
        "term": "包茎",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-032"
      },
      {
        "term": "早漏",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-033"
      },
      {
        "term": "遅漏",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-034"
      },
      {
        "term": "童貞",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-035"
      },
      {
        "term": "処女",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-036"
      },
      {
        "term": "巨乳",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-037"
      },
      {
        "term": "貧乳",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-038"
      },
      {
        "term": "痴女",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-039"
      },
      {
        "term": "淫乱",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-040"
      },
      {
        "term": "変態",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-041"
      },
      {
        "term": "そーぷらんど",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-042"
      },
      {
        "term": "でりへる",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-043"
      },
      {
        "term": "らぶほてる",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-044"
      },
      {
        "term": "ぱぱ活",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-045"
      },
      {
        "term": "寝取られ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-046"
      },
      {
        "term": "NTR",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-047"
      },
      {
        "term": "ふたなり",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-048"
      },
      {
        "term": "SM",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-049"
      },
      {
        "term": "BDSM",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-050"
      },
      {
        "term": "緊縛",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-051"
      },
      {
        "term": "ぼんでーじ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-052"
      },
      {
        "term": "ろーたー",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-053"
      },
      {
        "term": "ばいぶ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-054"
      },
      {
        "term": "あなる",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-055"
      },
      {
        "term": "ぱんちら",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-056"
      },
      {
        "term": "胸ちら",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-057"
      },
      {
        "term": "性奴隷",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-058"
      },
      {
        "term": "愛撫",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-059"
      },
      {
        "term": "愛液",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-060"
      },
      {
        "term": "援交",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-061"
      },
      {
        "term": "援助交際",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-062"
      },
      {
        "term": "立ちんぼ",
        "languageCode": "ja",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-063"
      },
      {
        "term": "れいぷ",
        "languageCode": "ja",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-064"
      },
      {
        "term": "強姦",
        "languageCode": "ja",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-065"
      },
      {
        "term": "輪姦",
        "languageCode": "ja",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-066"
      },
      {
        "term": "睡姦",
        "languageCode": "ja",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-067"
      },
      {
        "term": "屍姦",
        "languageCode": "ja",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-068"
      },
      {
        "term": "獣姦",
        "languageCode": "ja",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-069"
      },
      {
        "term": "近親相姦",
        "languageCode": "ja",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-070"
      },
      {
        "term": "糞",
        "languageCode": "ja",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-071"
      },
      {
        "term": "馬鹿",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-072"
      },
      {
        "term": "ぼけ",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-073"
      },
      {
        "term": "まぬけ",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-074"
      },
      {
        "term": "のろま",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-075"
      },
      {
        "term": "でべそ",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-076"
      },
      {
        "term": "はげ",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-077"
      },
      {
        "term": "じじい",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-078"
      },
      {
        "term": "ばばあ",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-079"
      },
      {
        "term": "ぽり公",
        "languageCode": "ja",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-080"
      },
      {
        "term": "いざり",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-081"
      },
      {
        "term": "ぎっちょ",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "substring",
        "key": "ja-ctx-082"
      },
      {
        "term": "びっこ",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-083"
      },
      {
        "term": "つんぼ",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-084"
      },
      {
        "term": "めくら",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-085"
      },
      {
        "term": "かたわ",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-086"
      },
      {
        "term": "白痴",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-087"
      },
      {
        "term": "土方",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-088"
      },
      {
        "term": "土人",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-089"
      },
      {
        "term": "支那",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-090"
      },
      {
        "term": "支那人",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-091"
      },
      {
        "term": "えた",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-092"
      },
      {
        "term": "非人",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-093"
      },
      {
        "term": "部落民",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-094"
      },
      {
        "term": "ほも",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-095"
      },
      {
        "term": "れず",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-096"
      },
      {
        "term": "あすぺ",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-097"
      },
      {
        "term": "糖質",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-098"
      },
      {
        "term": "統失",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-099"
      },
      {
        "term": "なまぽ",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-100"
      },
      {
        "term": "非国民",
        "languageCode": "ja",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "ja-ctx-101"
      }
    ]
  },
  {
    "id": "en-core-v1",
    "version": 2,
    "languageCode": "en",
    "name": "英語 基本検閲パック",
    "description": "高精度の強い罵倒、露骨な性的俗語、脅迫、差別的蔑称を中心にした基本辞書。単語境界を使用する。",
    "terms": [
      {
        "term": "fuck",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-001"
      },
      {
        "term": "fucking",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-002"
      },
      {
        "term": "fucked",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-003"
      },
      {
        "term": "fucker",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-004"
      },
      {
        "term": "motherfucker",
        "languageCode": "en",
        "category": "profanity",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-005"
      },
      {
        "term": "shit",
        "languageCode": "en",
        "category": "profanity",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-006"
      },
      {
        "term": "bullshit",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-007"
      },
      {
        "term": "bitch",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-008"
      },
      {
        "term": "cunt",
        "languageCode": "en",
        "category": "profanity",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-009"
      },
      {
        "term": "asshole",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-010"
      },
      {
        "term": "ass",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-011"
      },
      {
        "term": "bastard",
        "languageCode": "en",
        "category": "profanity",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-012"
      },
      {
        "term": "damn",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-013"
      },
      {
        "term": "crap",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-014"
      },
      {
        "term": "dick",
        "languageCode": "en",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-015"
      },
      {
        "term": "cock",
        "languageCode": "en",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-016"
      },
      {
        "term": "pussy",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-017"
      },
      {
        "term": "whore",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-018"
      },
      {
        "term": "slut",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-019"
      },
      {
        "term": "porn",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-020"
      },
      {
        "term": "blowjob",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-021"
      },
      {
        "term": "handjob",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-022"
      },
      {
        "term": "penis",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-023"
      },
      {
        "term": "vagina",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-024"
      },
      {
        "term": "boobs",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-025"
      },
      {
        "term": "tits",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-026"
      },
      {
        "term": "sex",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-027"
      },
      {
        "term": "idiot",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-028"
      },
      {
        "term": "moron",
        "languageCode": "en",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-029"
      },
      {
        "term": "stupid",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-030"
      },
      {
        "term": "dumbass",
        "languageCode": "en",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-031"
      },
      {
        "term": "jackass",
        "languageCode": "en",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-032"
      },
      {
        "term": "loser",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-033"
      },
      {
        "term": "ugly",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-034"
      },
      {
        "term": "shut up",
        "languageCode": "en",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-035"
      },
      {
        "term": "go die",
        "languageCode": "en",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-036"
      },
      {
        "term": "kill yourself",
        "languageCode": "en",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-037"
      },
      {
        "term": "kys",
        "languageCode": "en",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-038"
      },
      {
        "term": "nigger",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-039"
      },
      {
        "term": "nigga",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-040"
      },
      {
        "term": "faggot",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-041"
      },
      {
        "term": "retard",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-042"
      },
      {
        "term": "tranny",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-043"
      },
      {
        "term": "chink",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-044"
      },
      {
        "term": "spic",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-045"
      },
      {
        "term": "rape",
        "languageCode": "en",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-046"
      },
      {
        "term": "rapist",
        "languageCode": "en",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-047"
      },
      {
        "term": "kill you",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-048"
      },
      {
        "term": "murder you",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-049"
      },
      {
        "term": "bomb threat",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-050"
      },
      {
        "term": "motherfucking",
        "languageCode": "en",
        "category": "profanity",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-051"
      },
      {
        "term": "fuckface",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-052"
      },
      {
        "term": "fuckhead",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-053"
      },
      {
        "term": "fuck off",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-054"
      },
      {
        "term": "shithead",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-055"
      },
      {
        "term": "piece of shit",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-056"
      },
      {
        "term": "dipshit",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-057"
      },
      {
        "term": "dumbshit",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-058"
      },
      {
        "term": "horseshit",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-059"
      },
      {
        "term": "batshit",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-060"
      },
      {
        "term": "son of a bitch",
        "languageCode": "en",
        "category": "profanity",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-061"
      },
      {
        "term": "arsehole",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-062"
      },
      {
        "term": "dickhead",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-063"
      },
      {
        "term": "prick",
        "languageCode": "en",
        "category": "profanity",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-064"
      },
      {
        "term": "twat",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-065"
      },
      {
        "term": "wanker",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-066"
      },
      {
        "term": "douchebag",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-067"
      },
      {
        "term": "piss off",
        "languageCode": "en",
        "category": "profanity",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-068"
      },
      {
        "term": "goddamn",
        "languageCode": "en",
        "category": "profanity",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-069"
      },
      {
        "term": "clusterfuck",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-070"
      },
      {
        "term": "shitbag",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-071"
      },
      {
        "term": "shitface",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-072"
      },
      {
        "term": "cockhead",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-073"
      },
      {
        "term": "bitchass",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-074"
      },
      {
        "term": "fuckwit",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-075"
      },
      {
        "term": "fucktard",
        "languageCode": "en",
        "category": "profanity",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-076"
      },
      {
        "term": "rimjob",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-077"
      },
      {
        "term": "cumshot",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-078"
      },
      {
        "term": "jizz",
        "languageCode": "en",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-079"
      },
      {
        "term": "dildo",
        "languageCode": "en",
        "category": "sexual",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-080"
      },
      {
        "term": "jack off",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-081"
      },
      {
        "term": "jerk off",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-082"
      },
      {
        "term": "fingerbang",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-083"
      },
      {
        "term": "gangbang",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-084"
      },
      {
        "term": "bukkake",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-085"
      },
      {
        "term": "creampie",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-086"
      },
      {
        "term": "deepthroat",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-087"
      },
      {
        "term": "fisting",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-088"
      },
      {
        "term": "footjob",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-089"
      },
      {
        "term": "pegging",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-090"
      },
      {
        "term": "rimming",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-091"
      },
      {
        "term": "scat",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-092"
      },
      {
        "term": "golden shower",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-093"
      },
      {
        "term": "bestiality",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-094"
      },
      {
        "term": "zoophilia",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-095"
      },
      {
        "term": "incest",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-096"
      },
      {
        "term": "child porn",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-097"
      },
      {
        "term": "child pornography",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-098"
      },
      {
        "term": "underage porn",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-099"
      },
      {
        "term": "pedo porn",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-100"
      },
      {
        "term": "lolicon",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-101"
      },
      {
        "term": "rape porn",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-102"
      },
      {
        "term": "revenge porn",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-103"
      },
      {
        "term": "camwhore",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-104"
      },
      {
        "term": "camslut",
        "languageCode": "en",
        "category": "sexual",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-105"
      },
      {
        "term": "cumslut",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-106"
      },
      {
        "term": "fucktoy",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-107"
      },
      {
        "term": "sex slave",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-108"
      },
      {
        "term": "meat hole",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-109"
      },
      {
        "term": "cum dumpster",
        "languageCode": "en",
        "category": "sexual",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-110"
      },
      {
        "term": "worthless",
        "languageCode": "en",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-111"
      },
      {
        "term": "useless piece of shit",
        "languageCode": "en",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-112"
      },
      {
        "term": "nobody likes you",
        "languageCode": "en",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-113"
      },
      {
        "term": "everyone hates you",
        "languageCode": "en",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-114"
      },
      {
        "term": "you should die",
        "languageCode": "en",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-115"
      },
      {
        "term": "drop dead",
        "languageCode": "en",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-116"
      },
      {
        "term": "fatass",
        "languageCode": "en",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-117"
      },
      {
        "term": "lardass",
        "languageCode": "en",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-118"
      },
      {
        "term": "ugly bitch",
        "languageCode": "en",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-119"
      },
      {
        "term": "stupid bitch",
        "languageCode": "en",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-120"
      },
      {
        "term": "dumb bitch",
        "languageCode": "en",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-121"
      },
      {
        "term": "pathetic loser",
        "languageCode": "en",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-122"
      },
      {
        "term": "human garbage",
        "languageCode": "en",
        "category": "harassment",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-123"
      },
      {
        "term": "piece of trash",
        "languageCode": "en",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-124"
      },
      {
        "term": "scumbag",
        "languageCode": "en",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-125"
      },
      {
        "term": "creep",
        "languageCode": "en",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-126"
      },
      {
        "term": "pervert",
        "languageCode": "en",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-127"
      },
      {
        "term": "freakshow",
        "languageCode": "en",
        "category": "harassment",
        "severity": 3,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-128"
      },
      {
        "term": "you are disgusting",
        "languageCode": "en",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-129"
      },
      {
        "term": "you disgust me",
        "languageCode": "en",
        "category": "harassment",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-130"
      },
      {
        "term": "shoot you",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-131"
      },
      {
        "term": "stab you",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-132"
      },
      {
        "term": "beat you up",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-133"
      },
      {
        "term": "burn you alive",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-134"
      },
      {
        "term": "blow you up",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-135"
      },
      {
        "term": "school shooting",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-136"
      },
      {
        "term": "rape you",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-137"
      },
      {
        "term": "i will kill you",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-138"
      },
      {
        "term": "i'll kill you",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-139"
      },
      {
        "term": "i will hurt you",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-140"
      },
      {
        "term": "i know where you live",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-141"
      },
      {
        "term": "watch your back",
        "languageCode": "en",
        "category": "violence",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-142"
      },
      {
        "term": "you are dead",
        "languageCode": "en",
        "category": "violence",
        "severity": 5,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-143"
      },
      {
        "term": "wetback",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-144"
      },
      {
        "term": "beaner",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-145"
      },
      {
        "term": "kike",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-146"
      },
      {
        "term": "paki",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-147"
      },
      {
        "term": "raghead",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-148"
      },
      {
        "term": "towelhead",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-149"
      },
      {
        "term": "coon",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-150"
      },
      {
        "term": "darkie",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-151"
      },
      {
        "term": "gook",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-152"
      },
      {
        "term": "jigaboo",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-153"
      },
      {
        "term": "slanteye",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-154"
      },
      {
        "term": "zipperhead",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-155"
      },
      {
        "term": "sand nigger",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-156"
      },
      {
        "term": "porch monkey",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-157"
      },
      {
        "term": "camel jockey",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-158"
      },
      {
        "term": "white trash",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-159"
      },
      {
        "term": "redskin",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-160"
      },
      {
        "term": "cripple",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 4,
        "matchMode": "normalized",
        "fuzzyEnabled": true,
        "boundaryMode": "word",
        "key": "en-161"
      }
    ]
  },
  {
    "id": "en-context-v1",
    "version": 1,
    "languageCode": "en",
    "name": "英語 文脈注意パック",
    "description": "教育、報道、引用では正当な場合がある性的・解剖学的語、軽い罵倒、文脈依存の不快語を、厳格設定で原則「確認待ち」にする補助辞書。",
    "terms": [
      {
        "term": "sexual",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-001"
      },
      {
        "term": "sexuality",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-002"
      },
      {
        "term": "sexy",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-003"
      },
      {
        "term": "porno",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-004"
      },
      {
        "term": "pornography",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-005"
      },
      {
        "term": "adult video",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-006"
      },
      {
        "term": "adult content",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-007"
      },
      {
        "term": "nude",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-008"
      },
      {
        "term": "nudity",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-009"
      },
      {
        "term": "naked",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-010"
      },
      {
        "term": "breast",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-011"
      },
      {
        "term": "breasts",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-012"
      },
      {
        "term": "boob",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-013"
      },
      {
        "term": "vulva",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-014"
      },
      {
        "term": "clitoris",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-015"
      },
      {
        "term": "anus",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-016"
      },
      {
        "term": "anal",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-017"
      },
      {
        "term": "intercourse",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-018"
      },
      {
        "term": "orgasm",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-019"
      },
      {
        "term": "ejaculation",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-020"
      },
      {
        "term": "semen",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-021"
      },
      {
        "term": "genitals",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-022"
      },
      {
        "term": "condom",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-023"
      },
      {
        "term": "masturbate",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-024"
      },
      {
        "term": "masturbation",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-025"
      },
      {
        "term": "erotic",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-026"
      },
      {
        "term": "fetish",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-027"
      },
      {
        "term": "bdsm",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-028"
      },
      {
        "term": "bondage",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-029"
      },
      {
        "term": "dominatrix",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-030"
      },
      {
        "term": "escort",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-031"
      },
      {
        "term": "hooker",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-032"
      },
      {
        "term": "prostitute",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-033"
      },
      {
        "term": "stripper",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-034"
      },
      {
        "term": "strip club",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-035"
      },
      {
        "term": "sex worker",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-036"
      },
      {
        "term": "oral sex",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-037"
      },
      {
        "term": "anal sex",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-038"
      },
      {
        "term": "phone sex",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-039"
      },
      {
        "term": "gay sex",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-040"
      },
      {
        "term": "lesbian sex",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-041"
      },
      {
        "term": "threesome",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-042"
      },
      {
        "term": "orgy",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-043"
      },
      {
        "term": "swinger",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-044"
      },
      {
        "term": "hentai",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-045"
      },
      {
        "term": "yaoi",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-046"
      },
      {
        "term": "yuri",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-047"
      },
      {
        "term": "onlyfans",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-048"
      },
      {
        "term": "camgirl",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-049"
      },
      {
        "term": "cam boy",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-050"
      },
      {
        "term": "adult toy",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-051"
      },
      {
        "term": "sex toy",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-052"
      },
      {
        "term": "vibrator",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-053"
      },
      {
        "term": "erection",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-054"
      },
      {
        "term": "erectile dysfunction",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-055"
      },
      {
        "term": "virgin",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-056"
      },
      {
        "term": "virginity",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-057"
      },
      {
        "term": "circumcision",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-058"
      },
      {
        "term": "pubic hair",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-059"
      },
      {
        "term": "nipple",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-060"
      },
      {
        "term": "nipples",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-061"
      },
      {
        "term": "lingerie",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-062"
      },
      {
        "term": "panties",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-063"
      },
      {
        "term": "upskirt",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-064"
      },
      {
        "term": "voyeur",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-065"
      },
      {
        "term": "voyeurism",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-066"
      },
      {
        "term": "pedophile",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-067"
      },
      {
        "term": "paedophile",
        "languageCode": "en",
        "category": "sexual",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-068"
      },
      {
        "term": "child abuse",
        "languageCode": "en",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-069"
      },
      {
        "term": "sexual assault",
        "languageCode": "en",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-070"
      },
      {
        "term": "sexual harassment",
        "languageCode": "en",
        "category": "violence",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-071"
      },
      {
        "term": "hell",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-072"
      },
      {
        "term": "bloody",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-073"
      },
      {
        "term": "bollocks",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-074"
      },
      {
        "term": "sucks",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-075"
      },
      {
        "term": "suck",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-076"
      },
      {
        "term": "douche",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-077"
      },
      {
        "term": "arse",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-078"
      },
      {
        "term": "piss",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-079"
      },
      {
        "term": "bugger",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-080"
      },
      {
        "term": "git",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-081"
      },
      {
        "term": "tosser",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-082"
      },
      {
        "term": "bellend",
        "languageCode": "en",
        "category": "profanity",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-083"
      },
      {
        "term": "dumb",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-084"
      },
      {
        "term": "fat",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-085"
      },
      {
        "term": "skinny",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-086"
      },
      {
        "term": "lame",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-087"
      },
      {
        "term": "psycho",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-088"
      },
      {
        "term": "crazy",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-089"
      },
      {
        "term": "insane",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-090"
      },
      {
        "term": "freak",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-091"
      },
      {
        "term": "weirdo",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-092"
      },
      {
        "term": "old hag",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-093"
      },
      {
        "term": "old fart",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-094"
      },
      {
        "term": "brat",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-095"
      },
      {
        "term": "jerk",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-096"
      },
      {
        "term": "clown",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-097"
      },
      {
        "term": "trash",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-098"
      },
      {
        "term": "garbage",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-099"
      },
      {
        "term": "smelly",
        "languageCode": "en",
        "category": "harassment",
        "severity": 2,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-100"
      },
      {
        "term": "homo",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-101"
      },
      {
        "term": "dyke",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-102"
      },
      {
        "term": "queer",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-103"
      },
      {
        "term": "spastic",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-104"
      },
      {
        "term": "mong",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-105"
      },
      {
        "term": "oriental",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-106"
      },
      {
        "term": "gypsy",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-107"
      },
      {
        "term": "eskimo",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-108"
      },
      {
        "term": "illegal alien",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-109"
      },
      {
        "term": "colored",
        "languageCode": "en",
        "category": "discrimination",
        "severity": 1,
        "matchMode": "normalized",
        "fuzzyEnabled": false,
        "boundaryMode": "word",
        "key": "en-ctx-110"
      }
    ]
  }
]
);

export function getBuiltInFilterPack(id) {
  return BUILT_IN_FILTER_PACKS.find((pack) => pack.id === String(id || "")) || null;
}

export function listBuiltInFilterPacks() {
  return BUILT_IN_FILTER_PACKS.map(({ terms, ...pack }) => ({ ...pack, termCount: terms.length }));
}
