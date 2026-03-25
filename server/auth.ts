import type { Context, Next } from "hono";

const KRATOS_PUBLIC_URL =
  Deno.env.get("KRATOS_PUBLIC_URL") ??
  "http://kratos-public.ory.svc.cluster.local:80";
const PUBLIC_URL = Deno.env.get("PUBLIC_URL") ?? "http://localhost:3000";
const TEST_MODE = Deno.env.get("DRIVER_TEST_MODE") === "1";
if (TEST_MODE && Deno.env.get("DEPLOYMENT_ENVIRONMENT") === "production") {
  throw new Error("DRIVER_TEST_MODE=1 is forbidden when DEPLOYMENT_ENVIRONMENT=production");
}
if (TEST_MODE) {
  console.warn("⚠️  DRIVER_TEST_MODE is ON — authentication is bypassed. Do not use in production.");
}
const TEST_IDENTITY: SessionInfo = {
  id: "e2e-test-user-00000000",
  email: "e2e@test.local",
  name: "E2E Test User",
  picture: undefined,
  session: { active: true },
};

// Routes that require no authentication
const PUBLIC_ROUTES = new Set([
  "/health",
]);

// Routes with their own auth (WOPI access tokens)
const TOKEN_AUTH_PREFIXES = ["/wopi/"];

export interface SessionInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  session: unknown;
}

function extractSessionCookie(cookieHeader: string): string | null {
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    if (
      cookie.startsWith("ory_session_") ||
      cookie.startsWith("ory_kratos_session")
    ) {
      return cookie;
    }
  }
  return null;
}

export async function getSession(
  cookieHeader: string,
): Promise<{ info: SessionInfo | null; needsAal2: boolean; redirectTo?: string }> {
  const sessionCookie = extractSessionCookie(cookieHeader);
  if (!sessionCookie) return { info: null, needsAal2: false };

  try {
    const resp = await fetch(`${KRATOS_PUBLIC_URL}/sessions/whoami`, {
      headers: { cookie: sessionCookie },
    });
    if (resp.status === 403) {
      const body = await resp.json().catch(() => null);
      const redirectTo = body?.redirect_browser_to ?? body?.error?.details?.redirect_browser_to;
      return { info: null, needsAal2: true, redirectTo };
    }
    if (resp.status !== 200) return { info: null, needsAal2: false };
    const session = await resp.json();
    const traits = session?.identity?.traits ?? {};
    // Support both OIDC-standard (given_name/family_name) and legacy (name.first/name.last)
    const givenName = traits.given_name ?? traits.name?.first ?? "";
    const familyName = traits.family_name ?? traits.name?.last ?? "";
    const fullName = [givenName, familyName].filter(Boolean).join(" ") || traits.email || "";
    return {
      info: {
        id: session?.identity?.id ?? "",
        email: traits.email ?? "",
        name: fullName,
        picture: traits.picture,
        session,
      },
      needsAal2: false,
    };
  } catch {
    return { info: null, needsAal2: false };
  }
}

function isPublicRoute(path: string): boolean {
  for (const route of PUBLIC_ROUTES) {
    if (path === route || path.startsWith(route + "/")) return true;
  }
  // Static assets
  if (path.startsWith("/assets/") || path === "/index.html" || path === "/favicon.ico") return true;
  return false;
}

function isTokenAuthRoute(path: string): boolean {
  for (const prefix of TOKEN_AUTH_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

export async function authMiddleware(c: Context, next: Next) {
  const path = c.req.path;

  // Public routes: no auth needed
  if (isPublicRoute(path)) return await next();

  // WOPI routes: handled by their own token auth
  if (isTokenAuthRoute(path)) return await next();

  // Test mode: inject a fake identity for E2E testing
  if (TEST_MODE) {
    c.set("identity", TEST_IDENTITY);
    return await next();
  }

  // All other routes need a Kratos session
  const cookieHeader = c.req.header("cookie") ?? "";
  const { info: sessionInfo, needsAal2, redirectTo } = await getSession(cookieHeader);

  if (needsAal2) {
    if (path.startsWith("/api/") || c.req.header("accept")?.includes("application/json")) {
      return c.json({ error: "AAL2 required", redirectTo }, 403);
    }
    if (redirectTo) return c.redirect(redirectTo, 302);
    const returnTo = encodeURIComponent(PUBLIC_URL + path);
    return c.redirect(
      `/kratos/self-service/login/browser?aal=aal2&return_to=${returnTo}`,
      302,
    );
  }

  if (!sessionInfo) {
    if (path.startsWith("/api/") || c.req.header("accept")?.includes("application/json")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const loginUrl = `${PUBLIC_URL}/login?return_to=${encodeURIComponent(PUBLIC_URL + path)}`;
    return c.redirect(loginUrl, 302);
  }

  c.set("identity", sessionInfo);
  await next();
}

/** GET /api/auth/session */
export async function sessionHandler(c: Context): Promise<Response> {
  if (TEST_MODE) {
    const { session, ...user } = TEST_IDENTITY;
    return c.json({ session, user });
  }

  const cookieHeader = c.req.header("cookie") ?? "";
  const { info, needsAal2, redirectTo } = await getSession(cookieHeader);

  if (needsAal2) return c.json({ error: "AAL2 required", needsAal2: true, redirectTo }, 403);
  if (!info) return c.json({ error: "Unauthorized" }, 401);

  const { session, ...user } = info;
  return c.json({ session, user });
}
