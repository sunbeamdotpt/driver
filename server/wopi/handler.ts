/**
 * WOPI endpoint handlers.
 */

import type { Context } from "hono";
import sql from "../db.ts";
import { getObject, putObject } from "../s3.ts";
import { withSpan } from "../telemetry.ts";
import { verifyWopiToken, generateWopiToken } from "./token.ts";
import type { WopiTokenPayload } from "./token.ts";
import { getCollaboraActionUrl } from "./discovery.ts";
import {
  acquireLock,
  getLock,
  refreshLock,
  releaseLock,
  unlockAndRelock,
} from "./lock.ts";

// ── Token validation helper ─────────────────────────────────────────────────

async function validateToken(c: Context): Promise<WopiTokenPayload | null> {
  const token = c.req.query("access_token");
  if (!token) return null;
  return verifyWopiToken(token);
}

function wopiError(c: Context, status: number, msg: string): Response {
  return c.text(msg, status);
}

// ── CheckFileInfo ───────────────────────────────────────────────────────────

/** GET /wopi/files/:id */
export async function wopiCheckFileInfo(c: Context): Promise<Response> {
  return withSpan("wopi.checkFileInfo", { "wopi.file_id": c.req.param("id") ?? "" }, async () => {
    const payload = await validateToken(c);
    if (!payload) return wopiError(c, 401, "Invalid access token");

    const fileId = c.req.param("id");
    if (payload.fid !== fileId) return wopiError(c, 401, "Token/file mismatch");

    const [file] = await sql`
      SELECT * FROM files WHERE id = ${fileId}
    `;
    if (!file) return wopiError(c, 404, "File not found");

    return c.json({
      BaseFileName: file.filename,
      OwnerId: file.owner_id,
      Size: Number(file.size),
      UserId: payload.uid,
      UserFriendlyName: payload.unm,
      Version: file.updated_at?.toISOString?.() ?? String(file.updated_at),
      UserCanWrite: payload.wr,
      UserCanNotWriteRelative: true,
      SupportsLocks: true,
      SupportsUpdate: payload.wr,
      SupportsGetLock: true,
      LastModifiedTime: file.updated_at?.toISOString?.() ?? String(file.updated_at),
    });
  });
}

// ── GetFile ─────────────────────────────────────────────────────────────────

/** GET /wopi/files/:id/contents */
export async function wopiGetFile(c: Context): Promise<Response> {
  return withSpan("wopi.getFile", { "wopi.file_id": c.req.param("id") ?? "" }, async () => {
    const payload = await validateToken(c);
    if (!payload) return wopiError(c, 401, "Invalid access token");

    const fileId = c.req.param("id");
    if (payload.fid !== fileId) return wopiError(c, 401, "Token/file mismatch");

    const [file] = await sql`
      SELECT s3_key, mimetype FROM files WHERE id = ${fileId}
    `;
    if (!file) return wopiError(c, 404, "File not found");

    const resp = await getObject(file.s3_key);
    if (!resp.ok) return wopiError(c, 500, "Failed to retrieve file from storage");

    const headers = new Headers();
    headers.set("Content-Type", file.mimetype);
    if (resp.headers.get("content-length")) {
      headers.set("Content-Length", resp.headers.get("content-length")!);
    }

    return new Response(resp.body, { status: 200, headers });
  });
}

// ── PutFile ─────────────────────────────────────────────────────────────────

/** POST /wopi/files/:id/contents */
export async function wopiPutFile(c: Context): Promise<Response> {
  return withSpan("wopi.putFile", { "wopi.file_id": c.req.param("id") ?? "" }, async () => {
    const payload = await validateToken(c);
    if (!payload) return wopiError(c, 401, "Invalid access token");
    if (!payload.wr) return wopiError(c, 403, "No write permission");

    const fileId = c.req.param("id");
    if (payload.fid !== fileId) return wopiError(c, 401, "Token/file mismatch");

    // Verify lock
    const requestLock = c.req.header("X-WOPI-Lock") ?? "";
    const currentLock = await getLock(fileId);

    if (currentLock && currentLock !== requestLock) {
      const headers = new Headers();
      headers.set("X-WOPI-Lock", currentLock);
      return new Response("Lock mismatch", { status: 409, headers });
    }

    const [file] = await sql`
      SELECT s3_key, mimetype FROM files WHERE id = ${fileId}
    `;
    if (!file) return wopiError(c, 404, "File not found");

    const body = new Uint8Array(await c.req.arrayBuffer());
    await putObject(file.s3_key, body, file.mimetype);

    // Update size + timestamp
    await sql`
      UPDATE files SET size = ${body.length}, updated_at = now() WHERE id = ${fileId}
    `;

    return c.text("", 200);
  });
}

