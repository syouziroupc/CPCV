# Stage 1〜8.1 統合段階仕様

## 1. システム目的

CPCVは授業中のPDF表示と匿名コメントを連動させる。
教員は授業を作成する。学生は公開codeで参加する。
コメントは弾幕または積層表示する。
手動moderation。辞書filter。AI助言。翻訳。ページ別理解度分析を提供する。

PDF本体は教員端末のbrowser内だけで処理する。
CloudflareへPDF bytes。ファイル名。本文。画像。注釈を送らない。

## 2. 段階一覧

| 段階 | 主題 | 完成内容 | DB_V2 migration |
|---|---|---|---|
| 1 | 基準固定と現状監査 | 既存ソース。API。DB。UI。認証。WebSocketを記録した。動作変更は行わない。 | `なし` |
| 2 | DB再設計 | 組織。利用者。組織所属。認証session。授業。監査をDB_V2へ分離した。 | `0001` |
| 3 | 認証と組織権限 | HttpOnly Cookie。CSRF。Origin。PBKDF2。Owner/Admin/Teacher権限。授業APIを実装した。 | `0002` |
| 4 | 匿名参加者とコメント永続化 | 匿名参加者token。コメント正本。保持期限。CSV。跨DB投影の補償処理を実装した。 | `0003–0005` |
| 5 | 手動モデレーション | 事前承認。非表示。復元。削除。競合制御。監査履歴を実装した。 | `0006` |
| 6 | Realtime安定化 | D1 sequence。catch-up。重複排除。接続ticket。Durable Object Hibernationを実装した。 | `0007` |
| 6.5 | メール認証とaccount lifecycle | 自己登録。メール確認。password再設定。組織招待。メール変更。Turnstile。quotaを実装した。 | `0008–0009` |
| 7 | AI助言と翻訳 | Workers AIとQueuesによる非同期AI判定。翻訳。privacy guard。利用上限を実装した。 | `0010` |
| 7.5–7.8 | 辞書検閲と日英pack | 辞書filter。回避表記。簡単設定。日英翻訳前後検閲。500語pack。更新保護を実装した。 | `0011–0014` |
| 8 | PDF連動と匿名分析 | PDF hash。page連動。理解度。匿名集計。snapshot。CSV。180日保持を実装した。 | `0015` |
| 8.1 | 精密hardening | 証拠不変trigger。期限判定。競合防止。集計整合。Remote検査を強化した。 | `0016` |

## 3. 全段階共通の不変条件

- 正本DBは`DB_V2`である。
- 旧`DB`は互換投影先である。
- sessionは一つのorganizationへ固定する。
- request bodyのorganization IDを権限根拠にしない。
- Studentは匿名参加者である。
- raw session token。raw reset token。raw invitation tokenをD1へ保存しない。
- コメント原文は勝手に書き換えない。
- 伏字文と翻訳文は原文とは別に扱う。
- AIは手動moderation stateを自動変更しない。
- Realtime順序の正本はD1のsequence eventである。
- PDF本体をserverへ保存しない。
- 集計は個人別rankingへ利用しない。
- migrationはappend-onlyである。適用済みSQLを編集しない。

## 4. Stage 1

目的は現状固定である。
旧API。旧D1。Master認証。Teacher認証。Student参加。Durable Objectを棚卸しした。
非docs sourceのhashを保存した。
この段階では機能を変更していない。

## 5. Stage 2

`DB_V2`を新設した。
組織とuserを分離した。
roleは`users`ではなく`organization_members`へ置いた。
一人のuserが複数organizationへ所属できる。
授業は必ず一つのorganizationへ属する。
初回Owner bootstrapを実装した。

## 6. Stage 3

Cookie sessionを実装した。
CookieはHttpOnlyである。
productionはSecure。SameSiteはStrictである。
CSRF tokenはsessionと分離してhash保存する。
unsafe requestはOrigin完全一致とCSRFを要求する。
passwordはPBKDF2-HMAC-SHA-256で保存する。
login試行はIP。account。DB lockの三層で制限する。

