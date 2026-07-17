# Stage 7.5 API契約

## 組織辞書

### GET `/api/org/content-filter`

Owner。Admin。

返却:

- categories
- policies
- terms
- termLimit

### POST `/api/org/content-filter/terms`

Owner。Admin。CSRF必須。

```json
{
  "term": "example",
  "category": "profanity",
  "severity": 3,
  "matchMode": "normalized",
  "fuzzyEnabled": true
}
```

### PATCH `/api/org/content-filter/terms/:id`

Owner。Admin。CSRF必須。

部分更新を許可します。

### DELETE `/api/org/content-filter/terms/:id`

Owner。Admin。CSRF必須。

soft deleteです。

### PATCH `/api/org/content-filter/policies`

Ownerだけ。CSRF必須。

```json
{
  "policies": [{
    "category": "sexual",
    "enabled": true,
    "reviewMinSeverity": 2,
    "maskMinSeverity": 3,
    "rejectMinSeverity": 5
  }]
}
```

## 授業設定

### GET `/api/private/sessions/:sessionId/filter-settings`

授業管理権限が必要です。

### PATCH `/api/private/sessions/:sessionId/filter-settings`

```json
{
  "enabled": true,
  "aiRoutingMode": "ambiguous",
  "maskCharacter": "＊"
}
```

## 学生投稿

投稿拒否時:

```text
HTTP 422
CONTENT_REJECTED
```

学生画面には一致語やcategoryを表示しません。

伏字時は投稿成功です。responseの`filter.action`は`mask`になります。
