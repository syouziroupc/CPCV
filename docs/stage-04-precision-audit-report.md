# Stage 4 精密監査報告書

## 結論

Stage 4はローカル完成条件を満たした。精密監査で発見した不具合を修正し、Stage 2からStage 4までの機能試験513件、精密境界検査88件、deployment verifier 11件を失敗0件で完走した。実WorkerでもOwner loginから授業作成、匿名投稿、idempotent再送、履歴取得、CSV export、授業終了、logoutまで確認した。

GitHub、Cloudflare remote、staging、productionへの反映は行っていない。

## 重大な発見と修正

| 分類 | 発見事項 | 修正 |
|---|---|---|
| CI | Stage 3・4試験がCI対象外 | `check:precision`をCIへ接続 |
| Deploy | DB_V2 migrationとOwner確認なしでdeploy可能 | 両D1 migration、DB健全性、active Owner、smoke testを必須化 |
| CSRF | 複数tabでtokenが相互失効 | Sessionごとに期限付きsecondary tokenを最大8本保持 |
| Request | JSON bodyをstreamで無制限に読めた | 認証16 KiB、公開投稿4 KiBへ実byte上限 |
| Database | API外から本文長とnickname制約を回避可能 | DB triggerで本文、message_length、nicknameを強制 |
| Retention | participantとsecurity record cleanupが無制限または欠落 | 500件単位。最大20batch。古いSessionとreset tokenも削除 |
| Cron | scheduled handlerはあるがCron定義なし | UTC 03:17の日次Cronを追加 |
| Bootstrap | legacy D1併存時にDB_V2を特定できない | schemaとmigration履歴でDB_V2を識別 |
| Bootstrap | 後続migration適用済みDBを拒否 | Stage 2 coreを厳密確認し追加tableを許容 |
| Bootstrap | local Worker子processが残る | localはSQLite transaction。remote子processも追跡終了 |
| Local dev | Rate Limit pepper不足でloginが500 | local専用pepperを`npm run dev`へ明示 |
| Security | response種別によりheaderが欠落 | CSP、frame防御、HSTS等を統一 |
| WebSocket | 大きなclient frameを受理 | 上限超過frameをclose |
| Viewer | local cacheが無期限増加 | 保存期間と件数上限を追加。pruningを線形化 |
| UI | Mobile管理画面がpage levelで横overflow | grid shrink guardとtable内部scrollへ修正 |
| Privacy | 管理画面とmanualにIP保存表現が残存 | IP列と古い説明を撤去 |
| Packaging | npmとpnpm lockが併存 | npmへ統一 |

## 完成判定

- 機能試験513件。失敗0件
- 精密境界検査88件。失敗0件
- migration 0001から0005を新規DBへ適用
- 再適用はno-op
- `foreign_key_check`は0件
- `quick_check`は`ok`
- production依存と全依存の監査は脆弱性0件
- desktopとmobileでpage level横overflowなし
- 実Worker E2E成功
- scheduled handler local実行成功

## Remote前提

remote D1 UUID、Rate Limiting namespace、`AUTH_RATE_LIMIT_PEPPER`、Owner Bootstrap、staging実試験はデプロイ段階で必要となる。
