# Stage 7 デバッグ報告

## 修正済み

1. 既存組織と新規組織のAI設定初期行不足
   - migration backfillと作成triggerを追加

2. Stage 4試験DBへ0010未適用
   - 影響するfixtureを更新

3. migration前scheduled処理が`ai_jobs`を参照
   - table未存在時にAI recoveryだけをskip

4. model再試行をjob一件としてしか計上しない
   - 外部model呼出し一回ごとにusage eventを予約

5. primary不正structured responseで即失敗
   - retryableとしてfallback modelへ移行

6. translation保存後にRealtime event保存が失敗する部分成功
   - translation。job完了。usage更新。Realtime eventを同一D1 batchへ統合

7. Realtime dispatch失敗で翻訳通知を喪失
   - sequence eventを先に正本化しcatch-up可能に変更

8. 手動復元後に既存翻訳が画面へ戻らない
   - restore eventの直後にtranslation eventを再送

9. Workers AI structured outputのJSON Schema包みが誤形式
   - `json_schema`へSchema本体を直接指定

10. Turnstileや既存機能との境界検査が旧versionへ固定
    - Stage 7互換へ更新

11. mobile AI列の視認性
    - table内横scrollを維持しAI列の実測screenを追加

## 未実施

- 実Workers AI応答
- 実Queue再配送
- 実AI Gateway
- remote D1 migration
- production traffic

これらはstagingで確認します。
