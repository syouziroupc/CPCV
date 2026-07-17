# Stage 7.7 試験概要

## 完走した機能試験

| 群 | 成功 | 失敗 |
|---|---:|---:|
| DB_V2 | 159 | 0 |
| Auth core | 120 | 0 |
| Auth API | 118 | 0 |
| Private API | 50 | 0 |
| Comments | 67 | 0 |
| Manual moderation | 75 | 0 |
| Realtime | 44 | 0 |
| Email auth | 42 | 0 |
| Account lifecycle | 35 | 0 |
| AI | 47 | 0 |
| Content filter | 30 | 0 |
| Stage 7.7 bilingual filter | 21 | 0 |
| 合計 | 808 | 0 |

## 境界・deployment検査

| 群 | 成功 | 失敗 |
|---|---:|---:|
| Stage 7.7 boundary | 21 | 0 |
| Stage 7.6 boundary | 18 | 0 |
| Stage 7.5 boundary | 26 | 0 |
| Precision boundary | 110 | 0 |
| Stage compatibility command | 7 | 0 |
| Deployment verifiers | 11 | 0 |
| 合計 | 193 | 0 |

総計1,001件成功。失敗0件。

ほかに次を確認した。

- static check PASS
- project check PASS
- PDF link check PASS
- Wrangler deploy dry-run PASS
- npm audit 0 vulnerabilities
- npm audit --omit=dev 0 vulnerabilities
- D1 0001〜0013新規適用 PASS
- D1二回目適用 no-op
- foreign_key_check 0 rows
- quick_check ok

完全ログは`docs/stage07-7-records/`に保存する。
