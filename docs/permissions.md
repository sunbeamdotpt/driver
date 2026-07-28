---
title: Permissions
description: Zanzibar-style relationship-based access control via Ory Keto. Sounds fancy, works well.
updated_at: "2026-07-28"
---

# Permissions

Zanzibar-style relationship-based access control via Ory Keto. Sounds fancy, works well.

---

## The Model

Drive uses [Ory Keto](https://www.ory.sh/keto/) for permissions. The model: relationship tuples ("user X has relation Y on object Z") checked by graph traversal. If you've read the Zanzibar paper, this is that.

The OPL (Ory Permission Language) definitions live in `keto/namespaces.ts`. This file is consumed by the Keto server at deploy time — Deno never executes it. It uses TypeScript syntax with Keto's built-in types (`Namespace`, `Context`, `SubjectSet`).

## Namespaces

Five namespaces, hierarchical:

```
User
Group        members: (User | Group)[]
Bucket       owners, editors, viewers  -->  permits: write, read, delete
  Folder     owners, editors, viewers, parents: (Folder | Bucket)[]  -->  permits: write, read, delete
    File     owners, editors, viewers, parents: Folder[]  -->  permits: write, read, delete
```

### User

```typescript
class User implements Namespace {}
```

Marker namespace. Users are their Kratos identity UUID.

### Group

```typescript
class Group implements Namespace {
  related: {
    members: (User | Group)[];
  };
}
```

Groups can contain users or other groups (nested groups). Used in editor/viewer relations via `SubjectSet<Group, "members">`.

### Bucket

```typescript
class Bucket implements Namespace {
  related: {
    owners: User[];
    editors: (User | SubjectSet<Group, "members">)[];
    viewers: (User | SubjectSet<Group, "members">)[];
  };

  permits = {
    write: (ctx) => owners.includes(subject) || editors.includes(subject),
    read:  (ctx) => write(ctx) || viewers.includes(subject),
    delete: (ctx) => owners.includes(subject),
  };
}
```

Top of the hierarchy. Only owners can delete. Writers can also read. Standard privilege escalation.

### Folder

```typescript
class Folder implements Namespace {
  related: {
    owners: User[];
    editors: (User | SubjectSet<Group, "members">)[];
    viewers: (User | SubjectSet<Group, "members">)[];
    parents: (Folder | Bucket)[];
  };

  permits = {
    write: (ctx) =>
      owners.includes(subject) ||
      editors.includes(subject) ||
      this.related.parents.traverse((p) => p.permits.write(ctx)),
    // ... same pattern for read and delete
  };
}
```

The interesting bit is `parents.traverse()`. No direct permission grant? Keto walks up the parent chain. Folder in a bucket inherits the bucket's permissions. Folder in a folder inherits from that, which may inherit from its parent, all the way up to the bucket. One tuple at the top covers an entire tree.

### File

```typescript
class File implements Namespace {
  related: {
    owners: User[];
    editors: (User | SubjectSet<Group, "members">)[];
    viewers: (User | SubjectSet<Group, "members">)[];
    parents: Folder[];
  };
  // Same traverse pattern as Folder
}
```

Files can only have Folder parents (not Buckets directly). Same traversal logic.

## How Traversal Works

`parents.traverse()` is where Keto earns its keep. When you check "can user X write file Y?", Keto:

1. Checks if X is in Y's `owners` or `editors`
2. If not, looks at Y's `parents` relations
3. For each parent folder, recursively checks if X can write that folder
4. Each folder checks its own owners/editors, then traverses up to *its* parents
5. Eventually reaches a Bucket (no more parents) and checks there

Give a user `editor` on a bucket and they can write every folder and file in it. No per-file tuples needed.

---

## The HTTP API

The Keto client in `server/keto.ts` is a thin fetch wrapper. No SDK — Keto's HTTP API is simple enough that a client library would add more weight than value.

### Check Permission

```typescript
const allowed = await checkPermission(
  "files",                              // namespace
  "550e8400-e29b-41d4-a716-446655440000", // object (file UUID)
  "read",                                // relation
  "kratos-identity-uuid",                // subject_id
);
```

Under the hood:

```
POST {KETO_READ_URL}/relation-tuples/check/openapi
Content-Type: application/json

{
  "namespace": "files",
  "object": "550e8400-...",
  "relation": "read",
  "subject_id": "kratos-identity-uuid"
}
```

Returns `{ "allowed": true }` or `{ "allowed": false }`. Network errors return `false` — fail closed, always.

### Write Relationship

```typescript
await createRelationship("files", fileId, "owners", userId);
```

```
PUT {KETO_WRITE_URL}/admin/relation-tuples
Content-Type: application/json

{
  "namespace": "files",
  "object": "file-uuid",
  "relation": "owners",
  "subject_id": "user-uuid"
}
```

### Write Relationship with Subject Set

For parent relationships (file -> folder, folder -> folder, folder -> bucket):

```typescript
await createRelationshipWithSubjectSet(
  "files", fileId, "parents",   // this file's "parents" relation
  "folders", parentFolderId, "" // points to the folder
);
```

### Delete Relationship

```
DELETE {KETO_WRITE_URL}/admin/relation-tuples?namespace=files&object=...&relation=...&subject_id=...
```

### Batch Write

Atomic insert/delete of multiple tuples:

```typescript
await batchWriteRelationships([
  { action: "delete", relation_tuple: { namespace: "files", object: fileId, relation: "parents", subject_set: { ... } } },
  { action: "insert", relation_tuple: { namespace: "files", object: fileId, relation: "parents", subject_set: { ... } } },
]);
```

```
PATCH {KETO_WRITE_URL}/admin/relation-tuples
```

### Expand (Debugging)

```typescript
const tree = await expandPermission("files", fileId, "read", 3);
```

Returns the full permission tree. Useful for debugging why someone can or can't access something.

---

## Permission Middleware

`server/permissions.ts` exports `permissionMiddleware` for file/folder routes. Straightforward:

1. Extracts identity from `c.get("identity")`
2. Parses file/folder UUID from the URL path (`/api/files/:id` or `/api/folders/:id`)
3. Maps HTTP method to permission: `GET` → `read`, `DELETE` → `delete`, everything else → `write`
4. Checks against Keto
5. 403 if denied

For list operations (no `:id` in the path), the middleware passes through — per-item filtering happens in the handler:

```typescript
const filtered = await filterByPermission(files, userId, "read");
```

Checks permissions in parallel and returns only the allowed items.

---

## Tuple Lifecycle

Tuples live and die with their resources. No orphans.

### On File Create

```typescript
await writeFilePermissions(fileId, ownerId, parentFolderId);
```

Creates:
- `files:{fileId}#owners@{ownerId}` — creator is owner
- `files:{fileId}#parents@folders:{parentFolderId}#...` — links to parent folder

### On Folder Create

```typescript
await writeFolderPermissions(folderId, ownerId, parentFolderId, bucketId);
```

Creates:
- `folders:{folderId}#owners@{ownerId}`
- `folders:{folderId}#parents@folders:{parentFolderId}#...` — nested in another folder
- `folders:{folderId}#parents@buckets:{bucketId}#...` — at the bucket root

### On Delete

```typescript
await deleteFilePermissions(fileId);
```

Lists all tuples for the file across every relation (`owners`, `editors`, `viewers`, `parents`) and batch-deletes them. Clean break.

### On Move

```typescript
await moveFilePermissions(fileId, newParentId);
```

Batch operation: delete old parent tuple, insert new one, atomically. The file never exists in a state with no parent or two parents.

---

## What This Means in Practice

The payoff of Zanzibar for a file system:

- **Share a folder** → everything inside it is shared, recursively. No per-file grants.
- **Move a file** → it picks up the new folder's permissions automatically.
- **Groups are transitive** — add a user to a group, they inherit everything the group has.
- **One tuple on a bucket** can cover thousands of files.

The tradeoff is check latency. Every permission check is an HTTP call to Keto, which may traverse multiple levels. For list operations, checks run in parallel, but it's still N HTTP calls for N items. Fine for file browser pagination (50 items). Would need optimization for bulk operations — we'll cross that bridge when someone has 10,000 files in a folder.
