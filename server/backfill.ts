/**
 * S3 Backfill API
 *
 * Scans the SeaweedFS bucket and registers any S3 objects that don't have
 * a corresponding row in the PostgreSQL `files` table.
 *
 * Exposed as POST /api/admin/backfill — requires an authenticated session.
 * Not exposed via ingress (internal use only).
 *
 * Request body (all optional):
 *   { prefix?: string, dry_run?: boolean }
 *
 * Key layout convention:
 *   {identity-id}/my-files/{path}/{filename}   → personal files, owner = identity-id
 *   shared/{path}/{filename}                   → shared files, owner = "shared"
 */

import type { Context } from "hono";
import sql from "./db.ts";
import { listObjects, headObject } from "./s3.ts";

// Mimetype inference from file extension
const EXT_MIMETYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  tga: "image/x-tga",
  psd: "image/vnd.adobe.photoshop",
  exr: "image/x-exr",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  fbx: "application/octet-stream",
  gltf: "model/gltf+json",
  glb: "model/gltf-binary",
  obj: "model/obj",
  blend: "application/x-blender",
  dds: "image/vnd-ms.dds",
  ktx: "image/ktx",
  ktx2: "image/ktx2",
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip",
  "7z": "application/x-7z-compressed",
  json: "application/json",
  yaml: "text/yaml",
  yml: "text/yaml",
  xml: "application/xml",
  js: "text/javascript",
  ts: "text/typescript",
  py: "text/x-python",
  lua: "text/x-lua",
  glsl: "text/x-glsl",
  hlsl: "text/x-hlsl",
};

function inferMimetype(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIMETYPES[ext] ?? "application/octet-stream";
}

/**
 * Parse an S3 key into owner_id and path components.
 *
 * Expected formats:
 *   {identity-id}/my-files/{path}  → owner = identity-id
 *   shared/{path}                  → owner = "shared"
 */
export function parseKey(key: string): {
  ownerId: string;
  pathParts: string[];
  filename: string;
  isFolder: boolean;
} | null {
  if (!key || key === "/") return null;

  const isFolder = key.endsWith("/");
  const parts = key.replace(/\/$/, "").split("/").filter(Boolean);
  if (parts.length === 0) return null;

  let ownerId: string;
  let pathStart: number;

  if (parts[0] === "shared") {
    ownerId = "shared";
    pathStart = 1;
  } else if (parts.length >= 2 && parts[1] === "my-files") {
    ownerId = parts[0];
    pathStart = 2;
  } else {
    ownerId = parts[0];
    pathStart = 1;
  }

  const remaining = parts.slice(pathStart);
  if (remaining.length === 0 && !isFolder) return null;

  const filename = isFolder
    ? (remaining[remaining.length - 1] ?? parts[parts.length - 1])
    : remaining[remaining.length - 1];

  return {
    ownerId,
    pathParts: remaining.slice(0, -1),
    filename,
    isFolder,
  };
}

interface BackfillResult {
  scanned: number;
  already_registered: number;
  folders_created: number;
  files_created: number;
  errors: string[];
  dry_run: boolean;
}

