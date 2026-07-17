# CPCV 第1段階仕様書

## 1. 目的

現行CPCVを改修前の基準として固定する。
今後の差分を検証できる状態にする。
この段階ではアプリケーションの動作を変更しない。

## 2. 基準

- 入力ソース: `既存CPCV.zip`
- 開発方針: `CPCV_段階別開発指示書(1).zip`
- 入力ZIPのSHA-256: `docs/source-archives.sha256`
- 元ソースのファイル別SHA-256: `docs/original-source-manifest.sha256`
- 提供ZIPに`.git`は含まれない

元Gitリポジトリへ反映する場合は作業前に次を保存する。

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log -1 --oneline
```

ブランチ名は`stage-01-baseline`とする。

## 3. 現在の構成一覧

| 区分 | 現行実装 |
|---|---|
| 実行基盤 | Cloudflare Workers |
| 静的配信 | Workers Static Assets |
| DB | Cloudflare D1 |
| リアルタイム | Durable ObjectsとWebSocket Standard API |
| PDF | PDF.js。先生端末でローカルPDFを描画 |
| コメント本文 | D1とDurable Object Storageには保存しない |
| 端末ログ | ViewerのIndexedDBへ保存 |
| フロントエンド | HTML CSS Vanilla JavaScript |
| package manager | CIと既存手順はnpm。pnpm lockfileも残存 |

詳細は`docs/current-system.md`を参照する。

## 4. 現在のAPI一覧

### Public

- `GET /api/public/qr`
- `GET /api/public/sessions/:publicCode`
- `POST /api/public/sessions/:publicCode/messages`

### Teacher認証

- `POST /api/teacher/login`
- `POST /api/teacher/logout`

### Teacher private

- `GET /api/private/me`
- `GET /api/private/sessions`
- `POST /api/private/sessions`
- `GET /api/private/sessions/:sessionId`
- `DELETE /api/private/sessions/:sessionId`
- `POST /api/private/sessions/:sessionId/settings`
- `POST /api/private/sessions/:sessionId/comments/clear`
- `GET /api/private/sessions/:sessionId/live`

### Master

- `POST /api/master/login`
- `POST /api/master/logout`
- `GET /api/master/status`
- `GET /api/master/teachers`
- `POST /api/master/teachers`
- `POST /api/master/teachers/:teacherId/reset-password`
- `POST /api/master/teachers/:teacherId/disable`
- `POST /api/master/teachers/:teacherId/enable`
- `DELETE /api/master/teachers/:teacherId`
- `GET /api/master/sessions`
- `POST /api/master/sessions/:sessionId/end`
- `DELETE /api/master/sessions/:sessionId`

詳細は`docs/api-baseline.md`を参照する。

## 5. 画面一覧

| URL | 用途 |
|---|---|
| `/` | 授業コード入力 |
| `/j/:publicCode` | 学生投稿 |
| `/admin` | 先生ログイン 授業作成 授業一覧 |
| `/admin/:sessionId` | 授業設定と端末ログ確認 |
| `/viewer/:sessionId` | PDF投影 コメント表示 QR CSV |
| `/master` | 先生アカウントと進行中授業の管理 |

## 6. D1テーブル一覧

- `teachers`
- `sessions`
- `admin_audit_logs`
- `system_settings`
- `teacher_accounts`
- `teacher_sessions`
- `master_sessions`

空DBへの全マイグレーションは失敗する。
`0001_init.sql`と`0003_add_comment_display_seconds.sql`が同じ列を作るためである。
この問題は第2段階で新版DBを作って解消する。

## 7. Durable Objectの役割

クラスは`CommentRoom`。
授業IDからDurable Object IDを決める。

現行の役割:

- ViewerのWebSocket接続を保持
- コメントを接続中Viewerへ配信
- 設定変更と表示消去を配信
- `clientId`単位の10秒連投制限
- 投稿状態 表示状態 表示時間 表示方式をメモリ保持

Durable Object Storageは使用しない。
インスタンス再生成時にメモリ状態と連投記録は失われる。

## 8. 認証方法

### Master

- `MASTER_TOKEN`をログイン時に比較
- 15分のMaster sessionを発行
- D1にはsession tokenのSHA-256を保存
- 生tokenはブラウザLocalStorageへ保存
- loginとlogout以外のMaster APIはBearer認証
- logoutはBearerなしでも200

### Teacher

- `teacher_accounts`のlogin IDとpasswordで認証
- PBKDF2-HMAC-SHA-256 100,000回
- 12時間のTeacher sessionを発行
- D1にはsession tokenのSHA-256を保存
- 生tokenはブラウザLocalStorageへ保存
- Private APIはBearer認証
- WebSocketは`teacher-token.<token>`をサブプロトコルへ入れる

### Student

- アカウント認証なし
- 公開コードで授業を特定
- `clientId`はLocalStorageと`x-client-id`で送る
- 投稿レスポンスは同名Cookieも発行するが現行処理は読み戻さない

## 9. 現在のテスト一覧

| コマンド | 検査内容 |
|---|---|
| `npm ci` | `package-lock.json`から依存関係を再構築 |
| `npm run check` | JS構文 必須トークン 禁止トークンの静的確認 |
| `npm run check:project` | 必須ファイル Binding テーブル方針の静的確認 |
| `npm run check:pdf-links` | PDFリンク関連実装の文字列確認 |
| `npm run deploy:dry-run` | WorkerとAssetsのbundle確認 |
| `npm ls --all` | 依存関係ツリー確認 |
| `npm audit --json` | 全依存関係の既知脆弱性確認 |
| `npm audit --omit=dev --json` | production依存だけの確認 |
| D1 local migration | 空DBから再構築できるか確認 |
| ローカル実動試験 | 画面 API 認証 D1 WebSocketを確認 |
| 配布物監査 | 秘密情報 生成物 参照切れ 権限 ZIP構造を確認 |

既存の`check`群は主に静的検査である。
APIやDBの整合性を保証しない。

## 10. 既知の問題一覧

優先度と再現結果は`docs/known-issues.md`へ記録する。
第1段階では動作を変えず 後続段階へ送る。

## 11. 今後も残す機能

- Workers Static Assets D1 Durable Objectsの基本構成
- PDFをサーバーへ送らない方式
- PDF.js表示
- 公開コード参加
- Admin Viewer Masterの役割分離
- 投稿と表示のON/OFF
- コメント表示方式と表示時間
- QR表示
- 全画面投影
- 授業単位のリアルタイム配信
- CSV出力という利用者要件

## 12. 今後置き換える機能

| 段階 | 対象 |
|---|---|
| 第2段階 | DBスキーマ マイグレーション 先生情報二重管理 |
| 第3段階 | MASTER_TOKEN LocalStorage認証 権限 セッション |
| 第4段階 | 匿名参加者 コメント保存 IP取扱い CSV |
| 第5段階 | モデレーション 入力防御 CSV無害化 セキュリティヘッダー |
| 第6段階 | WebSocket認証 再接続 Hibernation 欠落と重複 |
| 第7段階 | AI判定 翻訳 |
| 第8段階 | PDFページ同期 理解度分析 |
| 第9段階 | 自動試験 README バージョン 提出物 |

## 13. 第1段階で変更してよいファイル

- `.gitignore`
- `docs/**`

元Gitで生成物が追跡済みの場合だけ `git ls-files`で確認したうえで追跡解除する。
対象は`node_modules` `.tools` `.wrangler` `tmp` `output` `*.log` `.dev.vars*` `.env*`に限定する。

## 14. 第1段階で変更してはいけないファイル

- `src/**`
- `public/**`
- `migrations/**`
- `scripts/**`
- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `wrangler.toml`
- `.github/workflows/**`
- `README.md`

禁止事項:

- DBスキーマ変更
- 認証変更
- UI変更
- API変更
- WebSocket変更
- 依存関係更新
- コード整理
- 本番D1操作
- 本番デプロイ

## 15. 完了条件

1. 入力ZIPと基準ファイルのSHA-256が記録されている
2. 現行構成 API 画面 D1 DO 認証がソースと一致する
3. 正常系と既知異常系の実動結果が記録されている
4. 空DB migration失敗が再現されている
5. 秘密情報とローカル生成物が配布物にない
6. 元の非docsアプリケーションファイルは`.gitignore`以外変更されていない
7. patchが`git apply --check --whitespace=error`を通る
8. clean ZIPが単一トップレベルフォルダを持つ
9. ZIP CRCと展開後hashが一致する
10. 本番D1と本番Workerを操作していない
11. 未検証事項を明記している
12. 元Gitではブランチとコミットを作成できる状態である

## 16. 確認コマンド

```bash
npm ci
npm run check
npm run check:project
npm run check:pdf-links
npm run deploy:dry-run
npm ls --all
npm audit --json
npm audit --omit=dev --json
npx wrangler d1 migrations apply class_comment_db --local --persist-to .baseline-d1
```

元Gitでの境界確認:

```bash
git diff --check
git diff --stat
git diff -- src public migrations scripts package.json package-lock.json pnpm-lock.yaml pnpm-workspace.yaml wrangler.toml .github README.md
```

推奨コミット:

```text
stage-01: document and freeze current system baseline
```
