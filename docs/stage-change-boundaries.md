# 各段階の変更禁止範囲

| 段階 | 変更禁止 |
|---:|---|
| 2仕上げ | 旧D1 UUID、旧migration、src/public動作、本番deploy |
| 3 | 学生投稿、匿名参加者、コメント保存、WebSocket方式、AI、翻訳、PDF分析、Viewer/Student UI、本番deploy |
| 4 | 認証方式、role matrix、WebSocket transport、AI、翻訳、PDF分析 |
| 5 | 認証方式、コメント本文schemaの無関係変更、AI自動判定、翻訳、PDF分析 |
| 6 | role、moderation state定義、AI判定、翻訳、PDF分析 |
| 7 | 認証、comment基盤、manual moderation優先順位、PDF分析 |
| 8 | 認証、AI基盤全面変更、個人ランキング、PDF server upload原則変更 |
| 9 | 新機能、旧migration改変、secret埋込み、未承認本番deploy |

## 全段階共通禁止

- 架空database ID
- 架空remote操作結果
- secretのsource、SQL、log、CLI引数への記載
- 過去migrationの書換え
- 無関係なリファクタリング
- 複数段階の一括patch
- 利用者未保存変更の上書き
- 試験未実施を合格扱い
- local結果をremote結果として記載
