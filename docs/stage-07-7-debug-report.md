# Stage 7.7 デバッグ報告

## 1. 翻訳結果から不適切語が再露出

### 原因

Stage 7.6は原文だけ辞書検査し。AI翻訳結果をそのままRealtimeへ送っていた。

### 修正

翻訳結果へ翻訳先言語の辞書を再適用する。原翻訳と表示翻訳を分離した。

### 確認

- mask対象は伏字翻訳だけ配信
- raw翻訳はRealtimeへ出ない
- review/rejectは翻訳eventを作らない

## 2. pendingの外国語を無駄に翻訳

### 原因

AI job作成条件がコメントの表示可能状態を十分に限定していなかった。

### 修正

pendingは翻訳jobを作らない。人間が承認した時点で再度jobを作る。

## 3. 日英以外で通常AI判定が無効だとjobが作られない

### 修正

`unsupported_language_mode=ai_review`を独立した強制moderation経路にした。AI結果は参考情報のまま。

## 4. 曖昧なLatin文を英語と誤判定

### 再現

```text
no puta
```

英語と他言語で共通する短語を一個含むだけで英語扱いする余地があった。

### 修正

英語確定には強い英語機能語または複数の英語語彙を要求する。曖昧Latin文は安全側で日英以外へ分類する。

### 回帰

- `no puta` → 日英以外。pending
- `I agree with this comment` → 英語
- 英語辞書の確定一致 → 辞書言語を優先

## 5. 日英パックの重複導入

### 修正

pack id。version。term keyを保存し。`INSERT OR IGNORE`と導入履歴で冪等にした。

## 6. 翻訳結果の部分保存

翻訳。filter結果。利用量。Realtime eventを同一D1 batchで保存する既存Stage 7の原子性を維持した。

## 7. 巨大な一括試験commandの時間超過

全段階を連続実行する`check:stage07-7`は環境の20分上限へ達した。個別試験に失敗はなかった。

最終検証は機能群ごとに分割した。CIの長時間枠では同commandも利用可能だが。ローカル完了判定は分割結果を正本とする。
