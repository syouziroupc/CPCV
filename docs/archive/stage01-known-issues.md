# CPCV 既知問題

第1段階では現行動作を固定するため修正しない。
対応段階は段階別開発指示書に合わせる。

## 致命的

### KI-001 空DBを再構築できない

対応: 第2段階

`0001_init.sql`が`comment_display_seconds`を作る。
`0003_add_comment_display_seconds.sql`が同じ列を追加する。
空D1へのmigrationは`duplicate column name: comment_display_seconds`で停止する。

### KI-002 先生削除後の同一ID再作成で授業を作れない

対応: 第2段階と第3段階

再現手順:

1. teacher accountを作成
2. loginして`teachers`行を作る
3. Masterからteacher accountを削除
4. 同じlogin IDで再作成
5. 再login
6. 授業作成

結果は`500 INTERNAL_ERROR`。
D1はforeign key error。

原因:

- `teachers.email`がUNIQUE
- email conflict時にnameだけ更新する
- `teachers.id`は旧account IDのまま
- 新account IDを`sessions.teacher_id`へ入れると外部キー違反

## 高

### KI-003 授業statusの不正遷移

対応: 第2段階と第5段階

- `deleted`から`active`へ戻せる
- `deleted`でもposting ON visibility ONを保存できる
- statusと`ended_at`が一貫しない

### KI-004 Master APIが存在しない対象へ成功を返す

対応: 第3段階

存在しないteacherまたはsessionへのreset enable disable delete endが200。
存在しないteacherのpassword resetは新passwordまで返す。

### KI-005 duplicate login IDが500

対応: 第3段階

UNIQUE違反を明示的な409などへ変換しない。

### KI-006 生IPをViewerとCSVへ送る

対応: 第4段階

Public APIが取得したIPを`message:new`へ含める。
接続中Viewer browserとIndexedDBへ生IPを渡す。
Teacher CSVにも生IPを出力する。

### KI-007 `x-client-id`を変更すると連投制限を回避できる

対応: 第4段階

client IDはclient指定headerを信用する。
値を変えるだけで別参加者として扱われる。
発行Cookieは識別に使われない。

### KI-008 CSV Formula Injection

対応: 第5段階

CSVはdouble quoteだけをescapeする。
`=` `+` `-` `@`などで始まるuntrusted inputを無害化しない。

### KI-009 URL検知が限定的

対応: 第5段階

拒否は`http://` `https://` `www.`だけ。
`ftp://`などは実動試験で受理された。

### KI-010 JSON入力防御が不足

対応: 第5段階

- Content-Type確認なし
- body全体のbyte size制限なし
- Unicode normalizationなし
- 一般control character除去なし
- parse失敗を空objectとして扱う

### KI-011 生の認証tokenをLocalStorageへ保存

対応: 第3段階

MasterとTeacherのraw tokenをLocalStorageへ保存する。
XSS browser extension 共有端末などへの露出面がある。

### KI-012 Teacher tokenをWebSocket subprotocolへ入れる

対応: 第6段階

Viewerは`teacher-token.<raw token>`を`Sec-WebSocket-Protocol`へ送る。
serverは同じtoken入り値を選択済みprotocolとして返す。

### KI-013 login試行制限がない

対応: 第3段階

Master loginとTeacher loginにrate limit lockout Turnstileがない。

### KI-014 WebSocket Origin確認がない

対応: 第6段階

WebSocket Upgrade時にOriginを検証しない。

### KI-015 Viewerが固定間隔で再接続を続ける

対応: 第6段階

close後は2.5秒で再接続する。
認証失敗や停止済み授業を区別しない。

### KI-016 Masterの授業終了が接続中Viewerへ即時反映されない

対応: 第6段階

Masterのend deleteはD1だけを更新する。
CommentRoomへstate変更やclearを送らない。

### KI-017 Viewer不在中のcommentを失う

対応: 第4段階と第6段階

comment本文をserverへ保存せず history replayもない。
Viewer未接続時または切断中のcommentは後から取得できない。

### KI-018 Security Headerが不足

対応: 第5段階

