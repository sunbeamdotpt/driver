/**
 * OpenTelemetry instrumentation for the Drive service.
 *
 * When OTEL_ENABLED=true, initialises the SDK with OTLP export and exposes:
 *   - tracingMiddleware  — Hono middleware that creates per-request spans
 *   - metricsMiddleware  — Hono middleware that records HTTP metrics
 *   - withSpan           — utility to wrap any async function in a child span
 *   - traceDbQuery       — utility to wrap a DB query with a span
 *   - shutdown           — graceful SDK shutdown
 *
 * When OTEL_ENABLED is not "true" every export is a lightweight no-op.
 */

import { trace, context, SpanKind, SpanStatusCode, metrics, propagation } from "npm:@opentelemetry/api@1.9.0";
import type { Span, Tracer, Context as OtelContext } from "npm:@opentelemetry/api@1.9.0";
import type { Context, Next } from "hono";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OTEL_ENABLED = Deno.env.get("OTEL_ENABLED") === "true";
const OTEL_SERVICE_NAME = Deno.env.get("OTEL_SERVICE_NAME") ?? "drive";
const OTEL_ENDPOINT =
  Deno.env.get("OTEL_EXPORTER_OTLP_ENDPOINT") ??
  "http://localhost:4317";
const OTEL_SAMPLER = Deno.env.get("OTEL_TRACES_SAMPLER") ?? "parentbased_traceidratio";
const OTEL_SAMPLER_ARG = parseFloat(Deno.env.get("OTEL_TRACES_SAMPLER_ARG") ?? "1.0");
const DEPLOYMENT_ENV = Deno.env.get("DEPLOYMENT_ENVIRONMENT") ?? "development";
const SERVICE_VERSION = Deno.env.get("SERVICE_VERSION") ?? "0.0.0";

// Re-export so tests/other modules can check
export { OTEL_ENABLED };

// ---------------------------------------------------------------------------
// SDK initialisation (only when enabled)
// ---------------------------------------------------------------------------

let _shutdownFn: (() => Promise<void>) | null = null;
let _tracer: Tracer | null = null;

// Metric instruments (initialised lazily)
let _requestDuration: ReturnType<ReturnType<typeof metrics.getMeter>["createHistogram"]> | null = null;
let _activeRequests: ReturnType<ReturnType<typeof metrics.getMeter>["createUpDownCounter"]> | null = null;
let _requestTotal: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]> | null = null;

async function initSdk(): Promise<void> {
  // Dynamic imports so the heavy SDK packages are never loaded when disabled
  const { NodeSDK } = await import("npm:@opentelemetry/sdk-node@0.57.2");
  const { OTLPTraceExporter } = await import("npm:@opentelemetry/exporter-trace-otlp-grpc@0.57.2");
  const { OTLPMetricExporter } = await import("npm:@opentelemetry/exporter-metrics-otlp-grpc@0.57.2");
  const { PeriodicExportingMetricReader } = await import("npm:@opentelemetry/sdk-metrics@1.30.1");
  const { Resource } = await import("npm:@opentelemetry/resources@1.30.1");
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
    "npm:@opentelemetry/semantic-conventions@1.28.0"
  );
  const { ParentBasedSampler, TraceIdRatioBasedSampler, AlwaysOnSampler, AlwaysOffSampler } = await import(
    "npm:@opentelemetry/sdk-trace-base@1.30.1"
  );
  const { W3CTraceContextPropagator } = await import("npm:@opentelemetry/core@1.30.1");

  // Build sampler
  let innerSampler;
  if (OTEL_SAMPLER === "always_on") {
    innerSampler = new AlwaysOnSampler();
  } else if (OTEL_SAMPLER === "always_off") {
    innerSampler = new AlwaysOffSampler();
  } else {
    innerSampler = new TraceIdRatioBasedSampler(OTEL_SAMPLER_ARG);
  }
  const sampler = OTEL_SAMPLER.startsWith("parentbased_")
    ? new ParentBasedSampler({ root: innerSampler })
    : innerSampler;

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: OTEL_SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    "deployment.environment": DEPLOYMENT_ENV,
  });

  const traceExporter = new OTLPTraceExporter({ url: OTEL_ENDPOINT });
  const metricExporter = new OTLPMetricExporter({ url: OTEL_ENDPOINT });
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 15_000,
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    sampler,
  });

  // Set the propagator globally before starting the SDK
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  sdk.start();

  _shutdownFn = () => sdk.shutdown();

  // Grab tracer
  _tracer = trace.getTracer(OTEL_SERVICE_NAME, SERVICE_VERSION);

  // Init metric instruments
  const meter = metrics.getMeter(OTEL_SERVICE_NAME, SERVICE_VERSION);
  _requestDuration = meter.createHistogram("http.server.request.duration", {
    description: "Duration of HTTP server requests",
    unit: "ms",
  });
  _activeRequests = meter.createUpDownCounter("http.server.active_requests", {
    description: "Number of active HTTP requests",
  });
  _requestTotal = meter.createCounter("http.server.request.total", {
    description: "Total HTTP requests",
  });
}

