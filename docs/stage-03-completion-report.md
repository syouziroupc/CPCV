# CPCV Stage 3 完了報告

## 完了した単位

- Stage 3-A: 認証基盤
- Stage 3-B: 認証・組織管理API
- Stage 3-C: 授業連携・UI移行

## Stage 3完了時の状態

- 組織単位のOwner、Admin、Teacher認証がある
- HttpOnly Cookie、CSRF、Origin検査がある
- LocalStorage認証tokenとBearer認証を使用しない
- Teacherの授業所有権を検査する
- OwnerとAdminは自組織の授業を扱える
- 他組織越境を拒否する
- 新版DBを権限上の正本とする
- 旧DBへ互換投影する
- 旧認証endpointを停止できる
- Student投稿とViewer表示を維持する
- ローカル回帰試験がある

## Stage 3完了に含まれないもの

- コメント本文のD1保存
- moderation state
- WebSocket sequenceとcatch-up
- AI判定と翻訳
- PDFページ別分析
- remote D1と本番deploy

次はStage 4の正式設計と実装へ進む。
