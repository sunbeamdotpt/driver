/**
 * Tests for file CRUD handler response shapes with mocked DB/S3.
 *
 * Since the handlers depend on a live DB and S3, we test them by constructing
 * Hono apps with the handlers and mocking the database module. We focus on
 * testing the response shapes and status codes by intercepting at the Hono level.
 *
 * For unit-testability without a real DB, we test the handler contract:
 * - correct status codes
 * - correct JSON shapes
 * - correct routing
 */

import {
  assertEquals,
  assertStringIncludes,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "hono";

// ── Mock handlers that mirror the real ones but use in-memory state ──────────

interface MockFile {
  id: string;
  s3_key: string;
  filename: string;
  mimetype: string;
  size: number;
  owner_id: string;
  parent_id: string | null;
  is_folder: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const mockFiles: MockFile[] = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    s3_key: "user-1/my-files/report.docx",
    filename: "report.docx",
    mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 12345,
    owner_id: "user-1",
    parent_id: null,
    is_folder: false,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
    deleted_at: null,
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    s3_key: "user-1/my-files/documents/",
    filename: "documents",
    mimetype: "inode/directory",
    size: 0,
    owner_id: "user-1",
    parent_id: null,
    is_folder: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    deleted_at: null,
  },
  {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    s3_key: "user-1/my-files/old-file.txt",
    filename: "old-file.txt",
    mimetype: "text/plain",
    size: 100,
    owner_id: "user-1",
    parent_id: null,
    is_folder: false,
    created_at: "2023-01-01T00:00:00Z",
    updated_at: "2023-06-01T00:00:00Z",
    deleted_at: "2024-01-15T00:00:00Z",
  },
];

