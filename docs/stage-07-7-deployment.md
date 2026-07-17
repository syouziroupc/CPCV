# Stage 7.7 Cloudflare反映手順

## 事前条件

- Stage 7.6までのRemote migration履歴を確認
- Remote DB_V2 backup
- Queue `cpcv-ai-jobs`が存在
- AI bindingが利用可能
- rate limiterとsecretが設定済み
- Email認証切替状態を確認

## migration

```powershell
npx wrangler d1 migrations apply class_comment_db_v2 --remote
```

適用対象:

```text
0013_bilingual_filter_translation_safety.sql
```

Remoteへ未適用の0010〜0012がある場合はWranglerが番号順に適用する。途中番号だけを手動で飛ばさない。

## staging

1. AI。辞書filter。翻訳を既定無効でdeploy
2. Remote `foreign_key_check`と`quick_check`
3. 日本語パックと英語パックを試験組織へ導入
4. 原文伏字。日英以外pending。AI参考判定を確認
5. 日→英。英→日の翻訳後検閲を確認
6. raw translationがViewerとWebSocketへ出ないことを確認
7. 誤検出を記録
8. production切替

## rollback

migrationを削除または逆適用しない。

機能停止は授業filterを無効。組織AIを無効。授業翻訳を無効にして行う。

Stage 7.6 binaryへ戻す場合も0013列はDBへ残す。Stage 7.6側が追加列を参照しないことをstagingで確認してから行う。
