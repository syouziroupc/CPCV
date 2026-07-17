# Stage 8 デバッグ報告

## 1. migration前Worker互換

### 問題

Stage 8 SQLが未適用のDBでコメント一覧と投稿がStage 8 tableを参照すると停止する。

### 修正

table存在を確認するpositive cacheを追加した。
Stage 8 tableがなければpage linkだけを省略する。
コメント一覧は`pdfPageNumber: null`を返す。

## 2. page切替と理解度回答の競合

### 問題

Studentがpage 3を見ている間に教員がpage 4へ移動すると回答がpage 4へ誤記録される余地があった。

### 修正

Studentが見た`bindingId`。`pageNumber`。`clientVersion`を送る。
server状態と完全一致した時だけ保存する。
不一致は`PDF_STATE_CHANGED`とする。

## 3. コメント受付OFF時の理解度

### 問題

理解度回答がコメント投稿設定へ不必要に依存していた。

### 修正

授業がactiveでPDF bindingがある場合はコメント受付OFFでも回答可能にした。

## 4. abuse対策

### 問題

理解度endpointにedge rate limitがなかった。

### 修正

IPをsecret pepper付きHMACにして既存public limiterへ別scopeで接続した。
コメントと理解度のcounter keyは分離した。

## 5. 組織横断外部キー

### 問題

単独IDの外部キーだけではapplication bug時に別組織resourceを誤参照する余地が残った。

### 修正

organization IDを含む複合外部キーへ強化した。

## 6. PDF hash memory

### 問題

PDF.js読込後に別のbuffer copyを作ると大きなPDFでmemoryを余分に消費する。

### 修正

一つのArrayBufferを先にSHA-256へ渡し。その後PDF.jsへ渡す。複製しない。

## 7. mobile layout

### 問題

page分析表とsnapshot exportが390px幅で詰まった。

### 修正

page全体を横へ広げず。表だけ内部横scrollにした。export操作はmobileで縦配置にした。

## 8. Remote確認不足

### 問題

`verify-remote-d1.mjs`がStage 6.5までのmigrationとtableしか確認していなかった。

### 修正

0010から0015。AI。辞書。PDF分析tableも確認するよう更新した。
