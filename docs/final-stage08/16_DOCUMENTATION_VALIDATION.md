# Stage 8 final documentation validation

- required integrated documents: 17
- missing: 0
- empty or too small: 0
- code changes: none
- Cloudflare remote changes: none
- source ZIP hash: 外側の`CPCV_STAGE08_FINAL_ARTIFACT_RECORD.txt`を正本とする

## Package tests

- handoff ZIP compression test: PASS
- handoff SHA-256 manifest: PASS
- documented source ZIP compression test: PASS
- `npm ci`: PASS
- `npm run check`: PASS
- `npm run check:project`: PASS
- `npm run check:pdf-links`: PASS
- `npm run deploy:dry-run`: PASS
- `npm audit --omit=dev`: 0 vulnerabilities

## Missing

- none

## Empty

- none
