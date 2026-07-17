# Production cutoverとrollback

## cutover gate

次の全条件が必要です。

- clean exact release commit
- local検査全成功
- `verify:deployment`成功
- 同一commitのstaging合格
- staging deployment ID記録済み
- staging acceptance record SHA-256記録済み
- DB_V2 Time Travel bookmark記録済み
- Stage 8.2 preflight 0件
- rollback先Worker deployment確定
- 明示承認

GitHub production workflowは`STAGING_PASSED`。staging commit。deployment ID。記録SHA-256を要求します。local safe deployは同等の環境変数を要求します。

## cutover順序

1. exact commit checkout
2. clean tree検査
3. local full validation
4. production config検査
5. D1 bookmark記録
6. Stage 8.2 preflight
7. pending migration適用
8. Remote D1検査
9. email cutover検査
10. secret設定
11. Worker deploy
12. Remote D1再検査
13. production smoke
14. deployment statusとversion記録

## rollback

Worker不具合は直前のexact Worker versionへ戻します。DB schemaは削除しません。

D1 restoreは次の場合だけ検討します。

- migrationまたはdata mutationで実dataが破損した
- Worker rollbackだけでは復旧しない
- restore先bookmarkと失われる書込を確認した
- userが明示承認した

restore後はforeign key。quick check。Owner。migration記録。smokeを再検査します。
