# CPCV Stage 3-B デバッグ報告書

## 修正した問題

1. logout body内の組織指定が未検査だった
   - 空bodyとJSON objectを分けて解析した
   - body。query。headerの組織指定を400で拒否した

2. 旧password schemeのrehash時に`password_changed_at`を上書きしていた
   - rehashはhash方式の更新だけとした
   - 実際のpassword変更日時を維持した

3. password resetでhash計算失敗後にtokenだけ消費する可能性があった
   - hash計算をtransaction前に移動した
   - password更新。token消費。他token失効。session失効。auditを単一batchにした

4. member変更後のsession失効とauditが別transactionだった
   - 条件付きOwner保護UPDATEと後続処理を単一batchにした
   - 更新成功markerを後続SQLの条件にした

5. password変更とmembership停止が競合すると新sessionだけ発行できない可能性があった
   - user。organization。membershipのactive状態をDB側で再確認した
   - operation markerで後続処理を条件化した

6. session発行SQLがmembership存在だけを前提としていた
   - active user。active organization。active membershipをINSERT時に再確認した

7. password reset発行の省略bodyを受け付けていなかった
   - JSON Content-Typeを維持したまま空bodyを許可した

8. malformed percent encodingが500になり得た
   - path parameterのdecode失敗を400へ変換した

9. 認証APIの予期しない500が通常JSON headerだけだった
   - 認証・組織APIでは500もno-store security headerを返すようにした

## fault injection

SQLite triggerで次のaudit insertを強制失敗させた。

- `member.created`
- `member.suspended`
- `auth.password.changed`
- `auth.password_reset.used`

全経路でHTTP 500を返し、user作成。membership変更。session失効。password変更。token消費がrollbackされることを確認した。
