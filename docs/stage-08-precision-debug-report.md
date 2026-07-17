# Stage 8.1 精密デバッグ報告

## 修正した不具合

1. コメント受付OFF時に理解度まで拒否される。
2. 期限切れ理解度とsnapshotがcleanup前に集計・取得できる。
3. 全体の3人抑制がdistinct participantではなくpage回答件数を数える。
4. 期限切れコメントがpage集計とCSVへ残る。
5. 180日超のpage eventが表示時間へ残る。
6. 同じPDFの再選択でcurrent pageと分析状態が初期化される。
7. 別PDFへ切替えると旧集計が画面から回収不能になる。
8. 複数PDF読込が競合すると古い処理が新しい画面を上書きする。
9. PDF bind失敗時にも現在表示中PDFを先に破棄する。
10. 理解度のpage/version競合が内部error codeのまま学生へ表示される。
11. 理解度endpointの濫用対策が不足する。
12. snapshot JSONを直接改変しても読出し時に検出しない。
13. page分析の証拠tableがSQL直接更新で改変可能。
14. page番号。binding。document。organizationの整合性をDBだけでは十分に強制しない。
15. 複数SELECTの途中で書込みが入ると集計値同士がずれる余地がある。
16. migration前DBでStage 8参照が既存投稿を壊す余地がある。
17. Remote D1検査が0016と新triggerを確認しない。
18. 現行文書とasset cache queryが古い版を指す。
19. Owner bootstrap試験が成功後も残留handleで終了しない場合がある。
20. Stage 8 aggregate runnerが全成功後も親processを終了しない場合がある。

## 安全側の判断

- snapshot破損時は不正dataを返さずerrorにする。
- page競合時は推測して保存せず再回答を求める。
- cleanup遅延中も期限切れdataを返さない。
- 別PDF切替では旧分析を自動snapshot化してから置換する。
- Remote resourceへは一切操作していない。
