# Stage 8.1 rollback

## 通常rollback

migration 0015と0016はappend-onlyで残す。Workerだけを直前のexact deploymentへ戻す。tableとtriggerを手動削除しない。

1. PDF切替とsnapshot作成を停止
2. deployment IDとD1 bookmarkを記録
3. Cloudflare deployment rollbackまたは直前commitをdeploy
4. 認証。コメント。moderation。Realtime。メール。AI。辞書をsmoke
5. `verify-remote-d1.mjs`でDB健全性を確認

Stage 7.8 Workerへ戻す場合。Stage 8 tableは参照されない。0016 triggerも旧tableを対象にしないため既存Stage 1～7機能へ干渉しない。

## Time Travel

Worker rollbackだけで既存data不整合が解消しない場合に限る。restoreはdatabase全体を上書きする。作業中の正当な新規dataも失う。

```bash
npx wrangler d1 time-travel restore class_comment_db_v2 --bookmark=<RECORDED_BOOKMARK>
```

利用者承認。対象bookmark。失われるdata。restore後のprevious bookmarkを記録する。
