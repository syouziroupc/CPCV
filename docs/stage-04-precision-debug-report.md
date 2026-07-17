# Stage 4 精密デバッグ報告書

## 調査方法

- source全体の静的検索
- migrationとtriggerの直接SQLite検査
- 認証・組織境界・競合・rollback試験
- fault injection
- Durable Object投稿経路試験
- retention backlog試験
- deployment workflow静的検証
- Wrangler local WorkerによるHTTP E2E
- desktop 1440x1000とmobile 390x844の描画測定
- PDF再生成と全page render
- clean extraction後の再試験

## 実Workerで発見した問題

`npm run dev`で`AUTH_RATE_LIMIT_PEPPER`が渡されず、loginが`AUTH_RATE_LIMIT_PEPPER_NOT_CONFIGURED`で500になった。単体試験環境はpepperを注入していたため検出されなかった。local専用pepperをdev commandへ追加した。production値とは別であり、remote deployではsecretを必須とする。

修正後に次の経路を通した。

1. Owner login
2. Session APIとOrganization API
3. 授業作成
4. 学生公開授業取得
5. 匿名comment投稿
6. 同一idempotency key再送
7. 認証済み履歴取得
8. CSV export
9. 授業終了
10. logout

同一key再送では元comment IDが返り、duplicate flagがtrueになった。

## Bootstrapの実環境差

`.dev-d1`にはlegacy DBとDB_V2が共存する。旧実装はSQLite fileが1個であることを前提にしたため、正常なlocal環境でも`DB_V2_LOCAL_DATABASE_NOT_FOUND`となった。各候補DBのmigration履歴とcore tableを確認しDB_V2を一意に選ぶ処理へ変更した。併存DB試験も追加した。

## Wrangler local queryについて

連続したWrangler local D1 queryの一部がruntime側で停止した。migration適用と再適用no-opはWranglerで確認した。DB integrityは同じSQLite fileへ直接`PRAGMA foreign_key_check`と`PRAGMA quick_check`を実行し、0件と`ok`を確認した。アプリケーションの失敗ではないが、remoteではdeployment verifierがWrangler responseを検証する。

## UI修正

Admin mobileは表のmin-content幅が親gridを押し広げていた。`.page`を`minmax(0,1fr)`にし、card類へ`min-width:0`を設定した。表は専用wrapper内部のみ横scrollさせた。8画面条件すべてで`scrollWidth == innerWidth`を確認した。

## 残存する既知事項

未解決事項は`docs/known-issues.md`に限定して記録した。主なものはremote未設定、Cookie破棄によるparticipant rate limit回避、WebSocket sequence/catch-up未実装、別D1間の単一transaction不可である。
