# Stage 5 デバッグ報告

## 実装中に修正した事項

1. 同じversionへの同時操作でaction UNIQUE errorが500になる問題を409へ変換した。
2. action insertとaudit insertを条件付きにし、競合時の偽監査を防止した。
3. 一括処理で一件の内部障害が全体を停止する問題をitem単位の500へ分離した。
4. Adminがsession画面を離れてもpollingを続ける問題を停止処理で修正した。
5. pendingを誤ってbroadcastする経路を遮断した。
6. Viewer撤回時にDOMだけでなくqueueとIndexedDBも削除するよう修正した。
7. deletedからvisibleへ直接復元しないDB triggerを追加した。
8. URL拒否を限定patternからscheme。domain。IPv4へ拡張した。
9. bulk内のcomment ID重複を入力時に拒否した。
10. remote健全性検査へStage 5 table。migration。trigger確認を追加した。
11. mobile tableはpage全体を広げずtable内部だけscrollする構造を確認した。
12. ブラウザ組織ポリシーによるlocalhost遮断と製品不具合を分離した。実Worker E2EはHTTPで確認し、UIは実HTMLと実CSSを別rendererで確認した。

## Fault injection

`comment_moderation_actions`へのINSERTを意図的に失敗させた。comment stateとauditがrollbackされることを確認した。

bulkの中央itemだけを意図的に失敗させた。前後itemが処理され、失敗itemだけpendingのまま残ることを確認した。
