# Codexへ渡す指示

以下をCodexへそのまま渡す。

```text
添付のCPCV_stage08_final_complete_handoff.zipを唯一の正本として扱ってください。

最初に00_READ_FIRST.mdとFINAL_STAGE08_SPECIFICATION/00_INDEX.mdを読んでください。
次にFINAL_STAGE08_SPECIFICATION/09_CODEX_CLOUDFLARE_RUNBOOK.mdへ従ってください。

目的はStage 8完成版をCloudflare stagingへ反映し。全受入試験を実施した後。明示承認を得てproductionへ反映することです。

禁止事項:
- CloudflareのUUID。namespace ID。secret。domainを推測しない
- productionへ直接deployしない
- productionとstagingのD1。Queueを共有しない
- PDF bytes。filename。page text。画像をCloudflareへ送る変更をしない
- migrations-v2/0001から0016を編集しない
- user承認なしでDEPLOY_PRODUCTIONを入力しない
- user承認なしでD1 Time Travel restoreを実行しない
- Stage 8と無関係なrefactorをしない

まずlocalで次を実行してください:
npm ci
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage08
npm run test:owner-bootstrap
npm run visual:stage08
npm run deploy:dry-run
npm audit
npm audit --omit=dev

一件でも失敗した場合はCloudflare操作をせず。原因と修正を提示してください。

Cloudflare操作前に13_CONFIGURATION_WORKSHEET.mdの未記入値をDashboardまたはWranglerから取得してください。値が取得できない場合は停止してください。

staging反映後は10_STAGING_ACCEPTANCE_TEST.mdを全件実行してください。
production反映の直前で一度停止し。実行予定command。D1 bookmark。migration一覧。staging結果。rollback先versionを提示してください。
明示承認後だけproductionへ進んでください。

作業結果はdeployment-records/へ保存してください。
最終的に変更source。config差分。migration output。version ID。smoke結果。rollback手順を一つの引継ぎZIPへまとめてください。
```
