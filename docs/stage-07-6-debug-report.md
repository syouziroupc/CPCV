# Stage 7.6 デバッグ報告

## 修正1 複数出現のmask漏れ

### 症状

同じ禁止語が一文に複数回ある場合に最初の一件だけが伏字になった。

### 原因

matcherが一用語につき最初のmatchだけを返していた。

### 修正

確定一致を全件列挙する。重複rangeを統合してからmaskする。

## 修正2 zero-width挿入時のmask位置ずれ

### 症状

strict一致へzero-width文字を挿入すると原文の別位置を伏字にする場合があった。

### 原因

正規化後indexとUTF-16原文indexを直接対応させていた。

### 修正

grapheme単位のoriginal span mappingを保持する。

## 修正3 英語の部分一致誤検出

### 症状

辞書語`ass`が`class`へ一致した。

### 修正

Latin系scriptの`auto`境界をword boundaryへ変更した。

## 修正4 タイ語・Devanagari照合不良

### 症状

結合記号を含む語が照合できない場合があった。

### 原因

旧normalizationがUnicode combining markを削除していた。

### 修正

markをcompact表現へ保持する。

## 修正5 用語編集不能

### 症状

PATCH APIは存在したが管理画面に編集操作がなかった。

### 修正

登録済み用語の編集。有効化。無効化。削除を追加した。

## 修正6 Admin SPA mirror不一致

### 症状

`public/admin/index.html`だけ更新され。`public/_admin_spa.html`が旧内容だった。

### 検出

precision boundary検査。

### 修正

二つを同期し。回帰検査を追加した。

## 修正7 D1全migration適用停止

### 症状

空のD1へ`0001`から`0012`をWranglerで連続適用すると`0011`で`too many terms in compound SELECT`が発生した。

### 原因

`0011`の初期policy backfillが`UNION ALL`を使っていた。組織作成triggerも複数行VALUESを一文で実行していた。Wrangler local D1のmigration実行経路でcompound SELECT上限へ到達した。

### 修正

`0011`のbackfillをcategoryごとの単純な`INSERT ... SELECT`へ分割した。組織作成triggerも一category一INSERTへ分割した。

Stage 7.5はremote未適用であるためremote migration historyとの不一致は存在しない。今後は`0011`の変更済み正本だけを使用する。

### 再検証

- 空D1へ`0001`〜`0012`適用成功
- 二回目は`No migrations to apply`
- `PRAGMA foreign_key_check`: 0件
- `PRAGMA quick_check`: ok
- 静的再発防止検査をStage 7.6 boundaryへ追加