権限はOwner。Admin。Teacherである。
Ownerはorganization全体を管理する。
AdminはTeacherと授業を管理する。
Teacherは自分の授業を管理する。
最後のactive Ownerを失う変更は禁止する。

## 7. Stage 4

Studentはbrowser Cookieに匿名participant tokenを持つ。
D1にはtoken hashだけを保存する。
コメントはidempotency keyを持つ。
コメント正本は`comments`である。
保持期限を持つ。
CSV exportは権限確認後に行う。
旧DB投影失敗時は補償処理を行う。

## 8. Stage 5

授業ごとにmoderation modeを持つ。
`off`は投稿後表示である。
`pre`は承認後表示である。
状態はvisible。pending。hidden。deletedを扱う。
状態遷移はDB triggerとexpected timestampで保護する。
単一操作。一括操作。履歴。監査を持つ。

## 9. Stage 6

WebSocket接続前に短命ticketを発行する。
Realtime eventはD1でsequenceを採番する。
clientは最後に処理したsequenceを保持する。
再接続時はcatch-upを取得する。
重複eventはsequenceで排除する。
Durable Objectはbroadcastを担当する。永続正本ではない。

## 10. Stage 6.5

自己登録は確認メール完了時に確定する。
未確認登録はpending tableへ置く。
メール確認時にuser。organization。Owner membership。quota。sessionを作る。
password reset。organization invitation。email changeを実装した。
公開認証APIはTurnstileと二層rate limitを使う。
account列挙を防ぐため外部responseを統一する。

## 11. Stage 7

AI処理はCloudflare Queueへjob IDだけを送る。
コメント本文はQueue messageへ入れない。
Workers AIはmoderation助言と翻訳を行う。
primary model失敗時はfallback modelを使う。
外部model呼出し単位で利用量を計上する。
PIIらしい文字列を検出した場合は外部AIへ送らない。
AI結果はallow。review。hideの助言である。手動状態は変更しない。

## 12. Stage 7.5〜7.8

辞書用語はterm。language。category。severity。match mode。boundary modeを持つ。
処理閾値はcategory policy側で決める。
確定一致は辞書で処理する。
曖昧一致はpendingとAI助言へ回す。

日本語はNFKC。片仮名から平仮名。記号挿入。ゼロ幅文字を考慮する。
英語は単語境界を優先する。
原文とdisplay messageを分離する。
翻訳前と翻訳後の両方へ日英辞書を適用する。
日英以外は自動許可せずpendingへ送る。

標準packは合計500語である。
推奨は基本289語を導入する。
厳格は文脈注意を含む500語を導入する。
利用者が編集または削除した語はpack更新で上書きしない。

## 13. Stage 8

教員browserでPDFのSHA-256を計算する。
serverへ送るのはhash。補助fingerprint。page count。file sizeである。
PDF bindingは授業へ固定する。
現在pageはclient versionで競合制御する。

Studentコメントはserverの現在pageへ紐付ける。
Studentはunderstood。unsure。confusedを送れる。
回答時のbinding。page。client versionがserver状態と一致した場合だけ保存する。

ページ別にコメント数。疑問符数。推定滞在時間。理解度を集計する。
distinct participantが3人未満なら内訳を隠す。
個人別一覧。個人ranking。participant ID付きexportは作らない。

snapshotはstable JSONとSHA-256 checksumを保存する。
CSVは集計値だけを出力する。
保持期限は180日である。

## 14. Stage 8.1

期限切れdataはcron前でもqueryから除外する。
同一PDF再選択をidempotentにする。
別PDF切替前に旧snapshotを自動作成する。
PDF読込競合で古い処理が画面を上書きしない。
Stage 8証拠行はD1 triggerで不変性を強制する。
全体理解度の3人判定はdistinct participant数で行う。
Remote検査はmigration 0016とtriggerを確認する。

## 15. Stage 8完成条件

- local全試験が成功する。
- `0001`から`0016`を空DBへ適用できる。
- 二回目migrationがno-opになる。
- foreign key異常が0件である。
- quick checkが`ok`である。
- Wrangler dry-runが成功する。
- source ZIP再展開後も同じ試験が成功する。
- Cloudflare remoteは未変更のまま引き継ぐ。
