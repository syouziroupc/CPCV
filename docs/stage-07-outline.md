# 第7段階 設計骨子: AI判定・翻訳

> 本文書は正式実装仕様ではない。第3段階の実装結果に依存する項目は第3段階完了後に確定する。

## 目的

AI判定・翻訳を独立したpatchとcommitで追加する。

## 前段階から必要な成果物

- 第5段階のmoderation statusと第6段階の安定event transport
- 直前段階の完成source ZIP
- 直前段階のmigration適用記録
- 直前段階の自動試験結果
- AuthContextとorganization境界。第3段階完了後に確定

## 追加する主な機能

- AI判定queue
- 人手override
- 翻訳
- 原文保持
- 失敗時fallback
- 利用量制御

## 追加予定のDB

- `ai_jobs`
- `ai_results`
- `translations。第三段階完了後に確定`

テーブル名、列、制約、保存期間は第3段階完了後に確定する。

## 変更予定ファイル

- `migrations-v2/0005_*`
- `src/ai/**`
- `src/translation/**`
- `Queue設定`
- `管理UI最小変更`

## 変更禁止範囲

- PDF分析、認証再設計、コメント基盤再設計
- 直前段階で確定した認証・組織境界を無断変更しない
- 旧migrationを書き換えない
- 本番deployを同一patchへ含めない
- 無関係なUI全面変更をしない

## 主な危険

- 誤判定
- prompt injection
- 個人情報外部送信
- 費用暴走
- 翻訳による意味変化

## 完了条件

- AI失敗時も投稿基盤継続
- 原文不変
- 人手override優先
- 利用量上限
- 監査と再実行
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
