# Stage 7 正式仕様: AI判定助言と翻訳

## 目的

コメント基盤を変更せずAI判定助言と翻訳を追加する。

## 不変条件

- 原文不変
- AIは手動moderation stateを変更しない
- 人間の判断を優先
- AI障害時も投稿を成功させる
- 組織境界と授業権限を維持
- PDFをserverへ保存しない
- 旧migrationを変更しない
- 本番deployを含めない

## 設定階層

組織設定が最上位です。組織AIが無効なら授業設定が有効でもjobを実行しません。

授業設定:

- moderation enabled
- translation enabled
- target language

対象言語は`ja`。`en`。`ko`。`zh-CN`。`zh-TW`です。

## 判定結果

- `allow`
- `review`
- `hide`

結果にはconfidenceとcategoryを保存します。これは助言です。自動非表示はしません。

## 翻訳

翻訳は原文と別tableへ保存します。Viewerでは原文の下に`AI翻訳`と表示します。

## Privacy

個人情報らしい文字列はlocalで止めます。外部AIへ送信しません。prompt injectionはuntrusted dataとして処理します。

## 障害処理

- Queue送信失敗: 投稿成功。D1 jobをscheduled recoveryで再送
- Provider一時障害: Queue retry
- structured response不正: fallback model
- 日次上限: jobをskip
- migration未適用: scheduled AI recoveryをskip
- Realtime dispatch失敗: D1 sequenceからcatch-up

## 完了条件

- 機能試験0 failure
- 境界検査0 failure
- npm audit 0
- PCとmobileの実画面確認
- ZIP再展開後の再試験
- 単一完全引継ぎZIP
