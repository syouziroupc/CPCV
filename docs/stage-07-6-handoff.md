# Stage 7.6 引継ぎ

## 基準

- version: 0.7.6
- Stage 7.5 baseline commit: `808b313d25ac59d0f05188f025149db7b41c7bff`
- migration: `0012_multilingual_filter_usability.sql`

## 最初に読む資料

1. `README.md`
2. `docs/stage-07-6-spec.md`
3. `docs/stage-07-6-foreign-language-policy.md`
4. `docs/stage-07-6-dictionary-format.md`
5. `docs/stage-07-6-debug-report.md`
6. `docs/stage-07-6-test-results.txt`

## Remote適用順

1. remote backup
2. migration 0010
3. migration 0011
4. migration 0012
5. staging deploy
6. filterとAIを無効のまま確認
7. 少数辞書で推奨presetを検証
8. mobileとRealtimeを確認
9. production切替

## 重要事項

- 0010から0012を飛ばして適用しない
- 中国語簡体字と繁体字は別行登録
- fuzzy一致を直接rejectへ使わない
- 政治categoryをpresetで有効化しない
- CSV exportはあるがCSV importはない
- sourceへ実辞書データは含まれない
- GitHub pushとCloudflare remote操作は未実施

## Migration正本に関する注意

`0011_dictionary_content_filter.sql`はStage 7.6でWrangler連続適用互換修正済みである。旧Stage 7.5 ZIP内の0011を使用してはいけない。

Stage 7.5はremote未適用だったためremote migration historyへの影響はない。