現行は主に`X-Content-Type-Options`と`Referrer-Policy`だけ。
CSP HSTS Permissions-Policy frame-ancestors相当の方針がない。

### KI-019 既存checkは実動を保証しない

対応: 各段階と第9段階

既存scriptは構文と文字列存在確認が中心。
API D1 auth status transition WebSocketを自動実動試験しない。

### KI-020 npm auditでdevelopment toolchain脆弱性

対応: 依存関係更新を許可する段階

2026-07-12 `npm audit --json`:

- low 1
- high 4
- total 5

`npm audit --omit=dev --json`は0件。
報告対象はWrangler系development dependency chain。

### KI-021 main pushでremote migrationとdeployを実行

対応: 運用設計または第9段階

GitHub Actionsはmain pushでremote D1 migration後にWorkerをdeployする。
現行migrationには再構築不能問題がある。
branch protectionとproduction approvalの前提が資料化されていない。

## 中

### KI-022 spaceだけの授業名を保存できる

対応: 第5段階

Teacher APIはtitleをtrimしない。

### KI-023 client ID Cookieが未使用

対応: 第4段階

Public投稿responseはCookieを発行する。
Student JSとWorkerはそのCookieを識別に使わない。

### KI-024 連投制限がDurable Objectメモリだけ

対応: 第4段階または第6段階

CommentRoom再生成時に`lastPostAt`が消える。

### KI-025 WebSocket Hibernation未使用

対応: 第6段階

WebSocket Standard APIを使用する。
idle時のHibernationを利用しない。

### KI-026 auth sessionのcleanupがない

対応: 第3段階

期限切れまたはrevoked済みのTeacherとMaster sessionを定期削除しない。

### KI-027 Teacher削除後も関連データが残る

対応: 第2段階

削除対象は`teacher_accounts`と`teacher_sessions`。
`teachers` `sessions` `admin_audit_logs`は残る。

### KI-028 Master操作のauditがない

対応: 第3段階

Teacher作成 reset disable delete 授業endなどをauditしない。

### KI-029 `comments/clear`は端末ログを消さない

対応: UI表現は第5段階または第9段階

APIは表示消去eventだけを送る。
Viewer IndexedDBの保存履歴は残る。

### KI-030 CORS方針が明文化されていない

対応: 第3段階

OPTIONSは204のみ。
Access-Control-Allow系headerはない。
同一origin専用として固定するか CORSを実装するか未定。

### KI-031 package managerが二重

対応: 第9段階または依存関係整理

`package-lock.json`と`pnpm-lock.yaml`が共存する。
CIはnpm。
lockfile内のWrangler versionも一致しない。

### KI-032 READMEと実装が不一致

対応: 第9段階

主な不一致:

- PDF.js実装なのにKnown Limitsはiframe
- CSVありなのにCSVなし
- IndexedDB保存ありなのにcomment保存なしとだけ記載
- version表記不一致

### KI-033 version表記が不一致

対応: 第9段階

- README v0.2.0
- package 0.1.0
- Worker name v01
- source folder v0.1

### KI-034 local devでもproduction join URLを返す

対応: 設定整理段階

`PUBLIC_ORIGIN`がproduction URLに固定される。
local APIで作成した授業もproduction originのjoin URLを返す。

### KI-035 manual生成環境が再現不能

対応: 第9段階

Python dependenciesをlockしない。
Windowsの特定font絶対pathを使用する。

## 低または整理対象

### KI-036 `system_settings`未使用

対応: 第2段階

### KI-037 `TEACHER_ORIGIN`未使用

対応: 設定整理段階

### KI-038 `admin_audit_logs`にforeign keyがない

対応: 第2段階

### KI-039 source ZIPに生成物が大量に含まれる

対応: 第1段階配布で除外済み

元ZIPには`node_modules` `.tools` `.wrangler` `tmp` `output` logが含まれる。

### KI-040 元Git履歴がない

対応: 利用者側

提供ZIPに`.git`がない。
元commit branch tracked state remoteは確認不能。
ZIP hashとfile manifestで代替する。