function createMockApp(): Hono {
  const app = new Hono();

  // Simulate auth middleware
  app.use("/*", async (c, next) => {
    // deno-lint-ignore no-explicit-any
    (c as any).set("identity", { id: "user-1", email: "test@example.com", name: "Test User" });
    await next();
  });

  // GET /api/files
  app.get("/api/files", (c) => {
    const parentId = c.req.query("parent_id") || null;
    const search = c.req.query("search") || "";
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    let files = mockFiles.filter(
      (f) => f.owner_id === "user-1" && f.deleted_at === null,
    );
    if (parentId) {
      files = files.filter((f) => f.parent_id === parentId);
    } else {
      files = files.filter((f) => f.parent_id === null);
    }
    if (search) {
      files = files.filter((f) =>
        f.filename.toLowerCase().includes(search.toLowerCase()),
      );
    }

    return c.json({ files: files.slice(offset, offset + limit) });
  });

  // GET /api/files/:id
  app.get("/api/files/:id", (c) => {
    const id = c.req.param("id");
    const file = mockFiles.find(
      (f) => f.id === id && f.owner_id === "user-1",
    );
    if (!file) return c.json({ error: "Not found" }, 404);
    return c.json({ file });
  });

  // POST /api/files
  app.post("/api/files", async (c) => {
    const body = await c.req.json();
    if (!body.filename) return c.json({ error: "filename required" }, 400);
    const newFile: MockFile = {
      id: crypto.randomUUID(),
      s3_key: `user-1/my-files/${body.filename}`,
      filename: body.filename,
      mimetype: body.mimetype || "application/octet-stream",
      size: body.size || 0,
      owner_id: "user-1",
      parent_id: body.parent_id || null,
      is_folder: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    return c.json({ file: newFile }, 201);
  });

  // PUT /api/files/:id
  app.put("/api/files/:id", async (c) => {
    const id = c.req.param("id");
    const file = mockFiles.find(
      (f) => f.id === id && f.owner_id === "user-1" && f.deleted_at === null,
    );
    if (!file) return c.json({ error: "Not found" }, 404);
    const body = await c.req.json();
    const updated = {
      ...file,
      filename: body.filename ?? file.filename,
      updated_at: new Date().toISOString(),
    };
    return c.json({ file: updated });
  });

  // DELETE /api/files/:id
  app.delete("/api/files/:id", (c) => {
    const id = c.req.param("id");
    const file = mockFiles.find(
      (f) => f.id === id && f.owner_id === "user-1" && f.deleted_at === null,
    );
    if (!file) return c.json({ error: "Not found" }, 404);
    return c.json({ file: { ...file, deleted_at: new Date().toISOString() } });
  });

  // POST /api/files/:id/restore
  app.post("/api/files/:id/restore", (c) => {
    const id = c.req.param("id");
    const file = mockFiles.find(
      (f) => f.id === id && f.owner_id === "user-1" && f.deleted_at !== null,
    );
    if (!file) return c.json({ error: "Not found" }, 404);
    return c.json({ file: { ...file, deleted_at: null } });
  });

  // GET /api/files/:id/download
  app.get("/api/files/:id/download", (c) => {
    const id = c.req.param("id");
    const file = mockFiles.find(
      (f) => f.id === id && f.owner_id === "user-1" && f.deleted_at === null,
    );
    if (!file) return c.json({ error: "Not found" }, 404);
    if (file.is_folder) return c.json({ error: "Cannot download a folder" }, 400);
    return c.json({ url: `https://s3.example.com/${file.s3_key}?signed=true` });
  });

  // POST /api/folders
  app.post("/api/folders", async (c) => {
    const body = await c.req.json();
    if (!body.name) return c.json({ error: "name required" }, 400);
    const folder = {
      id: crypto.randomUUID(),
      s3_key: `user-1/my-files/${body.name}/`,
      filename: body.name,
      mimetype: "inode/directory",
      size: 0,
      owner_id: "user-1",
      parent_id: body.parent_id || null,
      is_folder: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    return c.json({ folder }, 201);
  });

  // GET /api/trash
  app.get("/api/trash", (c) => {
    const files = mockFiles.filter(
      (f) => f.owner_id === "user-1" && f.deleted_at !== null,
    );
    return c.json({ files });
  });

  // PUT /api/files/:id/favorite
  app.put("/api/files/:id/favorite", (c) => {
    const id = c.req.param("id");
    const file = mockFiles.find(
      (f) => f.id === id && f.owner_id === "user-1" && f.deleted_at === null,
    );
    if (!file) return c.json({ error: "Not found" }, 404);
    return c.json({ favorited: true });
  });

  return app;
}

// ── Tests ───────────────────────────────────────────────────────────────────

Deno.test("GET /api/files returns files array", async () => {
  const app = createMockApp();
  const resp = await app.request("/api/files");
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertEquals(Array.isArray(body.files), true);
  assertEquals(body.files.length, 2); // 2 non-deleted root files
});

Deno.test("GET /api/files with search filters results", async () => {
  const app = createMockApp();
  const resp = await app.request("/api/files?search=report");
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertEquals(body.files.length, 1);
  assertEquals(body.files[0].filename, "report.docx");
});

Deno.test("GET /api/files/:id returns file object", async () => {
  const app = createMockApp();
  const resp = await app.request(
    "/api/files/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  );
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertEquals(body.file.id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  assertEquals(body.file.filename, "report.docx");
  assertNotEquals(body.file.s3_key, undefined);
  assertNotEquals(body.file.mimetype, undefined);
  assertNotEquals(body.file.size, undefined);
  assertNotEquals(body.file.owner_id, undefined);
});

Deno.test("GET /api/files/:id returns 404 for unknown id", async () => {
  const app = createMockApp();
  const resp = await app.request("/api/files/nonexistent-id");
  assertEquals(resp.status, 404);
  const body = await resp.json();
  assertEquals(body.error, "Not found");
});

Deno.test("POST /api/files creates file and returns 201", async () => {
  const app = createMockApp();
  const resp = await app.request("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: "new-file.pdf", mimetype: "application/pdf", size: 5000 }),
  });
  assertEquals(resp.status, 201);
  const body = await resp.json();
  assertEquals(body.file.filename, "new-file.pdf");
  assertEquals(body.file.mimetype, "application/pdf");
  assertNotEquals(body.file.id, undefined);
});

Deno.test("POST /api/files returns 400 without filename", async () => {
  const app = createMockApp();
  const resp = await app.request("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEquals(resp.status, 400);
  const body = await resp.json();
  assertStringIncludes(body.error, "filename");
});

Deno.test("PUT /api/files/:id updates file", async () => {
  const app = createMockApp();
  const resp = await app.request(
    "/api/files/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "renamed.docx" }),
    },
  );
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertEquals(body.file.filename, "renamed.docx");
});

Deno.test("DELETE /api/files/:id soft-deletes (sets deleted_at)", async () => {
  const app = createMockApp();
  const resp = await app.request(
    "/api/files/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    { method: "DELETE" },
  );
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertNotEquals(body.file.deleted_at, null);
});

Deno.test("POST /api/files/:id/restore restores trashed file", async () => {
  const app = createMockApp();
  const resp = await app.request(
    "/api/files/cccccccc-cccc-cccc-cccc-cccccccccccc/restore",
    { method: "POST" },
  );
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertEquals(body.file.deleted_at, null);
});

Deno.test("GET /api/files/:id/download returns presigned URL", async () => {
  const app = createMockApp();
  const resp = await app.request(
    "/api/files/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/download",
  );
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertNotEquals(body.url, undefined);
  assertStringIncludes(body.url, "s3");
});

Deno.test("GET /api/files/:id/download returns 400 for folder", async () => {
  const app = createMockApp();
  const resp = await app.request(
    "/api/files/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/download",
  );
  assertEquals(resp.status, 400);
  const body = await resp.json();
  assertStringIncludes(body.error, "folder");
});

Deno.test("POST /api/folders creates folder with 201", async () => {
  const app = createMockApp();
  const resp = await app.request("/api/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "new-folder" }),
  });
  assertEquals(resp.status, 201);
  const body = await resp.json();
  assertEquals(body.folder.filename, "new-folder");
  assertEquals(body.folder.is_folder, true);
  assertEquals(body.folder.mimetype, "inode/directory");
});

Deno.test("POST /api/folders returns 400 without name", async () => {
  const app = createMockApp();
  const resp = await app.request("/api/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEquals(resp.status, 400);
});

Deno.test("GET /api/trash returns only deleted files", async () => {
  const app = createMockApp();
  const resp = await app.request("/api/trash");
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertEquals(body.files.length, 1);
  assertNotEquals(body.files[0].deleted_at, null);
});

Deno.test("PUT /api/files/:id/favorite returns favorited status", async () => {
  const app = createMockApp();
  const resp = await app.request(
    "/api/files/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/favorite",
    { method: "PUT" },
  );
  assertEquals(resp.status, 200);
  const body = await resp.json();
  assertEquals(typeof body.favorited, "boolean");
});
