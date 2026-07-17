# Production cutoverとrollback

## cutover gate

全条件が必要です。

- clean exact release commit
- local検査全成功
- production config検査成功
- staging config検査成功
- productionとstagingのresource分離検査成功
- 同一commitのstaging合格
- staging deployment ID記録済み
- staging config SHA-256記録済み
- staging acceptance record SHA-256記録済み
- staging evidence内容検査成功
- DB_V2 Time Travel bookmark記録済み
- Stage 8.2 preflight 0件
- rollback先Worker version確定
- 明示承認

## cutover順序

1. exact commit checkout
2. clean tree検査
3. source manifest検査
4. local full validation
5. staging evidence検査
6. production config検査
7. D1 bookmark記録
8. Stage 8.2 preflight
9. pending migration一覧保存
10. migration適用
11. Remote D1検査
12. email cutover検査
13. secret設定
14. Worker deploy
15. Remote D1再検査
16. production smoke
17. deployment statusとversion保存
18. 証跡SHA-256一覧生成

`scripts/safe-deploy.ps1`とproduction workflowはこの順序を実装します。

## rollback

Worker不具合は直前のexact Worker versionへ戻します。DB schemaは削除しません。

D1 restoreは次の場合だけ検討します。

- migrationまたはdata mutationで実dataが破損した
- Worker rollbackだけでは復旧しない
- restore先bookmarkを確認した
- restore後に失われる書込を確認した
- userが明示承認した

restore後はforeign key。quick check。Owner。migration記録。smokeを再検査します。
