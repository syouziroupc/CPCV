# 第3段階 自動テスト仕様

## 1. 試験構成

| 層 | 内容 |
|---|---|
| static | 禁止参照、秘密値、LocalStorage、Bearer残存検査 |
| schema | migration、列、INDEX、制約 |
| unit | Cookie、CSRF、Origin、password、permission |
| integration | Worker + local DB_V2 + old local DB |
| adversarial | 越境、偽造、race、replay、rate limit |
| package | ZIP再展開後の全再試験 |

## 2. Migration

- 空DBへ0001と0002が適用できる
- 二回目applyがno-op
- 旧migrationを適用しない
- users追加列が存在
- defaultとCHECKが正しい
- indexが存在
- 0001だけのDBへ0002を適用できる
- 0002途中失敗時に半端なschemaを残さない

## 3. Cookie

- production名が`__Host-cpcv_session`
- Secureあり
- HttpOnlyあり
- SameSite=Strict
- Path=/
- Domainなし
- login response JSONにraw session tokenなし
- logoutはMax-Age=0で同一属性
- local mode以外でdev cookie拒否
- authenticated responseがno-store

## 4. Origin

- 正しいOrigin成功
- 別scheme拒否
- 別host拒否
- 別port拒否
- suffix一致攻撃拒否
- `https://trusted.example.evil`拒否
- Originなしunsafe request拒否
- 複数Origin header拒否

## 5. CSRF

- 正しいtoken成功
- headerなし403
- 空header403
- token改変403
- 別session token403
- revoked session token403
- logoutにCSRF必須
- GETにCSRF不要
- loginにCSRF不要だがOrigin必須
- tokenがaudit logへ出ない

## 6. Login

- 正常login
- userなしgeneric 401
- password不一致generic 401
- suspended user generic 401
- deleted user generic 401
- membershipなしgeneric 401
- suspended organization拒否
- suspended membership拒否
- single organization自動選択
- multiple organizationで409
- 有効なorganization選択成功
- 他人のorganization ID拒否
- loginでrequest organization IDをmembership候補として照合し。権限根拠にはしない
- login成功でfailed count reset
- dummy hash path実行

## 7. Rate limitとlock

- IP limit超過で429
- account key limit超過で429
- 生IPがlogとDBへ出ない
- 5回失敗でlocked_until設定
- lock中にpassword正解でも拒否
- 期限後login成功
- 成功でcount reset
- limiter failure時のfail-open/fail-closed動作を仕様どおり確認。推奨はaccount lockを維持しlimiterだけfail-open

## 8. Session

- D1にhashだけ保存
- idle期限
- absolute期限
- revoked session
- user停止後拒否
- organization停止後拒否
- membership停止後拒否
- role変更後旧session拒否
- last_seen更新は5分未満でwriteしない
- 5分以上で延長
- absolute期限を超えて延長しない
- token replayはlogout後失敗
- session fixationなし

## 9. Password

- 11文字拒否
- 12文字成功
- 128文字成功
- 129文字拒否
- Unicode成功
- login ID同一拒否
- current password不一致拒否
- change成功
- change後旧password拒否
- change後旧session全失効
- reset token hash保存

- 管理者発行endpointが`POST /api/org/members/:userId/password-reset`
- 旧`POST /api/auth/password/reset/request`が存在しない
- raw token一度だけ返却
- 期限切れ拒否
- 使用済み拒否
- revoked拒否
- reset成功後全session失効
- reset成功後他token失効
- AdminがOwner/Adminへreset token発行不可
- OwnerがAdmin/Teacherへreset token発行可
- active複数組織所属者へ発行拒否

## 10. Role

全permission matrixをtable-driven testにする。

- Owner許可操作
- Admin許可操作
- Teacher許可操作
- AdminのOwner管理拒否
- AdminのAdmin管理拒否
- Teacherのmember API拒否
- 最後のOwner除去拒否
- 自分自身の最後のOwner停止拒否
- role変更時session失効

## 11. 組織越境

- 他組織member一覧拒否
- 他組織audit拒否
- 他組織session取得拒否
- 他組織session更新拒否
- 他組織session終了拒否
- 同じuserが複数組織所属時もcurrent auth organizationへ固定
- login以外のrequest body/query/headerにorganization IDがあれば400
- session Cookieを別organizationへ流用不能

## 12. 授業投影

- 作成時にDB_V2と旧DBで同一ID
- 同一public code
- titleと状態一致
- 旧DB作成失敗時にDB_V2 deleted
- 失敗時に成功responseなし
- 更新時両DB一致
- DB_V2更新失敗時に旧DB rollback
- rollback失敗時にinconsistent audit
- 終了時は旧DBが必ず投稿停止
- 削除時は両DBがdeleted相当
- Teacherは自分のsessionだけ
- Owner/Adminは自組織全session

## 13. Legacy境界

- V2有効時にteacher login 410
- V2有効時にmaster API 410
- Bearer tokenでprivate APIへ入れない
- LocalStorageにsession tokenなし
- Student public APIが従来payloadで成功
- Viewer接続が従来方式で成功
- WebSocket subprotocolは第3段階では変更なし

## 14. Audit

- 必須actionを全て記録
- organization IDが正しい
- actor user/roleが正しい
- details_json valid JSON
- passwordなし
- raw tokenなし
- hash/saltなし
- Cookie headerなし
- 生IPなし

## 15. Package

- ZIP CRC
- path traversalなし
- symlinkなし
- secret fileなし
- node_modulesなし
- local D1なし
- manifest一致
- `npm ci`後に全試験再成功
