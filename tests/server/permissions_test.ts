import {
  assertEquals,
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

// Set env vars before import
Deno.env.set("KETO_READ_URL", "http://keto-read:4466");
Deno.env.set("KETO_WRITE_URL", "http://keto-write:4467");

import {
  permissionMiddleware,
  writeFilePermissions,
  writeFolderPermissions,
  deleteFilePermissions,
  moveFilePermissions,
  filterByPermission,
} from "../../server/permissions.ts";

// ── Hono context helpers ─────────────────────────────────────────────────────

function createMockContext(options: {
  method: string;
  path: string;
  identity?: { id: string } | null;
}): {
  ctx: {
    req: { method: string; path: string };
    get: (key: string) => unknown;
    json: (body: unknown, status?: number) => Response;
  };
  getStatus: () => number;
} {
  let responseStatus = 200;
  const ctx = {
    req: {
      method: options.method,
      path: options.path,
    },
    get(key: string): unknown {
      if (key === "identity") return options.identity ?? undefined;
      return undefined;
    },
    json(body: unknown, status?: number): Response {
      responseStatus = status ?? 200;
      return new Response(JSON.stringify(body), {
        status: responseStatus,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
  return { ctx, getStatus: () => responseStatus };
}

// ── permissionMiddleware tests ───────────────────────────────────────────────

Deno.test("permissionMiddleware — allows authorized GET request", async () => {
  mockFetch((url) => {
    if (url.includes("/relation-tuples/check/openapi")) {
      return new Response(JSON.stringify({ allowed: true }), { status: 200 });
    }
    return new Response("", { status: 404 });
  });

  try {
    const { ctx } = createMockContext({
      method: "GET",
      path: "/api/files/550e8400-e29b-41d4-a716-446655440000",
      identity: { id: "user-1" },
    });

    let nextCalled = false;
    // deno-lint-ignore no-explicit-any
    const result = await permissionMiddleware(ctx as any, async () => {
      nextCalled = true;
    });

    assertEquals(nextCalled, true);
    assertEquals(result, undefined);
  } finally {
    restoreFetch();
  }
});

Deno.test("permissionMiddleware — blocks unauthorized request with 403", async () => {
  mockFetch(() =>
    new Response(JSON.stringify({ allowed: false }), { status: 200 })
  );

  try {
    const { ctx } = createMockContext({
      method: "GET",
      path: "/api/files/550e8400-e29b-41d4-a716-446655440000",
      identity: { id: "user-1" },
    });

    let nextCalled = false;
    // deno-lint-ignore no-explicit-any
    const result = await permissionMiddleware(ctx as any, async () => {
      nextCalled = true;
    });

    assertEquals(nextCalled, false);
    assertEquals(result instanceof Response, true);
    assertEquals(result!.status, 403);
  } finally {
    restoreFetch();
  }
});

Deno.test("permissionMiddleware — returns 401 when no identity", async () => {
  try {
    const { ctx } = createMockContext({
      method: "GET",
      path: "/api/files/550e8400-e29b-41d4-a716-446655440000",
      identity: null,
    });

    let nextCalled = false;
    // deno-lint-ignore no-explicit-any
    const result = await permissionMiddleware(ctx as any, async () => {
      nextCalled = true;
    });

    assertEquals(nextCalled, false);
    assertEquals(result instanceof Response, true);
    assertEquals(result!.status, 401);
  } finally {
    restoreFetch();
  }
});

Deno.test("permissionMiddleware — passes through for list operations (no ID)", async () => {
  try {
    const { ctx } = createMockContext({
      method: "GET",
      path: "/api/files",
      identity: { id: "user-1" },
    });

    let nextCalled = false;
    // deno-lint-ignore no-explicit-any
    await permissionMiddleware(ctx as any, async () => {
      nextCalled = true;
    });

    assertEquals(nextCalled, true);
  } finally {
    restoreFetch();
  }
});

Deno.test("permissionMiddleware — checks 'read' for GET", async () => {
  let checkedRelation = "";
  mockFetch((_url, init) => {
    const body = JSON.parse(init?.body as string);
    checkedRelation = body.relation;
    return new Response(JSON.stringify({ allowed: true }), { status: 200 });
  });

  try {
    const { ctx } = createMockContext({
      method: "GET",
      path: "/api/files/550e8400-e29b-41d4-a716-446655440000",
      identity: { id: "user-1" },
    });

    // deno-lint-ignore no-explicit-any
    await permissionMiddleware(ctx as any, async () => {});
    assertEquals(checkedRelation, "read");
  } finally {
    restoreFetch();
  }
});

Deno.test("permissionMiddleware — checks 'write' for PUT", async () => {
  let checkedRelation = "";
  mockFetch((_url, init) => {
    const body = JSON.parse(init?.body as string);
    checkedRelation = body.relation;
    return new Response(JSON.stringify({ allowed: true }), { status: 200 });
  });

  try {
    const { ctx } = createMockContext({
      method: "PUT",
      path: "/api/files/550e8400-e29b-41d4-a716-446655440000",
      identity: { id: "user-1" },
    });

    // deno-lint-ignore no-explicit-any
    await permissionMiddleware(ctx as any, async () => {});
    assertEquals(checkedRelation, "write");
  } finally {
    restoreFetch();
  }
});

Deno.test("permissionMiddleware — checks 'write' for POST", async () => {
  let checkedRelation = "";
  mockFetch((_url, init) => {
    const body = JSON.parse(init?.body as string);
    checkedRelation = body.relation;
    return new Response(JSON.stringify({ allowed: true }), { status: 200 });
  });

  try {
    const { ctx } = createMockContext({
      method: "POST",
      path: "/api/files/550e8400-e29b-41d4-a716-446655440000",
      identity: { id: "user-1" },
    });

    // deno-lint-ignore no-explicit-any
    await permissionMiddleware(ctx as any, async () => {});
    assertEquals(checkedRelation, "write");
  } finally {
    restoreFetch();
  }
});

Deno.test("permissionMiddleware — checks 'write' for PATCH", async () => {
  let checkedRelation = "";
  mockFetch((_url, init) => {
    const body = JSON.parse(init?.body as string);
    checkedRelation = body.relation;
    return new Response(JSON.stringify({ allowed: true }), { status: 200 });
  });

  try {
    const { ctx } = createMockContext({
      method: "PATCH",
      path: "/api/files/550e8400-e29b-41d4-a716-446655440000",
      identity: { id: "user-1" },
    });

    // deno-lint-ignore no-explicit-any
    await permissionMiddleware(ctx as any, async () => {});
    assertEquals(checkedRelation, "write");
  } finally {
    restoreFetch();
  }
});

Deno.test("permissionMiddleware — checks 'delete' for DELETE", async () => {
  let checkedRelation = "";
  mockFetch((_url, init) => {
    const body = JSON.parse(init?.body as string);
    checkedRelation = body.relation;
    return new Response(JSON.stringify({ allowed: true }), { status: 200 });
  });

  try {
    const { ctx } = createMockContext({
      method: "DELETE",
      path: "/api/files/550e8400-e29b-41d4-a716-446655440000",
      identity: { id: "user-1" },
    });

    // deno-lint-ignore no-explicit-any
    await permissionMiddleware(ctx as any, async () => {});
    assertEquals(checkedRelation, "delete");
  } finally {
    restoreFetch();
  }
});

Deno.test("permissionMiddleware — uses 'folders' namespace for folder routes", async () => {
  let checkedNamespace = "";
  mockFetch((_url, init) => {
    const body = JSON.parse(init?.body as string);
    checkedNamespace = body.namespace;
    return new Response(JSON.stringify({ allowed: true }), { status: 200 });
  });

  try {
    const { ctx } = createMockContext({
      method: "GET",
      path: "/api/folders/550e8400-e29b-41d4-a716-446655440000",
      identity: { id: "user-1" },
    });

    // deno-lint-ignore no-explicit-any
    await permissionMiddleware(ctx as any, async () => {});
    assertEquals(checkedNamespace, "folders");
  } finally {
    restoreFetch();
  }
});

Deno.test("permissionMiddleware — uses 'files' namespace for file routes", async () => {
  let checkedNamespace = "";
  mockFetch((_url, init) => {
    const body = JSON.parse(init?.body as string);
    checkedNamespace = body.namespace;
    return new Response(JSON.stringify({ allowed: true }), { status: 200 });
  });

  try {
    const { ctx } = createMockContext({
      method: "GET",
      path: "/api/files/550e8400-e29b-41d4-a716-446655440000",
      identity: { id: "user-1" },
    });

    // deno-lint-ignore no-explicit-any
    await permissionMiddleware(ctx as any, async () => {});
    assertEquals(checkedNamespace, "files");
  } finally {
    restoreFetch();
  }
});

// ── writeFilePermissions tests ───────────────────────────────────────────────

Deno.test("writeFilePermissions — creates owner tuple", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];

  mockFetch((url, init) => {
    calls.push({ url, body: JSON.parse(init?.body as string) });
    return new Response("{}", { status: 201 });
  });

  try {
    await writeFilePermissions("file-1", "user-1");
    assertEquals(calls.length, 1);
    assertEquals(calls[0].body.namespace, "files");
    assertEquals(calls[0].body.object, "file-1");
    assertEquals(calls[0].body.relation, "owners");
    assertEquals(calls[0].body.subject_id, "user-1");
  } finally {
    restoreFetch();
  }
});

Deno.test("writeFilePermissions — creates owner + parent tuples", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];

  mockFetch((url, init) => {
    calls.push({ url, body: JSON.parse(init?.body as string) });
    return new Response("{}", { status: 201 });
  });

  try {
    await writeFilePermissions("file-1", "user-1", "folder-2");
    assertEquals(calls.length, 2);
    assertEquals(calls[0].body.relation, "owners");
    assertEquals(calls[1].body.relation, "parents");
    assertEquals(calls[1].body.subject_set, {
      namespace: "folders",
      object: "folder-2",
      relation: "",
    });
  } finally {
    restoreFetch();
  }
});

// ── writeFolderPermissions tests ─────────────────────────────────────────────

Deno.test("writeFolderPermissions — creates owner only (no parent, no bucket)", async () => {
  const calls: { body: Record<string, unknown> }[] = [];

  mockFetch((_url, init) => {
    calls.push({ body: JSON.parse(init?.body as string) });
    return new Response("{}", { status: 201 });
  });

  try {
    await writeFolderPermissions("folder-1", "user-1");
    assertEquals(calls.length, 1);
    assertEquals(calls[0].body.namespace, "folders");
    assertEquals(calls[0].body.relation, "owners");
    assertEquals(calls[0].body.subject_id, "user-1");
  } finally {
    restoreFetch();
  }
});

Deno.test("writeFolderPermissions — creates owner + parent folder tuples", async () => {
  const calls: { body: Record<string, unknown> }[] = [];

  mockFetch((_url, init) => {
    calls.push({ body: JSON.parse(init?.body as string) });
    return new Response("{}", { status: 201 });
  });

  try {
    await writeFolderPermissions("folder-1", "user-1", "parent-folder-2");
    assertEquals(calls.length, 2);
    assertEquals(calls[0].body.relation, "owners");
    assertEquals(calls[1].body.relation, "parents");
    assertEquals(calls[1].body.subject_set, {
      namespace: "folders",
      object: "parent-folder-2",
      relation: "",
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("writeFolderPermissions — creates owner + bucket parent", async () => {
  const calls: { body: Record<string, unknown> }[] = [];

  mockFetch((_url, init) => {
    calls.push({ body: JSON.parse(init?.body as string) });
    return new Response("{}", { status: 201 });
  });

  try {
    await writeFolderPermissions("folder-1", "user-1", undefined, "bucket-1");
    assertEquals(calls.length, 2);
    assertEquals(calls[0].body.namespace, "folders");
    assertEquals(calls[0].body.relation, "owners");
    assertEquals(calls[1].body.subject_set, {
      namespace: "buckets",
      object: "bucket-1",
      relation: "",
    });
  } finally {
    restoreFetch();
  }
});

Deno.test("writeFolderPermissions — parentFolderId takes priority over bucketId", async () => {
  const calls: { body: Record<string, unknown> }[] = [];

  mockFetch((_url, init) => {
    calls.push({ body: JSON.parse(init?.body as string) });
    return new Response("{}", { status: 201 });
  });

  try {
    await writeFolderPermissions("folder-1", "user-1", "parent-folder", "bucket-1");
    assertEquals(calls.length, 2);
    // Should use parent folder, not bucket
    const subjectSet = calls[1].body.subject_set as Record<string, string>;
    assertEquals(subjectSet.namespace, "folders");
    assertEquals(subjectSet.object, "parent-folder");
  } finally {
    restoreFetch();
  }
});

// ── deleteFilePermissions tests ──────────────────────────────────────────────

Deno.test("deleteFilePermissions — lists and batch-deletes all tuples", async () => {
  let batchBody: unknown[] = [];

  mockFetch((url, init) => {
    // listRelationships calls
    if (url.includes("/relation-tuples?") && (!init?.method || init?.method === "GET")) {
      const u = new URL(url);
      const relation = u.searchParams.get("relation");
      if (relation === "owners") {
        return new Response(
          JSON.stringify({
            relation_tuples: [
              { namespace: "files", object: "file-1", relation: "owners", subject_id: "user-1" },
            ],
          }),
          { status: 200 },
        );
      }
      if (relation === "viewers") {
        return new Response(
          JSON.stringify({
            relation_tuples: [
              { namespace: "files", object: "file-1", relation: "viewers", subject_id: "user-2" },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ relation_tuples: [] }), { status: 200 });
    }

    // batchWriteRelationships (PATCH)
    if (init?.method === "PATCH") {
      batchBody = JSON.parse(init?.body as string);
      return new Response(null, { status: 204 });
    }

    return new Response("", { status: 200 });
  });

  try {
    await deleteFilePermissions("file-1");
    // Should have collected 2 tuples (owners + viewers) and batch-deleted
    assertEquals(batchBody.length, 2);
    assertEquals((batchBody[0] as Record<string, unknown>).action, "delete");
    assertEquals((batchBody[1] as Record<string, unknown>).action, "delete");
  } finally {
    restoreFetch();
  }
});

Deno.test("deleteFilePermissions — no-op when file has no tuples", async () => {
  let patchCalled = false;

  mockFetch((url, init) => {
    if (url.includes("/relation-tuples?")) {
      return new Response(JSON.stringify({ relation_tuples: [] }), { status: 200 });
    }
    if (init?.method === "PATCH") {
      patchCalled = true;
      return new Response(null, { status: 204 });
    }
    return new Response("", { status: 200 });
  });

  try {
    await deleteFilePermissions("file-no-tuples");
    assertEquals(patchCalled, false);
  } finally {
    restoreFetch();
  }
});

// ── moveFilePermissions tests ────────────────────────────────────────────────

Deno.test("moveFilePermissions — deletes old parent and inserts new", async () => {
  let batchBody: unknown[] = [];

  mockFetch((url, init) => {
    // listRelationships for existing parents
    if (url.includes("/relation-tuples?") && (!init?.method || init?.method === "GET")) {
      return new Response(
        JSON.stringify({
          relation_tuples: [
            {
              namespace: "files",
              object: "file-1",
              relation: "parents",
              subject_set: { namespace: "folders", object: "old-folder", relation: "" },
            },
          ],
        }),
        { status: 200 },
      );
    }

    // batchWriteRelationships
    if (init?.method === "PATCH") {
      batchBody = JSON.parse(init?.body as string);
      return new Response(null, { status: 204 });
    }

    return new Response("", { status: 200 });
  });

  try {
    await moveFilePermissions("file-1", "new-folder");
    // Should have 2 patches: delete old parent + insert new parent
    assertEquals(batchBody.length, 2);
    assertEquals((batchBody[0] as Record<string, unknown>).action, "delete");
    assertEquals((batchBody[1] as Record<string, unknown>).action, "insert");
    const insertTuple = (batchBody[1] as Record<string, Record<string, unknown>>).relation_tuple;
    assertEquals(insertTuple.object, "file-1");
    assertEquals(insertTuple.relation, "parents");
    const subjectSet = insertTuple.subject_set as Record<string, string>;
    assertEquals(subjectSet.namespace, "folders");
    assertEquals(subjectSet.object, "new-folder");
  } finally {
    restoreFetch();
  }
});

Deno.test("moveFilePermissions — works when file has no existing parent", async () => {
  let batchBody: unknown[] = [];

  mockFetch((url, init) => {
    if (url.includes("/relation-tuples?")) {
      return new Response(JSON.stringify({ relation_tuples: [] }), { status: 200 });
    }
    if (init?.method === "PATCH") {
      batchBody = JSON.parse(init?.body as string);
      return new Response(null, { status: 204 });
    }
    return new Response("", { status: 200 });
  });

  try {
    await moveFilePermissions("file-1", "new-folder");
    assertEquals(batchBody.length, 1);
    assertEquals((batchBody[0] as Record<string, unknown>).action, "insert");
  } finally {
    restoreFetch();
  }
});

// ── filterByPermission tests ─────────────────────────────────────────────────

Deno.test("filterByPermission — returns only allowed files", async () => {
  const allowedIds = new Set(["file-1", "file-3"]);

  mockFetch((_url, init) => {
    const body = JSON.parse(init?.body as string);
    const allowed = allowedIds.has(body.object);
    return new Response(JSON.stringify({ allowed }), { status: 200 });
  });

  try {
    const files = [
      { id: "file-1", is_folder: false },
      { id: "file-2", is_folder: false },
      { id: "file-3", is_folder: false },
    ];

    const result = await filterByPermission(files, "user-1", "read");
    assertEquals(result.length, 2);
    assertEquals(result[0].id, "file-1");
    assertEquals(result[1].id, "file-3");
  } finally {
    restoreFetch();
  }
});

Deno.test("filterByPermission — uses 'folders' namespace for folders", async () => {
  const checkedNamespaces: string[] = [];

  mockFetch((_url, init) => {
    const body = JSON.parse(init?.body as string);
    checkedNamespaces.push(body.namespace);
    return new Response(JSON.stringify({ allowed: true }), { status: 200 });
  });

  try {
    const items = [
      { id: "file-1", is_folder: false },
      { id: "folder-1", is_folder: true },
    ];

    await filterByPermission(items, "user-1", "read");
    assertEquals(checkedNamespaces.includes("files"), true);
    assertEquals(checkedNamespaces.includes("folders"), true);
  } finally {
    restoreFetch();
  }
});

Deno.test("filterByPermission — returns empty array when none allowed", async () => {
  mockFetch(() =>
    new Response(JSON.stringify({ allowed: false }), { status: 200 })
  );

  try {
    const files = [
      { id: "file-1", is_folder: false },
      { id: "file-2", is_folder: false },
    ];

    const result = await filterByPermission(files, "user-1", "read");
    assertEquals(result.length, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test("filterByPermission — handles empty input array", async () => {
  try {
    const result = await filterByPermission([], "user-1", "read");
    assertEquals(result.length, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test("filterByPermission — items without is_folder use 'files' namespace", async () => {
  let checkedNamespace = "";

  mockFetch((_url, init) => {
    const body = JSON.parse(init?.body as string);
    checkedNamespace = body.namespace;
    return new Response(JSON.stringify({ allowed: true }), { status: 200 });
  });

  try {
    const items = [{ id: "item-1" }];
    await filterByPermission(items, "user-1", "read");
    assertEquals(checkedNamespace, "files");
  } finally {
    restoreFetch();
  }
});
