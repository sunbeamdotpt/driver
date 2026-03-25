import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "hono";
import { authMiddleware, getSession, sessionHandler } from "../../server/auth.ts";

// ── Fetch mock infrastructure ────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
) {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    return Promise.resolve(handler(url, init));
  }) as typeof globalThis.fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// ── authMiddleware tests ─────────────────────────────────────────────────────

Deno.test("auth middleware - /health bypasses auth", async () => {
  const app = new Hono();
  app.use("/*", authMiddleware);
  app.get("/health", (c) => c.json({ ok: true }));

  const res = await app.request("/health");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
});

Deno.test("auth middleware - /health/ subpath bypasses auth", async () => {
  const app = new Hono();
  app.use("/*", authMiddleware);
  app.get("/health/deep", (c) => c.json({ ok: true }));

  const res = await app.request("/health/deep");
  assertEquals(res.status, 200);
});

Deno.test("auth middleware - /api route returns 401 without session (JSON accept)", async () => {
  const app = new Hono();
  app.use("/*", authMiddleware);
  app.get("/api/files", (c) => c.json({ files: [] }));

  const res = await app.request("/api/files", {
    headers: { accept: "application/json" },
  });
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Unauthorized");
});

Deno.test("auth middleware - static assets bypass auth", async () => {
  const app = new Hono();
  app.use("/*", authMiddleware);
  app.get("/assets/main.js", (c) => c.text("js"));

  const res = await app.request("/assets/main.js");
  assertEquals(res.status, 200);
});

Deno.test("auth middleware - /index.html bypasses auth", async () => {
  const app = new Hono();
  app.use("/*", authMiddleware);
  app.get("/index.html", (c) => c.text("html"));

  const res = await app.request("/index.html");
  assertEquals(res.status, 200);
});

Deno.test("auth middleware - /favicon.ico bypasses auth", async () => {
  const app = new Hono();
  app.use("/*", authMiddleware);
  app.get("/favicon.ico", (c) => c.text("icon"));

  const res = await app.request("/favicon.ico");
  assertEquals(res.status, 200);
});

Deno.test("auth middleware - /wopi routes bypass session auth", async () => {
  const app = new Hono();
  app.use("/*", authMiddleware);
  app.get("/wopi/files/test-id", (c) => c.json({ BaseFileName: "test.docx" }));

  const res = await app.request("/wopi/files/test-id");
  assertEquals(res.status, 200);
});

Deno.test("auth middleware - browser request without session redirects to login", async () => {
  const app = new Hono();
  app.use("/*", authMiddleware);
  app.get("/explorer", (c) => c.text("ok"));

  const res = await app.request("/explorer", {
    headers: { accept: "text/html" },
    redirect: "manual",
  });
  assertEquals(res.status, 302);
  const location = res.headers.get("location") ?? "";
  assertEquals(location.includes("/login"), true);
});

Deno.test("auth middleware - valid session sets identity and calls next", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({
        identity: {
          id: "user-abc-123",
          traits: {
            email: "alice@example.com",
            given_name: "Alice",
            family_name: "Smith",
            picture: "https://img.example.com/alice.jpg",
          },
        },
      }),
      { status: 200 },
    )
  );

  try {
    const app = new Hono();
    app.use("/*", authMiddleware);
    app.get("/api/files", (c) => {
      // deno-lint-ignore no-explicit-any
      const identity = (c as any).get("identity");
      return c.json({ identity });
    });

    const res = await app.request("/api/files", {
      headers: {
        cookie: "ory_session_abc=some-session-value",
        accept: "application/json",
      },
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.identity.id, "user-abc-123");
    assertEquals(body.identity.email, "alice@example.com");
    assertEquals(body.identity.name, "Alice Smith");
    assertEquals(body.identity.picture, "https://img.example.com/alice.jpg");
  } finally {
    restoreFetch();
  }
});

Deno.test("auth middleware - 403 from Kratos with JSON accept returns AAL2 required", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({
        redirect_browser_to: "https://kratos.example.com/aal2",
      }),
      { status: 403 },
    )
  );

  try {
    const app = new Hono();
    app.use("/*", authMiddleware);
    app.get("/api/files", (c) => c.json({ ok: true }));

    const res = await app.request("/api/files", {
      headers: {
        cookie: "ory_session_abc=some-session-value",
        accept: "application/json",
      },
    });
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.error, "AAL2 required");
    assertEquals(body.redirectTo, "https://kratos.example.com/aal2");
  } finally {
    restoreFetch();
  }
});

