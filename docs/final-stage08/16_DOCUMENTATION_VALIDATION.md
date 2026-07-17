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
- staging外部config手順
- productionとstagingのresource分離検査
- staging evidenceの実ファイル照合
- Time Travel bookmarkとpreflight
- production後のRemote再検査
- deployment証跡とSHA-256一覧
- external pending values
- historical deploy文書のdeprecated表示

失敗した場合は文書を正本として渡しません。
