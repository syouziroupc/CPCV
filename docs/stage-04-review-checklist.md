# CPCV Stage 4 Review Checklist

## Database

- [x] 旧migrationを変更していない
- [x] `0003_comments.sql`でStage 4 comment schemaを追加した
- [x] `0004_precision_hardening.sql`でsecondary CSRFと精密制約を追加した
- [x] `0005_comment_content_guards.sql`で本文・長さ・nicknameをDB側でも検証する
- [x] comment IDをserver生成する
- [x] organizationとsession境界をDB制約で固定した
- [x] idempotency uniquenessをDB制約で固定した
- [x] 生IP、User-Agent、端末指紋を保存しない
- [x] retention indexを持つ
- [x] `foreign_key_check`が0件
- [x] `quick_check`が`ok`

## Public API

- [x] DB_V2の授業を正本として参照する
- [x] legacy public handlerを到達不能のまま残さず削除した
- [x] 初回tokenをHttpOnly Cookieで発行する
- [x] token平文をDBへ保存しない
- [x] request bodyを4 KiBへ制限する
- [x] 保存成功後だけbroadcastする
- [x] duplicateを再broadcastしない
- [x] rate claimとinsertを同一batchへ含める
- [x] oversized WebSocket frameを閉じる

## Authenticated API

- [x] AuthContextのorganization IDを使用する
- [x] Teacherの所有授業制限を維持する
- [x] Owner、Adminの組織境界を維持する
- [x] unsafe requestはOrigin・JSON・CSRFを検証する
- [x] 複数tab用CSRF tokenを最大8本へ制限する
- [x] CSVをno-storeで返す
- [x] retention手動実行をOwnerへ限定する

## Maintenance and deployment preparation

- [x] comment・participant cleanupを500件単位へ制限する
- [x] expired auth sessionとreset tokenを7日後に削除する
- [x] daily Cronを`wrangler.toml`へ定義する
- [x] CIがStage 2〜4と精密検査を実行する
- [x] production deployを手動workflowへ分離する
- [x] production前に両D1 migration・DB健全性・active Ownerを検査する
- [x] local bootstrapがlegacy D1併存時もDB_V2を選択する
- [x] local devへ非本番Rate Limit pepperを設定する

## Client

- [x] LocalStorage client IDを撤去した
- [x] 再送中は同じidempotency keyを維持する
- [x] 成功後に新しいkeyへ進む
- [x] ViewerのCSVをserver exportへ変更した
- [x] Viewer cacheを件数と期間で制限する
- [x] page levelの横overflowがない
- [x] table横scrollをcontainer内部へ閉じ込めた
- [x] privacy表示が実装と一致する
- [x] static mirrorと配信SPAが一致する

## Verification

- [x] Stage 2試験159件成功
- [x] Stage 3-A試験120件成功
- [x] Stage 3-B試験118件成功
- [x] Stage 3-C試験49件成功
- [x] Stage 4試験67件成功
- [x] 機能回帰513件成功。失敗0件
- [x] 精密境界検査88件成功。失敗0件
- [x] deployment verifier 11件成功。失敗0件
- [x] migration初回適用成功
- [x] migration再実行no-op
- [x] Wrangler dry-run成功
- [x] npm audit脆弱性0件
- [x] desktop・mobile screenshot確認
- [x] 実Worker E2Eでloginからlogoutまで確認
- [x] scheduled handlerをlocalで実行して`ok`を確認
- [ ] remote D1適用。デプロイ段階で実施
- [ ] remote Cron activation確認。デプロイ段階で実施
- [ ] staging・production実環境試験。デプロイ段階で実施
