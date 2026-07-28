---
title: Testing
description: Five test suites, 90%+ coverage on both layers, and a Docker Compose stack for full WOPI integration tests.
updated_at: "2026-07-28"
---

# Testing

Five test suites, 90%+ coverage on both layers, and a Docker Compose stack for full WOPI integration tests.

---

## Overview

| Suite | Runner | Count | What it tests |
|-------|--------|-------|---------------|
| Server unit tests | Deno | 93 | API handlers, S3 signing, WOPI tokens, locks, auth, CSRF, Keto, permissions, backfill |
| UI unit tests | Vitest | 278 | Components, pages, hooks, stores, API client |
| E2E tests | Playwright | 11 | Full browser flows against a running server |
| Integration service tests | Playwright | 12 | Theme tokens, CSS injection, waffle menu from production integration service |
| WOPI integration tests | Playwright | 13 | End-to-end Collabora editing via Docker Compose |

---

## Server Unit Tests (Deno)

```bash
deno task test
```

Which runs:

```bash
deno test -A tests/server/
```

10 test files, one per server module:

| File | What it covers |
|------|---------------|
| `auth_test.ts` | Kratos session validation, cookie extraction, AAL2 handling, test mode |
| `csrf_test.ts` | HMAC double-submit token generation, verification, timing-safe comparison |
| `files_test.ts` | File CRUD handlers, presigned URL generation, sort/search/pagination |
| `s3_test.ts` | AWS SigV4 signing, canonical request building, presign URL generation |
| `keto_test.ts` | Keto HTTP client: check, write, delete, batch, list, expand |
| `permissions_test.ts` | Permission middleware, tuple lifecycle, filterByPermission |
| `backfill_test.ts` | Key parsing, folder chain creation, dry run, mimetype inference |
| `wopi_token_test.ts` | JWT generation, verification, expiry, payload validation |
| `wopi_lock_test.ts` | Lock acquire, release, refresh, conflict, unlock-and-relock, TTL |
| `wopi_discovery_test.ts` | Discovery XML parsing, caching, retry logic |

All use Deno's built-in test runner and assertions — no test framework dependency. WOPI lock tests inject an `InMemoryLockStore` so you don't need Valkey running.

### Running with coverage

```bash
deno test -A --coverage tests/server/
deno coverage coverage/
```

---

## UI Unit Tests (Vitest)

```bash
cd ui && npx vitest run
```

Or from the project root:

```bash
deno task test:ui
```

278 tests across 27 files:

| Area | Files | What they test |
|------|-------|---------------|
| Components | `FileBrowser`, `FileUpload`, `CollaboraEditor`, `ProfileMenu`, `FileActions`, `FilePreview`, `AssetTypeBadge`, `BreadcrumbNav`, `WaffleButton`, `ShareDialog` | Rendering, user interaction, keyboard navigation, aria attributes |
| Pages | `Explorer`, `Recent`, `Favorites`, `Trash`, `Editor` | Route-level rendering, data loading, empty states |
| API | `client`, `files`, `session`, `wopi` | Fetch mocking, error handling, request formatting |
| Stores | `selection`, `upload` | Zustand state management, multi-select, upload queue |
| Hooks | `useAssetType`, `usePreview`, `useThreeDPreview` | File type detection, preview capability determination |
| Layouts | `AppLayout` | Header, sidebar, main content area rendering |
| Cunningham | `useCunninghamTheme` | Theme integration, CSS variable injection |
| Root | `App` | CunninghamProvider + Router mounting |

### Running with coverage

```bash
cd ui && npx vitest run --coverage
```

---

## E2E Tests (Playwright)

```bash
cd ui && npx playwright test e2e/driver.spec.ts
```

Or:

```bash
deno task test:e2e
```

**Needs a running server** with:
- `DRIVER_TEST_MODE=1` (bypasses Kratos auth, injects a fake identity)
- PostgreSQL with migrations applied
- SeaweedFS (`weed mini` works fine)

11 tests covering browser-level flows:
- File browser navigation
- Folder creation and navigation
- File upload (single and multi-part)
- File rename and move
- File deletion and restore from trash
- Sort and search
- Favorites toggle
- Download via presigned URL

---

## Integration Service Tests (Playwright)

```bash
cd ui && INTEGRATION_URL=https://integration.sunbeam.pt npx playwright test e2e/integration-service.spec.ts
```

12 tests validating La Suite integration service theming:
- CSS variable injection from the integration service
- Theme token validation
- Waffle menu rendering
- Dark mode support
- Custom font loading
- Runtime theme switching

These hit the production integration service at `integration.sunbeam.pt`. No local Drive server needed — they test the theme integration layer in isolation.

---

## WOPI Integration Tests (Playwright)

```bash
# Start the test stack
docker compose up -d

# Wait for services to be healthy (Collabora takes ~30s)
docker compose ps

# Start the server pointed at compose services
DATABASE_URL="postgres://driver:driver@localhost:5433/driver_db" \
SEAWEEDFS_S3_URL="http://localhost:8334" \
COLLABORA_URL="http://localhost:9980" \
PUBLIC_URL="http://host.docker.internal:3200" \
PORT=3200 \
DRIVER_TEST_MODE=1 \
deno run -A main.ts

# Run the tests
cd ui && DRIVER_URL=http://localhost:3100 npx playwright test e2e/wopi.spec.ts
```

13 tests covering the full WOPI editing flow:
- Token generation for various file types
- Editor URL construction with WOPISrc
- Collabora iframe loading
- CheckFileInfo response validation
- GetFile content retrieval
- PutFile content writing
- Lock/unlock lifecycle
- Lock conflict handling
- Token expiry and refresh
- Concurrent editing detection

### The Docker Compose Stack

`compose.yaml` spins up three services:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres` | `postgres:16-alpine` | 5433 | Test database (5433 to avoid conflict with host PostgreSQL) |
| `seaweedfs` | `chrislusf/seaweedfs:latest` | 8334 | S3 storage (8334 to avoid conflict with host weed mini) |
| `collabora` | `collabora/code:latest` | 9980 | Document editor |

Drive runs on the host (not in Docker) so Playwright can reach it. Collabora needs to call back to the host for WOPI — `aliasgroup1` points to `host.docker.internal:3200`.

Tear down after testing:

```bash
docker compose down -v
```

---

## Running Everything

```bash
# All automated tests (server + UI + E2E)
deno task test:all
```

Which runs:

```bash
deno task test && deno task test:ui && deno task test:e2e
```

WOPI integration tests aren't in `test:all` — they need the Docker Compose stack. Run them separately when touching WOPI code.
