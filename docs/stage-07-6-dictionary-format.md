# Stage 7.6 辞書形式

## DB形式

table: `content_filter_terms`

| field | 型 | 説明 |
|---|---|---|
| `id` | TEXT | 用語ID |
| `organization_id` | TEXT | 組織 |
| `term` | TEXT | 原型用語 |
| `language_code` | TEXT | 言語。既定`und` |
| `category` | TEXT | 種類 |
| `severity` | INTEGER | 1〜5 |
| `match_mode` | TEXT | strict。normalized。fuzzy |
| `fuzzy_enabled` | INTEGER | 0または1 |
| `boundary_mode` | TEXT | auto。word。substring |
| `active` | INTEGER | 0または1 |
| `created_by_user_id` | TEXT | 作成者 |
| `created_at` | TEXT | 作成時刻 |
| `updated_at` | TEXT | 更新時刻 |

## CSV export形式

```csv
term,language_code,category,severity,match_mode,fuzzy_enabled,boundary_mode,active
```

CSV importはStage 7.6では実装していない。

## 管理操作

組織OwnerまたはAdminが画面から次を実行できる。

- 追加
- 編集
- 有効化
- 無効化
- 削除
- CSV export

用語本文は監査ログへ保存しない。
