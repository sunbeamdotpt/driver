/**
 * File CRUD handlers for Hono routes.
 * Uses server/db.ts for metadata and server/s3.ts for storage.
 */

import type { Context } from "hono";
import sql from "./db.ts";
import { copyObject, deleteObject, getObject, putObject } from "./s3.ts";
import { presignGetUrl, presignPutUrl, createMultipartUpload, presignUploadPart, completeMultipartUpload as s3CompleteMultipart } from "./s3-presign.ts";

// ── Helpers ─────────────────────────────────────────────────────────────────

interface Identity {
  id: string;
  email: string;
}

function getIdentity(c: Context): Identity | null {
  const identity = c.get("identity");
  if (!identity?.id) return null;
  return identity as Identity;
}

function buildS3Key(ownerId: string, path: string, filename: string): string {
  const parts = [ownerId, "my-files"];
  if (path) parts.push(path);
  parts.push(filename);
  return parts.join("/");
}

/** Recompute folder sizes up the ancestor chain after a file mutation. */
async function propagateFolderSizes(parentId: string | null) {
  if (!parentId) return;
  await sql`SELECT propagate_folder_sizes(${parentId}::uuid)`;
}

// ── File operations ────────────────────────────────────────────────────────

/** GET /api/files?parent_id=&sort=&search=&limit=&offset= */
export async function listFiles(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const parentId = c.req.query("parent_id") || null;
  const sort = c.req.query("sort") || "filename";
  const search = c.req.query("search") || "";
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const allowedSorts: Record<string, string> = {
    filename: "filename ASC",
    "-filename": "filename DESC",
    size: "size ASC",
    "-size": "size DESC",
    created_at: "created_at ASC",
    "-created_at": "created_at DESC",
    updated_at: "updated_at ASC",
    "-updated_at": "updated_at DESC",
  };
  const orderBy = allowedSorts[sort] ?? "filename ASC";

  let rows;
  if (search) {
    if (parentId) {
      rows = await sql.unsafe(
        `SELECT * FROM files
         WHERE owner_id = $1 AND parent_id = $2 AND deleted_at IS NULL
           AND filename ILIKE $3
         ORDER BY is_folder DESC, ${orderBy}
         LIMIT $4 OFFSET $5`,
        [identity.id, parentId, `%${search}%`, limit, offset],
      );
    } else {
      rows = await sql.unsafe(
        `SELECT * FROM files
         WHERE owner_id = $1 AND parent_id IS NULL AND deleted_at IS NULL
           AND filename ILIKE $2
         ORDER BY is_folder DESC, ${orderBy}
         LIMIT $3 OFFSET $4`,
        [identity.id, `%${search}%`, limit, offset],
      );
    }
  } else {
    if (parentId) {
      rows = await sql.unsafe(
        `SELECT * FROM files
         WHERE owner_id = $1 AND parent_id = $2 AND deleted_at IS NULL
         ORDER BY is_folder DESC, ${orderBy}
         LIMIT $3 OFFSET $4`,
        [identity.id, parentId, limit, offset],
      );
    } else {
      rows = await sql.unsafe(
        `SELECT * FROM files
         WHERE owner_id = $1 AND parent_id IS NULL AND deleted_at IS NULL
         ORDER BY is_folder DESC, ${orderBy}
         LIMIT $2 OFFSET $3`,
        [identity.id, limit, offset],
      );
    }
  }

  return c.json({ files: rows });
}

/** GET /api/files/:id */
export async function getFile(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const [file] = await sql`
    SELECT * FROM files WHERE id = ${id} AND owner_id = ${identity.id}
  `;
  if (!file) return c.json({ error: "Not found" }, 404);

  // Update last_opened
  await sql`
    INSERT INTO user_file_state (user_id, file_id, last_opened)
    VALUES (${identity.id}, ${id}, now())
    ON CONFLICT (user_id, file_id) DO UPDATE SET last_opened = now()
  `;

  return c.json({ file });
}

