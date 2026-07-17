# CPCV 第1段階 厳格デバッグ報告

作業日: 2026-07-12

## 1. 検証方針

生成物を正しいと仮定せず 次の観点で再検査した。

1. 開発指示書との整合
2. 元sourceとのfile hash比較
3. API routeとSQLのsource読解
4. clean dependency install
5. existing static checks
6. Worker dry-run bundle
7. empty D1 migration
8. local API authentication WebSocket test
9. known-failure reproduction
10. secret and generated artifact scan
11. local HTML resource and duplicate ID scan
12. Windows case-insensitive collision and path length
13. patch apply and whitespace check
14. ZIP CRC top-level permission duplicate entry
15. ZIP再展開後の再試験

## 2. 前回成果物から修正した点

- 第1段階でproduct codeを直すように読める表現を削除
- Master logoutとTeacher display nameのAPI実態を訂正
- Cookie `Path=/`を明記
- IndexedDB名をsourceと一致させた
- existing static checkとruntime testを区別
- raw IP exposureとclient ID spoofを既知問題へ追加
- JSON size Content-Type Unicode防御不足を追加
- local production URL固定とmanual script再現性を追加
- clean ZIPのtop-level directoryを固定
- directory `0755` file `0644`へ正規化
- patchをfile上書き方式ではなくunified git patchへ変更
- absolute environment pathとtest tokenを成果物から除外
- hash manifestの対象を明文化

## 3. Runtime test

local D1は現行migrationが通らないため test専用に`0003`だけ除いた統合schemaを使った。
これは成果物とproductionには含めていない。

67項目を確認した。

正常系:

- 5画面とasset response
- cache and referrer headers
- QR API
- Master login status logout
- Teacher create login me logout revoke
- session create detail public lookup delete
- WebSocket connect state message settings clear
- client cookie attributes
- same client rapid-post limit

異常または欠陥再現:

- duplicate login IDは500
- nonexistent target Master operationsは200
- missing teacher resetはpasswordを返す
- whitespace-only titleを保存
- formula-like commentを受理
- `ftp://`を受理
- deleted with enabled flagsを受理
- deletedからactiveへ復帰
- deleted session detail取得可能
- delete and recreate same login ID後のsession createは500
- WebSocket selected protocolにraw tokenが含まれる

runtime test logには一時tokenとpasswordが含まれるため成果物へ同梱していない。
結果だけをこの文書へ転記した。

## 4. Migration test

実行:

```bash
npx wrangler d1 migrations apply class_comment_db --local --persist-to .baseline-d1
```

結果:

- `0001_init.sql` success
- `0002_drop_documents.sql` success
- `0003_add_comment_display_seconds.sql` failure
- error: `duplicate column name: comment_display_seconds`

この失敗は第2段階の入力として固定した。

## 5. Dependency test

環境:

- Node.js 22.16.0
- npm 10.9.2
- Wrangler resolved 4.101.0

結果:

- clean `npm ci` success
- all existing checks success
- dry-run success
- full audit: low 1 high 4
- production-only audit: 0

依存関係は第1段階では更新していない。

## 6. Change boundary

元sourceの非生成物42 fileを基準化した。
最終成果物では`.gitignore`だけが変わる。
残る41 fileはbyte-for-byte同一。

変更禁止領域に差分がないことをhashで確認した。

## 7. Packaging test

clean source ZIPとpatch ZIPを別directoryへ展開して確認した。

結果:

- 両ZIPとも単一のtop-level directory
- duplicate archive entryなし
- CRC errorなし
- directory modeは全て0755
- file modeは全て0644
- symlinkなし
- `node_modules` `.tools` `.wrangler` `tmp` `output` logなし
- `.dev.vars*` `.env*`なし
- `/mnt/data`などの検証環境pathなし
- 一時Master token Teacher token passwordなし
- clean ZIP展開後の53 fileが作成元とSHA-256一致
- patchは`git apply --check --whitespace=error`成功
- patch適用結果の53 fileがclean sourceとSHA-256一致

元ソースの`create_manual_pdf.py`にあるWindows font絶対pathは変更していない。
これはKI-035へ記録した。

## 8. ZIP再展開後の再試験

clean ZIPから展開したsourceで再実行した。

- `npm ci` success
- `npm run check` success
- `npm run check:project` success
- `npm run check:pdf-links` success
- `npm run deploy:dry-run` success
- `npm ls --all` success
- full auditはlow 1 high 4
- production-only auditは0
- 空D1 migrationは記録済みの列重複で失敗
- test専用schemaによるruntime testは67 passed 0 failed

runtime test script DB state log `node_modules` `.wrangler`は成果物へ含めていない。

## 9. 未検証

次は実施していない。

- production D1 data and migration history
- production Worker behavior
- actual Cloudflare edge IP header behavior
- Chrome Edge smartphone visual E2E
- 3-hour continuous run
- multi-class load test
- Windows PowerShell deploy script execution
- manual PDF generation

第1段階の完了条件には含めない。
第9段階または該当機能段階で検証する。
