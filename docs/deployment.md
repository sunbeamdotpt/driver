---
title: Deployment
description: How Drive runs in production as part of the SBBB Kubernetes stack.
updated_at: "2026-07-28"
---

# Deployment

How Drive runs in production as part of the SBBB Kubernetes stack.

---

## Where This Fits

Drive replaces the upstream [suitenumerique/drive](https://github.com/suitenumerique/drive) Helm chart in the SBBB stack. Same role, one binary instead of Django + Celery + Redis queues + Next.js.

Sits alongside the other La Suite apps and shares the Ory identity stack (Kratos + Hydra) for auth.

---

## The Binary

```bash
deno task build
```

Produces a single `driver` binary via `deno compile`:

```bash
deno compile --allow-net --allow-read --allow-env --include ui/dist -o driver main.ts
```

Bundles:
- Deno runtime
- All server TypeScript (compiled to JS)
- The entire `ui/dist` directory (React SPA)

No Node.js, no npm, no `node_modules` at runtime. Copy the binary into a container and run it. That's the deployment.

---

## Environment Variables

Everything is configured via environment variables. No config files.

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `3000` | No | Server listen port |
| `PUBLIC_URL` | `http://localhost:3100` | Yes | Public-facing URL. Used in WOPI callback URLs, redirects, and CSRF. Must be the URL users see in their browser. |
| `DATABASE_URL` | `postgres://driver:driver@localhost:5432/driver_db` | Yes | PostgreSQL connection string |
| `SEAWEEDFS_S3_URL` | `http://seaweedfs-filer.storage.svc.cluster.local:8333` | No | S3 endpoint |
| `SEAWEEDFS_ACCESS_KEY` | *(empty)* | No | S3 access key (empty = unauthenticated) |
| `SEAWEEDFS_SECRET_KEY` | *(empty)* | No | S3 secret key |
| `S3_BUCKET` | `sunbeam-driver` | No | S3 bucket name |
| `S3_REGION` | `us-east-1` | No | S3 region for signing |
| `VALKEY_URL` | `redis://localhost:6379/2` | No | Valkey/Redis URL for WOPI locks. Falls back to in-memory if unavailable. Set to your Valkey cluster URL in production. |
| `KRATOS_PUBLIC_URL` | `http://kratos-public.ory.svc.cluster.local:80` | No | Kratos public API for session validation |
| `KETO_READ_URL` | `http://keto-read.ory.svc.cluster.local:4466` | No | Keto read API for permission checks |
| `KETO_WRITE_URL` | `http://keto-write.ory.svc.cluster.local:4467` | No | Keto write API for tuple management |
| `COLLABORA_URL` | `http://collabora.lasuite.svc.cluster.local:9980` | No | Collabora Online for WOPI discovery |
| `WOPI_JWT_SECRET` | `dev-wopi-secret-change-in-production` | **Yes** | HMAC secret for WOPI access tokens. **Change this in production.** |
| `CSRF_COOKIE_SECRET` | `dev-secret-change-in-production` | **Yes** | HMAC secret for CSRF double-submit cookies. **Change this in production.** |
| `DRIVER_TEST_MODE` | *(unset)* | No | Set to `1` to bypass auth. **Never set this in production.** |

---

## Health Check

```
GET /health
```

Returns:
```json
{ "ok": true, "time": "2026-03-25T10:30:00.000Z" }
```

No auth required. Use this for Kubernetes liveness and readiness probes:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 3
  periodSeconds: 5
```

---

## Collabora Configuration

Collabora needs to know which hosts can make WOPI callbacks. This is the `aliasgroup1` env var on the Collabora deployment. Get this wrong and Collabora will reject every callback with a "Not allowed" error.

```yaml
# Collabora environment
aliasgroup1: "https://drive\\.example\\.com"
```

The value is a regex — dots must be escaped. Multiple hosts:

```yaml
aliasgroup1: "https://drive\\.example\\.com|https://drive\\.staging\\.example\\.com"
```

In the Docker Compose test stack, this is:

```yaml
aliasgroup1: "http://host\\.docker\\.internal:3200"
```

---

## OIDC Client Setup

Drive authenticates users via Ory Kratos sessions. For OIDC flows, you need a client registered in Ory Hydra.

Client credentials go in a Kubernetes secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: oidc-drive
type: Opaque
stringData:
  client-id: "drive"
  client-secret: "your-secret-here"
```

The Kratos identity schema needs standard OIDC claims (email, name). Drive reads from session traits:

```typescript
const givenName = traits.given_name ?? traits.name?.first ?? "";
const familyName = traits.family_name ?? traits.name?.last ?? "";
```

Supports both OIDC-standard (`given_name`/`family_name`) and legacy (`name.first`/`name.last`) formats. You probably won't need to think about this.

---

## SeaweedFS Bucket

Create the bucket before first deploy (or don't — SeaweedFS creates buckets on first write with default config):

```bash
# Using AWS CLI pointed at SeaweedFS
aws --endpoint-url http://seaweedfs:8333 s3 mb s3://sunbeam-driver
```

Bucket name defaults to `sunbeam-driver`, configurable via `S3_BUCKET`.

---

## Keto Deployment

Keto is new to the SBBB stack — Drive introduced it. You need to deploy:

1. **Keto server** with read (4466) and write (4467) APIs
2. **OPL namespaces** from `keto/namespaces.ts` loaded at deploy time

The namespace file defines the permission model (User, Group, Bucket, Folder, File). See [permissions.md](permissions.md) for the details.

Typical Keto config:

```yaml
# Keto config
dsn: postgres://keto:keto@postgres:5432/keto_db
namespaces:
  location: file:///etc/keto/namespaces.ts
serve:
  read:
    host: 0.0.0.0
    port: 4466
  write:
    host: 0.0.0.0
    port: 4467
```

Read API: accessible from Drive pods. Write API: accessible from Drive pods + admin tooling. Neither should be exposed to the internet.

---

## Database Migration

Run migrations before first deploy and after updates that add new ones:

```bash
DATABASE_URL="postgres://..." ./driver migrate
```

Or, if running from source:

```bash
DATABASE_URL="postgres://..." deno run -A server/migrate.ts
```

Idempotent — running them multiple times is safe. A `_migrations` table tracks what's been applied.

---

## Observability

OpenTelemetry tracing and metrics are built in (`server/telemetry.ts`) — every request is instrumented automatically.

Full picture:
- **OpenTelemetry** — tracing and metrics via OTLP. Especially useful for debugging WOPI callback chains.
- `/health` endpoint for uptime monitoring
- PostgreSQL query logs for database performance
- S3 access logs from SeaweedFS
- Container stdout/stderr

---

## Deployment Checklist

1. Build the binary: `deno task build`
2. Set **`WOPI_JWT_SECRET`** to a random secret (32+ characters)
3. Set **`CSRF_COOKIE_SECRET`** to a different random secret
4. Set **`PUBLIC_URL`** to the actual user-facing URL
5. Set **`DATABASE_URL`** and run migrations
6. Ensure SeaweedFS bucket exists
7. Configure Collabora `aliasgroup1` to allow WOPI callbacks from `PUBLIC_URL`
8. Register the OIDC client in Hydra (or use the `oidc-drive` secret)
9. Deploy Keto with the namespace file from `keto/namespaces.ts`
10. Verify: `curl https://drive.example.com/health`
11. **Do not** set `DRIVER_TEST_MODE=1` in production. It disables all auth. You will have a bad time.
