# Stage 5 Review Checklist

- [x] 組織境界をclient値から取得していない
- [x] Teacher所有授業を検査する
- [x] OwnerとAdminを自組織へ限定する
- [x] pendingをbroadcastしない
- [x] 非表示と削除をViewerから撤回する
- [x] deletedからvisibleへ直接戻さない
- [x] expectedUpdatedAtを必須化する
- [x] 一括操作を25件へ制限する
- [x] action。event。auditを同一batchへ含める
- [x] comment本文をgeneric auditへ保存しない
- [x] 生IP。User-Agent。端末指紋を追加していない
- [x] clearとmoderationを分離する
- [x] remote deployment verifierがmigration 0006を確認する
- [x] Stage 1〜4回帰試験が0 failure
- [x] 実Worker smoke testが成功
- [x] DesktopとMobileを描画確認
- [x] ZIP再展開後に再試験
