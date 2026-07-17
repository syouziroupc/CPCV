# Stage 7.5 引継ぎ書

## 正本

完全引継ぎZIP内の`source/CPCV_stage07_5_complete_source.zip`を正本とします。

## 最初に読む順序

1. `00_READ_FIRST.md`
2. `docs/stage-07-5-final-verification.txt`
3. `docs/stage-07-5-spec.md`
4. `docs/stage-07-5-cloudflare-setup.md`
5. `docs/stage-07-5-debug-report.md`

## 最初の検査

```bash
npm ci
npm run check:stage07-5
npm run visual:stage07-5
npm run deploy:dry-run
npm audit
npm audit --omit=dev
```

## 禁止

- 既存migrationを書き換えない
- fuzzy一致を直接投稿拒否へ変更しない
- political categoryを無断で既定有効にしない
- 伏字後本文で原文を上書きしない
- AI結果で自動非表示にしない
- 本番DBへ先に適用しない

## 次段階

Stage 8へ進む前にstagingで次を確認します。

- 2000語近い辞書の処理時間
- 実際の日本語回避表記
- AI ambiguous routingの費用
- false positive率
- policy変更権限
