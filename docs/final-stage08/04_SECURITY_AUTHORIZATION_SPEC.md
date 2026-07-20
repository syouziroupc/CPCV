# Security。認証。権限仕様

## 1. 認証方式

- メールアドレスとpasswordを使用する。
- Cookieにraw session tokenを保存する。
- D1にはsession token hashを保存する。
- CookieはHttpOnlyである。
- productionではSecureである。
- SameSiteはStrictである。
- sessionはorganizationへ固定する。

## 2. password

- PBKDF2-HMAC-SHA-256を使用する。
- 現行iterationは600,000である。
- passwordは8文字以上128文字以下である。
- password変更とreset後は既存sessionを失効する。
- plaintext。hash。saltをlogへ出さない。

## 3. CSRFとOrigin

- unsafe methodはOrigin完全一致を要求する。
- 認証済みunsafe methodはCSRF tokenも要求する。
- CSRF raw tokenはbrowser memoryへ置く。
- D1にはhashだけを保存する。
- JSON APIは正しいContent-Typeを要求する。

## 4. role

| role | 主な権限 |
|---|---|
| Owner | organization。Admin。Teacher。quota。辞書。AI設定 |
| Admin | Teacher。授業。招待。授業設定 |
| Teacher | 自分の授業。コメント。moderation。分析 |

最後のactive Ownerを停止。削除。降格しない。
AdminはOwnerまたは別Adminを勝手に管理しない。
Teacherは他人の授業を管理しない。

## 5. 組織境界

- organization IDはauth sessionから決める。
- request body。query。pathのorganization IDを権限根拠にしない。
- 他organization resourceは原則404で隠す。
- DB外部キーとtriggerでもorganization一致を強制する。

## 6. account lifecycle

- 自己登録は確認メール完了時に確定する。
- password reset requestはaccountの存在を明かさない。
- invitation tokenはorganizationとemailへ固定する。
- email変更は現在passwordを要求する。
- email変更後は全sessionを失効する。

## 7. Turnstile

自己登録。確認メール再送。password reset requestで使用する。
server-side Siteverifyを必須とする。
tokenは5分間有効である。
tokenは一回限りである。
Turnstile障害時は公開account作成系をfail-closedにする。
既存loginはTurnstileへ依存させない。

## 8. rate limit

- login IP: 20回/60秒
- login account: 10回/60秒
- 公開コメント: 30回/60秒
- 公開メール要求: 30回/60秒

bindingごとに異なる`namespace_id`を使う。
同じnamespace IDを共有するとcounterも共有される。
公開メールにはD1 exact counterも併用する。
IPはpepper付きHMACまたはhashで保存する。full IPを保存しない。

## 9. log禁止情報

- raw password
- password hash
- salt
- raw auth token
- raw CSRF token
- raw email token
- raw participant token
- Turnstile secret
- full email address
- full IP address
- PDF bytes。filename。page text

## 10. security header

- Content Security Policy
- X-Content-Type-Options
- Referrer-Policy
- Cache-Control no-store for auth and private API
- Frame制限

Turnstile用に`challenges.cloudflare.com`だけを必要範囲で許可する。
