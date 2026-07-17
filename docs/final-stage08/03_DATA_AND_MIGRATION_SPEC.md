# データモデルとmigration仕様

## 1. DB構成

`DB_V2`が現行正本である。
`DB`は旧画面と旧接続の互換投影先である。
二つのD1を同一transactionへ含められない。
DB_V2成功後に旧DBへ投影する。
投影失敗時はDB_V2を補償更新する。

## 2. migration一覧

| 番号 | 内容 |
|---|---|
| 0001 | 組織。利用者。membership。session。授業。監査 |
| 0002 | 認証security。lock。CSRF。rate limit補助 |
| 0003 | 匿名参加者。コメント |
| 0004 | 精密制約。保持期限。index |
| 0005 | コメント本文guard |
| 0006 | 手動moderation |
| 0007 | Realtime sequence。ticket |
| 0008 | メール登録。確認。reset |
| 0009 | 招待。メール変更。quota |
| 0010 | AI job。結果。翻訳。利用量 |
| 0011 | 辞書filter |
| 0012 | 多言語と設定簡略化 |
| 0013 | 日英pack。翻訳前後検閲 |
| 0014 | pack拡充と更新保護 |
| 0015 | PDF page分析。理解度。snapshot |
| 0016 | Stage 8証拠整合trigger |

既存migrationは編集しない。
新しい変更は`0017_...sql`から開始する。

## 3. table群

### 組織と認証

- `organizations`
- `users`
- `organization_members`
- `auth_sessions`
- `auth_session_csrf_tokens`
- `password_reset_tokens`
- `audit_logs`
- `organization_quotas`
- `organization_origins`
### メールとaccount lifecycle

- `pending_registrations`
- `organization_invitations`
- `email_change_requests`
- `email_delivery_attempts`
- `email_enrollment_requests`
- `organization_email_events`
- `auth_public_counters`
### 授業とコメント

- `live_sessions`
- `participants`
- `comments`
- `comment_events`
- `session_moderation_settings`
- `comment_moderation_actions`
### Realtime

- `realtime_session_state`
- `realtime_events`
- `realtime_connection_tickets`
### AIと翻訳

- `organization_ai_settings`
- `session_ai_settings`
- `ai_jobs`
- `ai_results`
- `ai_usage_events`
- `translations`
### 辞書filter

- `content_filter_terms`
- `organization_content_filter_policies`
- `session_content_filter_settings`
- `comment_filter_matches`
- `content_filter_pack_installs`
### PDF分析

- `pdf_documents`
- `session_pdf_bindings`
- `pdf_pages`
- `session_pdf_state`
- `pdf_page_events`
- `comment_page_links`
- `understanding_signals`
- `analytics_snapshots`

## 4. IDと時刻

- IDはprefix付きrandom IDを使う。
- 時刻はUTC ISO 8601 textで保存する。
- booleanは0または1で保存する。
- organizationを持つtableはorganization IDを複合外部キーへ含める。

## 5. token保存

raw tokenを保存しない。
SHA-256 hashだけを保存する。
対象はauth session。CSRF。password reset。registration。invitation。email change。Realtime ticket。participant tokenである。

## 6. 証拠不変性

Stage 8の次の情報は作成後に変更しない。

- PDF identity
- PDF binding identity
- page identity
- page event
- comment page link
- analytics snapshot

understanding signalは同一participant。同一binding。同一pageの再回答だけを許可する。

## 7. retention

- コメントは授業設定または環境設定の保持期間を使う。
- 理解度。page event。analytics snapshotは180日である。
- cleanup cronが遅れてもquery時点で期限切れを除外する。
- 一回のcleanup件数には上限を設ける。

## 8. migration手順

Local:

```bash
npx wrangler d1 migrations apply DB_V2 --local --persist-to .stage08-final-d1
npx wrangler d1 migrations apply DB_V2 --local --persist-to .stage08-final-d1
```

二回目は`No migrations to apply`でなければならない。

Remote:

```bash
npx wrangler d1 migrations apply class_comment_db_v2 --remote
node scripts/verify-remote-d1.mjs
```

Cloudflareは未適用migrationだけを適用する。
適用後にbackupが取得される。

## 9. Remote検証

- `d1_migrations`に0016まで記録
- 必須tableが存在
- moderation。Realtime。quota。Stage 8 triggerが存在
- `PRAGMA foreign_key_check`が0件
- `PRAGMA quick_check`が`ok`
- active Ownerが一人以上
- verified emailがないOwnerがいる場合は`EMAIL_AUTH_REQUIRED=0`を維持
