import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseKey, backfillHandler } from "../../server/backfill.ts";
import { Hono } from "hono";

// ── parseKey tests ───────────────────────────────────────────────────────────

Deno.test("parseKey — personal file under my-files", () => {
  const result = parseKey("abc-123/my-files/documents/report.docx");
  assertEquals(result?.ownerId, "abc-123");
  assertEquals(result?.pathParts, ["documents"]);
  assertEquals(result?.filename, "report.docx");
  assertEquals(result?.isFolder, false);
});

Deno.test("parseKey — personal file at root of my-files", () => {
  const result = parseKey("abc-123/my-files/photo.png");
  assertEquals(result?.ownerId, "abc-123");
  assertEquals(result?.pathParts, []);
  assertEquals(result?.filename, "photo.png");
  assertEquals(result?.isFolder, false);
});

Deno.test("parseKey — nested personal file", () => {
  const result = parseKey("abc-123/my-files/game/assets/textures/brick.png");
  assertEquals(result?.ownerId, "abc-123");
  assertEquals(result?.pathParts, ["game", "assets", "textures"]);
  assertEquals(result?.filename, "brick.png");
  assertEquals(result?.isFolder, false);
});

Deno.test("parseKey — shared file", () => {
  const result = parseKey("shared/project-alpha/design.odt");
  assertEquals(result?.ownerId, "shared");
  assertEquals(result?.pathParts, ["project-alpha"]);
  assertEquals(result?.filename, "design.odt");
  assertEquals(result?.isFolder, false);
});

Deno.test("parseKey — folder (trailing slash)", () => {
  const result = parseKey("abc-123/my-files/documents/");
  assertEquals(result?.ownerId, "abc-123");
  assertEquals(result?.isFolder, true);
  assertEquals(result?.filename, "documents");
});

Deno.test("parseKey — shared folder", () => {
  const result = parseKey("shared/assets/");
  assertEquals(result?.ownerId, "shared");
  assertEquals(result?.isFolder, true);
  assertEquals(result?.filename, "assets");
});

Deno.test("parseKey — empty key returns null", () => {
  assertEquals(parseKey(""), null);
  assertEquals(parseKey("/"), null);
});

Deno.test("parseKey — root-level key without my-files", () => {
  const result = parseKey("some-user/file.txt");
  assertEquals(result?.ownerId, "some-user");
  assertEquals(result?.filename, "file.txt");
  assertEquals(result?.pathParts, []);
});

Deno.test("parseKey — UUID owner ID", () => {
  const result = parseKey("e2e-test-user-00000000/my-files/SBBB Super Boujee Business Box.odt");
  assertEquals(result?.ownerId, "e2e-test-user-00000000");
  assertEquals(result?.filename, "SBBB Super Boujee Business Box.odt");
  assertEquals(result?.isFolder, false);
});

Deno.test("parseKey — owner-only key without file returns null", () => {
  const result = parseKey("abc-123");
  assertEquals(result, null);
});

Deno.test("parseKey — my-files root folder", () => {
  const result = parseKey("abc-123/my-files/");
  assertNotEquals(result, null);
  assertEquals(result?.ownerId, "abc-123");
  assertEquals(result?.isFolder, true);
});

Deno.test("parseKey — shared root folder", () => {
  const result = parseKey("shared/");
  assertNotEquals(result, null);
  assertEquals(result?.ownerId, "shared");
  assertEquals(result?.isFolder, true);
});

Deno.test("parseKey — deeply nested shared file", () => {
  const result = parseKey("shared/a/b/c/d/deep-file.txt");
  assertEquals(result?.ownerId, "shared");
  assertEquals(result?.pathParts, ["a", "b", "c", "d"]);
  assertEquals(result?.filename, "deep-file.txt");
  assertEquals(result?.isFolder, false);
});

Deno.test("parseKey — key with only owner/my-files returns null (no remaining file)", () => {
  const result = parseKey("abc-123/my-files");
  assertEquals(result, null);
});

Deno.test("parseKey — deeply nested folder with trailing slash", () => {
  const result = parseKey("abc-123/my-files/a/b/c/");
  assertEquals(result?.ownerId, "abc-123");
  assertEquals(result?.isFolder, true);
  assertEquals(result?.filename, "c");
  assertEquals(result?.pathParts, ["a", "b"]);
});

Deno.test("parseKey — non my-files path with nested files", () => {
  const result = parseKey("some-user/other-dir/sub/file.txt");
  assertEquals(result?.ownerId, "some-user");
  assertEquals(result?.pathParts, ["other-dir", "sub"]);
  assertEquals(result?.filename, "file.txt");
});

Deno.test("parseKey — shared file at root", () => {
  const result = parseKey("shared/file.txt");
  assertEquals(result?.ownerId, "shared");
  assertEquals(result?.filename, "file.txt");
  assertEquals(result?.pathParts, []);
});

Deno.test("parseKey — file with no extension", () => {
  const result = parseKey("abc-123/my-files/Makefile");
  assertEquals(result?.filename, "Makefile");
  assertEquals(result?.isFolder, false);
});

Deno.test("parseKey — file with multiple dots in name", () => {
  const result = parseKey("abc-123/my-files/archive.tar.gz");
  assertEquals(result?.filename, "archive.tar.gz");
});

// ── backfillHandler tests ────────────────────────────────────────────────────

Deno.test("backfillHandler — returns 401 when no identity", async () => {
  const app = new Hono();
  app.post("/api/admin/backfill", backfillHandler);

  const res = await app.request("/api/admin/backfill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dry_run: true }),
  });

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Unauthorized");
});

Deno.test("backfillHandler — returns 401 when identity has no id", async () => {
  const app = new Hono();
  app.use("/*", async (c, next) => {
    c.set("identity" as never, { email: "test@test.com" });
    await next();
  });
  app.post("/api/admin/backfill", backfillHandler);

  const res = await app.request("/api/admin/backfill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dry_run: true }),
  });

  assertEquals(res.status, 401);
});
