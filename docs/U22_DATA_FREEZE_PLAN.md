# CPCV U-22 全データ凍結計画

対象: Web `0.8.10` / Windows Desktop `0.2.2`

「全データ凍結」は、公開提出物と運用バックアップを混ぜないことを最優先にします。本番利用者の個人情報、認証情報、secret、raw production DBはU-22提出物へ含めません。

## A. ソースコード — 提出対象

凍結するもの:

- Git exact commit
- root Web source
- `public/`
- `src/`
- `migrations/` / `migrations-v2/`
- `scripts/`
- `docs/`
- Desktop source `desktop-overlay-poc/`
- lockfile / source SHA-256 manifest
- non-secret `wrangler.toml`
- GitHub workflow

最終exact commitで以下を実行します。

```bash
node scripts/build-u22-freeze-bundle.mjs
```

このscriptはdirty treeを拒否し、source manifestとU-22 freeze verifierを再確認してから、repositoryの**tracked fileだけ**を `git archive` でZIP化します。出力はrepository外の `CPCV-freeze-output/` に置き、ZIP SHA-256とfreeze recordを作ります。

## B. Windows実行ファイル — 提出対象

GitにはEXEをcommitしません。

最終Desktop CI artifactから固定するもの:

- `cpcv-desktop.exe`
- `cpcv-desktop.exe.sha256`
- `CPCV_BUILD_ENVIRONMENT.txt`

freeze recordにexact source commitとEXE SHA-256を対応付けます。

## C. Web production deployment — 提出URLの正本

固定するmetadata:

- exact source commit
- production origin
- staging deployment/version ID
- staging acceptance record SHA-256
- production Worker deployment/version ID
- production smoke result
- D1 integrity result

source historyだけで「配備済み」と推測しません。最終exact commitをstagingでacceptance後、既存manual production workflowで同一commitを配備します。

## D. Production D1 — 内部保全のみ・提出禁止

production DBにはaccount、organization、session、comment等の実データが含まれ得るため、**U-22 source ZIPや審査用sample dataへ入れません**。

凍結直前の内部証跡として最低限固定:

- D1 Time Travel bookmark / timestamp
- migration list
- `PRAGMA quick_check`
- foreign-key integrity result
- active Owner確認
- production deployment record artifact

追加でraw D1 exportを取得する場合:

- private/internal storageだけに保存
- access controlを設定
- SHA-256を記録
- Git/GitHub artifact/U-22提出storageへ置かない
- demo用DBとして流用しない

## E. Durable Object / Queue / Workers AI

Queueの一時メッセージやDurable Objectのruntime socket状態は提出用データとして凍結しません。

凍結するのは:

- source
- binding/resource configuration
- queue names
- consumer settings
- migration/schema
- test evidence
- deployment/version ID

secretやruntime tokenは凍結資料へ記録しません。

## F. Secret / certificate — 提出禁止

以下はsource ZIP、freeze manifest、動画、スクリーンショットへ含めません。

- Cloudflare API token
- account secret
- rate-limit pepper
- Turnstile secret
- password/reset/invitation token
- session/cookie/CSRF raw token
- Windows signing certificate/password
- private key

存在確認は名前と「configured / not configured」の状態だけで行います。

## G. 審査用sample data — 提出対象

production dataを複製せず、synthetic dataだけを使用します。

固定候補:

- sample PDF
- sample PDF SHA-256
- demo session作成手順
- test comment例
- login/demo account手順

sample PDFに個人情報、授業実データ、顧客情報を含めません。

## H. 検証証跡 — 内部＋必要分を提出資料へ反映

保存するもの:

- Web CI run ID / result
- Desktop CI run ID / result
- source manifest verification count
- freeze verifier result
- Stage regression result
- dependency audit result
- Desktop EXE SHA-256
- physical Windows acceptance report
- production Worker version
- production smoke result

GitHub Actions log自体をsubmission source ZIPへ複製する必要はありません。freeze recordから対応するrun IDを追跡可能にします。

## 凍結完了条件

以下が揃った時だけ「全データ凍結完了」とします。

1. exact commit決定
2. Web全自動gate PASS
3. Desktop全自動gate PASS
4. source ZIP + SHA-256生成
5. Desktop EXE + SHA-256固定
6. physical Windows acceptance PASS
7. exact commitのproduction配備とsmoke PASS
8. D1内部保全証跡固定
9. synthetic sample PDF + SHA-256固定
10. login/demo手順固定
11. freeze manifest完成
12. frozen revisionへの通常変更停止

外部gateが未完了の間は「freeze-ready candidate」であり、「frozen release」とは呼びません。
