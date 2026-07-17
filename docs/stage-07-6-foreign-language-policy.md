# Stage 7.6 外国語対応方針

## 対応する基本原則

辞書語はUnicode文字列として保存する。

言語を限定せず登録できる。管理画面の選択肢には主要16言語を用意する。未収録言語は`und`として登録できる。

## 言語別の扱い

| 言語群 | 既定照合 |
|---|---|
| 日本語 | NFKC。片仮名→平仮名。substring |
| 英語・欧州言語 | case fold。word boundary |
| ロシア語 | word boundary |
| アラビア語・ヘブライ語 | combining mark保持。word boundary |
| HindiなどDevanagari | combining mark保持。word boundary |
| 中国語 | substring。簡体字と繁体字は別登録 |
| 韓国語 | NFKC。substring |
| タイ語・Lao・Khmer・Myanmar | combining mark保持。substring |

## AIへ回す条件

- fuzzy一致
- confusable一致
- 一文字差など確定性が低い一致
- 授業設定が全投稿AI

辞書に確定一致した投稿はAIへ送らなくてよい。

## 非対応または限定対応

- 自動翻訳してから辞書照合しない
- stemmingや形態素解析は行わない
- 中国語簡繁変換は行わない
- 全Unicode confusableを無差別にfoldしない
- 方言。俗語。文脈依存表現は辞書追加またはAI助言で扱う

この限定は誤検出を抑えるためである。
