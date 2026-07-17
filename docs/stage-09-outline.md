# 第9段階 設計骨子: 最終統合・提出

> 本文書は正式実装仕様ではない。第3段階の実装結果に依存する項目は第3段階完了後に確定する。

## 目的

最終統合・提出を独立したpatchとcommitで追加する。

## 前段階から必要な成果物

- 第3〜8段階の完成成果物とmigration履歴
- 直前段階の完成source ZIP
- 直前段階のmigration適用記録
- 直前段階の自動試験結果
- AuthContextとorganization境界。第3段階完了後に確定

## 追加する主な機能

- 統合試験
- security review
- 負荷試験
- migration rehearsal
- rollback rehearsal
- 運用文書
- 提出ZIP

## 追加予定のDB

- `原則追加なし。必要な修正migrationだけ`

テーブル名、列、制約、保存期間は第3段階完了後に確定する。

## 変更予定ファイル

- `全体。ただし修正理由ごとに限定patch`

## 変更禁止範囲

- 新機能追加
- 直前段階で確定した認証・組織境界を無断変更しない
- 旧migrationを書き換えない
- 本番deployを同一patchへ含めない
- 無関係なUI全面変更をしない

## 主な危険

- 段階間regression
- remote誤操作
- secret混入
- rollback不能
- 文書と実装差異

## 完了条件

- 全段階条件合格
- remote手順検証
- 本番前承認点明示
- ZIP再展開試験
- SHA-256
- 未解決事項ゼロまたは受容記録
- 自動試験0 failure
- ZIP再展開後の再試験
- stage単独patchとcommit

## Codex用指示の下書き

1. 直前段階sourceと本骨子を読む。
2. 第3段階完了後に確定と書かれた項目は勝手に決めない。
3. 正式設計書を先に作成し、承認前に実装しない。
4. migration、実装、試験を一段階だけ行う。
5. 変更禁止範囲をhashまたは境界scriptで検査する。
6. 正常系、異常系、越境、rollbackを試験する。
7. 本番deployを行わない。
8. 完成ZIP、patch、試験結果、debug report、SHA-256を提出する。
