# CPCV Stage 3-C 実装報告書

## 1. 完了状態

Stage 3-Cのローカル実装を完了した。

GitHub、Cloudflare remote、remote D1、本番Workerには接続していない。

## 2. 実装した範囲

### 2.1 授業APIの新版認証化

`/api/private/**`をStage 3のHttpOnly Cookie認証へ接続した。

- Bearer tokenは認証に使用しない
- 認証組織はsessionから決定する
- requestの`organizationId`は拒否する
- Teacherは自分が作成した授業だけ扱える
- OwnerとAdminは自組織の全授業を扱える
- 他組織の授業は404として扱う

### 2.2 新旧D1投影

権限上の正本を`DB_V2.live_sessions`とした。

学生公開APIと既存Durable Object互換のため、旧`DB.sessions`へ同じsession IDとpublic codeを投影する。

- 作成: DB_V2作成後に旧DBへ投影
- 設定変更: 旧DB更新後にDB_V2を条件付き更新
- 更新失敗: 旧DBをsnapshotへrollback
- 終了・削除: 旧DBを先に安全側停止
- 投影不整合: `session.projection_inconsistent`を監査記録

### 2.3 作成失敗時の安全側補償

旧DBへの新規投影が失敗した場合、DB_V2のsessionを`deleted`へ変更する。

補償用audit insertまで失敗した場合も、auditの原子性を理由にactive orphanを残さない。別の条件付きUPDATEで安全側削除を行い、不整合監査を再試行する。

### 2.4 管理画面

`/admin`をCookie認証へ移行した。

- 認証tokenをLocalStorageへ保存しない
- Bearer headerを送信しない
- unsafe requestへCSRF tokenを付ける
- OwnerとAdminには組織管理リンクを表示する
- 複数組織選択に対応する

`/master`をOwner・Admin用の組織管理画面へ置き換えた。

- メンバー追加
- role変更
- 停止・再開・解除
- reset token発行
- 組織内授業の操作
- 監査ログ表示

### 2.5 Viewer

ViewerのPDF表示とコメント表示構造は維持した。

認証部分だけCookie方式へ移行した。

- LocalStorage認証tokenを廃止
- Bearer tokenとWebSocket subprotocol tokenを廃止
- WebSocket upgrade時はブラウザCookieとOriginを使用
- QR隅表示の視覚設定だけLocalStorageへ保存する

### 2.6 旧認証停止

`AUTH_V2_ENABLED=1`では次を410にする。

- `/api/teacher/login`
- `/api/teacher/logout`
- `/api/master/**`

productionで`AUTH_V2_ENABLED=0`を指定した場合は起動を拒否する。

## 3. 変更した主要ファイル

- `src/index.js`
- `src/routes/private-v2.js`
- `src/db/live-session-projection.js`
- `public/_admin_spa.html`
- `public/_viewer_spa.html`
- `public/master/index.html`
- `public/assets/admin.js`
- `public/assets/viewer.js`
- `public/assets/master.js`
- `scripts/test-private-v2.mjs`
- `scripts/verify-stage03c-boundaries.mjs`
- `package.json`
- `package-lock.json`
- `wrangler.toml`

## 4. 依存更新

開発依存のWranglerを`4.110.0`へ更新し、主要依存をexact versionへ固定した。npmとpnpmのlockfileも同期した。

更新前のfull auditで確認されたWrangler配下の5件を解消した。更新後は開発依存を含む`npm audit`が0件となった。

## 5. 互換維持

変更していないもの。

- Student UI
- 学生投稿API
- コメントmessage payload
- PDF.js本体
- 旧D1 migration
- Durable Objectの外部protocol
- GitHub Actions
- production deploy設定

## 6. 未実施

- remote `DB_V2`作成
- remote migration
- Rate Limiting binding設定
- Owner Bootstrap
- staging deploy
- production deploy
- 実ネットワーク負荷試験

これらは最終デプロイ段階でCodexが実環境を確認して行う。
