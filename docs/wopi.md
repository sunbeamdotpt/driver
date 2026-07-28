---
title: WOPI Integration
description: How Drive talks to Collabora Online, how Collabora talks back, and the iframe dance that ties them together.
updated_at: "2026-07-28"
---

# WOPI Integration

How Drive talks to Collabora Online, how Collabora talks back, and the iframe dance that ties them together.

---

## What WOPI Is

WOPI (Web Application Open Platform Interface) is Microsoft's protocol for embedding document editors in web apps. Collabora implements it. Your app (the "WOPI host") exposes a few HTTP endpoints, and Collabora calls them to read files, write files, and manage locks.

The mental model that matters: during editing, the browser talks to Collabora, and Collabora talks to your server. The browser is not in the loop for file I/O.

## The Full Flow

Here's what happens when a user double-clicks a `.docx`:

### 1. Token Generation

The browser calls our API to get a WOPI access token:

```
POST /api/wopi/token
Content-Type: application/json

{ "file_id": "550e8400-e29b-41d4-a716-446655440000" }
```

The server:
- Validates the Kratos session (normal session auth)
- Looks up the file in PostgreSQL
- Determines write access (currently: owner = can write)
- Generates a JWT signed with HMAC-SHA256
- Fetches the Collabora discovery XML to find the editor URL for this mimetype
- Returns the token, TTL, and editor URL

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "access_token_ttl": 1711382400000,
  "editor_url": "https://collabora.example.com/browser/abc123/cool.html?WOPISrc=..."
}
```

### 2. Form POST to Collabora

The browser doesn't `fetch()` the editor URL — it submits a hidden HTML form targeting an iframe. Yes, a form POST in 2026. This is how WOPI works: the token goes as a form field, not a header.

From `CollaboraEditor.tsx`:

```tsx
<form
  ref={formRef}
  target="collabora_frame"
  action={wopiData.editor_url!}
  encType="multipart/form-data"
  method="post"
  style={{ display: 'none' }}
>
  <input name="access_token" value={wopiData.access_token} type="hidden" readOnly />
  <input name="access_token_ttl" value={String(wopiData.access_token_ttl)} type="hidden" readOnly />
</form>

<iframe
  ref={iframeRef}
  name="collabora_frame"
  title="Collabora Editor"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
  allow="clipboard-read *; clipboard-write *"
  allowFullScreen
/>
```

**The timing matters.** The form submission fires in a `useEffect` on `wopiData` change — not in a callback, not in a `setTimeout`. Both the `<form>` and `<iframe name="collabora_frame">` must be in the DOM before `formRef.current.submit()`. If you submit before the named iframe exists, the browser opens the POST in the main window and your SPA is toast. Ask us how we know.

```tsx
useEffect(() => {
  if (wopiData?.editor_url && formRef.current && iframeRef.current) {
    formRef.current.submit()
  }
}, [wopiData])
```

### 3. Collabora Calls Back

Once Collabora receives the form POST, it starts making WOPI requests to our server using the `WOPISrc` URL embedded in the editor URL. Every request includes `?access_token=...` as a query parameter.

### 4. PostMessage Communication

Collabora talks to the parent window via `postMessage`. The component listens for:

- `App_LoadingStatus` (Status: `Document_Loaded`) — hide the loading spinner, focus the iframe
- `UI_Close` — user clicked the close button in Collabora
- `Action_Save` / `Action_Save_Resp` — save status for the UI

Token refresh also uses postMessage. Before the token expires, the component fetches a new one and sends it to the iframe:

```tsx
iframeRef.current.contentWindow.postMessage(
  JSON.stringify({
    MessageId: 'Action_ResetAccessToken',
    Values: {
      token: data.access_token,
      token_ttl: String(data.access_token_ttl),
    },
  }),
  '*',
)
```

Tokens refresh 5 minutes before expiry (`TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000`).

---

## WOPI Endpoints

### CheckFileInfo

```
GET /wopi/files/:id?access_token=...
```

Returns metadata Collabora needs to render the editor:

```json
{
  "BaseFileName": "quarterly-report.docx",
  "OwnerId": "kratos-identity-uuid",
  "Size": 145832,
  "UserId": "kratos-identity-uuid",
  "UserFriendlyName": "Sienna Costa",
  "Version": "2025-03-15T10:30:00.000Z",
  "UserCanWrite": true,
  "UserCanNotWriteRelative": true,
  "SupportsLocks": true,
  "SupportsUpdate": true,
  "SupportsGetLock": true,
  "LastModifiedTime": "2025-03-15T10:30:00.000Z"
}
```

`UserCanNotWriteRelative` is always `true` — we don't support PutRelativeFile (creating files from within the editor). PutRelative override gets a 501.

### GetFile

```
GET /wopi/files/:id/contents?access_token=...
```

Fetches the file from S3 and streams it back. This is the one place file bytes flow through the server — Collabora can't use pre-signed URLs, so we proxy.

### PutFile

```
POST /wopi/files/:id/contents?access_token=...
X-WOPI-Lock: <lock-id>

