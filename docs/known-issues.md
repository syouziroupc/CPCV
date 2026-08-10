# CPCV 現行既知事項

更新基準: U-22凍結候補。Web `0.8.10` / Windows Desktop `0.2.2`。

この文書は凍結判定で残っている事項だけを記録します。Stage 1〜8の旧課題一覧は履歴資料です。現在値は `README.md`、`docs/current-system.md`、`wrangler.toml`、`SOURCE_GIT_RECORD.txt` を優先します。

## KI-CURRENT-001 凍結候補Web sourceとproduction Workerの一致が未確定

最後にGitHub上で完全なproduction配備成功記録が確認できるsourceは `4a295ae5505a680019b9896b97e1d6f1ec2f20cd` です。U-22凍結候補はそれ以降の `0.8.10` 修正を含みます。

凍結前に、最終commitと同一commitをisolated stagingで受入試験し、既存のmanual production workflowで配備した後、Worker deployment/version IDとproduction smoke結果を記録します。sourceだけから本番版を推測しません。

## KI-CURRENT-002 既存accountのemail移行は運用ゲート

`EMAIL_AUTH_REQUIRED=0` の間は既存login ID利用者を維持できます。全既存accountのverified email移行を確認してから必須化します。これはU-22デモの機能欠陥ではなく、運用cutover条件です。

## KI-CURRENT-003 Windows実行ファイルは未署名

Desktop CIにはAuthenticode署名工程がありますが、repository secretに署名証明書が設定されていない場合は署名工程をskipします。未署名EXEはWindows SmartScreen等の警告対象になり得ます。機能試験とは分離して記録します。

## KI-CURRENT-004 Desktopの物理投影試験が残る

CIではWindows Release build、Rust unit test、Clippy、20秒launch smokeまで自動確認します。次は物理Windows環境で以下を確認します。

- PowerPoint slideshowより前面にcommentが表示される
- click-throughによりPowerPointのmouse/keyboard操作を奪わない
- comment表示ON/OFFとQR表示が管理画面から反映される
- 複数monitorと異なるDPIで正しい画面へ配置される
- monitor切替とHDMI抜き差し後に復旧する
- sleep/resume後に管理画面とoverlayが再利用できる

## KI-CURRENT-005 WebSocket ticketは60秒・一回限り

接続ticketは短寿命で一回消費です。接続直前に取得し、失効時は新しいticketを取得します。長時間保持して再利用する設計にはしません。

## KI-CURRENT-006 Realtime catch-upはbounded

catch-upは最大500 eventです。範囲を超える場合はsnapshot/resetへ切り替えます。授業履歴の正本はD1で、全履歴取得はauthenticated API/CSVを使用します。

## KI-CURRENT-007 D1とDurable Objectは単一transactionではない

comment/realtimeの永続正本はD1です。Durable Object配信失敗はbounded retry、snapshot/catch-up、delivery-only retryで回復します。旧DBとDB_V2の跨DB更新も単一transactionではないため、既存のcompensationとinconsistency記録を維持します。

## 凍結前に解消済みとして扱う旧事項

以下は現在のproduction設定・実装では「未設定」と扱いません。

- production DB / DB_V2 binding
- production Rate Limiting namespaces
- Queue bindings
- Email sender binding
- Turnstile site key
- production origin
- Stage 8.2 migration `0001`〜`0017` の実装

実際の秘密値はrepositoryへ保存せず、Cloudflare/GitHub secret側で管理します。
