# Stage 8 正式仕様: ローカルPDF連動と匿名理解度分析

## 1. 目的

先生端末で表示しているPDFの現在ページとコメントを結び付ける。
学生の理解度シグナルをページ単位で匿名集計する。
PDF本体をCloudflareへ送信しない原則を維持する。

## 2. 変更しない範囲

- PDFファイル本体の保存
- PDF本文。画像。注釈。ファイル名の送信
- 認証方式
- 組織境界
- コメント本文とmoderation状態遷移
- Realtime sequence契約
- AIと辞書filterの判断契約
- Studentの恒久account化
- 本番deploy

## 3. PDF識別

先生のbrowserでPDFをArrayBufferへ読み込む。
`crypto.subtle.digest("SHA-256", arrayBuffer)`でSHA-256を計算する。
serverへ送る項目は次だけ。

- SHA-256
- PDF.js fingerprint。補助値
- ページ数
- ファイルサイズ

PDF.js fingerprintだけを一意識別子として信用しない。
組織内の正本識別子はSHA-256とする。

## 4. ページ状態

PDFを授業へ紐付けるとpage 1の状態を作る。
ページ変更は単調増加する`clientVersion`で受け付ける。
古いversionと別bindingの更新は無視または拒否する。

コメント投稿時はStudentからpage番号を受け取らない。
serverが保持する現在ページを同じD1 batch内で`comment_page_links`へ保存する。

## 5. 理解度シグナル

選択肢は三つ。

- `understood`: 理解できた
- `unsure`: 少し不明
- `confused`: わからない

Studentは現在表示している`bindingId`。`pageNumber`。`clientVersion`を送る。
serverの現在状態と完全一致した場合だけ保存する。
ページ変更との競合時は保存せず再回答を求める。

一参加者。一PDF binding。一pageにつき一件とする。
再回答は同じ行を更新する。

## 6. 匿名集計

ページ単位で次を集計する。

- 表示回数
- 推定表示秒数
- コメント数
- visible。pending。hidden件数
- 疑問符付きコメント数
- 匿名コメント参加者数
- 理解度回答数
- understood。unsure。confused件数
- 理解度指数

理解度指数は次。

```text
understood = 100
unsure     = 50
confused   = 0
```

3人未満の理解度内訳は表示しない。
匿名コメント参加者数も3人未満なら表示しない。
個人別一覧。個人ranking。参加者IDのexportは作らない。

## 7. 表示時間

`bound`と`page_changed` eventから推定する。
一つのpage滞在区間は最大30分で切る。
browserの切断や放置で過大計上しないためである。

## 8. スナップショット

教員は集計を確定記録として保存できる。

- 集計基準時刻
- 最小集団人数
- summary JSON
- page JSON
- stable JSONのSHA-256
- 作成者
- 保持期限

CSVは集計値だけを出力する。
コメント本文。nickname。参加者IDは出力しない。

## 9. 保持期間

理解度シグナルと集計スナップショットは180日保持する。
Cron cleanupは一回500件まで削除する。
Stage 8 migration未適用環境ではStage 8 cleanupだけを安全に省略する。

## 10. migration互換

Workerがmigrationより先に切り替わっても既存投稿を停止させない。
Stage 8 tableがない場合は次の動作にする。

- コメント投稿は従来どおり成功
- コメント一覧のpage番号は`null`
- PDF状態は無効
- 理解度UIは表示しない
- Stage 8 cleanupだけ省略

正式なCloudflare反映順はmigration先行とする。

## 11. 既定状態

PDFを教員が選択するまでStage 8機能は有効にならない。
授業へPDFを紐付けた時点で理解度UIとpage分析を有効にする。
