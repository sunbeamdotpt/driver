import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

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

// We need to set env vars before importing the module
Deno.env.set("KETO_READ_URL", "http://keto-read:4466");
Deno.env.set("KETO_WRITE_URL", "http://keto-write:4467");

// Dynamic import so env vars are picked up (module-level const reads at import time).
async function importKeto() {
  const mod = await import(`../../server/keto.ts?v=${Date.now()}`);
  return mod;
}

// Since Deno caches module imports, we import once and re-use.
const keto = await importKeto();

// ── checkPermission tests ───────────────────────────────────────────────────

Deno.test("checkPermission — returns true when Keto says allowed", async () => {
  mockFetch((url, init) => {
    assertEquals(url, "http://keto-read:4466/relation-tuples/check/openapi");
    assertEquals(init?.method, "POST");
    const body = JSON.parse(init?.body as string);
    assertEquals(body.namespace, "files");
    assertEquals(body.object, "file-123");
    assertEquals(body.relation, "read");
    assertEquals(body.subject_id, "user-abc");
    return new Response(JSON.stringify({ allowed: true }), { status: 200 });
  });

  try {
    const result = await keto.checkPermission("files", "file-123", "read", "user-abc");
    assertEquals(result, true);
  } finally {
    restoreFetch();
  }
});

Deno.test("checkPermission — returns false when Keto denies", async () => {
  mockFetch(() => new Response(JSON.stringify({ allowed: false }), { status: 200 }));
  try {
    const result = await keto.checkPermission("files", "file-123", "write", "user-abc");
    assertEquals(result, false);
  } finally {
    restoreFetch();
  }
});

Deno.test("checkPermission — returns false on network error", async () => {
  mockFetch(() => {
    throw new Error("network down");
  });
  try {
    const result = await keto.checkPermission("files", "file-123", "read", "user-abc");
    assertEquals(result, false);
  } finally {
    restoreFetch();
  }
});

Deno.test("checkPermission — returns false on non-200 response", async () => {
  mockFetch(() => new Response("error", { status: 500 }));
  try {
    const result = await keto.checkPermission("files", "file-123", "read", "user-abc");
    assertEquals(result, false);
  } finally {
    restoreFetch();
  }
});

// ── createRelationship tests ────────────────────────────────────────────────

Deno.test("createRelationship — sends correct PUT request", async () => {
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> = {};
  let capturedMethod = "";

  mockFetch((url, init) => {
    capturedUrl = url;
    capturedMethod = init?.method ?? "";
    capturedBody = JSON.parse(init?.body as string);
    return new Response(JSON.stringify({}), { status: 201 });
  });

  try {
    await keto.createRelationship("files", "file-456", "owners", "user-xyz");
    assertEquals(capturedUrl, "http://keto-write:4467/admin/relation-tuples");
    assertEquals(capturedMethod, "PUT");
    assertEquals(capturedBody.namespace, "files");
    assertEquals(capturedBody.object, "file-456");
    assertEquals(capturedBody.relation, "owners");
    assertEquals(capturedBody.subject_id, "user-xyz");
  } finally {
    restoreFetch();
  }
});

Deno.test("createRelationship — throws on failure", async () => {
  mockFetch(() => new Response("bad", { status: 500 }));
  try {
    await assertRejects(
      () => keto.createRelationship("files", "file-456", "owners", "user-xyz"),
      Error,
      "Keto createRelationship failed",
    );
  } finally {
    restoreFetch();
  }
});

// ── createRelationshipWithSubjectSet tests ──────────────────────────────────

