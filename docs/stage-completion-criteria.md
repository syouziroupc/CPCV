# 各段階の完了条件

## 共通条件

各段階は次を全て満たす。

1. 基準commitが記録されている
2. stage専用branch
3. 変更ファイル一覧
4. 変更禁止範囲の自動検査
5. migrationは新規連番
6. 空DBまたは直前DBから適用可能
7. 二回目applyがno-op
8. 正常系試験
9. 異常系試験
10. 組織越境試験
11. rollbackまたは補償試験
12. 秘密値漏えい検査
13. `git diff --check`
14. dry-run
15. 本番deployなし。Stage 9の承認済み作業を除く
16. ZIP CRC
17. ZIP再展開試験
18. SHA-256
19. 未解決事項明記
20. stage単独commit

## Stage 2仕上げ

- remote DB_V2が実在
- 実UUID設定
- remote migration成功
- remote schema検査
- Owner Bootstrap成功
- 旧DB無変更

## Stage 3

`docs/stage-03-spec.md`第23節の34項目を全件確認する。

## Stage 4

- participantとcommentがorganization/sessionへ固定
- comment ID一意
- duplicate投稿防止
- CSV Formula Injection対策
- 生IP保存なし
- retention明示

## Stage 5

- moderation state machine
- role別操作
- Viewer反映
- audit
- bulk operation制限

## Stage 6

完了。local・再展開試験済み。remote未実施。

- subprotocol raw auth token廃止
- 一回限り接続ticket
- Hibernation
- reconnect/catch-up
- sequenceと重複排除

## Stage 7

- 原文保持
- AI失敗時fallback
- manual override優先
- 翻訳由来表示の識別
- 利用量上限
- 外部送信情報の明示

## Stage 8

- PDF非server送信原則
- page link再現性
- 匿名集計
- 個人ランキングなし
- analytics export検証

## Stage 9

- 全段階regression 0 failure
- migration rehearsal
- rollback rehearsal
- security review
- 負荷試験
- 運用文書
- release ZIP再展開試験
- 最終SHA-256
- 未解決事項の受容記録
