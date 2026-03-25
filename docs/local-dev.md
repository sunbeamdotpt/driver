# Local Development

Zero to running in 2 minutes. Full WOPI editing stack takes a bit longer, but not much.

---

## Prerequisites

| Tool | Version | What for |
|------|---------|----------|
| [Deno](https://deno.land/) | 2.x | Server runtime |
| [Node.js](https://nodejs.org/) | 20+ | UI build toolchain |
| PostgreSQL | 14+ | Metadata storage |
| [SeaweedFS](https://github.com/seaweedfs/seaweedfs) | latest | S3-compatible file storage |

### Installing SeaweedFS

`weed mini` is all you need — single-process mode that runs master, volume, and filer with S3 support:

```bash
# macOS
brew install seaweedfs

# Or download from GitHub releases
# https://github.com/seaweedfs/seaweedfs/releases
```

---

## Quick Start (No WOPI)

Gets you a working file browser with uploads, folders, sort, search — everything except document editing.

### 1. Database Setup

```bash
createdb driver_db
DATABASE_URL="postgres://localhost/driver_db" deno run -A server/migrate.ts
```

Creates `files`, `user_file_state`, `_migrations` tables and the folder size functions.

### 2. Start SeaweedFS

```bash
weed mini -dir=/tmp/seaweed-driver
```

S3 endpoint on `http://localhost:8333`. No auth, no config. It works.

### 3. Build the UI

```bash
cd ui && npm install && npx vite build && cd ..
```

### 4. Start the Server

```bash
DATABASE_URL="postgres://localhost/driver_db" \
SEAWEEDFS_S3_URL="http://localhost:8333" \
DRIVER_TEST_MODE=1 \
deno run -A main.ts
```

Open `http://localhost:3000`.

`DRIVER_TEST_MODE=1` bypasses Kratos auth and injects a fake identity. No Ory stack needed unless you're working on auth flows.

### Development Mode (Hot Reload)

Or skip the manual steps entirely:

```bash
deno task dev
```

Runs both in parallel:
- `deno run -A --watch main.ts` — server with file-watching restart
- `cd ui && npx vite` — Vite dev server with HMR

Vite proxies API calls to the Deno server. Edit code, save, see it.

---

## Full WOPI Setup (Collabora Editing)

Document editing needs Collabora Online. Docker Compose is the path of least resistance.

### 1. Start the Compose Stack

```bash
docker compose up -d
```

Starts:
- **PostgreSQL** on 5433 (not 5432, avoids conflicts)
- **SeaweedFS** on 8334 (not 8333, same reason)
- **Collabora Online** on 9980

Collabora takes ~30 seconds on first start. Wait for healthy:

```bash
docker compose ps
```

### 2. Run Migrations

```bash
DATABASE_URL="postgres://driver:driver@localhost:5433/driver_db" deno run -A server/migrate.ts
```

### 3. Start the Server

```bash
DATABASE_URL="postgres://driver:driver@localhost:5433/driver_db" \
SEAWEEDFS_S3_URL="http://localhost:8334" \
COLLABORA_URL="http://localhost:9980" \
PUBLIC_URL="http://host.docker.internal:3200" \
PORT=3200 \
DRIVER_TEST_MODE=1 \
deno run -A main.ts
```

Note `PUBLIC_URL` — Collabora (in Docker) needs to reach the server (on the host) for WOPI callbacks, hence `host.docker.internal`. Port 3200 avoids stepping on anything already on 3000.

### 4. Test It

Upload a `.docx` or `.odt`, double-click it. Collabora loads in an iframe. If it doesn't, check the `aliasgroup1` config in `compose.yaml`.

### Tear Down

```bash
docker compose down -v
```

`-v` removes volumes so you start clean next time.

---

## Integration Service Theming

To test La Suite theming locally, point at the production integration service:

```bash
INTEGRATION_URL=https://integration.sunbeam.pt deno run -A main.ts
```

Injects runtime theme CSS, fonts, dark mode, and the waffle menu. The integration tests validate this:

```bash
cd ui && INTEGRATION_URL=https://integration.sunbeam.pt npx playwright test e2e/integration-service.spec.ts
```

---

## Environment Variables for Local Dev

Minimal reference (Drive doesn't read `.env` files — set these in your shell or prefix your command):

```bash
# Required
DATABASE_URL="postgres://localhost/driver_db"
SEAWEEDFS_S3_URL="http://localhost:8333"

# Optional — defaults are fine for local dev
PORT=3000
PUBLIC_URL="http://localhost:3000"
S3_BUCKET="sunbeam-driver"
DRIVER_TEST_MODE=1

# Only needed for WOPI editing
COLLABORA_URL="http://localhost:9980"
WOPI_JWT_SECRET="dev-wopi-secret-change-in-production"

# Only needed for real auth (not test mode)
KRATOS_PUBLIC_URL="http://localhost:4433"

# Only needed for permissions
KETO_READ_URL="http://localhost:4466"
KETO_WRITE_URL="http://localhost:4467"
```

---

## Common Tasks

### Reset the database

```bash
dropdb driver_db && createdb driver_db
DATABASE_URL="postgres://localhost/driver_db" deno run -A server/migrate.ts
```

### Backfill files from S3

Uploaded files directly to SeaweedFS and they're not showing up?

```bash
curl -X POST http://localhost:3000/api/admin/backfill \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```

Drop `"dry_run": true` to actually write the rows.

### Build the compiled binary

```bash
deno task build
```

Runs `vite build` then `deno compile`. One binary in the project root.

### Run all tests

```bash
deno task test:all
```

See [testing.md](testing.md) for the full breakdown.
