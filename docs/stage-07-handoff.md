# Stage 7 引継ぎ書

## 正本

単一完全引継ぎZIP内の`source/CPCV_stage07_complete_source.zip`を正本とします。

## 最初に読む順序

1. `00_READ_FIRST.md`
2. `docs/stage-07-final-verification.txt`
3. `docs/stage-07-cloudflare-setup.md`
4. `docs/stage-07-debug-report.md`
5. `source/CPCV_stage07_complete_source/README.md`

## 次の担当者が最初に行うこと

1. source ZIPのSHA-256を照合
2. 空フォルダへ展開
3. `npm ci`
4. `npm run check:stage07`
5. `npm run visual:stage07`
6. remote操作前にCloudflare設定手順を確認

## 禁止

- AIを有効にした状態で初回deployしない
- 0010適用前にAI consumerを動かさない
- 実在学生のコメントをstaging model検証へ使わない
- AI助言で自動非表示にしない
- 既存migrationを書き換えない

## 次段階

Stage 8へ進む前にstagingでQueue。Workers AI。Gateway。D1 quota。Realtime catch-upを実動確認します。
