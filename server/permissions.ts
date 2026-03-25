/**
 * Hono middleware and helpers for Keto-based permission checks.
 */

import type { Context, Next } from "hono";
import {
  checkPermission,
  createRelationship,
  createRelationshipWithSubjectSet,
  deleteRelationship,
  batchWriteRelationships,
  type RelationPatch,
} from "./keto.ts";

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Permission middleware for /api/files/* routes.
 *
 * - Extracts identity from `c.get("identity")`.
 * - For GET requests, checks `read` permission.
 * - For POST/PUT/DELETE, checks `write` or `delete` permission.
 * - Returns 403 if denied.
 * - Passes through for list operations (no file ID in route).
 */
export async function permissionMiddleware(
  c: Context,
  next: Next,
): Promise<Response | void> {
  const identity = c.get("identity") as { id: string } | undefined;
  if (!identity?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Extract file/folder ID from the path — e.g. /api/files/:id or /api/folders/:id
  const match = c.req.path.match(
    /\/api\/(?:files|folders)\/([0-9a-f-]{36})/,
  );
  if (!match) {
    // List operations — per-item filtering happens in the handler
    return await next();
  }

  const resourceId = match[1];
  const method = c.req.method.toUpperCase();
  const namespace = c.req.path.includes("/folders/") ? "folders" : "files";

  let relation: string;
  if (method === "GET") {
    relation = "read";
  } else if (method === "DELETE") {
    relation = "delete";
  } else {
    // POST, PUT, PATCH
    relation = "write";
  }

  const allowed = await checkPermission(
    namespace,
    resourceId,
    relation,
    identity.id,
  );

  if (!allowed) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return await next();
}

// ── Tuple lifecycle helpers ──────────────────────────────────────────────────

/**
 * Write permission tuples when a file is created.
 * - Creates owner relationship: files:{fileId}#owner@{ownerId}
 * - If parentFolderId, creates parent relationship:
 *   files:{fileId}#parent@folders:{parentFolderId}#...
 */
export async function writeFilePermissions(
  fileId: string,
  ownerId: string,
  parentFolderId?: string,
): Promise<void> {
  await createRelationship("files", fileId, "owners", ownerId);

  if (parentFolderId) {
    await createRelationshipWithSubjectSet(
      "files",
      fileId,
      "parents",
      "folders",
      parentFolderId,
      "",
    );
  }
}

/**
 * Write permission tuples when a folder is created.
 */
export async function writeFolderPermissions(
  folderId: string,
  ownerId: string,
  parentFolderId?: string,
  bucketId?: string,
): Promise<void> {
  await createRelationship("folders", folderId, "owners", ownerId);

  if (parentFolderId) {
    await createRelationshipWithSubjectSet(
      "folders",
      folderId,
      "parents",
      "folders",
      parentFolderId,
      "",
    );
  } else if (bucketId) {
    await createRelationshipWithSubjectSet(
      "folders",
      folderId,
      "parents",
      "buckets",
      bucketId,
      "",
    );
  }
}

/**
 * Remove all relationships for a file.
 */
export async function deleteFilePermissions(fileId: string): Promise<void> {
  // We need to list and delete all tuples for this file.
  // Use batch delete with known relations.
  const relations = ["owners", "editors", "viewers", "parents"];
  const patches: RelationPatch[] = [];

  // We cannot enumerate subjects without listing, so we list first.
  const { listRelationships } = await import("./keto.ts");

  for (const relation of relations) {
    const tuples = await listRelationships("files", fileId, relation);
    for (const tuple of tuples) {
      patches.push({ action: "delete", relation_tuple: tuple });
    }
  }

  if (patches.length > 0) {
    await batchWriteRelationships(patches);
  }
}

/**
 * Update parent relationship when a file is moved.
 * Deletes old parent tuple and creates new one.
 */
export async function moveFilePermissions(
  fileId: string,
  newParentId: string,
): Promise<void> {
  const { listRelationships } = await import("./keto.ts");

  // Find and remove existing parent relationships
  const existing = await listRelationships("files", fileId, "parents");
  const patches: RelationPatch[] = [];

  for (const tuple of existing) {
    patches.push({ action: "delete", relation_tuple: tuple });
  }

  // Add new parent
  patches.push({
    action: "insert",
    relation_tuple: {
      namespace: "files",
      object: fileId,
      relation: "parents",
      subject_set: {
        namespace: "folders",
        object: newParentId,
        relation: "",
      },
    },
  });

  await batchWriteRelationships(patches);
}

/**
 * Filter a list of files/folders by permission.
 * Checks permissions in parallel and returns only the allowed items.
 */
export async function filterByPermission<
  T extends { id: string; is_folder?: boolean },
>(
  files: T[],
  userId: string,
  relation: string,
): Promise<T[]> {
  const results = await Promise.all(
    files.map(async (file) => {
      const namespace = file.is_folder ? "folders" : "files";
      const allowed = await checkPermission(
        namespace,
        file.id,
        relation,
        userId,
      );
      return { file, allowed };
    }),
  );

  return results.filter((r) => r.allowed).map((r) => r.file);
}
