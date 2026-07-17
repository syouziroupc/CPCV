# CPCV 現在の既知事項

更新基準: Stage 6.5

## 未解決

### KI-CURRENT-001 Remote環境未設定

- remote `DB_V2` UUID未設定
- 4個のRate Limiting namespace未設定
- Email Service sender domain未設定
- Turnstile実key未設定
- remote migration未実施
- stagingとproduction未検証

### KI-CURRENT-002 既存Ownerのメール移行

既存accountにはメールがない。`EMAIL_AUTH_REQUIRED=0`でログインし`/account`から登録する。全active Ownerが移行するまでメール必須化できない。

### KI-CURRENT-003 Email Service実到達未検証

local testではadapterと失敗処理を検証した。実domainのSPF。DKIM。DMARC。迷惑メール判定。provider timeoutはstagingで確認する。

### KI-CURRENT-004 Turnstile実環境未検証

Siteverify処理とtest bypassを検証した。実widget。hostname。timeout。challenge UXはstagingで確認する。

### KI-CURRENT-005 WebSocket ticketが短時間URL queryへ含まれる

Browser WebSocket APIの制約による。60秒。一回限り。hash保存。application logではredactする。CDN側log方針をstagingで確認する。

### KI-CURRENT-006 Realtime snapshot上限

差分とsnapshotは各500件上限。全履歴の正本はD1とCSVである。

### KI-CURRENT-007 Durable ObjectとD1間に単一transactionはない

即時配信失敗時はDBを戻さない。catch-upで回復する。Cloudflare実障害試験は未実施。

### KI-CURRENT-008 新旧D1間に単一transactionはない

授業投影は補償処理とauditで扱う。実障害試験はstagingで行う。

### KI-CURRENT-009 Python画面検査はnpm管理外

Python。Chromium。Playwright。BeautifulSoupはnpmとは別に必要。

## Stage 6.5で解消した事項

- 管理者による仮password配布
- 管理者へのraw reset token表示
- 組織招待経路の欠落
- 既存userの複数組織参加経路の欠落
- メール変更経路の欠落
- 組織quotaの未実装
- 招待再送競合
- account enumeration
- Ownerメール切替前検査の欠落
