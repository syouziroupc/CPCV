# Stage 8 引継ぎ

## 正本

完全引継ぎZIP内の完成ソースZIPとexpanded sourceを正本とする。
SHA-256は`00_READ_FIRST.md`と`SHA256SUMS.txt`で確認する。

## 完了

- Stage 8 local実装
- migration 0015
- PDF非送信境界
- page連動
- 匿名理解度
- snapshotとCSV
- migration前互換
- 自動試験
- PCとmobile画面確認
- Codex Cloudflare反映手順
- rollback手順

## 未実施

- GitHub push
- Remote D1 migration
- Cloudflare staging deploy
- Cloudflare production deploy
- production PDF実測
- production小人数抑制実測

## Codexの次作業

設計やコードを変更せず。`stage-08-codex-cloudflare-deployment.md`の手順でCloudflareへ反映する。
実値不足やRemote検査失敗があれば停止して報告する。

## 既知の限界

- PDF hash計算はファイル全体をbrowser memoryへ読む
- 512 MiBを上限とする
- page滞在時間は教員Viewer側の推定
- 理解度は自己申告
- 3人閾値は再識別を完全には防がない
- PDF binding解除専用APIはない
- snapshot保持期限は180日固定
