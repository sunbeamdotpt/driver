# S3 Layout

How files are stored in SeaweedFS, and why you can browse the bucket and actually understand what you're looking at.

---

## Key Convention

S3 keys are human-readable paths. This is intentional, and we'd do it again.

### Personal files

```
{identity-id}/my-files/{path}/{filename}
```

Examples:
```
a1b2c3d4-e5f6-7890-abcd-ef1234567890/my-files/quarterly-report.docx
a1b2c3d4-e5f6-7890-abcd-ef1234567890/my-files/Projects/game-prototype/level-01.fbx
a1b2c3d4-e5f6-7890-abcd-ef1234567890/my-files/Documents/meeting-notes.odt
```

The identity ID is the Kratos identity UUID. `my-files` is a fixed segment that separates the identity prefix from user content.

### Shared files

```
shared/{path}/{filename}
```

Examples:
```
shared/team-assets/brand-guide.pdf
shared/templates/invoice-template.xlsx
```

Shared files use `"shared"` as the owner ID.

### Folders

Folder keys end with a trailing slash:
```
a1b2c3d4-e5f6-7890-abcd-ef1234567890/my-files/Projects/
a1b2c3d4-e5f6-7890-abcd-ef1234567890/my-files/Projects/game-prototype/
```

### Why Human-Readable?

Most S3-backed file systems use UUIDs as keys (`files/550e8400-e29b-41d4.bin`). We don't. You should be able to `s3cmd ls` the bucket and immediately see who owns what, what the folder structure looks like, and what the files are.

This pays for itself when debugging, doing backfills, migrating data, or when someone asks "where did my file go?" — you can answer by looking at S3 directly, no database cross-referencing required.

The tradeoff: renames and moves require S3 copy + delete (S3 has no rename operation). The `updateFile` handler in `server/files.ts` handles this:

```typescript
if (newS3Key !== file.s3_key && !file.is_folder && Number(file.size) > 0) {
  await copyObject(file.s3_key, newS3Key);
  await deleteObject(file.s3_key);
}
```

---

## The PostgreSQL Metadata Layer

S3 stores the bytes. PostgreSQL tracks everything else.

### The `files` Table

```sql
CREATE TABLE files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  s3_key      TEXT NOT NULL UNIQUE,
  filename    TEXT NOT NULL,
  mimetype    TEXT NOT NULL DEFAULT 'application/octet-stream',
  size        BIGINT NOT NULL DEFAULT 0,
  owner_id    TEXT NOT NULL,
  parent_id   UUID REFERENCES files(id) ON DELETE CASCADE,
  is_folder   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
```

Design decisions worth noting:

- **UUID primary key** — API routes use UUIDs, not paths. Decouples the URL space from the S3 key space.
- **`s3_key` is unique** — the bridge between metadata and storage. UUID → s3_key and s3_key → metadata, both directions work.
- **`parent_id` is self-referencing** — folders and files share a table. A folder is a row with `is_folder = true`. The hierarchy is a tree of `parent_id` pointers.
- **Soft delete** — `deleted_at` gets set, the row stays. Trash view queries `deleted_at IS NOT NULL`. Restore clears it.
- **`owner_id` is a text field** — not a FK to a users table, because there is no users table. It's the Kratos identity UUID. We don't duplicate identity data locally.

Indexes:

```sql
CREATE INDEX idx_files_parent ON files(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_owner  ON files(owner_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_files_s3key  ON files(s3_key);
```

Partial indexes on `parent_id` and `owner_id` exclude soft-deleted rows — most queries filter on `deleted_at IS NULL`, so the indexes stay lean. Deleted files don't bloat the hot path.

### The `user_file_state` Table

```sql
CREATE TABLE user_file_state (
  user_id     TEXT NOT NULL,
  file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  favorited   BOOLEAN NOT NULL DEFAULT false,
  last_opened TIMESTAMPTZ,
  PRIMARY KEY (user_id, file_id)
);
```

Per-user state that doesn't belong on the file itself. Favorites and recent files are powered by this table.

---

## Folder Sizes

Folders show their total size (all descendants, recursively). Two PostgreSQL functions handle this.

