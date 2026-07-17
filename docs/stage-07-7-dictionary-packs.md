# Stage 7.7 日本語・英語検閲パック

## 1. ファイル

```text
data/content-filter-packs/
├─ ja-core-v1.csv
├─ en-core-v1.csv
└─ README.md
```

実行時の正本は`src/content-filter/packs.js`。CSVはレビュー。編集案作成。外部確認のための同等データである。

## 2. CSV形式

```csv
term,language_code,category,severity,match_mode,fuzzy_enabled,boundary_mode,active
```

| 列 | 値 |
|---|---|
| `term` | 検閲語または句 |
| `language_code` | `ja`または`en` |
| `category` | sexual。profanity。harassment。discrimination。violence |
| `severity` | 1〜5 |
| `match_mode` | `normalized`または`strict` |
| `fuzzy_enabled` | 0または1 |
| `boundary_mode` | 日本語は主にsubstring。英語はword |
| `active` | 0または1 |

## 3. 収録数

| パック | 合計 | sexual | profanity | harassment | discrimination | violence |
|---|---:|---:|---:|---:|---:|---:|
| 日本語 | 39 | 15 | 3 | 13 | 4 | 4 |
| 英語 | 50 | 13 | 14 | 11 | 7 | 5 |

政治的発言は0語。

## 4. 導入後の編集

パックは組織の`content_filter_terms`へコピーする。

管理者は各用語について次を変更できる。

- 用語本文
- 種類
- severity
- 厳密または正規化照合
- fuzzy
- 単語境界
- 有効・無効
- 削除

パック由来の行を編集した時点でsource-pack metadataを外し。組織独自用語として扱う。

## 5. 運用上の注意

- 診断名。学術用語。引用文脈でも一致する可能性がある。
- 差別語は授業テーマによって正当な引用があり得る。
- severityは法的または倫理的な絶対評価ではない。
- 初回導入後は少数授業で誤検出率を確認する。
- 自動拒否閾値は最も慎重に設定する。
- 政治分類はパックに含めず。必要な組織だけ独自登録する。

## 6. 更新方法

v1の意味を後から書き換えない。用語セットを変更する場合は`ja-core-v2`または`en-core-v2`を新設する。

既存組織へ新versionを自動上書きしない。組織管理者が差分確認後に導入する設計とする。
