import postgres from "postgres";
import { OTEL_ENABLED, withSpan } from "./telemetry.ts";

const DATABASE_URL =
  Deno.env.get("DATABASE_URL") ??
  "postgres://driver:driver@localhost:5432/driver_db";

const _sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

/**
 * Traced SQL tagged-template proxy.
 *
 * When OTEL is enabled every query is wrapped in a `db.query` span whose
 * `db.statement` attribute contains the SQL template (parameters replaced
 * with `$N` placeholders — no user data leaks into traces).
 *
 * When OTEL is disabled this is the raw postgres.js instance.
 */
// deno-lint-ignore no-explicit-any
const sql: typeof _sql = OTEL_ENABLED
  ? new Proxy(_sql, {
      apply(_target, _thisArg, args) {
        // Tagged-template call: sql`SELECT ...`
        const [strings] = args as [TemplateStringsArray, ...unknown[]];
        const statement = Array.isArray(strings)
          ? strings.join("$?")
          : "unknown";
        return withSpan(
          "db.query",
          { "db.statement": statement, "db.system": "postgresql" },
          () => Reflect.apply(_target, _thisArg, args),
        );
      },
    })
  : _sql;

export default sql;
