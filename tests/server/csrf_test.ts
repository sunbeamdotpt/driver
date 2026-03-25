import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "hono";
import { csrfMiddleware, generateCsrfToken, CSRF_COOKIE_NAME } from "../../server/csrf.ts";

Deno.test("CSRF - generateCsrfToken returns token and cookie", async () => {
  const { token, cookie } = await generateCsrfToken();
  assertEquals(typeof token, "string");
  assertEquals(token.includes("."), true);
  assertEquals(cookie.includes(CSRF_COOKIE_NAME), true);
});

Deno.test("CSRF - token has UUID.signature format", async () => {
  const { token } = await generateCsrfToken();
  const parts = token.split(".");
  assertEquals(parts.length, 2);
  // UUID is 36 chars
  assertEquals(parts[0].length, 36);
  // Signature is a hex string (64 chars for SHA-256)
  assertEquals(parts[1].length, 64);
});

Deno.test("CSRF - cookie contains correct attributes", async () => {
  const { cookie } = await generateCsrfToken();
  assertStringIncludes(cookie, "Path=/");
  assertStringIncludes(cookie, "HttpOnly");
  assertStringIncludes(cookie, "SameSite=Strict");
});

Deno.test("CSRF - GET requests bypass CSRF check", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.get("/api/files", (c) => c.json({ ok: true }));

  const res = await app.request("/api/files");
  assertEquals(res.status, 200);
});

Deno.test("CSRF - HEAD requests bypass CSRF check", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.get("/api/files", (c) => c.json({ ok: true }));

  const res = await app.request("/api/files", { method: "HEAD" });
  // HEAD on a GET route should pass
  assertEquals(res.status >= 200 && res.status < 400, true);
});

Deno.test("CSRF - POST without token returns 403", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.post("/api/files", (c) => c.json({ ok: true }));

  const res = await app.request("/api/files", { method: "POST" });
  assertEquals(res.status, 403);
});

Deno.test("CSRF - PUT without token returns 403", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.put("/api/files/abc", (c) => c.json({ ok: true }));

  const res = await app.request("/api/files/abc", { method: "PUT" });
  assertEquals(res.status, 403);
});

Deno.test("CSRF - PATCH without token returns 403", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.patch("/api/files/abc", (c) => c.json({ ok: true }));

  const res = await app.request("/api/files/abc", { method: "PATCH" });
  assertEquals(res.status, 403);
});

Deno.test("CSRF - DELETE without token returns 403", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.delete("/api/files/abc", (c) => c.json({ ok: true }));

  const res = await app.request("/api/files/abc", { method: "DELETE" });
  assertEquals(res.status, 403);
});

Deno.test("CSRF - POST with valid token succeeds", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.post("/api/files", (c) => c.json({ ok: true }));

  const { token } = await generateCsrfToken();
  const res = await app.request("/api/files", {
    method: "POST",
    headers: {
      "x-csrf-token": token,
      cookie: `${CSRF_COOKIE_NAME}=${token}`,
    },
  });
  assertEquals(res.status, 200);
});

Deno.test("CSRF - WOPI POST bypasses CSRF", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.post("/wopi/files/abc", (c) => c.json({ ok: true }));

  const res = await app.request("/wopi/files/abc", { method: "POST" });
  assertEquals(res.status, 200);
});

Deno.test("CSRF - mismatched token rejected", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.post("/api/files", (c) => c.json({ ok: true }));

  const { token } = await generateCsrfToken();
  const { token: otherToken } = await generateCsrfToken();
  const res = await app.request("/api/files", {
    method: "POST",
    headers: {
      "x-csrf-token": token,
      cookie: `${CSRF_COOKIE_NAME}=${otherToken}`,
    },
  });
  assertEquals(res.status, 403);
});

Deno.test("CSRF - POST to non-api path bypasses CSRF", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.post("/login", (c) => c.json({ ok: true }));

  const res = await app.request("/login", { method: "POST" });
  assertEquals(res.status, 200);
});

Deno.test("CSRF - token without cookie header rejected", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.post("/api/files", (c) => c.json({ ok: true }));

  const { token } = await generateCsrfToken();
  const res = await app.request("/api/files", {
    method: "POST",
    headers: {
      "x-csrf-token": token,
      // no cookie
    },
  });
  assertEquals(res.status, 403);
});

Deno.test("CSRF - cookie without header token rejected", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.post("/api/files", (c) => c.json({ ok: true }));

  const { token } = await generateCsrfToken();
  const res = await app.request("/api/files", {
    method: "POST",
    headers: {
      // no x-csrf-token header
      cookie: `${CSRF_COOKIE_NAME}=${token}`,
    },
  });
  assertEquals(res.status, 403);
});

Deno.test("CSRF - malformed token (no dot) rejected", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.post("/api/files", (c) => c.json({ ok: true }));

  const badToken = "no-dot-in-this-token";
  const res = await app.request("/api/files", {
    method: "POST",
    headers: {
      "x-csrf-token": badToken,
      cookie: `${CSRF_COOKIE_NAME}=${badToken}`,
    },
  });
  assertEquals(res.status, 403);
});

Deno.test("CSRF - token with wrong signature rejected", async () => {
  const app = new Hono();
  app.use("/*", csrfMiddleware);
  app.post("/api/files", (c) => c.json({ ok: true }));

  const { token } = await generateCsrfToken();
  const parts = token.split(".");
  const tamperedToken = `${parts[0]}.${"a".repeat(64)}`;
  const res = await app.request("/api/files", {
    method: "POST",
    headers: {
      "x-csrf-token": tamperedToken,
      cookie: `${CSRF_COOKIE_NAME}=${tamperedToken}`,
    },
  });
  assertEquals(res.status, 403);
});

Deno.test("CSRF - two generated tokens are different", async () => {
  const { token: t1 } = await generateCsrfToken();
  const { token: t2 } = await generateCsrfToken();
  assertEquals(t1 !== t2, true);
});
