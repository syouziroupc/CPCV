# Stage 7.8 反映手順

## 前提

Stage 7.7がRemoteへ未反映なら0013と0014を順に適用する。

## 手順

1. Remote DB_V2をbackup
2. stagingでmigration 0001から0014の履歴を確認
3. `0014_filter_pack_expansion.sql`を適用
4. AI。辞書。翻訳を無効のままdeploy
5. 試験組織で推奨設定を適用
6. 基本パックがversion 2になることを確認
7. 手動編集語が維持されることを確認
8. 削除済み語が復活しないことを確認
9. 誤検出例と見逃し例を記録
10. productionへ反映

厳格設定は授業内容を確認してから有効化する。
