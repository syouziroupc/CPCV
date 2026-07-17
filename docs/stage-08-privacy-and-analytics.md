# Stage 8 Privacyと分析境界

## PDF

PDFは先生端末内だけに存在する。
Cloudflareへ送るのはSHA-256。補助fingerprint。page数。file size。現在pageだけ。

SHA-256はbrowserのWeb Crypto APIで計算する。
PDF.js fingerprintは補助値に限定する。

## Student

Studentは既存の匿名participant tokenを使用する。
理解度回答に氏名。email。student numberを追加しない。

## 小人数抑制

理解度内訳は3回答未満で非表示。
匿名コメント参加者数も3人未満なら非表示。
回答総数自体は表示できる。

これは完全な差分privacyではない。
授業規模や時系列を知る教員が個人を推測できる可能性は残る。
そのため個人別履歴。page別participant一覧。rankingを実装しない。

## export

CSVへ含めない。

- participant ID
- nickname
- comment text
- IP
- cookie token
- user agent

含める。

- page番号
- event由来の表示回数と推定秒数
- 状態別コメント件数
- 疑問符付きコメント件数
- 抑制済み理解度集計
- snapshot checksum

## 利用上の限界

理解度シグナルは自己申告である。
理解度指数は成績評価や個人評価に使用しない。
page滞在時間は教員側Viewerの操作記録でありStudentの閲覧時間ではない。
疑問符付きコメント数は質問の完全な分類ではない。
