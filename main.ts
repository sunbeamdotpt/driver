import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { tracingMiddleware, metricsMiddleware } from "./server/telemetry.ts";
import { authMiddleware, sessionHandler } from "./server/auth.ts";
import { csrfMiddleware } from "./server/csrf.ts";
import {
  listFiles,
  getFile,
  createFile,
  updateFile,
  deleteFile,
  restoreFile,
  downloadFile,
  getUploadUrl,
  completeUpload,
  listRecent,
  listFavorites,
  toggleFavorite,
  listTrash,
} from "./server/files.ts";
import { createFolder, listFolderChildren } from "./server/folders.ts";
import { backfillHandler } from "./server/backfill.ts";
import {
  wopiCheckFileInfo,
  wopiGetFile,
  wopiPutFile,
  wopiPostAction,
  generateWopiTokenHandler,
} from "./server/wopi/handler.ts";

const app = new Hono();

// OpenTelemetry tracing + metrics (must be before auth)
app.use("/*", tracingMiddleware);
app.use("/*", metricsMiddleware);

// Health check — no auth
app.get("/health", (c) =>
  c.json({ ok: true, time: new Date().toISOString() }));

// Auth middleware on everything except /health
app.use("/*", async (c, next) => {
  if (c.req.path === "/health") return await next();
  return await authMiddleware(c, next);
});

// CSRF protection
app.use("/*", csrfMiddleware);

// ── Auth ────────────────────────────────────────────────────────────────────
app.get("/api/auth/session", sessionHandler);

// ── File operations ─────────────────────────────────────────────────────────
app.get("/api/files", listFiles);
app.post("/api/files", createFile);
app.get("/api/files/:id", getFile);
app.put("/api/files/:id", updateFile);
app.delete("/api/files/:id", deleteFile);
app.post("/api/files/:id/restore", restoreFile);
app.get("/api/files/:id/download", downloadFile);
app.post("/api/files/:id/upload-url", getUploadUrl);
app.post("/api/files/:id/complete-upload", completeUpload);

// ── Folders ─────────────────────────────────────────────────────────────────
app.post("/api/folders", createFolder);
app.get("/api/folders/:id/children", listFolderChildren);

// ── User state ──────────────────────────────────────────────────────────────
app.get("/api/recent", listRecent);
app.get("/api/favorites", listFavorites);
app.put("/api/files/:id/favorite", toggleFavorite);
app.get("/api/trash", listTrash);

// ── Admin (session-auth, not exposed via ingress) ───────────────────────────
app.post("/api/admin/backfill", backfillHandler);

// ── WOPI endpoints (token-auth, bypasses Kratos via auth.ts) ────────────────
app.get("/wopi/files/:id", wopiCheckFileInfo);
app.get("/wopi/files/:id/contents", wopiGetFile);
app.post("/wopi/files/:id/contents", wopiPutFile);
app.post("/wopi/files/:id", wopiPostAction);

// ── WOPI token generation (session-auth) ────────────────────────────────────
app.post("/api/wopi/token", generateWopiTokenHandler);

// ── Static files from ui/dist ───────────────────────────────────────────────
app.use(
  "/*",
  serveStatic({
    root: "./ui/dist",
  }),
);

// SPA fallback
app.use(
  "/*",
  serveStatic({
    root: "./ui/dist",
    path: "index.html",
  }),
);

const port = parseInt(Deno.env.get("PORT") ?? "3000", 10);
console.log(`Drive listening on :${port}`);
Deno.serve({ port }, app.fetch);
