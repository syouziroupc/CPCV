# 第3段階 レビューチェックリスト

## A. 変更境界

- [ ] Stage 2基準commitから開始した
- [ ] `migrations/**`無変更
- [ ] 旧D1 UUID無変更
- [ ] Student UI無変更
- [ ] Viewer UI無変更
- [ ] Durable Object protocol無変更
- [ ] AI、翻訳、PDF分析なし
- [ ] 本番deployなし

## B. Cookieとtoken

- [ ] HttpOnly
- [ ] Secure production
- [ ] SameSite=Strict
- [ ] Path=/
- [ ] Domainなし
- [ ] raw session tokenがJSONにない
- [ ] LocalStorageに認証tokenがない
- [ ] DBはtoken hashだけ
- [ ] logoutでCookie削除

## C. CSRFとOrigin

- [ ] unsafe method全てに適用
- [ ] Origin完全一致
- [ ] missing Origin拒否
- [ ] CSRF constant-time比較
- [ ] login/resetはOrigin検査
- [ ] error codeが401と403を混同しない

## D. 認証

- [ ] generic login failure
- [ ] dummy hash
- [ ] IP limiter
- [ ] account limiter
- [ ] D1 account lock
- [ ] idle expiry
- [ ] absolute expiry
- [ ] last_seen write抑制
- [ ] session fixation防止

## E. Password

- [ ] scheme version保存
- [ ] salt要件
- [ ] iteration検証
- [ ] 12〜128文字
- [ ] current password確認
- [ ] change後session失効
- [ ] reset一回限り
- [ ] 複数組織所属者reset制限
- [ ] 秘密値logなし

## F. Roleと組織

- [ ] roleはmembershipから取得
- [ ] client organization IDを信用しない
- [ ] AdminはOwnerを管理不能
- [ ] AdminはAdminを管理不能
- [ ] 最後のOwner保護
- [ ] membership停止でsession失効
- [ ] role変更でsession失効
- [ ] 他組織session越境不能
- [ ] Teacherは他人のsession越境不能

## G. 授業projection

- [ ] DB_V2が正本
- [ ] 旧DBが互換投影
- [ ] 作成時ID一致
- [ ] 失敗補償
- [ ] update rollback
- [ ] 安全側停止
- [ ] 不整合audit
- [ ] public student互換
- [ ] WebSocket互換

## H. Audit

- [ ] action命名統一
- [ ] actor正確
- [ ] organization正確
- [ ] details valid JSON
- [ ] password/token/hash/salt/IPなし

## I. 試験・提出

- [ ] Stage 2試験維持
- [ ] Stage 3全試験0 failure
- [ ] dry-run成功
- [ ] ZIP再展開再試験
- [ ] patchがStage 3限定
- [ ] commit ID記録
- [ ] SHA-256記録
- [ ] remote未実施事項を明記
