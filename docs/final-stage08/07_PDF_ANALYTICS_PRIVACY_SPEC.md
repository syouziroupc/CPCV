# PDF連動。匿名分析。Privacy仕様

## 1. PDF処理境界

PDFは教員browserで読み込む。
serverへ次を送らない。

- PDF bytes
- filename
- page text
- image
- annotation
- embedded metadata全文

送る情報は次だけである。

- SHA-256
- PDF.js fingerprint補助値
- page count
- file size
- current page

## 2. PDF binding

PDFはorganizationとlive sessionへ固定する。
同じPDFを再選択した場合は既存bindingとpage状態を再利用する。
別PDFへ切替える場合は旧分析snapshotを先に作る。

## 3. page state

- 初期pageは1である。
- `clientVersion`は単調増加する。
- 古いversionを拒否する。
- 別bindingのpage更新を拒否する。
- page範囲外をDB triggerで拒否する。

## 4. コメントpage link

Student requestからpage番号を受け取らない。
コメント保存時のserver current pageを同一D1 batchへ保存する。
link作成後の更新を禁止する。

## 5. 理解度

値は次の三つである。

- understood = 100
- unsure = 50
- confused = 0

Studentは見ていたbinding ID。page。client versionを送る。
server current stateと完全一致する場合だけ保存する。
同一participant。同一binding。同一pageはupsertする。

## 6. 集計

pageごとに次を計算する。

- view count
- estimated seconds
- total comments
- visible。pending。hidden comments
- question-mark comments
- distinct comment participants
- understanding response count
- understood。unsure。confused count
- understanding index

一つの滞在区間は最大30分として切る。
放置と切断で過大計上しない。

## 7. 小集団抑制

understanding内訳はdistinct participantが3人以上の場合だけ表示する。
匿名コメント参加者数も3人未満なら表示しない。
回答件数ではなくparticipant数で判定する。

## 8. snapshot

snapshotは次を持つ。

- source cutoff time
- minimum group size
- summary JSON
- page JSON
- SHA-256 checksum
- creator
- created time
- retention expiry

read時にchecksumを再計算する。
不一致ならexportしない。
D1 triggerで作成後の更新を禁止する。

## 9. CSV

CSVへ次を出さない。

- participant ID
- nickname
- comment text
- email
- PDF filename
- PDF text

checksumはresponse headerへ付ける。

## 10. retention

understanding。page event。snapshotは180日である。
期限切れはcron削除前でもqueryから除外する。
cleanupは一回500件までである。

## 11. Privacy上の禁止

- 個人別理解度history
- 個人ranking
- 特定学生の滞在時間
- participant ID付きexport
- PDF内容のserver解析
- AIへPDF内容を送ること