Deno.test("createRelationshipWithSubjectSet — sends subject_set payload", async () => {
  let capturedBody: Record<string, unknown> = {};

  mockFetch((_url, init) => {
    capturedBody = JSON.parse(init?.body as string);
    return new Response("{}", { status: 201 });
  });

  try {
    await keto.createRelationshipWithSubjectSet(
      "files", "file-1", "parents",
      "folders", "folder-2", "",
    );
    assertEquals(capturedBody.subject_set, {
      namespace: "folders",
      object: "folder-2",
      relation: "",
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("createRelationshipWithSubjectSet — throws on failure", async () => {
  mockFetch(() => new Response("error", { status: 403 }));
  try {
    await assertRejects(
      () => keto.createRelationshipWithSubjectSet("files", "f1", "parents", "folders", "f2", ""),
      Error,
      "Keto createRelationshipWithSubjectSet failed",
    );
  } finally {
    restoreFetch();
  }
});

// ── deleteRelationship tests ────────────────────────────────────────────────

Deno.test("deleteRelationship — sends DELETE with query params", async () => {
  let capturedUrl = "";
  let capturedMethod = "";

  mockFetch((url, init) => {
    capturedUrl = url;
    capturedMethod = init?.method ?? "";
    return new Response(null, { status: 204 });
  });

  try {
    await keto.deleteRelationship("files", "file-1", "owners", "user-1");
    assertEquals(capturedMethod, "DELETE");
    const u = new URL(capturedUrl);
    assertEquals(u.searchParams.get("namespace"), "files");
    assertEquals(u.searchParams.get("object"), "file-1");
    assertEquals(u.searchParams.get("relation"), "owners");
    assertEquals(u.searchParams.get("subject_id"), "user-1");
  } finally {
    restoreFetch();
  }
});

Deno.test("deleteRelationship — throws on failure", async () => {
  mockFetch(() => new Response("error", { status: 500 }));
  try {
    await assertRejects(
      () => keto.deleteRelationship("files", "file-1", "owners", "user-1"),
      Error,
      "Keto deleteRelationship failed",
    );
  } finally {
    restoreFetch();
  }
});

// ── batchWriteRelationships tests ───────────────────────────────────────────

Deno.test("batchWriteRelationships — formats patches correctly", async () => {
  let capturedBody: unknown[] = [];
  let capturedMethod = "";

  mockFetch((_url, init) => {
    capturedMethod = init?.method ?? "";
    capturedBody = JSON.parse(init?.body as string);
    return new Response(null, { status: 204 });
  });

  try {
    await keto.batchWriteRelationships([
      {
        action: "insert",
        relation_tuple: {
          namespace: "files",
          object: "file-1",
          relation: "owners",
          subject_id: "user-1",
        },
      },
      {
        action: "delete",
        relation_tuple: {
          namespace: "files",
          object: "file-1",
          relation: "viewers",
          subject_id: "user-2",
        },
      },
    ]);
    assertEquals(capturedMethod, "PATCH");
    assertEquals(capturedBody.length, 2);
    assertEquals((capturedBody[0] as Record<string, unknown>).action, "insert");
    assertEquals((capturedBody[1] as Record<string, unknown>).action, "delete");
  } finally {
    restoreFetch();
  }
});

Deno.test("batchWriteRelationships — throws on failure", async () => {
  mockFetch(() => new Response("error", { status: 500 }));
  try {
    await assertRejects(
      () =>
        keto.batchWriteRelationships([
          {
            action: "insert",
            relation_tuple: {
              namespace: "files",
              object: "file-1",
              relation: "owners",
              subject_id: "user-1",
            },
          },
        ]),
      Error,
      "Keto batchWriteRelationships failed",
    );
  } finally {
    restoreFetch();
  }
});

// ── listRelationships tests ─────────────────────────────────────────────────

Deno.test("listRelationships — sends GET with query params", async () => {
  let capturedUrl = "";

  mockFetch((url) => {
    capturedUrl = url;
    return new Response(
      JSON.stringify({
        relation_tuples: [
          { namespace: "files", object: "f1", relation: "owners", subject_id: "u1" },
        ],
      }),
      { status: 200 },
    );
  });

  try {
    const tuples = await keto.listRelationships("files", "f1", "owners");
    assertEquals(tuples.length, 1);
    assertEquals(tuples[0].subject_id, "u1");
    const u = new URL(capturedUrl);
    assertEquals(u.searchParams.get("namespace"), "files");
    assertEquals(u.searchParams.get("object"), "f1");
    assertEquals(u.searchParams.get("relation"), "owners");
  } finally {
    restoreFetch();
  }
});

Deno.test("listRelationships — with only namespace param", async () => {
  let capturedUrl = "";

  mockFetch((url) => {
    capturedUrl = url;
    return new Response(
      JSON.stringify({ relation_tuples: [] }),
      { status: 200 },
    );
  });

  try {
    const tuples = await keto.listRelationships("files");
    assertEquals(tuples.length, 0);
    const u = new URL(capturedUrl);
    assertEquals(u.searchParams.get("namespace"), "files");
    assertEquals(u.searchParams.has("object"), false);
  } finally {
    restoreFetch();
  }
});

Deno.test("listRelationships — with subject_id param", async () => {
  let capturedUrl = "";

  mockFetch((url) => {
    capturedUrl = url;
    return new Response(
      JSON.stringify({ relation_tuples: [] }),
      { status: 200 },
    );
  });

  try {
    await keto.listRelationships("files", undefined, undefined, "user-1");
    const u = new URL(capturedUrl);
    assertEquals(u.searchParams.get("subject_id"), "user-1");
  } finally {
    restoreFetch();
  }
});

Deno.test("listRelationships — throws on failure", async () => {
  mockFetch(() => new Response("error", { status: 500 }));
  try {
    await assertRejects(
      () => keto.listRelationships("files"),
      Error,
      "Keto listRelationships failed",
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("listRelationships — handles empty relation_tuples", async () => {
  mockFetch(() =>
    new Response(JSON.stringify({}), { status: 200 })
  );

  try {
    const tuples = await keto.listRelationships("files");
    assertEquals(tuples.length, 0);
  } finally {
    restoreFetch();
  }
});

// ── expandPermission tests ──────────────────────────────────────────────────

Deno.test("expandPermission — sends POST with correct body", async () => {
  let capturedBody: Record<string, unknown> = {};

  mockFetch((_url, init) => {
    capturedBody = JSON.parse(init?.body as string);
    return new Response(JSON.stringify({ type: "union", children: [] }), { status: 200 });
  });

  try {
    const result = await keto.expandPermission("files", "file-1", "read", 5);
    assertEquals(capturedBody.namespace, "files");
    assertEquals(capturedBody.max_depth, 5);
    assertEquals((result as Record<string, unknown>).type, "union");
  } finally {
    restoreFetch();
  }
});

Deno.test("expandPermission — uses default max_depth of 3", async () => {
  let capturedBody: Record<string, unknown> = {};

  mockFetch((_url, init) => {
    capturedBody = JSON.parse(init?.body as string);
    return new Response(JSON.stringify({ type: "leaf" }), { status: 200 });
  });

  try {
    await keto.expandPermission("files", "file-1", "read");
    assertEquals(capturedBody.max_depth, 3);
  } finally {
    restoreFetch();
  }
});

Deno.test("expandPermission — throws on failure", async () => {
  mockFetch(() => new Response("error", { status: 500 }));
  try {
    await assertRejects(
      () => keto.expandPermission("files", "file-1", "read"),
      Error,
      "Keto expandPermission failed",
    );
  } finally {
    restoreFetch();
  }
});
