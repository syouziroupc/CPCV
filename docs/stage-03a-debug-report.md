# CPCV 第3段階A デバッグ報告書

## 1. 実施内容

- 空local D1への`0001`と`0002`適用
- 二回目migrationのno-op確認
- 列、default、NOT NULL、CHECK、INDEX検査
- PBKDF2現行schemeと旧schemeの互換検査
- Cookie属性検査
- Origin、Content-Type、CSRFの攻撃系検査
- permission matrixのtable-driven test
- Rate Limiting binding mock
- session middlewareのJOIN、期限、status検査
- 第2段階154件の回帰試験
- Stage 1保護ファイルのSHA-256検査
- Worker dry-run
- production dependency audit

## 2. 実装中に修正した問題

### 2.1 Bootstrapと新password schemeの不一致

第2段階Bootstrapは旧`pbkdf2-sha256-100000-v1`を生成していた。第3段階Aの現行schemeへ統一した。旧schemeの検証互換は残した。

### 2.2 Bootstrap schema fingerprint

`0002_auth_security.sql`追加後はschema fingerprintが変わる。Bootstrap Workerの基準hashとmigration履歴検査を`0001`と`0002`へ更新した。

### 2.3 Stage 2境界検査

従来は`src/**`からの`DB_V2`参照を全面禁止していた。第3段階Aでは`src/auth/**`だけを許可し、既存routeとUIへの接続は禁止したままにした。

### 2.4 IPv6 loopback

Local cookie判定にIPv6 loopbackを追加した。remote hostnameで`APP_ENV=local`を指定してもlocal cookieへ降格できない。

### 2.5 非同期拒否試験

CSRFとRate Limitingの拒否試験を明示的に`await`するよう修正した。試験完了前にsummaryが出る可能性を排除した。

## 3. 境界確認

次に変更がないことを検査した。

- 既存Worker route
- Student UI
- Viewer UI
- 旧migration
- GitHub workflow
- Cloudflare binding設定

Stage 3-Aの認証部品はまだ実行経路へ接続されていない。

## 4. 残存事項

- 600,000回PBKDF2のCloudflare実機性能はremote未接続のため未測定
- Rate Limiting bindingの実環境挙動は未検証
- account lockの更新処理はStage 3-B
- 最後のOwnerの競合保護はStage 3-B
- ブラウザCookie実動試験はStage 3-Cとstaging

## 5. 判定

既知のStage 3-Aローカル試験失敗は0件である。remote環境固有の検証はデプロイ工程へ残す。
