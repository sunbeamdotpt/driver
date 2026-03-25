# Drive TODOs

## Done

### S3 Backfill
Shipped. `server/backfill.ts`, exposed as `POST /api/admin/backfill`. See [docs/s3-layout.md](docs/s3-layout.md#the-backfill-api).

### OpenTelemetry
Shipped. `server/telemetry.ts` — tracing + metrics middleware, `withSpan` utility for all S3/DB/WOPI/Keto operations. OTLP gRPC export to Alloy/Tempo.

## Open

### Wire up Keto permission middleware
`server/permissions.ts` and `server/keto.ts` are fully implemented but not connected to routes in `main.ts`. File/folder CRUD currently checks `owner_id` equality only. The `ShareDialog.tsx` UI exists but calls a `/api/files/:id/share` endpoint that doesn't exist yet. This is the next big piece — needs Keto deployed in the cluster first.

### CSRF token issuance
The CSRF token generation (`generateCsrfToken()`) and verification work, but no endpoint actually *issues* the token to the client. The UI client doesn't send `x-csrf-token` headers. In test mode CSRF is bypassed, so this is invisible during development. Needs: a middleware or session endpoint that sets the CSRF cookie, and the UI fetch client needs to read + send it on mutating requests.

## Maybe Later

### SeaweedFS filer webhook
SeaweedFS filer supports change notifications. A webhook handler could auto-register new objects as they land — no more manual backfill runs. Not a priority until someone is bulk-uploading to S3 regularly.

### Lazy registration
Compare DB records against S3 on folder browse, auto-create missing rows. Sounds nice in theory, but it adds latency to the hot path and the explicit backfill endpoint handles the real use cases fine.

### Real upload progress
`FileUpload.tsx` fakes progress on a 200ms timer. Use `XMLHttpRequest` with `upload.onprogress` for actual byte-level tracking.

### Recursive path resolution via CTE
`buildPathFromParent()` in `files.ts` and `folders.ts` fires one DB query per folder level. Replace with a recursive CTE for single-query path resolution. Add a depth limit to prevent infinite loops from corrupted `parent_id` chains.
