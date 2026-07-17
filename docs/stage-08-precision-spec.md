# Stage 8.1 精密デバッグ仕様

## 目的

Stage 8をCloudflareへ反映する前に。data整合性。保持期限。競合。旧DB互換。画面挙動。migration再現性を精密に検査する。

## 完了条件

- 全functional testが失敗0
- Stage 8。precision。deployment boundaryが失敗0
- 0001から0016を空D1へ適用可能
- 二回目migrationがno-op
- foreign key異常0
- quick checkがok
- snapshot checksum破損を検出
- 期限切れdataがcron前でも非表示
- 同一PDF再選択がidempotent
- 別PDF切替前に旧分析を自動snapshot
- page切替競合時に誤回答を保存しない
- PDF bytes。filename。page textをserverへ送らない
- Remote未操作
