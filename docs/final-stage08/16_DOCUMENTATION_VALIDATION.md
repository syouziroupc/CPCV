# Documentation validation

```bash
npm run verify:final-docs
```

検査対象です。

- package version `0.8.2`
- READMEとcurrent systemのversion
- migration `0017`
- Stage 8.2 trigger 42本
- 監査71件の修正対応表
- Codex最終指示の禁止事項
- Git bundleからclean作業treeを作る手順
- outer companion SHA-256必須化
- 正しい`source/expanded-source`参照path
- production非secret値設定後の新release commit
- source manifest生成と検査
- staging canonical configのsource外保持
- source root runtime config materialization
- productionとstagingのresource分離検査
- staging 44項目と受入試験書SHA-256拘束
- Time Travel bookmark。migration一覧。rollback versionの承認前取得
- production後のRemote再検査
- exact Worker rollback command
- deployment証跡とSHA-256一覧
- CIのsource manifestと文書検査
- external pending values
- historical deploy文書のdeprecated表示

失敗した場合は文書を正本として渡しません。
