# Moderation。AI。翻訳。辞書filter仕様

## 1. 判断順序

```text
入力validation
→ 原文言語判定
→ 日英辞書filter
→ moderation mode
→ コメント保存
→ 必要時だけAI moderation
→ 人間による最終判断
→ 承認済みコメントだけ翻訳
→ 翻訳後の日英辞書filter
→ 安全な翻訳だけ表示
```

## 2. 入力validation

空欄。長さ超過。URL。domain。IP address。危険なURIを拒否する。
制御文字。ゼロ幅文字は照合時に処理する。

## 3. 手動moderation

- `off`: 原則visible
- `pre`: 原則pending
- hidden。restore。deleteを教員が操作する。
- 状態遷移はexpected updated timestampで競合制御する。
- すべてauditとaction historyへ記録する。

## 4. 辞書filter

用語は次を持つ。

- term
- language code
- category
- severity 1〜5
- match mode
- fuzzy enabled
- boundary mode
- active

処理はcategory policyで決める。

- review threshold
- mask threshold
- reject threshold

用語側levelと処理側thresholdを分離する。

## 5. 回避表記

日本語ではNFKC。片仮名から平仮名。空白。句読点。ゼロ幅文字。一部類似文字を処理する。
英語ではcase folding。単語境界。空白挿入。一部leetを処理する。
曖昧一致は自動拒否しない。

## 6. 標準pack

- 日本語基本128語
- 日本語文脈注意101語
- 英語基本161語
- 英語文脈注意110語
- 合計500語

推奨設定は基本289語である。
厳格設定は500語である。
政治発言packはない。
文脈注意語は自動拒否へ使わない。
利用者編集と削除をpack更新で上書きしない。

## 7. AI moderation

Workers AIを使用する。

- primary: `@cf/zai-org/glm-4.7-flash`
- fallback: `@cf/qwen/qwen3-30b-a3b-fp8`

出力はstructured JSONである。
AI結果はallow。review。hideの助言である。
AIは`comments.moderation_state`を変更しない。

Queue messageはjob IDだけである。
Queueはat-least-onceを前提にする。
D1 claimで重複実行を防ぐ。

## 8. privacy guard

外部AIへ送る前に次を検出する。

- email
- URL
- 電話番号らしい文字列
- 日本郵便番号
- Luhnを通るcard番号
- prompt injectionらしい表現

PII疑いは外部AIへ送らない。
moderationはreviewへ回す。
翻訳は保留する。

## 9. 翻訳

- 原文と翻訳先が同じ場合は翻訳しない。
- pending。hidden。deletedは自動翻訳しない。
- 絵文字だけ。数字だけ。極端に短い文は翻訳しない。
- 翻訳は別tableへ保存する。
- 翻訳後に翻訳先の日英辞書を適用する。
- 翻訳文がreviewまたはrejectなら翻訳だけを非表示にする。
- 翻訳結果だけを理由に原文を削除しない。

## 10. 日英以外

日英以外またはLatin短文で言語が曖昧な場合はpendingへ送る。
AIが有効なら参考判定を依頼する。
AIが無効または障害中なら人間確認で止める。
自動許可しない。

## 11. 利用量

organization単位の日次上限を持つ。
model呼出し一回ごとに利用量を記録する。
primaryとfallbackを呼べば二回として数える。
上限超過時はAI処理だけを停止する。コメント投稿は維持する。