// Kick off init if enabled (fire-and-forget; middleware awaits the promise)
const _initPromise: Promise<void> | null = OTEL_ENABLED ? initSdk() : null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTracer(): Tracer {
  return _tracer ?? trace.getTracer(OTEL_SERVICE_NAME);
}

/**
 * Derive a short route template from the Hono matched route.
 * Falls back to the raw path.
 */
function routeOf(c: Context): string {
  // Hono exposes the matched route pattern via c.req.routePath (Hono v4)
  try {
    // deno-lint-ignore no-explicit-any
    const rp = (c.req as any).routePath;
    if (rp) return rp;
  } catch { /* ignore */ }
  return c.req.path;
}

// ---------------------------------------------------------------------------
// Hono middleware — tracing
// ---------------------------------------------------------------------------

export async function tracingMiddleware(c: Context, next: Next): Promise<void | Response> {
  if (!OTEL_ENABLED) return await next();

  // Ensure SDK is ready
  if (_initPromise) await _initPromise;

  const tracer = getTracer();
  const req = c.req;

  // Extract incoming trace context from request headers
  const carrier: Record<string, string> = {};
  req.raw.headers.forEach((value, key) => {
    carrier[key] = value;
  });
  const parentCtx = propagation.extract(context.active(), carrier);

  const route = routeOf(c);
  const spanName = `${req.method} ${route}`;

  return await tracer.startActiveSpan(
    spanName,
    {
      kind: SpanKind.SERVER,
      attributes: {
        "http.method": req.method,
        "http.url": req.url.replace(/access_token=[^&]+/g, "access_token=REDACTED"),
        "http.route": route,
        "http.user_agent": req.header("user-agent") ?? "",
      },
    },
    parentCtx,
    async (span: Span) => {
      try {
        await next();

        const status = c.res.status;
        span.setAttribute("http.status_code", status);

        // Attach user identity if set by auth middleware
        try {
          const identity = c.get("identity");
          if (identity?.id) {
            span.setAttribute("enduser.id", identity.id);
          }
        } catch { /* identity not set */ }

        if (status >= 500) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${status}` });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }

        // Inject trace context into response headers
        const responseCarrier: Record<string, string> = {};
        propagation.inject(context.active(), responseCarrier);
        for (const [k, v] of Object.entries(responseCarrier)) {
          c.res.headers.set(k, v);
        }
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Hono middleware — metrics
// ---------------------------------------------------------------------------

export async function metricsMiddleware(c: Context, next: Next): Promise<void | Response> {
  if (!OTEL_ENABLED) return await next();
  if (_initPromise) await _initPromise;

  const route = routeOf(c);
  const method = c.req.method;

  _activeRequests?.add(1, { "http.method": method, "http.route": route });
  const start = performance.now();

  try {
    await next();
  } finally {
    const durationMs = performance.now() - start;
    const status = c.res?.status ?? 500;

    _activeRequests?.add(-1, { "http.method": method, "http.route": route });
    _requestDuration?.record(durationMs, {
      "http.method": method,
      "http.route": route,
      "http.status_code": status,
    });
    _requestTotal?.add(1, {
      "http.method": method,
      "http.route": route,
      "http.status_code": status,
    });
  }
}

// ---------------------------------------------------------------------------
// withSpan — wrap any async function in a child span
// ---------------------------------------------------------------------------

/**
 * Run `fn` inside a new child span. Attributes can be set inside `fn` via the
 * span argument. If OTEL is disabled this simply calls `fn` with a no-op span.
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  if (!OTEL_ENABLED) {
    // Provide a no-op span
    const noopSpan = trace.getTracer("noop").startSpan("noop");
    noopSpan.end();
    return await fn(noopSpan);
  }
  if (_initPromise) await _initPromise;

  const tracer = getTracer();
  return await tracer.startActiveSpan(name, { attributes }, async (span: Span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}

// ---------------------------------------------------------------------------
// traceDbQuery — wrap a database call with a span
// ---------------------------------------------------------------------------

/**
 * Wrap a DB query function call with a `db.query` span.
 * `statement` should be the SQL template (no interpolated values).
 */
export async function traceDbQuery<T>(
  statement: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withSpan("db.query", { "db.statement": statement, "db.system": "postgresql" }, async () => {
    return await fn();
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

export async function shutdown(): Promise<void> {
  if (_shutdownFn) await _shutdownFn();
}
