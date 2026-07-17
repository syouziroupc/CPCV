# Stage 7 次開発引継ぎ

## 基準

Stage 6.5完成ソースを唯一の基準とする。

## 維持する契約

- accountは確認済みemailを中心とする
- sessionは一組織へ固定する
- roleはorganization membershipに保存する
- quotaはorganization単位とする
- 人間のmoderation判断をAIより優先する
- Stage 6 sequence eventをRealtime順序の正本とする
- AI障害で学生投稿を失わせない
- 原文を変更しない
- PDFをAI providerへ送らない
- 生IP。端末指紋。auth tokenをAI providerへ送らない

## Stage 7対象

- AI moderation jobとresult
- 翻訳jobとresult
- 原文と翻訳の分離
- provider障害時fallback
- organization単位の利用量上限
- OwnerによるAI有効化
- 授業単位設定
- prompt injection対策
- AI resultのRealtime event設計

## 禁止

- Stage 5 moderation stateを無断変更しない
- Stage 6 sequenceを別正本へ置き換えない
- Stage 6.5 accountを再設計しない
- remote deployを実装patchへ混ぜない
