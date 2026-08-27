---
title: Drive
---

# Drive

[![Matrix](https://img.shields.io/badge/chat-%23hello%3Asunbeam.pt-0dbd8b?logo=matrix)](https://matrix.to/#/#hello:sunbeam.pt)
[![License](https://img.shields.io/github/license/sunbeamdotpt/driver)](LICENSE)

An S3 file browser with WOPI-based document editing, built for [La Suite Numérique](https://lasuite.numerique.gouv.fr/). One Deno binary. No Django, no Celery, no Next.js — files, folders, and Collabora. That's the whole thing.

Built by [Sunbeam Studios](https://sunbeam.pt) as a drop-in replacement for the upstream [drive](https://github.com/suitenumerique/drive). The original is a Django/Celery/Next.js stack. This is a single binary that does the same job.

> **Status:** Running in production. WOPI editing, pre-signed uploads, folder sizes, game asset hooks, full Ory integration — all shipping. We're replacing upstream drive one feature at a time.

---

## What it does

| Feature | How it works |
|---------|-------------|
| **File browser** | Navigate folders, sort, search, multi-select. react-aria underneath for keyboard + screen reader support. |
| **Document editing** | Double-click a .docx/.odt/.xlsx → Collabora Online opens via WOPI. Full-screen, no chrome. |
| **Pre-signed uploads** | Browser uploads straight to S3. File bytes never touch the server. Multi-part for large files. |
| **Game asset support** | Type detection for FBX, glTF, textures (DDS, KTX), audio, video. Icons + badges now, previews later. |
| **Folder sizes** | Recursive PostgreSQL functions. Size updates propagate up the ancestor chain on every file change. |
| **OIDC auth** | Ory Kratos sessions + Ory Hydra OAuth2. Same identity stack as every other La Suite app. |
| **Permissions** | Ory Keto (Zanzibar-style). Hierarchical: bucket → folder → file, with group support. |
| **Theming** | La Suite integration service provides runtime CSS. Dark mode, custom fonts, waffle menu — one URL. |
| **S3 backfill** | Files dropped directly into SeaweedFS? Hit the backfill endpoint and they show up in the browser with correct metadata. |

---

## Architecture

```
Browser ──→ Deno/Hono Server ──→ SeaweedFS (S3)
                │                   PostgreSQL (metadata)
                │                   Valkey (WOPI locks)
                │                   Ory Keto (permissions)
                ├──→ Collabora Online (WOPI callbacks)
                └──→ Ory Kratos (session validation)
```

One Deno binary (~450KB JS + static UI). Hono routes requests, the UI is a Vite-built React SPA from `ui/dist`. `deno compile` packs it all into a single executable.

---

## Quick start

```bash
# Prerequisites: Deno 2.x, Node 20+, PostgreSQL, SeaweedFS (or weed mini)

# Install UI deps + build
cd ui && npm install && npx vite build && cd ..

# Create database + run migrations
createdb driver_db
DATABASE_URL="postgres://localhost/driver_db" deno run -A server/migrate.ts

# Start
DATABASE_URL="postgres://localhost/driver_db" \
SEAWEEDFS_S3_URL="http://localhost:8333" \
deno run -A main.ts
```

Open `http://localhost:3100`. That's it.

For the full stack with Collabora editing, see [docs/local-dev.md](docs/local-dev.md).

---

## Project structure

```
drive/
├── main.ts                 Hono app entry — all routes
├── deno.json               Tasks, imports
├── compose.yaml            Docker Compose for WOPI integration testing
├── server/
│   ├── auth.ts             Kratos session middleware
│   ├── csrf.ts             CSRF protection (HMAC double-submit)
│   ├── telemetry.ts        OpenTelemetry tracing + metrics middleware
│   ├── db.ts               PostgreSQL client
│   ├── migrate.ts          Schema migrations
│   ├── s3.ts               S3 client (AWS SigV4, no SDK)
│   ├── s3-presign.ts       Pre-signed URL generation
│   ├── files.ts            File CRUD + user state handlers
│   ├── folders.ts          Folder operations
│   ├── keto.ts             Ory Keto HTTP client
│   ├── permissions.ts      Permission middleware + tuple lifecycle
│   ├── backfill.ts         S3 → DB backfill API
│   └── wopi/
│       ├── handler.ts      WOPI endpoints (CheckFileInfo, GetFile, PutFile, locks)
│       ├── token.ts        JWT access tokens for WOPI
│       ├── lock.ts         Valkey-backed lock service
│       └── discovery.ts    Collabora discovery XML cache
├── ui/
│   ├── src/
│   │   ├── main.tsx        Vite entry point
│   │   ├── App.tsx         CunninghamProvider + Router
│   │   ├── layouts/        AppLayout (header + sidebar + main)
│   │   ├── pages/          Explorer, Recent, Favorites, Trash, Editor
│   │   ├── components/     FileBrowser, FileUpload, CollaboraEditor, ProfileMenu, etc.
│   │   ├── api/            React Query hooks + fetch client
│   │   ├── stores/         Zustand (selection, upload queue)
│   │   ├── hooks/          Asset type detection, preview capabilities
│   │   └── cunningham/     Cunningham theme integration
│   └── e2e/                Playwright tests (driver, wopi, integration-service)
├── keto/
│   └── namespaces.ts       OPL permission model
└── tests/
    └── server/             Deno test files (10 files)
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Server | [Deno](https://deno.land/) + [Hono](https://hono.dev/) |
| Frontend | React 19 + [Cunningham v4](https://github.com/suitenumerique/cunningham) + [react-aria](https://react-spectrum.adobe.com/react-aria/) |
| Storage | [SeaweedFS](https://github.com/seaweedfs/seaweedfs) (S3-compatible) |
| Database | PostgreSQL (file registry, folder sizes) |
| Cache | Valkey (WOPI locks with TTL) |
| Auth | [Ory Kratos](https://www.ory.sh/kratos/) (identity) + [Ory Hydra](https://www.ory.sh/hydra/) (OAuth2/OIDC) |
| Permissions | [Ory Keto](https://www.ory.sh/keto/) (Zanzibar-style ReBAC) |
| Document editing | [Collabora Online](https://www.collaboraoffice.com/) via WOPI |
| Theming | [La Suite integration service](https://github.com/suitenumerique/integration) |
| Build | `deno compile` → single binary |

---

## Testing

```bash
# Server unit tests (Deno)
deno task test

# UI unit tests (Vitest)
cd ui && npx vitest run

# UI unit tests with coverage
cd ui && npx vitest run --coverage

# E2E tests (Playwright — needs running server + weed mini + PostgreSQL)
cd ui && npx playwright test e2e/driver.spec.ts

# Integration service tests (Playwright — hits production integration.sunbeam.pt)
cd ui && INTEGRATION_URL=https://integration.sunbeam.pt npx playwright test e2e/integration-service.spec.ts

# WOPI integration tests (Playwright — needs docker compose stack)
docker compose up -d
# start server pointed at compose services, then:
cd ui && DRIVER_URL=http://localhost:3100 npx playwright test e2e/wopi.spec.ts
```

90%+ line coverage on both server and UI. See [docs/testing.md](docs/testing.md) for the full breakdown.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `PUBLIC_URL` | `http://localhost:3100` | Public-facing URL (used in WOPI callbacks + redirects) |
| `DATABASE_URL` | `postgres://driver:driver@localhost:5432/driver_db` | PostgreSQL connection string |
| `SEAWEEDFS_S3_URL` | `http://seaweedfs-filer.storage.svc.cluster.local:8333` | S3 endpoint |
| `SEAWEEDFS_ACCESS_KEY` | *(empty)* | S3 access key |
| `SEAWEEDFS_SECRET_KEY` | *(empty)* | S3 secret key |
| `S3_BUCKET` | `sunbeam-driver` | S3 bucket name |
| `S3_REGION` | `us-east-1` | S3 region for signing |
| `VALKEY_URL` | `redis://localhost:6379/2` | Valkey/Redis URL for WOPI locks (falls back to in-memory if unavailable) |
| `KRATOS_PUBLIC_URL` | `http://kratos-public.ory.svc.cluster.local:80` | Kratos public API |
| `KETO_READ_URL` | `http://keto-read.ory.svc.cluster.local:4466` | Keto read API |
| `KETO_WRITE_URL` | `http://keto-write.ory.svc.cluster.local:4467` | Keto write API |
| `COLLABORA_URL` | `http://collabora.lasuite.svc.cluster.local:9980` | Collabora Online |
| `WOPI_JWT_SECRET` | `dev-wopi-secret-change-in-production` | HMAC secret for WOPI access tokens |
| `CSRF_COOKIE_SECRET` | `dev-secret-change-in-production` | HMAC secret for CSRF tokens |
| `DRIVER_TEST_MODE` | *(unset)* | Set to `1` to bypass auth (E2E testing only) |

---

## Docs

| Doc | What's in it |
|-----|-------------|
| [Architecture](docs/architecture.md) | How the pieces fit together and why there aren't many of them |
| [WOPI](docs/wopi.md) | Collabora integration — discovery, tokens, locks, the iframe dance |
| [Permissions](docs/permissions.md) | Keto OPL model — Zanzibar-style, hierarchical traversal |
| [S3 Layout](docs/s3-layout.md) | Human-readable keys, backfill, the metadata layer |
| [Testing](docs/testing.md) | Five test suites, coverage targets, Docker Compose for WOPI |
| [Local Dev](docs/local-dev.md) | Zero to running in 2 minutes |
| [Deployment](docs/deployment.md) | Kubernetes, Collabora config, deployment checklist |

---

## License

[MIT](LICENSE) — do whatever you want with it.

Questions? `hello@sunbeam.pt`
