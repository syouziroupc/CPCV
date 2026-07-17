# Stage 6.5 引継ぎ

## 正本

完成成果物の`source/CPCV_stage06_5_complete_source/`を正本とする。同内容のZIPも`source/`へ収録する。

## 開始方法

```bash
npm ci
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage06-5
npm run visual:stage06-5
npm run deploy:dry-run
npm audit
```

## Remote状態

未反映。

- GitHub push未実施
- remote D1 migration未実施
- Email Service実送信未実施
- Turnstile実key未検証
- staging未deploy
- production未deploy

## 次の段階

Stage 7。AI判定と翻訳。

Stage 6.5のaccount。organization。quotaを再設計しない。AI設定と利用量はorganization単位で追加する。
