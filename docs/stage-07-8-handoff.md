# Stage 7.8 引継ぎ

## 正本

- version `0.7.8`
- migration latest `0014_filter_pack_expansion.sql`
- 推奨辞書 289語
- 厳格辞書 500語

## 最初に確認するもの

1. `00_READ_FIRST.md`
2. `README.md`
3. `docs/stage-07-8-spec.md`
4. `docs/stage-07-8-dictionary-audit.md`
5. `docs/stage-07-8-test-results.txt`
6. `docs/stage-07-8-deployment.md`

## 次段階で勝手に変更しないもの

- 基本と文脈注意の分離
- 政治語を自動導入しない方針
- 文脈注意を自動拒否しない方針
- 手動編集をpack更新で上書きしない方針
- 削除語を再導入で復活させない方針
- 原文とdisplay textの分離
- 人間のmoderation最優先
