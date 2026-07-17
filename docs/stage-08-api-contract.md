# Stage 8 API契約

## private API

すべて既存の認証Cookie。組織固定session。授業管理権限を使用する。
unsafe requestはOrigin。JSON Content-Type。CSRFを要求する。

### `GET /api/private/sessions/:sessionId/pdf/state`

現在のPDF bindingとpage状態を返す。

### `POST /api/private/sessions/:sessionId/pdf/bind`

```json
{
  "sha256Hex": "64 lowercase hex",
  "pdfjsFingerprint": "optional",
  "pageCount": 20,
  "fileSizeBytes": 1234567
}
```

PDF bytes。filename。page textは受け付けない。
active授業だけ実行できる。

### `POST /api/private/sessions/:sessionId/pdf/page`

```json
{
  "bindingId": "pbd_...",
  "pageNumber": 5,
  "clientVersion": 8
}
```

古いversionは現在状態を上書きしない。

### `GET /api/private/sessions/:sessionId/analytics`

現在時点の匿名集計を返す。
参加者ID。nickname。コメント本文は返さない。

### `GET /api/private/sessions/:sessionId/analytics/snapshots`

最大20件のsnapshot summaryを返す。

### `POST /api/private/sessions/:sessionId/analytics/snapshots`

空JSON objectを受け付ける。
現在集計を確定し201を返す。

### `GET /api/private/sessions/:sessionId/analytics/snapshots/:snapshotId/export`

匿名集計CSVを返す。
response header `x-cpcv-analytics-checksum`へSHA-256を設定する。

## public API

### `GET /api/public/sessions/:publicCode`

Stage 8有効時に最低限の状態を返す。

```json
{
  "understandingEnabled": true,
  "pdfState": {
    "bindingId": "pbd_...",
    "pageNumber": 5,
    "clientVersion": 8
  }
}
```

PDF hash。page count。教員user IDは公開しない。

### `POST /api/public/sessions/:publicCode/understanding`

```json
{
  "signal": "understood",
  "bindingId": "pbd_...",
  "pageNumber": 5,
  "clientVersion": 8
}
```

Public edge rate limitを適用する。
現在状態が一致しない場合は保存しない。
コメント受付がOFFでもactive授業なら回答できる。

## error boundary

- `PDF_HASH_INVALID`
- `PDF_PAGE_COUNT_INVALID`
- `PDF_FILE_SIZE_INVALID`
- `PDF_BINDING_INVALID`
- `PDF_PAGE_INVALID`
- `PDF_CLIENT_VERSION_INVALID`
- `PDF_METADATA_CONFLICT`
- `PDF_BINDING_NOT_FOUND`
- `PDF_STATE_CHANGED`
- `UNDERSTANDING_SIGNAL_INVALID`
- `ANALYTICS_SNAPSHOT_NOT_FOUND`

内部SQLと組織外resourceの存在は外部へ露出しない。
