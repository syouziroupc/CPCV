# CPCV 第2段階 Git記録

入力された第一段階完成版ZIPと現在の作業ディレクトリには`.git`が含まれていない。元リポジトリのbranch、commit ID、履歴は確認できない。

この成果物ではGit履歴を捏造しない。元のGitリポジトリへ反映する際は`stage-02-database` branchを作成し、変更内容を確認してcommitする。

```bash
git switch -c stage-02-database
git status --short
git diff --check
git add .gitignore package.json wrangler.toml migrations-v2 scripts docs
git commit -m "stage-02: add isolated D1 v2 schema"
```

提出ZIPには`.git`を含めない。