/** POST /api/files — create file (form-data with file, or JSON for metadata-only) */
export async function createFile(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    const parentId = formData.get("parent_id") as string | null;
    const filename = (formData.get("filename") as string) || file.name;

    // Build path from parent chain
    const path = parentId ? await buildPathFromParent(parentId, identity.id) : "";
    const s3Key = buildS3Key(identity.id, path, filename);

    const bytes = new Uint8Array(await file.arrayBuffer());
    await putObject(s3Key, bytes, file.type);

    const [row] = await sql`
      INSERT INTO files (s3_key, filename, mimetype, size, owner_id, parent_id)
      VALUES (${s3Key}, ${filename}, ${file.type}, ${bytes.length}, ${identity.id}, ${parentId})
      RETURNING *
    `;

    await propagateFolderSizes(parentId);
    return c.json({ file: row }, 201);
  }

  // JSON body — metadata-only (the actual upload happens via presigned URL)
  const body = await c.req.json();
  const { filename, mimetype, size, parent_id } = body;
  if (!filename) return c.json({ error: "filename required" }, 400);

  const path = parent_id ? await buildPathFromParent(parent_id, identity.id) : "";
  const s3Key = buildS3Key(identity.id, path, filename);

  const [row] = await sql`
    INSERT INTO files (s3_key, filename, mimetype, size, owner_id, parent_id)
    VALUES (${s3Key}, ${filename}, ${mimetype || "application/octet-stream"}, ${size || 0}, ${identity.id}, ${parent_id || null})
    RETURNING *
  `;

  await propagateFolderSizes(parent_id || null);
  return c.json({ file: row }, 201);
}

/** PUT /api/files/:id — rename or move */
export async function updateFile(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const [file] = await sql`
    SELECT * FROM files WHERE id = ${id} AND owner_id = ${identity.id} AND deleted_at IS NULL
  `;
  if (!file) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json();
  const newFilename = body.filename ?? file.filename;
  const newParentId = body.parent_id !== undefined ? body.parent_id : file.parent_id;
  const newSize = body.size !== undefined ? body.size : file.size;

  // Compute new S3 key
  const path = newParentId ? await buildPathFromParent(newParentId, identity.id) : "";
  const newS3Key = buildS3Key(identity.id, path, newFilename);

  // If S3 key changed, copy + delete in S3 (only if content exists)
  if (newS3Key !== file.s3_key && !file.is_folder && Number(file.size) > 0) {
    await copyObject(file.s3_key, newS3Key);
    await deleteObject(file.s3_key);
  }

  const oldParentId = file.parent_id;

  const [updated] = await sql`
    UPDATE files
    SET filename = ${newFilename},
        parent_id = ${newParentId},
        s3_key = ${newS3Key},
        size = ${newSize},
        updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;

  // Propagate folder sizes if parent changed or file was moved
  await propagateFolderSizes(newParentId);
  if (oldParentId && oldParentId !== newParentId) {
    await propagateFolderSizes(oldParentId);
  }

  return c.json({ file: updated });
}

/** DELETE /api/files/:id — soft delete */
export async function deleteFile(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const [file] = await sql`
    UPDATE files
    SET deleted_at = now()
    WHERE id = ${id} AND owner_id = ${identity.id} AND deleted_at IS NULL
    RETURNING *
  `;
  if (!file) return c.json({ error: "Not found" }, 404);

  await propagateFolderSizes(file.parent_id);
  return c.json({ file });
}

/** POST /api/files/:id/restore */
export async function restoreFile(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const [file] = await sql`
    UPDATE files
    SET deleted_at = NULL, updated_at = now()
    WHERE id = ${id} AND owner_id = ${identity.id} AND deleted_at IS NOT NULL
    RETURNING *
  `;
  if (!file) return c.json({ error: "Not found" }, 404);

  await propagateFolderSizes(file.parent_id);
  return c.json({ file });
}

/** GET /api/files/:id/download — returns pre-signed download URL */
export async function downloadFile(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const [file] = await sql`
    SELECT * FROM files WHERE id = ${id} AND owner_id = ${identity.id} AND deleted_at IS NULL
  `;
  if (!file) return c.json({ error: "Not found" }, 404);
  if (file.is_folder) return c.json({ error: "Cannot download a folder" }, 400);

  const url = await presignGetUrl(file.s3_key);
  return c.json({ url });
}

/** POST /api/files/:id/upload-url — returns pre-signed upload URL(s) */
export async function getUploadUrl(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const [file] = await sql`
    SELECT * FROM files WHERE id = ${id} AND owner_id = ${identity.id} AND deleted_at IS NULL
  `;
  if (!file) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json();
  const contentType = body.content_type || file.mimetype;
  const parts = body.parts as number | undefined;

  if (parts && (parts < 1 || parts > 10000)) {
    return c.json({ error: "parts must be between 1 and 10000" }, 400);
  }

  if (parts && parts > 1) {
    // Multipart upload
    const uploadId = await createMultipartUpload(file.s3_key, contentType);
    const urls: string[] = [];
    for (let i = 1; i <= parts; i++) {
      urls.push(await presignUploadPart(file.s3_key, uploadId, i));
    }
    return c.json({ multipart: true, upload_id: uploadId, urls });
  }

  // Single-part pre-signed PUT
  const url = await presignPutUrl(file.s3_key, contentType);
  return c.json({ multipart: false, url });
}

/** POST /api/files/:id/complete-upload — complete multipart upload */
export async function completeUpload(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const [file] = await sql`
    SELECT * FROM files WHERE id = ${id} AND owner_id = ${identity.id} AND deleted_at IS NULL
  `;
  if (!file) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json();
  const { upload_id, parts } = body;
  if (!upload_id || !Array.isArray(parts)) {
    return c.json({ error: "upload_id and parts[] required" }, 400);
  }

  await s3CompleteMultipart(file.s3_key, upload_id, parts);

  // Update size if provided
  if (body.size) {
    await sql`UPDATE files SET size = ${body.size}, updated_at = now() WHERE id = ${id}`;
    await propagateFolderSizes(file.parent_id);
  }

  return c.json({ ok: true });
}

// ── User state handlers ────────────────────────────────────────────────────

/** GET /api/recent */
export async function listRecent(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const rows = await sql`
    SELECT f.*, ufs.last_opened
    FROM files f
    JOIN user_file_state ufs ON ufs.file_id = f.id
    WHERE ufs.user_id = ${identity.id}
      AND ufs.last_opened IS NOT NULL
      AND f.deleted_at IS NULL
    ORDER BY ufs.last_opened DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return c.json({ files: rows });
}

