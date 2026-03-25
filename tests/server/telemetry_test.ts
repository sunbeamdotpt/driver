/**
 * Tests for the telemetry module.
 *
 * These tests run with OTEL_ENABLED=false (the default) to verify
 * that the no-op / graceful-degradation path works correctly, and
 * that the public API surface behaves as expected.
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "hono";
import {
  tracingMiddleware,
  metricsMiddleware,
  withSpan,
  traceDbQuery,
  OTEL_ENABLED,
  shutdown,
} from "../../server/telemetry.ts";

// ---------------------------------------------------------------------------
// Sanity: OTEL_ENABLED should be false in the test environment
// ---------------------------------------------------------------------------

Deno.test("OTEL_ENABLED is false by default", () => {
  assertEquals(OTEL_ENABLED, false);
});

// ---------------------------------------------------------------------------
// Middleware no-op behaviour when OTEL_ENABLED = false
// ---------------------------------------------------------------------------

Deno.test("tracingMiddleware passes through when OTEL disabled", async () => {
  const app = new Hono();
  app.use("/*", tracingMiddleware);
  app.get("/ping", (c) => c.text("pong"));

  const res = await app.request("/ping");
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "pong");
});

Deno.test("metricsMiddleware passes through when OTEL disabled", async () => {
  const app = new Hono();
  app.use("/*", metricsMiddleware);
  app.get("/ping", (c) => c.text("pong"));

  const res = await app.request("/ping");
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "pong");
});

Deno.test("both middlewares together pass through when OTEL disabled", async () => {
  const app = new Hono();
  app.use("/*", tracingMiddleware);
  app.use("/*", metricsMiddleware);
  app.get("/hello", (c) => c.json({ msg: "world" }));

  const res = await app.request("/hello");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.msg, "world");
});

// ---------------------------------------------------------------------------
// withSpan utility — no-op when disabled
// ---------------------------------------------------------------------------

Deno.test("withSpan executes the function and returns its result when OTEL disabled", async () => {
  const result = await withSpan("test.span", { key: "val" }, async (_span) => {
    return 42;
  });
  assertEquals(result, 42);
});

Deno.test("withSpan propagates errors from the wrapped function", async () => {
  let caught = false;
  try {
    await withSpan("test.error", {}, async () => {
      throw new Error("boom");
    });
  } catch (e) {
    caught = true;
    assertEquals((e as Error).message, "boom");
  }
  assertEquals(caught, true);
});

Deno.test("withSpan provides a span object to the callback", async () => {
  await withSpan("test.span_object", {}, async (span) => {
    assertExists(span);
    // The no-op span should have standard methods
    assertEquals(typeof span.end, "function");
    assertEquals(typeof span.setAttribute, "function");
  });
});

// ---------------------------------------------------------------------------
// traceDbQuery utility — no-op when disabled
// ---------------------------------------------------------------------------

Deno.test("traceDbQuery executes the function and returns result", async () => {
  const result = await traceDbQuery("SELECT 1", async () => {
    return [{ count: 1 }];
  });
  assertEquals(result, [{ count: 1 }]);
});

Deno.test("traceDbQuery propagates errors", async () => {
  let caught = false;
  try {
    await traceDbQuery("SELECT bad", async () => {
      throw new Error("db error");
    });
  } catch (e) {
    caught = true;
    assertEquals((e as Error).message, "db error");
  }
  assertEquals(caught, true);
});

// ---------------------------------------------------------------------------
// Middleware does not break error responses
// ---------------------------------------------------------------------------

Deno.test("tracingMiddleware handles 404 routes gracefully", async () => {
  const app = new Hono();
  app.use("/*", tracingMiddleware);
  app.use("/*", metricsMiddleware);
  // No routes registered for /missing

  const res = await app.request("/missing");
  assertEquals(res.status, 404);
});

Deno.test("tracingMiddleware handles handler errors gracefully", async () => {
  const app = new Hono();
  app.use("/*", tracingMiddleware);
  app.use("/*", metricsMiddleware);
  app.get("/explode", () => {
    throw new Error("handler error");
  });

  const res = await app.request("/explode");
  // Hono returns 500 for unhandled errors
  assertEquals(res.status, 500);
});

// ---------------------------------------------------------------------------
// shutdown is safe when SDK was never initialised
// ---------------------------------------------------------------------------

Deno.test("shutdown is a no-op when OTEL disabled", async () => {
  // Should not throw
  await shutdown();
});

// ---------------------------------------------------------------------------
// Middleware preserves response headers from downstream handlers
// ---------------------------------------------------------------------------

Deno.test("tracingMiddleware preserves custom response headers", async () => {
  const app = new Hono();
  app.use("/*", tracingMiddleware);
  app.get("/custom", (c) => {
    c.header("X-Custom", "test-value");
    return c.text("ok");
  });

  const res = await app.request("/custom");
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("X-Custom"), "test-value");
});
