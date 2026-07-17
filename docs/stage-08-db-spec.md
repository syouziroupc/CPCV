# Stage 8.1 DB仕様

## migrations

```text
migrations-v2/0015_pdf_page_analytics.sql
migrations-v2/0016_stage08_precision_hardening.sql
```

既存migration 0001から0015は変更しない。`0016`はappend-only hardeningです。

## Stage 8 tables

- `pdf_documents`: PDF bytesを含まない組織内metadata
- `session_pdf_bindings`: 授業とPDFの履歴
- `pdf_pages`: 観測したpage
- `session_pdf_state`: server現在page
- `pdf_page_events`: page変更証拠
- `comment_page_links`: コメントとserver pageの対応
- `understanding_signals`: 匿名理解度
- `analytics_snapshots`: 匿名集計の確定記録

## 0016 hardening

D1 triggerで次を拒否する。

- page countを超えるpage
- bindingとdocumentの不一致
- session stateとbindingの不一致
- 他組織のPDF。授業。user。participant参照
- page eventとbindingの不一致
- comment page evidenceの不一致
- understanding evidenceの不一致
- snapshotとbindingの不一致
- evidence row作成後のidentity変更
- snapshot JSONまたはchecksumの直接更新

保持期限削除と許可された状態更新は妨げない。

## 論理期限

cleanup前でも次をquery対象外にする。

- `comments.expires_at <= now`
- `understanding_signals.expires_at <= now`
- `analytics_snapshots.expires_at <= now`
- 180日を超えた`pdf_page_events`

## 検査結果

```text
0001～0016 fresh apply: PASS
second apply: No migrations to apply
PRAGMA foreign_key_check: 0 rows
PRAGMA quick_check: ok
Stage 8 hardening triggers: installed
```
