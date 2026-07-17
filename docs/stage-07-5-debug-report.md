# Stage 7.5 デバッグ報告

## 修正済み

1. migration番号
   - Stage 7が0010を使用済みのため0011へ固定
2. Stage 4からStage 7試験DB
   - 0011を全対象harnessへ追加
3. comments raw INSERT
   - 新列追加後もconstraint試験が成立するよう列名を明示
4. 伏字範囲
   - 記号挿入による回避では一致範囲全体を伏字化
5. Realtime response category
   - 新規投稿は保存後再取得値ではなく同期判定結果からcategoryを返却
6. Stage 7 boundary
   - 0010が最終migrationという旧前提を解除
7. モバイルUI
   - 辞書表とpolicy表を内部横スクロールへ限定
   - ページ全体の横overflowを防止
8. 入力フォーム
   - labelとcontrolをfield単位で再配置
9. 監査
   - 用語追加。更新。削除。policy更新。授業設定更新を記録
   - audit detailsへ検閲用語本文を保存しない

## 誤検出対策

- fuzzy/confusable一致は直接blockしない
- 短い語にはfuzzyを適用しない
- political categoryは既定無効
- category policyはOwnerだけが変更可能
- AIは助言に限定