### `recompute_folder_size(folder_id)`

Recursive CTE that walks all descendants:

```sql
CREATE OR REPLACE FUNCTION recompute_folder_size(folder_id UUID)
RETURNS BIGINT LANGUAGE SQL AS $$
  WITH RECURSIVE descendants AS (
    SELECT id, size, is_folder
    FROM files
    WHERE parent_id = folder_id AND deleted_at IS NULL
    UNION ALL
    SELECT f.id, f.size, f.is_folder
    FROM files f
    JOIN descendants d ON f.parent_id = d.id
    WHERE f.deleted_at IS NULL
  )
  SELECT COALESCE(SUM(size) FILTER (WHERE NOT is_folder), 0)
  FROM descendants;
$$;
```

Sums file sizes only (not folders) to avoid double-counting. Excludes soft-deleted items.

### `propagate_folder_sizes(start_parent_id)`

Walks up the ancestor chain, recomputing each folder's size:

```sql
CREATE OR REPLACE FUNCTION propagate_folder_sizes(start_parent_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  current_id UUID := start_parent_id;
  computed  BIGINT;
BEGIN
  WHILE current_id IS NOT NULL LOOP
    computed := recompute_folder_size(current_id);
    UPDATE files SET size = computed WHERE id = current_id AND is_folder = true;
    SELECT parent_id INTO current_id FROM files WHERE id = current_id;
  END LOOP;
END;
$$;
```

Called after every file mutation: create, delete, restore, move, upload completion. The handler calls it like:

```typescript
await sql`SELECT propagate_folder_sizes(${parentId}::uuid)`;
```

When a file moves between folders, both the old and new parent chains get recomputed:

```typescript
await propagateFolderSizes(newParentId);
if (oldParentId && oldParentId !== newParentId) {
  await propagateFolderSizes(oldParentId);
}
```

---

## The Backfill API

S3 and the database can get out of sync — someone uploaded directly to SeaweedFS, a migration didn't finish, a backup restore happened. The backfill API reconciles them.

```
POST /api/admin/backfill
Content-Type: application/json

{
  "prefix": "",
  "dry_run": true
}
```

Both fields are optional. `prefix` filters by S3 key prefix. `dry_run` shows what would happen without writing anything.

Response:

```json
{
  "scanned": 847,
  "already_registered": 812,
  "folders_created": 15,
  "files_created": 20,
  "errors": [],
  "dry_run": false
}
```

### What it does

1. Lists all objects in the bucket (paginated, 1000 at a time)
2. Loads existing `s3_key` values from PostgreSQL into a Set
3. For each S3 object not in the database:
   - Parses the key → owner ID, path, filename
   - Infers mimetype from extension (extensive map in `server/backfill.ts` — documents, images, video, audio, 3D formats, code, archives)
   - `HEAD` on the object for real content-type and size
   - Creates parent folder rows recursively if missing
   - Inserts the file row
4. Recomputes folder sizes for every folder

The key parsing handles both conventions:

```typescript
// {identity-id}/my-files/{path} -> owner = identity-id
// shared/{path}                 -> owner = "shared"
```

### When to reach for it

- After bulk-uploading files directly to SeaweedFS
- After migrating from another storage system
- After restoring from a backup
- Any time S3 has files the database doesn't know about

The endpoint requires an authenticated session but isn't exposed via ingress — admin-only, on purpose.

---

## S3 Client

The S3 client (`server/s3.ts`) does AWS Signature V4 with Web Crypto. No AWS SDK — it's a lot of dependency for six API calls. Implements:

- `listObjects` — ListObjectsV2 with pagination
- `headObject` — HEAD for content-type and size
- `getObject` — GET (streaming response)
- `putObject` — PUT with content hash
- `deleteObject` — DELETE (404 is not an error)
- `copyObject` — PUT with `x-amz-copy-source` header

Pre-signed URLs (`server/s3-presign.ts`) support:
- `presignGetUrl` — download directly from S3
- `presignPutUrl` — upload directly to S3
- `createMultipartUpload` + `presignUploadPart` + `completeMultipartUpload` — large file uploads

Default pre-signed URL expiry is 1 hour.
