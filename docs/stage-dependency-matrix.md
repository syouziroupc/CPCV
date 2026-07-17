# 全段階 依存関係表

| 段階 | 主成果物 | 必須前提 | 後続へ渡すもの | 並行可否 |
|---:|---|---|---|---|
| 1 | 現行基準 | 元ソース | manifest、既知問題 | 完了 |
| 2 | 新版DB schema | Stage 1 | DB_V2、7テーブル、Bootstrap | 完了。remoteのみ未実施 |
| 3 | 認証・組織権限 | Stage 2 local。remoteは本番前必須 | AuthContext、role、Cookie、CSRF、授業正本 | 最優先 |
| 4 | 匿名参加者・コメント保存 | Stage 3 | comment ID、participant ID、保存規則 | 完了。remote未実施 |
| 5 | 手動moderation | Stage 4 | comment state machine、moderation audit | 完了。remote未実施 |
| 6 | WebSocket安定化 | Stage 3 auth + Stage 5 event | realtime protocol、sequence、reconnect | 完了。remote未実施 |
| 7 | AI・翻訳 | Stage 5 state + Stage 6 transport | AI job/result、translation | Stage 6後 |
| 8 | PDF連動・分析 | Stage 4 data + Stage 6 timeline。AI利用時Stage 7 | page link、analytics | Stage 7後推奨 |
| 9 | 最終統合 | Stage 3〜8 | release candidate | 最後 |

## Critical path

```text
Stage 2仕上げ
  -> Stage 3 認証
  -> Stage 4 コメント永続化
  -> Stage 5 モデレーション
  -> Stage 6 WebSocket
  -> Stage 7 AI・翻訳
  -> Stage 8 PDF分析
  -> Stage 9 統合
```

## 依存上の重要点

- Stage 3のAuthContextはStage 4以降で変更しない。
- Stage 4のcomment IDとstateはStage 5以降の基礎になる。
- Stage 5のstate machine確定前にAI判定を作らない。
- Stage 6のevent順序確定前にAI結果をrealtime表示しない。
- Stage 8は個人評価へ転用しない分析境界を正式設計で固定する。
