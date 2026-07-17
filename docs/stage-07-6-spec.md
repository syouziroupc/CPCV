# Stage 7.6 正式仕様

## 1. 目的

Stage 7.5の辞書filterを多言語対応し。設定の難易度を下げる。

辞書による同期判定を第一層とする。曖昧な投稿だけを必要に応じてAIへ送る。

## 2. 判定層

1. 入力検証
2. 辞書の確定一致
3. 辞書の曖昧一致
4. AI助言
5. 教員の最終判断

AIは`comments.moderation_state`を変更しない。

## 3. 多言語正規化

- NFKCを照合用文字列だけへ適用
- 原文を変更しない
- grapheme単位で原文位置を追跡
- format文字。zero-width文字。variation selectorを照合時に除去
- Unicode combining markは保持
- 片仮名を平仮名へfold
- ASCII case fold
- 限定confusable fold
- 記号と空白を除去したcompact表現を回避表記検出へ使用

## 4. 境界方式

`boundary_mode`は次の三種類。

| 値 | 動作 |
|---|---|
| `auto` | scriptと言語に応じて自動選択 |
| `word` | 単語境界が成立する場合だけ一致 |
| `substring` | 文中の連続部分として一致 |

`auto`はLatin。Cyrillic。Greek。Arabic。Hebrew。Devanagariなどでword境界を使う。

CJK。Kana。Hangul。Thai。Lao。Khmer。Myanmarではsubstringを使う。

## 5. 中国語

簡体字と繁体字の自動変換は行わない。

同じ概念を両方検出する場合は別行で登録する。自動変換は誤変換と地域差があるためである。

## 6. 辞書形式

| 列 | 内容 |
|---|---|
| `term` | 検閲用語 |
| `language_code` | BCP47系言語コード。未指定は`und` |
| `category` | 種類 |
| `severity` | 1〜5 |
| `match_mode` | strict。normalized。fuzzy |
| `fuzzy_enabled` | 曖昧一致の有効状態 |
| `boundary_mode` | auto。word。substring |
| `active` | 有効状態 |

## 7. 簡単設定

### 組織

- 推奨
- 厳格
- すべて無効
- 現在の詳細設定

### 授業

- 使用しない
- 推奨。曖昧な投稿だけAI
- 辞書のみ。AIなし
- 全投稿をAIでも確認

簡単設定は既存の詳細値をpresetへ変更する。詳細設定へ切り替えれば個別調整できる。

## 8. 詳細設定

- category policy
- review。mask。reject閾値
- 用語の言語
- 境界方式
- match mode
- fuzzy
- active
- AI routing
- mask文字

## 9. 原文保護

原文は`comments.message`へ保持する。

投影用文は`comments.display_message`へ保存する。

ViewerとRealtimeへ原文を送らない。

## 10. 既定値

全機能は既定無効。

政治的発言categoryは簡単設定presetでも無効。

曖昧一致は自動拒否しない。承認待ちまたはAI助言へ送る。