Deno.test("auth middleware - 403 from Kratos redirects browser to aal2 URL", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({
        redirect_browser_to: "https://kratos.example.com/aal2",
      }),
      { status: 403 },
    )
  );

  try {
    const app = new Hono();
    app.use("/*", authMiddleware);
    app.get("/explorer", (c) => c.text("ok"));

    const res = await app.request("/explorer", {
      headers: {
        cookie: "ory_session_abc=some-session-value",
        accept: "text/html",
      },
      redirect: "manual",
    });
    assertEquals(res.status, 302);
    const location = res.headers.get("location") ?? "";
    assertEquals(location, "https://kratos.example.com/aal2");
  } finally {
    restoreFetch();
  }
});

Deno.test("auth middleware - 403 from Kratos without redirect URL falls back to login URL", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({}),
      { status: 403 },
    )
  );

  try {
    const app = new Hono();
    app.use("/*", authMiddleware);
    app.get("/explorer", (c) => c.text("ok"));

    const res = await app.request("/explorer", {
      headers: {
        cookie: "ory_session_abc=some-session-value",
        accept: "text/html",
      },
      redirect: "manual",
    });
    assertEquals(res.status, 302);
    const location = res.headers.get("location") ?? "";
    assertStringIncludes(location, "aal2");
  } finally {
    restoreFetch();
  }
});

Deno.test("auth middleware - 403 with error.details.redirect_browser_to is extracted", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({
        error: {
          details: {
            redirect_browser_to: "https://kratos.example.com/aal2-from-details",
          },
        },
      }),
      { status: 403 },
    )
  );

  try {
    const app = new Hono();
    app.use("/*", authMiddleware);
    app.get("/api/data", (c) => c.json({ ok: true }));

    const res = await app.request("/api/data", {
      headers: {
        cookie: "ory_session_abc=some-session-value",
        accept: "application/json",
      },
    });
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.redirectTo, "https://kratos.example.com/aal2-from-details");
  } finally {
    restoreFetch();
  }
});

Deno.test("auth middleware - non-200 non-403 from Kratos returns 401", async () => {
  mockFetch(() => new Response("error", { status: 500 }));

  try {
    const app = new Hono();
    app.use("/*", authMiddleware);
    app.get("/api/files", (c) => c.json({ ok: true }));

    const res = await app.request("/api/files", {
      headers: {
        cookie: "ory_session_abc=some-session-value",
        accept: "application/json",
      },
    });
    assertEquals(res.status, 401);
  } finally {
    restoreFetch();
  }
});

Deno.test("auth middleware - network failure to Kratos returns 401", async () => {
  mockFetch(() => {
    throw new Error("network error");
  });

  try {
    const app = new Hono();
    app.use("/*", authMiddleware);
    app.get("/api/files", (c) => c.json({ ok: true }));

    const res = await app.request("/api/files", {
      headers: {
        cookie: "ory_session_abc=some-session-value",
        accept: "application/json",
      },
    });
    assertEquals(res.status, 401);
  } finally {
    restoreFetch();
  }
});

// ── getSession tests ─────────────────────────────────────────────────────────

Deno.test("getSession - no session cookie returns null info", async () => {
  const result = await getSession("some-other-cookie=value");
  assertEquals(result.info, null);
  assertEquals(result.needsAal2, false);
});

Deno.test("getSession - empty cookie header returns null info", async () => {
  const result = await getSession("");
  assertEquals(result.info, null);
  assertEquals(result.needsAal2, false);
});

Deno.test("getSession - valid session returns SessionInfo", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({
        identity: {
          id: "user-xyz",
          traits: {
            email: "bob@example.com",
            given_name: "Bob",
            family_name: "Jones",
          },
        },
      }),
      { status: 200 },
    )
  );

  try {
    const result = await getSession("ory_session_abc=token123");
    assertEquals(result.info?.id, "user-xyz");
    assertEquals(result.info?.email, "bob@example.com");
    assertEquals(result.info?.name, "Bob Jones");
    assertEquals(result.needsAal2, false);
  } finally {
    restoreFetch();
  }
});

Deno.test("getSession - ory_kratos_session cookie also works", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({
        identity: {
          id: "user-kratos",
          traits: { email: "kratos@example.com" },
        },
      }),
      { status: 200 },
    )
  );

  try {
    const result = await getSession("ory_kratos_session=token456");
    assertEquals(result.info?.id, "user-kratos");
    assertEquals(result.info?.email, "kratos@example.com");
  } finally {
    restoreFetch();
  }
});