// ── Lock/Unlock/RefreshLock/GetLock (routed by X-WOPI-Override) ─────────────

/** POST /wopi/files/:id */
export async function wopiPostAction(c: Context): Promise<Response> {
  const override = c.req.header("X-WOPI-Override")?.toUpperCase() ?? "UNKNOWN";
  return withSpan(`wopi.${override.toLowerCase()}`, { "wopi.file_id": c.req.param("id") ?? "", "wopi.override": override }, async () => {
    const payload = await validateToken(c);
    if (!payload) return wopiError(c, 401, "Invalid access token");

    const fileId = c.req.param("id");
    if (payload.fid !== fileId) return wopiError(c, 401, "Token/file mismatch");
    const lockId = c.req.header("X-WOPI-Lock") ?? "";
    const oldLockId = c.req.header("X-WOPI-OldLock") ?? "";

    switch (override) {
      case "LOCK": {
        if (oldLockId) {
          const result = await unlockAndRelock(fileId, oldLockId, lockId);
          if (!result.success) {
            const headers = new Headers();
            if (result.existingLockId) headers.set("X-WOPI-Lock", result.existingLockId);
            return new Response("Lock mismatch", { status: 409, headers });
          }
          return c.text("", 200);
        }

        const result = await acquireLock(fileId, lockId);
        if (!result.success) {
          const headers = new Headers();
          if (result.existingLockId) headers.set("X-WOPI-Lock", result.existingLockId);
          return new Response("Lock conflict", { status: 409, headers });
        }
        return c.text("", 200);
      }

      case "GET_LOCK": {
        const current = await getLock(fileId);
        const headers = new Headers();
        headers.set("X-WOPI-Lock", current ?? "");
        return new Response("", { status: 200, headers });
      }

      case "REFRESH_LOCK": {
        const result = await refreshLock(fileId, lockId);
        if (!result.success) {
          const headers = new Headers();
          if (result.existingLockId) headers.set("X-WOPI-Lock", result.existingLockId);
          return new Response("Lock mismatch", { status: 409, headers });
        }
        return c.text("", 200);
      }

      case "UNLOCK": {
        const result = await releaseLock(fileId, lockId);
        if (!result.success) {
          const headers = new Headers();
          if (result.existingLockId) headers.set("X-WOPI-Lock", result.existingLockId);
          return new Response("Lock mismatch", { status: 409, headers });
        }
        return c.text("", 200);
      }

      case "PUT_RELATIVE":
        return wopiError(c, 501, "PutRelative not supported");

      case "RENAME_FILE": {
        if (!payload.wr) return wopiError(c, 403, "No write permission");
        const newName = c.req.header("X-WOPI-RequestedName") ?? "";
        if (!newName) return wopiError(c, 400, "Missing X-WOPI-RequestedName");

        await sql`UPDATE files SET filename = ${newName}, updated_at = now() WHERE id = ${fileId}`;
        return c.json({ Name: newName });
      }

      default:
        return wopiError(c, 501, `Unknown override: ${override}`);
    }
  });
}

// ── Token generation endpoint ───────────────────────────────────────────────

/** POST /api/wopi/token — session-authenticated, generates token for a file */
export async function generateWopiTokenHandler(c: Context): Promise<Response> {
  const identity = c.get("identity");
  if (!identity?.id) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const fileId = body.file_id;
  if (!fileId) return c.json({ error: "file_id required" }, 400);

  // Verify file exists and user has access (owner check)
  // TODO: Replace owner_id check with Keto permission check when permissions are wired up
  const [file] = await sql`
    SELECT id, owner_id, mimetype FROM files
    WHERE id = ${fileId} AND deleted_at IS NULL AND owner_id = ${identity.id}
  `;
  if (!file) return c.json({ error: "File not found" }, 404);

  const canWrite = file.owner_id === identity.id;
  const token = await generateWopiToken(
    fileId,
    identity.id,
    identity.name || identity.email,
    canWrite,
  );

  const tokenTtl = Date.now() + 8 * 3600 * 1000;

  // Build the Collabora editor URL with WOPISrc
  let editorUrl: string | null = null;
  try {
    const urlsrc = await getCollaboraActionUrl(file?.mimetype ?? "", "edit");
    if (urlsrc) {
      const PUBLIC_URL = Deno.env.get("PUBLIC_URL") ?? "http://localhost:3100";
      const wopiSrc = encodeURIComponent(`${PUBLIC_URL}/wopi/files/${fileId}`);
      editorUrl = `${urlsrc}WOPISrc=${wopiSrc}`;
    }
  } catch {
    // Discovery not available — editorUrl stays null
  }

  return c.json({
    access_token: token,
    access_token_ttl: tokenTtl,
    editor_url: editorUrl,
  });
}
