# Staging受入試験

## 1. 前提

- staging Worker。DB_V2。Queueがproductionと分離されている。
- test Ownerが存在する。
- Email Serviceはtest recipientだけへ制限する。
- AI利用上限を小さく設定する。
- test PDFは機密情報を含まない。

## 2. 認証

- 自己登録request
- 確認メール到達
- email verify
- login
- logout
- password変更
- password reset
- invitation
- email変更
- 複数organization選択
- 最後のOwner保護

## 3. 授業

- Owner。Admin。Teacherの権限差
- 授業作成
- 公開code
- 投稿ON/OFF
- コメント表示ON/OFF
- 授業終了
- 他organizationから404

## 4. コメントとmoderation

- 同じidempotency keyの重複排除
- pre moderationでpending
- approve。hide。restore。delete
- 一括moderation
- audit history
- CSV

## 5. Realtime

- Viewer接続
- sequence増加
- reconnect
- catch-up
- duplicate排除
- Durable Object再起動相当
- broadcast失敗後のcatch-up

## 6. 辞書とAI

- 日本語基本pack
- 英語基本pack
- 回避表記
- 英語単語境界
- 曖昧一致はpending
- 日英以外はpending
- AI job Queue投入
- primary。fallback
- PII検出時に外部AIへ送らない
- AI結果が手動状態を変えない
- 利用上限

## 7. 翻訳

- 原文と翻訳先が同じ場合はskip
- pendingは翻訳しない
- 承認後に翻訳
- 翻訳後辞書filter
- reviewまたはreject翻訳は非表示
- 原文状態は維持

## 8. PDF

Browser DevToolsのNetworkを開く。

- PDF選択
- request bodyへPDF bytesがない
- filenameがない
- page textがない
- SHA-256。page count。file sizeだけ
- 同一PDF再選択で状態維持
- 別PDF切替で旧snapshot作成
- page 1から3へ移動
- コメントがpage 3へ紐付く
- 古いclient version拒否

## 9. 理解度

- understood。unsure。confused
- コメント受付OFFでも回答可能
- page競合時は再回答
- 同一participant再回答はupsert
- 2人では内訳非表示
- 3人で内訳表示
- participant IDが画面へ出ない

## 10. Analytics

- page別count
- question mark count
- estimated seconds
- snapshot
- checksum
- CSV
- CSVにnickname。comment text。participant IDがない
- snapshot改変検知
- 期限切れdataが集計に戻らない

## 11. 障害

- AI binding error
- Queue retry
- Email送信失敗
- Durable Object通知失敗
- legacy DB投影失敗
- Stage 8 tableなし互換

## 12. 合格条件

- blocker 0件
- security/privacy不具合0件
- data loss 0件
- production resourceへのaccess 0件
- 全証跡を保存
