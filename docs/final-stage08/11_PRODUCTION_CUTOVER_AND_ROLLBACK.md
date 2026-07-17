# Production cutoverとrollback

## cutover gate

全条件が必要です。

- clean exact release commit
- source manifest一致
- local検査全成功
- production config検査成功
- staging config検査成功
- productionとstagingのresource分離検査成功
- 同一commitのstaging 44項目合格
- staging受入試験書SHA-256一致
- staging deployment ID記録済み
- staging config SHA-256記録済み
- staging acceptance record SHA-256記録済み
- staging evidence内容検査成功
- DB_V2 Time Travel bookmark記録済み
- Stage 8.2 preflight 0件
- pending migration一覧保存済み
- rollback先Worker version確定
- 明示承認

## cutover順序

1. exact commit checkout
2. clean treeとsource manifest検査
3. local full validation
4. staging evidence検査
5. production config検査
6. D1 bookmark記録
7. Stage 8.2 preflight
8. pending migration一覧保存
9. Remote D1 read-only検査
10. Worker deployment statusとversion一覧保存
11. userへ全read-only結果提示
12. 明示承認
13. migration適用
14. Remote D1再検査
15. email cutover検査
16. secret設定
17. Worker deploy
18. Remote D1再検査
19. production smoke
20. deployment statusとversion保存
21. 証跡SHA-256一覧生成

`scripts/safe-deploy.ps1`はread-only情報を承認前に取得します。production workflowを使う場合はdispatch前に同じread-only情報を提示します。GitHub `production` environmentにはrequired reviewerを設定します。

## Worker rollback

rollback先のexact version IDを使います。

```bash
npx wrangler versions list
npx wrangler rollback <EXACT_PREVIOUS_VERSION_ID>
```

Worker rollbackはWorker code/versionを戻します。D1 schema。migration履歴。binding。Queue。Rate Limiting namespace。Email。Turnstileは自動で戻りません。rollback後もRemote D1とsmokeを再検査します。

## D1 Time Travel restore

D1 restoreは次の場合だけ検討します。

- migrationまたはdata mutationで実dataが破損した
- Worker rollbackだけでは復旧しない
- restore先bookmarkを確認した
- restore後に失われる書込を確認した
- userが明示承認した

restore commandは影響範囲を提示してから確定します。restore後はforeign key。quick check。Owner。migration記録。smokeを再検査します。
