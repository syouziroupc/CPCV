# Stage 1〜8.2 統合段階仕様

## 目的

CPCVは授業中のPDF表示と匿名コメントを連動させます。教員は授業を作成します。学生は公開codeで参加します。コメントは弾幕または積層表示します。手動moderation。辞書filter。AI助言。翻訳。ページ別理解度分析を提供します。

PDF本体は教員browser内だけで処理します。CloudflareへPDF bytes。ファイル名。本文。画像。注釈を送信しません。

## 段階

| 段階 | 完成内容 | DB_V2 migration |
|---|---|---|
| 1 | 基準固定と現状監査 | なし |
| 2 | 組織。user。membership。授業。監査のDB_V2化 | `0001` |
| 3 | Cookie認証。CSRF。Origin。role。授業API | `0002` |
| 4 | 匿名participant。comment正本。保持期限。跨DB投影 | `0003`〜`0005` |
| 5 | 手動moderation。競合制御。履歴 | `0006` |
| 6 | D1 sequence。catch-up。ticket。Durable Object | `0007` |
| 6.5 | メール認証。招待。reset。Turnstile。quota | `0008`〜`0009` |
| 7 | Queue。Workers AI。助言。翻訳。利用上限 | `0010` |
| 7.5〜7.8 | 辞書filter。多言語。日英pack。pack更新 | `0011`〜`0014` |
| 8 | PDF hash。page連動。匿名理解度。snapshot | `0015` |
| 8.1 | PDF証拠整合。期限判定。集計競合対策 | `0016` |
| 8.2 | 71件の不具合修正。組織境界。競合。deploy検査 | `0017` |

## 不変条件

- 正本DBは`DB_V2`です。
- legacy `DB`は互換投影先です。
- request bodyのorganization IDを権限根拠にしません。
- raw tokenをD1へ保存しません。
- comment原文をfilterやAIで上書きしません。
- AIは手動moderation stateを自動変更しません。
- Realtime順序の正本はD1 sequenceです。
- PDF本体をserverへ保存しません。
- 個人別理解度rankingを作りません。
- migrationはappend-onlyです。

## Stage 8.2追加条件

- 期限切れcommentとeventは物理削除前でも利用不能です。
- idempotency keyはparticipant単位です。
- filterは証拠表示上限後も全termを評価します。
- AI workerはjob claim identityが一致する場合だけ結果を確定します。
- Realtime接続は無通信でも5分以内に認証を再検証します。
- PDF更新の敗者はacceptedを返しません。
- understandingはactive sessionと現在pageを再確認します。
- loginと公開メールのlimiter障害はfail closedです。
- content filter mutationとauditは同じbatchです。
- 20種類の組織・context境界をinsertとupdate triggerで強制します。
- active filter term上限2000件をD1で強制します。

## 完成条件

- `0001`〜`0017`を空DBへ順番適用できる。
- `PRAGMA foreign_key_check`が0件。
- `PRAGMA integrity_check`が`ok`。
- 全段階の回帰試験が成功する。
- Stage 8.2 hardening試験が成功する。
- documentation検査が成功する。
- Wrangler dry-runが成功する。
- production config検査は実値設定後だけ成功する。
- staging受入試験を同一commitで完了する。
- production deployは明示承認後だけ行う。
