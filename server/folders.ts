/**
 * Folder operation handlers for Hono routes.
 */

import type { Context } from "hono";
import sql from "./db.ts";

interface Identity {
  id: string;
  email: string;
}

function getIdentity(c: Context): Identity | null {
  const identity = c.get("identity");
  if (!identity?.id) return null;
  return identity as Identity;
}

/** POST /api/folders — create a folder (DB record only, no S3 object) */
export async function createFolder(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { name, parent_id } = body;
  if (!name) return c.json({ error: "name required" }, 400);

  // Build s3_key for the folder (convention: ends with /)
  const pathParts = [identity.id, "my-files"];
  if (parent_id) {
    const parentPath = await buildPathFromParent(parent_id, identity.id);
    if (parentPath) pathParts.push(parentPath);
  }
  pathParts.push(name);
  const s3Key = pathParts.join("/") + "/";

  const [folder] = await sql`
    INSERT INTO files (s3_key, filename, mimetype, size, owner_id, parent_id, is_folder)
    VALUES (${s3Key}, ${name}, ${"inode/directory"}, ${0}, ${identity.id}, ${parent_id || null}, ${true})
    RETURNING *
  `;

  return c.json({ folder }, 201);
}

/** GET /api/folders/:id/children — list folder contents (sorted, paginated) */
export async function listFolderChildren(c: Context): Promise<Response> {
  const identity = getIdentity(c);
  if (!identity) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const sort = c.req.query("sort") || "filename";
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  // Verify folder exists and belongs to user
  const [folder] = await sql`
    SELECT id FROM files
    WHERE id = ${id} AND owner_id = ${identity.id} AND is_folder = true AND deleted_at IS NULL
  `;
  if (!folder) return c.json({ error: "Folder not found" }, 404);

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

  const rows = await sql.unsafe(
    `SELECT * FROM files
     WHERE parent_id = $1 AND owner_id = $2 AND deleted_at IS NULL
     ORDER BY is_folder DESC, ${orderBy}
     LIMIT $3 OFFSET $4`,
    [id, identity.id, limit, offset],
  );

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