[file bytes]
```

Writes the edited file back to S3. Validates the lock — if a different lock holds the file, returns 409 with the current lock ID in `X-WOPI-Lock`. Updates file size and `updated_at` in PostgreSQL.

### Lock Operations

All lock operations go through `POST /wopi/files/:id` with the `X-WOPI-Override` header:

| Override | Headers | What it does |
|----------|---------|-------------|
| `LOCK` | `X-WOPI-Lock` | Acquire a lock. If `X-WOPI-OldLock` is also present, it's an unlock-and-relock. |
| `GET_LOCK` | — | Returns current lock ID in `X-WOPI-Lock` response header. |
| `REFRESH_LOCK` | `X-WOPI-Lock` | Extend the TTL of an existing lock. |
| `UNLOCK` | `X-WOPI-Lock` | Release the lock. |
| `RENAME_FILE` | `X-WOPI-RequestedName` | Rename the file (requires write permission). |

Lock conflicts return 409 with the conflicting lock ID in the `X-WOPI-Lock` response header.

---

## Token Generation

WOPI tokens are JWTs signed with HMAC-SHA256 using Web Crypto. No external JWT library — it's 30 lines of code and one fewer dependency.

The payload:

```typescript
interface WopiTokenPayload {
  fid: string   // File UUID
  uid: string   // User ID (Kratos identity)
  unm: string   // User display name
  wr: boolean   // Can write
  iat: number   // Issued at (unix seconds)
  exp: number   // Expires at (unix seconds)
}
```

Default expiry is 8 hours (`DEFAULT_EXPIRES_SECONDS = 8 * 3600`).

The signing is textbook JWT — base64url-encode header and payload, HMAC-SHA256 sign the `header.payload` string, base64url-encode the signature:

```typescript
const header = base64urlEncode(
  encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
);
const body = base64urlEncode(
  encoder.encode(JSON.stringify(payload)),
);
const sigInput = encoder.encode(`${header}.${body}`);
const sig = await hmacSign(sigInput, secret);
return `${header}.${body}.${base64urlEncode(sig)}`;
```

Verification checks signature, then expiry. Token is scoped to a specific file — the handler validates `payload.fid === fileId` on every request.

Secret comes from the `WOPI_JWT_SECRET` env var. Default is `dev-wopi-secret-change-in-production` — the name is the reminder.

---

## Lock Service

Locks live in Valkey (Redis-compatible) with a 30-minute TTL. The key format is `wopi:lock:{fileId}`.

From `server/wopi/lock.ts`:

```typescript
const LOCK_TTL_SECONDS = 30 * 60; // 30 minutes
const KEY_PREFIX = "wopi:lock:";
```

The lock service uses an injectable `LockStore` interface:

- **`ValkeyLockStore`** — production, uses ioredis
- **`InMemoryLockStore`** — in-memory Map for tests and local dev

Fallback chain — try Valkey, fall back to in-memory (good enough for local dev, you'd notice in production):

```typescript
function getStore(): LockStore {
  if (!_store) {
    try {
      _store = new ValkeyLockStore();
    } catch {
      console.warn("WOPI lock: falling back to in-memory store");
      _store = new InMemoryLockStore();
    }
  }
  return _store;
}
```

Lock acquisition uses `SET NX EX` (set-if-not-exists with TTL) for atomicity. If the lock exists with the same lock ID, the TTL refreshes instead — Collabora does this "re-lock with same ID" thing and you have to handle it.

---

## Discovery Caching

Collabora publishes a discovery XML at `/hosting/discovery` that maps mimetypes to editor URLs. We cache it for 1 hour:

```typescript
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
```

Retries up to 3 times with exponential backoff (1s, 2s). The XML is parsed with regex — yes, regex for XML, but the discovery format is stable and an XML parser dependency isn't worth it for one endpoint. Pulls `<app name="mimetype">` blocks and extracts `<action name="..." urlsrc="..." />` entries.

If Collabora is down, the token endpoint returns `editor_url: null` and the UI shows an error. No crash.

Cache can be cleared with `clearDiscoveryCache()` for testing.

---

## Iframe Sandbox

The iframe sandbox is as tight as Collabora allows:

```
sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
allow="clipboard-read *; clipboard-write *"
```

Every permission is load-bearing — remove any one of these and something breaks:
- `allow-scripts` — Collabora is a web app, needs JS
- `allow-same-origin` — Collabora's internal communication
- `allow-forms` — the initial form POST targets this iframe
- `allow-popups` — help/about dialogs
- `allow-popups-to-escape-sandbox` — those popups need full functionality
- `allow-downloads` — "Download as..." from within the editor
- `clipboard-read/write` — copy/paste