async function runBackfill(prefix: string, dryRun: boolean): Promise<BackfillResult> {
  const result: BackfillResult = {
    scanned: 0,
    already_registered: 0,
    folders_created: 0,
    files_created: 0,
    errors: [],
    dry_run: dryRun,
  };

  // Load existing keys
  const existingRows = await sql`SELECT s3_key FROM files`;
  const existingKeys = new Set(existingRows.map((r: Record<string, unknown>) => r.s3_key as string));

  // Folder ID cache: s3_key → uuid
  const folderIdCache = new Map<string, string>();
  const existingFolders = await sql`SELECT id, s3_key FROM files WHERE is_folder = true`;
  for (const f of existingFolders) {
    folderIdCache.set(f.s3_key, f.id);
  }

  // Recursive folder creation
  async function ensureFolder(s3Key: string, ownerId: string, filename: string): Promise<string> {
    const cached = folderIdCache.get(s3Key);
    if (cached) return cached;

    if (existingKeys.has(s3Key)) {
      const [row] = await sql`SELECT id FROM files WHERE s3_key = ${s3Key}`;
      if (row) {
        folderIdCache.set(s3Key, row.id);
        return row.id;
      }
    }

    // Resolve parent folder
    let parentId: string | null = null;
    const segments = s3Key.replace(/\/$/, "").split("/");
    if (segments.length > 2) {
      const parentS3Key = segments.slice(0, -1).join("/") + "/";
      const parentName = segments[segments.length - 2];
      parentId = await ensureFolder(parentS3Key, ownerId, parentName);
    }

    if (dryRun) {
      const fakeId = crypto.randomUUID();
      folderIdCache.set(s3Key, fakeId);
      result.folders_created++;
      return fakeId;
    }

    const [row] = await sql`
      INSERT INTO files (s3_key, filename, mimetype, size, owner_id, parent_id, is_folder)
      VALUES (${s3Key}, ${filename}, ${"inode/directory"}, ${0}, ${ownerId}, ${parentId}, ${true})
      ON CONFLICT (s3_key) DO UPDATE SET s3_key = files.s3_key
      RETURNING id
    `;
    folderIdCache.set(s3Key, row.id);
    existingKeys.add(s3Key);
    result.folders_created++;
    return row.id;
  }

  // Walk bucket
  let continuationToken: string | undefined;
  do {
    const listing = await listObjects(prefix, undefined, 1000, continuationToken);

    for (const obj of listing.contents) {
      result.scanned++;

      if (existingKeys.has(obj.key)) {
        result.already_registered++;
        continue;
      }

      const parsed = parseKey(obj.key);
      if (!parsed) continue;

      try {
        let size = obj.size;
        let mimetype = inferMimetype(parsed.filename);
        const head = await headObject(obj.key);
        if (head) {
          size = head.contentLength;
          if (head.contentType && head.contentType !== "application/octet-stream") {
            mimetype = head.contentType;
          }
        }

        // Ensure parent folder chain
        let parentId: string | null = null;
        if (parsed.pathParts.length > 0) {
          const keySegments = obj.key.split("/");
          const parentSegments = keySegments.slice(0, -1);
          const parentS3Key = parentSegments.join("/") + "/";
          const parentFilename = parentSegments[parentSegments.length - 1];
          parentId = await ensureFolder(parentS3Key, parsed.ownerId, parentFilename);
        }

        if (parsed.isFolder) {
          await ensureFolder(obj.key, parsed.ownerId, parsed.filename);
          continue;
        }

        if (dryRun) {
          result.files_created++;
          continue;
        }

        const [row] = await sql`
          INSERT INTO files (s3_key, filename, mimetype, size, owner_id, parent_id, is_folder)
          VALUES (${obj.key}, ${parsed.filename}, ${mimetype}, ${size}, ${parsed.ownerId}, ${parentId}, ${false})
          ON CONFLICT (s3_key) DO NOTHING
          RETURNING id
        `;
        if (row) {
          existingKeys.add(obj.key);
          result.files_created++;
        } else {
          result.already_registered++;
        }
      } catch (err) {
        result.errors.push(`${obj.key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    continuationToken = listing.nextContinuationToken;
  } while (continuationToken);

  // Propagate folder sizes
  if (result.folders_created > 0 && !dryRun) {
    const folders = await sql`SELECT id FROM files WHERE is_folder = true`;
    for (const f of folders) {
      await sql`SELECT propagate_folder_sizes(${f.id}::uuid)`;
    }
  }

  return result;
}

/** POST /api/admin/backfill — requires authenticated session */
const ADMIN_IDS = (Deno.env.get("ADMIN_IDENTITY_IDS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** POST /api/admin/backfill — requires authenticated session + admin identity */
export async function backfillHandler(c: Context): Promise<Response> {
  const identity = c.get("identity");
  if (!identity?.id) return c.json({ error: "Unauthorized" }, 401);

  // Admin check: ADMIN_IDENTITY_IDS must be set and caller must be in the list
  if (ADMIN_IDS.length === 0 || !ADMIN_IDS.includes(identity.id)) {
    return c.json({ error: "Forbidden — admin access required" }, 403);
  }

  let prefix = "";
  let dryRun = false;

  try {
    const body = await c.req.json();
    prefix = body.prefix ?? "";
    dryRun = body.dry_run ?? false;
  } catch {
    // No body or invalid JSON — use defaults
  }

  const result = await runBackfill(prefix, dryRun);
  return c.json(result);
}