/** GET /api/favorites */
export async function listFavorites(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const rows = await sql`
    SELECT f.*, ufs.favorited
    FROM files f
    JOIN user_file_state ufs ON ufs.file_id = f.id
    WHERE ufs.user_id = ${identity.id}
      AND ufs.favorited = true
      AND f.deleted_at IS NULL
    ORDER BY f.filename ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return c.json({ files: rows });
}

/** PUT /api/files/:id/favorite — toggle favorite */
export async function toggleFavorite(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const [file] = await sql`
    SELECT id FROM files WHERE id = ${id} AND owner_id = ${identity.id} AND deleted_at IS NULL
  `;
  if (!file) return c.json({ error: "Not found" }, 404);

  const [state] = await sql`
    INSERT INTO user_file_state (user_id, file_id, favorited)
    VALUES (${identity.id}, ${id}, true)
    ON CONFLICT (user_id, file_id)
    DO UPDATE SET favorited = NOT user_file_state.favorited
    RETURNING favorited
  `;

  return c.json({ favorited: state.favorited });
}

/** GET /api/trash */
export async function listTrash(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const rows = await sql`
    SELECT * FROM files
    WHERE owner_id = ${identity.id} AND deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return c.json({ files: rows });
}

// ── Internal helpers ────────────────────────────────────────────────────────

async function buildPathFromParent(parentId: string, ownerId: string): Promise<string> {
  const parts: string[] = [];
  let currentId: string | null = parentId;

  while (currentId) {
    const [folder] = await sql`
      SELECT id, filename, parent_id FROM files
      WHERE id = ${currentId} AND owner_id = ${ownerId} AND is_folder = true
    `;
    if (!folder) break;
    parts.unshift(folder.filename);
    currentId = folder.parent_id;
  }

  return parts.join("/");
}
