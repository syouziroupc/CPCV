# Stage 7.5 DB仕様

Migration: `migrations-v2/0011_dictionary_content_filter.sql`

## comments追加列

- `display_message`: 投影用の伏字後本文
- `filter_action`: allow。mask。review
- `filter_ai_required`: AIへ回すか
- `filter_version`: 判定設定版

投稿拒否はcommentsへ保存しないため`reject`はDB列値に含めません。

## content_filter_terms

組織ごとの辞書です。

- 原語
- NFKC等を適用したnormalized term
- 記号等を除いたcompact term
- category
- severity
- match mode
- fuzzy enabled
- active

同一組織。category。compact termの重複を禁止します。

## organization_content_filter_policies

種類ごとの有効状態と閾値を保存します。

新規組織には無効状態の10種類をtriggerで作ります。

## session_content_filter_settings

授業単位で次を保存します。

- enabled
- AI routing mode
- mask character

新規授業には無効状態の設定をtriggerで作ります。

## comment_filter_matches

教員確認用の判定証拠です。

- term ID
- category
- severity
- match kind
- confidence
- obfuscation score
- 原文上のspan

辞書語の本文は重複保存しません。

## Realtime trigger

`message:new`と復元eventは次を使います。

```sql
COALESCE(display_message, message)
```

原文はRealtime payloadへ混入させません。
