# DB。data。migration正本

## Database

| binding | 用途 |
|---|---|
| `DB` | legacy互換投影 |
| `DB_V2` | application source of truth |

## migration順序

`migrations-v2/0001_initial_schema.sql`から`0017_final_integrity_hardening.sql`までを連番で適用します。適用済みmigrationは編集しません。

| migration | 主題 |
|---|---|
| 0001 | core schema |
| 0002 | auth security |
| 0003 | comments |
| 0004 | precision auth hardening |
| 0005 | comment guards |
| 0006 | manual moderation |
| 0007 | realtime |
| 0008 | email auth |
| 0009 | account lifecycle |
| 0010 | AI moderation and translation |
| 0011 | dictionary filter |
| 0012 | multilingual usability |
| 0013 | bilingual translation safety |
| 0014 | filter pack expansion |
| 0015 | PDF page analytics |
| 0016 | Stage 8 precision hardening |
| 0017 | final integrity hardening |

## 0017

`0017`は既存dataを先に検査します。次のいずれかがあればmigrationを中止します。

- 20種類の組織・context不整合
- organizationごとのactive filter termが2000件超

移行後は42本の永続triggerを作成します。insertとupdateの両方を対象にします。

主な境界は次です。

- audit actorとorganization
- moderation actorとorganization
- filter creator。updater。installerとorganization
- AI settings updaterとorganization
- PDF creatorとorganization
- invitation acceptorとorganization membership
- Realtime ticketのuser。auth session。organization
- Realtime eventとsource comment session
- filter evidenceとterm organization
- AI result。translation。usageとjob context
- active filter term上限

## deploy前remote preflight

```bash
npm run verify:stage82-preflight
```

0件以外を無断で修正しません。review済みdata repair手順を作成します。修正後にpreflightを再実行します。

## migration

```bash
npx wrangler d1 time-travel info class_comment_db_v2
npx wrangler d1 migrations apply class_comment_db_v2 --remote
node scripts/verify-remote-d1.mjs
```

Remote検査は`0017`。42本のStage 8.2 trigger。foreign key。quick check。active Ownerを確認します。

## rollback

通常rollbackはWorker versionを戻します。migration fileとtableを削除しません。D1 Time Travel restoreはdataを書き戻す破壊的操作です。明示承認と影響確認がある場合だけ実行します。
