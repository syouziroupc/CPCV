# 第4段階 設計骨子: 匿名参加者・コメント永続化

> 本文書は正式実装仕様ではない。第3段階の実装結果に依存する項目は第3段階完了後に確定する。

## 目的

匿名参加者・コメント永続化を独立したpatchとcommitで追加する。

## 前段階から必要な成果物

- 認証済み組織・授業境界と旧DB投影が安定していること
- 直前段階の完成source ZIP
- 直前段階のmigration適用記録
- 直前段階の自動試験結果
- AuthContextとorganization境界。第3段階完了後に確定

## 追加する主な機能

- 匿名参加者ID
- コメントのD1永続保存
- 投稿履歴
- CSV安全化
- 保存期間

## 追加予定のDB

- `participants`
- `comments`
- `comment_events または必要最小限の監査列`

テーブル名、列、制約、保存期間は第3段階完了後に確定する。

## 変更予定ファイル

- `migrations-v2/0003_*`
- `src/routes/public-v2.js`
- `src/comments/**`
- `public/assets/join.js`
- `public/assets/viewer.js`

## 変更禁止範囲

- AI、翻訳、WebSocket再設計、PDF分析
- 直前段階で確定した認証・組織境界を無断変更しない
- 旧migrationを書き換えない
- 本番deployを同一patchへ含めない
- 無関係なUI全面変更をしない

## 主な危険

- 個人識別情報の過剰保存
- 生IP保存
- CSV Formula Injection
- 投稿重複
- 旧DBとの二重書込み

## 完了条件

- 匿名参加者とコメントが組織・授業へ固定
- 投稿再送が重複しない
- CSV無害化
- 保存期間試験
- 現行表示互換
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
