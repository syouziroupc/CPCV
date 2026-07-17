# Stage 7 API契約

既存認証Cookie。Origin。CSRF。organization境界を維持します。

## 組織AI設定

### `GET /api/org/ai-settings`

OwnerまたはAdmin。

### `PATCH /api/org/ai-settings`

Ownerのみ。

```json
{
  "enabled": false,
  "moderationDailyLimit": 500,
  "translationDailyLimit": 500
}
```

## 授業AI設定

### `GET /api/private/sessions/:sessionId/ai-settings`

授業管理権限が必要です。

### `PATCH /api/private/sessions/:sessionId/ai-settings`

```json
{
  "moderationEnabled": true,
  "translationEnabled": true,
  "targetLanguage": "ja"
}
```

設定を有効にした時は最大100件をbackfillします。

## コメントAI再試行

### `POST /api/private/sessions/:sessionId/comments/:commentId/ai-retry`

```json
{
  "jobTypes": ["moderation", "translation"]
}
```

## コメント一覧追加情報

管理用コメント一覧に最新AI判定。翻訳。job状態を追加します。原文と手動moderation stateは変更しません。

## Realtime event

翻訳完了時にsequence付きtranslation eventを保存します。Viewerは原文の下へ翻訳を反映します。
