# 監査71件 修正対応表

元監査の71件を一件ずつ対応付けた表です。Statusはlocal sourceに対する判定です。Cloudflare remote環境の設定とstaging acceptanceは別項目です。

| ID | 重大度 | 問題 | 修正 | 実装 | 検証 |
|---:|---|---|---|---|---|
| 1 | 高 | 期限切れコメントが管理一覧に残る | 管理一覧のSQLへretained_until > nowを追加した。 | src/comments/repository.js | Stage 4 comments。Stage 8 PDF retention。code review |
| 2 | 高 | 期限切れコメントがCSVへ出力される | CSV取得SQLへretained_until > nowを追加した。 | src/comments/repository.js | Stage 4 comments。code review |
| 3 | 高 | 期限切れコメントがRealtime reset snapshotへ再掲される | reset snapshotのcommentとsource eventを期限内へ限定した。 | src/realtime/repository.js | Stage 6 realtime。Stage 8 PDF retention |
| 4 | 高 | 期限切れRealtimeイベントがcatch-upへ残る | catch-up eventをexpires_at > nowへ限定した。 | src/realtime/repository.js | Stage 6 realtime。code review |
| 5 | 中 | reset判定が期限切れイベントを基準にする | oldest sequence算定から期限切れeventを除外した。 | src/realtime/repository.js | Stage 6 realtime。code review |
| 6 | 中 | Realtimeイベント単体取得が期限切れを返す | event ID取得とsequence取得へexpires_at > nowを追加した。 | src/realtime/repository.js | Stage 6 realtime。code review |
| 7 | 中 | コメント起点のRealtimeイベント検索が期限切れを返す | comment起点event検索へexpires_at > nowを追加した。 | src/realtime/repository.js | Stage 5 moderation。Stage 6 realtime |
| 8 | 高 | 期限切れコメントがidempotency keyを占有し続ける | idempotency照会をparticipant単位かつ期限内へ限定した。期限切れkeyは再利用可能にした。 | src/comments/repository.js | Stage 4 comments。code review |
| 9 | 高 | 期限切れコメントをモデレーションできる | moderation対象取得。履歴。操作SQLを期限内commentへ限定した。 | src/moderation/repository.js | Stage 5 moderation。Stage 8 PDF retention |
| 10 | 高 | AIバックフィルが期限切れコメントを対象にする | AI backfill対象へretained_until > nowを追加した。 | src/ai/repository.js | Stage 7 AI。code review |
| 11 | 高 | 期限切れコメント本文をWorkers AIへ送信できる | job作成。claim。context load。完了時に期限内commentを再検証した。 | src/ai/repository.js; src/ai/processor.js | Stage 7 AI。code review |
| 12 | 高 | 期限切れコメントの状態変更が新しいRealtimeイベントを生成する | 期限切れcommentはmoderation更新前に拒否する。Realtime eventも生成されない。 | src/moderation/repository.js; src/realtime/repository.js | Stage 5 moderation。Stage 6 realtime |
| 13 | 高 | audit_logsのactorをorganizationへ拘束していない | audit actorとorganizationのinsert/update triggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 14 | 高 | comment_eventsのactorをorganizationへ拘束していない | comment event actorとorganizationのinsert/update triggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 15 | 高 | comment_moderation_actionsのactorをorganizationへ拘束していない | moderation action actorとorganizationのinsert/update triggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 16 | 高 | session_moderation_settingsの更新者をorganizationへ拘束していない | moderation setting updaterとorganizationのinsert/update triggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 17 | 高 | content_filter_termsの作成者をorganizationへ拘束していない | filter term creatorとorganizationのinsert/update triggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 18 | 高 | organization_content_filter_policiesの更新者をorganizationへ拘束していない | organization filter policy updaterのinsert/update境界triggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 19 | 高 | session_content_filter_settingsの更新者をorganizationへ拘束していない | session filter updaterのinsert/update境界triggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 20 | 高 | content_filter_pack_installsの実行者をorganizationへ拘束していない | filter pack installerのinsert/update境界triggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 21 | 高 | organization_ai_settingsの更新者をorganizationへ拘束していない | organization AI setting updaterのinsert/update境界triggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 22 | 高 | session_ai_settingsの更新者をorganizationへ拘束していない | session AI setting updaterのinsert/update境界triggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 23 | 高 | organization_originsの作成者をorganizationへ拘束していない | organization origin creatorのinsert/update境界triggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 24 | 高 | pdf_documentsの作成者をorganizationへ拘束していない | PDF metadata creatorのinsert/update境界triggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 25 | 高 | 招待受諾者を招待organizationへ拘束していない | invitation acceptorをorganization membershipへ拘束するtriggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 26 | 高 | Realtime ticketのuserをticket organizationへ拘束していない | Realtime ticket userをorganization membershipへ拘束するtriggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 27 | 高 | Realtime ticketのauth sessionをticket organization/userへ拘束していない | Realtime ticket auth sessionをorganizationとuserへ拘束するtriggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 28 | 高 | Realtime eventのsource commentをevent sessionへ拘束していない | Realtime source commentをorganizationとlive sessionへ拘束するtriggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 29 | 高 | filter matchのtermをcomment organizationへ拘束していない | filter match termをcomment organizationへ拘束するtriggerを追加した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 30 | 高 | ai_resultsのjobとcomment contextが一致しなくても保存できる | AI resultをjobのorganization。session。comment。job_typeへ拘束した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 31 | 高 | translationsのjobとcomment contextが一致しなくても保存できる | translationをjob contextとtarget languageへ拘束した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 32 | 高 | ai_usage_eventsのjobをorganizationへ拘束していない | AI usageをjob organization。job type。attemptへ拘束した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening direct regression。remote verifier。Stage 8.2 preflight |
| 33 | 高 | COMMENT_ROOM未設定で非Realtime公開APIまで500になる | COMMENT_ROOMの必須判定をmessage POST経路だけへ移した。 | src/routes/public-v2.js | Stage 4 comments。boundary verification |
| 34 | 中 | 小文字public codeでは参加者Cookieが次回要求へ送られない | participant cookie Pathをpublic session API共通prefixへ変更した。 | src/comments/cookies.js | Stage 4 comments。static mirror verification |
| 35 | 高 | idempotency keyが参加者を跨いで重複応答を開示する | idempotency keyをparticipant token hashへ拘束した。別participantの既存responseを返さない。 | src/comments/repository.js | Stage 4 comments。code review |
| 36 | 中 | 失効済みWebSocketが無通信時に残り続ける | Durable Object alarmで5分ごとにauth sessionとmembershipとlive sessionを再検証する。 | src/realtime/comment-room.js | Stage 6 realtime |
| 37 | 中 | Realtime ticket消費と取得の間でcron削除競合が起きる | ticket消費を条件付きUPDATEと同一statement結果で確定した。 | src/realtime/repository.js | Stage 6 realtime |
| 38 | 高 | 古いmoderation workerが新しい成功結果を上書きできる | moderation完了をclaimed_atとattempt_count一致へ拘束した。 | src/ai/repository.js | Stage 7 AI。Final hardening |
| 39 | 高 | 古いtranslation workerが新しい翻訳を上書きできる | translation完了をclaimed_atとattempt_count一致へ拘束した。 | src/ai/repository.js | Stage 7 AI。Final hardening |
| 40 | 高 | 古いtranslation workerがRealtime translation:ready相当イベントを生成できる | translation realtime eventも成功jobのexact claim identityへ拘束した。 | src/ai/repository.js; src/realtime/repository.js | Stage 7 AI |
| 41 | 高 | 3回目processing中にworker停止するとjobが永久停止する | stale processing jobを5分cronでretry又はattempt上限時failedへ閉じる。 | src/ai/repository.js; src/index.js; wrangler.toml | Stage 7 AI。precision boundary |
| 42 | 中 | skipAiJobが更新件数0を成功として扱う | skipはexact processing claimの更新件数1を必須にした。 | src/ai/repository.js | Stage 7 AI |
| 43 | 中 | failOrRetryAiJobが更新件数0を成功として扱う | fail/retryはexact processing claimの更新件数1を必須にした。 | src/ai/repository.js | Stage 7 AI |
| 44 | 高 | Queue送信失敗後の再dispatchが日次cronまで行われない | AI recovery cronを5分間隔へ追加した。Queue失敗jobを再回収する。 | src/index.js; wrangler.toml | Stage 7 AI。precision boundary |
| 45 | 高 | 切断後の滞在時間を最大30分まで過大計上する | 現在pageから切断後までのtail dwellを加算しない。page event区間だけを集計する。 | src/pdf-analysis/repository.js | Stage 8 PDF |
| 46 | 中 | 同じclientVersionの競合更新で敗者もaccepted=trueになり得る | page updateのaccepted判定をactual mutationとevent IDへ拘束した。 | src/pdf-analysis/repository.js | Stage 8 PDF |
| 47 | 高 | session終了競合後も既存participantの理解度signalを保存できる | 理解度signal保存時にactive session。active participant。current binding/page/versionを同時検証する。 | src/pdf-analysis/repository.js | Stage 8 PDF |
| 48 | 中 | 新PDF bind失敗でも旧PDFのanalytics snapshotが残る | 自動snapshot後にbind失敗した場合はsnapshotとauditを補償削除する。 | src/routes/pdf-analysis.js; src/pdf-analysis/repository.js | Stage 8 PDF |
| 49 | 中 | bind失敗前に既存PDF metadataを更新する | PDF metadata更新とsession bindを一つのbatchへ統合した。失敗時に部分更新しない。 | src/pdf-analysis/repository.js | Stage 8 PDF |
| 50 | 中 | PDF新規登録競合でloser側fingerprintが失われる | 新規登録競合時も入力fingerprintを保持して再取得結果へ反映した。 | src/pdf-analysis/repository.js | Stage 8 PDF |
| 51 | 高 | Stage 8の監査ログがfail-openで欠落する | PDF bind。snapshotとauditを同一batchへ統合した。audit失敗時は全体をrollbackする。 | src/pdf-analysis/repository.js; src/routes/pdf-analysis.js | Stage 8 PDF |
| 52 | 高 | password change確定後のSELECT失敗で利用者が全sessionを失う | password change前にorganization contextを取得した。変更確定後の追加SELECTを廃止した。 | src/routes/auth.js | Auth API |
| 53 | 中 | 招待revoke競合で虚偽auditが残る | invitation revoke auditを実際の条件付き更新成功時だけinsertする。 | src/routes/account-lifecycle.js; src/auth/audit.js | Account lifecycle。code review |
| 54 | 中 | 同時logoutで更新0のauditが残る | logout auditを実際のsession revoke成功時だけinsertする。 | src/routes/auth.js; src/auth/audit.js | Auth API。code review |
| 55 | 中 | 同時CSRF発行で返却直後のtokenを別要求が削除できる | CSRF同時刻順序をrowidで確定した。最新8件だけを保持する。 | src/auth/csrf-tokens.js | Final hardening direct regression |
| 56 | 低 | session GET失敗時に不要なCSRF tokenが残る | session context取得完了後だけsecondary CSRF tokenを発行する順序へ変更した。 | src/routes/auth.js | Auth API。code review |
| 57 | 高 | login rate limiter障害時にfail-openする | login limiter欠落又は例外を503 RATE_LIMIT_UNAVAILABLEへfail-closedした。 | src/auth/rate-limit.js | Final hardening direct regression。Auth API |
| 58 | 高 | 公開メールrate limiter障害時にfail-openする | 公開メールlimiter欠落又は例外も503へfail-closedした。 | src/auth/rate-limit.js; src/auth/public-auth-rate.js | Final hardening direct regression。email auth |
| 59 | 中 | 公開メールのrecipient/IP quota更新が非原子的である | recipientとIP counterをD1 batchで原子的に更新した。 | src/auth/public-auth-rate.js | Final hardening forced-failure regression |
| 60 | 中 | 60秒edge rate limitでもRetry-Afterが翌UTC日までになる | edge rate limitのRetry-Afterを60秒へ分離した。日次quotaだけ翌UTC日を返す。 | src/auth/public-auth-rate.js | email auth。code review |
| 61 | 高 | メール送信結果のDB更新失敗を黙殺しattemptがpendingに残る | provider送信結果のDB更新を必須化した。更新失敗又は0件は503でfail-closedする。 | src/auth/email-service.js | email auth。code review |
| 62 | 致命 | 100件match上限で後続のreject語を検査しない | 全termを評価してdecisionを確定した後にresponse evidenceだけ100件へcapする。 | src/content-filter/matcher.js | Final hardening direct regression |
| 63 | 高 | 手動term上限がcount-then-insert競合で超過する | active term上限2000をDB INSERT/UPDATE triggerで原子的に強制した。 | migrations-v2/0017_final_integrity_hardening.sql | Final hardening migration。Stage 7.6 |
| 64 | 高 | pack install上限がcount-then-batch競合で超過する | pack installにも同じDB上限triggerを適用した。UPSERT upgradeは許可する。 | migrations-v2/0017_final_integrity_hardening.sql; src/content-filter/repository.js | Stage 7.8 pack upgrade。dictionary audit |
| 65 | 高 | 設定変更とauditが別transactionである | policy。session setting。term。pack mutationとauditを同一D1 batchへ統合した。 | src/content-filter/repository.js; src/routes/content-filter.js | Stage 7.6。Stage 7.8 |
| 66 | 中 | policy UPDATEの更新件数を検証しない | policy UPDATEのchanges=1を必須にした。0件は明示エラーにする。 | src/content-filter/repository.js | Stage 7.6。code review |
| 67 | 低 | pack pathの不正percent encodingがgeneric 500になる | path decodeを専用関数で処理し不正percent encodingを400へ変換した。 | src/routes/content-filter.js | Stage 7.6。code review |
| 68 | 高 | 上限超過状態になるとAPIからtermを削除して復旧できない | 上限検査を作成系へ限定した。既存termのDELETEは上限超過時も可能にした。 | src/routes/content-filter.js; src/content-filter/repository.js | Stage 7.6。code review |
| 69 | 高 | session終了の片側成功でDB間状態が分裂する | V2終了失敗時にlegacy projectionを事前snapshotから復元する補償処理を追加した。 | src/routes/private-v2.js | Private API |
| 70 | 高 | session削除の片側成功でDB間状態が分裂する | V2削除失敗時にlegacy projectionを事前snapshotから復元する補償処理を追加した。 | src/routes/private-v2.js | Private API |
| 71 | 低 | teacher APIが実在しないuser.localメールを返す | teacher responseはverified email又はnullを返す。架空domainを生成しない。 | src/routes/private-v2.js | Final hardening direct regression。Private API |