Deno.test("getSession - legacy name.first/name.last traits", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({
        identity: {
          id: "user-legacy",
          traits: {
            email: "legacy@example.com",
            name: { first: "Legacy", last: "User" },
          },
        },
      }),
      { status: 200 },
    )
  );

  try {
    const result = await getSession("ory_session_test=val");
    assertEquals(result.info?.name, "Legacy User");
  } finally {
    restoreFetch();
  }
});

Deno.test("getSession - falls back to email when no name parts", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({
        identity: {
          id: "user-noname",
          traits: {
            email: "noname@example.com",
          },
        },
      }),
      { status: 200 },
    )
  );

  try {
    const result = await getSession("ory_session_test=val");
    assertEquals(result.info?.name, "noname@example.com");
  } finally {
    restoreFetch();
  }
});

Deno.test("getSession - 403 returns needsAal2 true", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({ redirect_browser_to: "https://example.com/aal2" }),
      { status: 403 },
    )
  );

  try {
    const result = await getSession("ory_session_test=val");
    assertEquals(result.info, null);
    assertEquals(result.needsAal2, true);
    assertEquals(result.redirectTo, "https://example.com/aal2");
  } finally {
    restoreFetch();
  }
});

Deno.test("getSession - 403 with unparseable body still returns needsAal2", async () => {
  mockFetch(() =>
    new Response("not json", { status: 403 })
  );

  try {
    const result = await getSession("ory_session_test=val");
    assertEquals(result.info, null);
    assertEquals(result.needsAal2, true);
    assertEquals(result.redirectTo, undefined);
  } finally {
    restoreFetch();
  }
});

Deno.test("getSession - non-200 non-403 returns null info", async () => {
  mockFetch(() => new Response("error", { status: 500 }));

  try {
    const result = await getSession("ory_session_test=val");
    assertEquals(result.info, null);
    assertEquals(result.needsAal2, false);
  } finally {
    restoreFetch();
  }
});

Deno.test("getSession - network error returns null info", async () => {
  mockFetch(() => {
    throw new Error("connection refused");
  });

  try {
    const result = await getSession("ory_session_test=val");
    assertEquals(result.info, null);
    assertEquals(result.needsAal2, false);
  } finally {
    restoreFetch();
  }
});

// ── sessionHandler tests ─────────────────────────────────────────────────────

Deno.test("sessionHandler - returns user info for valid session", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({
        identity: {
          id: "user-session",
          traits: {
            email: "session@example.com",
            given_name: "Session",
            family_name: "User",
          },
        },
      }),
      { status: 200 },
    )
  );

  try {
    const app = new Hono();
    app.get("/api/auth/session", sessionHandler);

    const res = await app.request("/api/auth/session", {
      headers: { cookie: "ory_session_abc=token" },
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.user.id, "user-session");
    assertEquals(body.user.email, "session@example.com");
    assertEquals(body.user.name, "Session User");
    assertEquals(body.session !== undefined, true);
  } finally {
    restoreFetch();
  }
});

Deno.test("sessionHandler - returns 401 without session", async () => {
  const app = new Hono();
  app.get("/api/auth/session", sessionHandler);

  const res = await app.request("/api/auth/session");
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Unauthorized");
});

Deno.test("sessionHandler - returns 403 when AAL2 required", async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({ redirect_browser_to: "https://example.com/aal2" }),
      { status: 403 },
    )
  );

  try {
    const app = new Hono();
    app.get("/api/auth/session", sessionHandler);

    const res = await app.request("/api/auth/session", {
      headers: { cookie: "ory_session_abc=token" },
    });
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.error, "AAL2 required");
    assertEquals(body.needsAal2, true);
  } finally {
    restoreFetch();
  }
});

Deno.test("getSession - extracts session cookie from multiple cookies", async () => {
  mockFetch((url, init) => {
    // Verify the correct cookie was sent
    const cookieHeader = (init?.headers as Record<string, string>)?.cookie ?? "";
    assertEquals(cookieHeader.includes("ory_session_"), true);
    return new Response(
      JSON.stringify({
        identity: {
          id: "user-multi",
          traits: { email: "multi@example.com" },
        },
      }),
      { status: 200 },
    );
  });

  try {
    const result = await getSession("other=foo; ory_session_abc=token123; another=bar");
    assertEquals(result.info?.id, "user-multi");
  } finally {
    restoreFetch();
  }
});
