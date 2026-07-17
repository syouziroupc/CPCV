# Documentation validation

```bash
npm run verify:final-docs
```

検査対象です。

- package version `0.8.2`
- READMEとcurrent systemのversion
- migration `0017`
- Stage 8.2 trigger 42本
- Codex final instructionの禁止事項
- staging evidence gate
- Time Travel bookmarkとpreflight
- production後のRemote再検査
- external pending values
- historical deploy文書のdeprecated表示

失敗した場合は文書を正本として渡しません。
