/**
 * JWT-based WOPI access tokens using Web Crypto (HMAC-SHA256).
 */

const TEST_MODE = Deno.env.get("DRIVER_TEST_MODE") === "1";
const WOPI_JWT_SECRET = Deno.env.get("WOPI_JWT_SECRET") ?? (TEST_MODE ? "test-wopi-secret" : "");
if (!WOPI_JWT_SECRET && !TEST_MODE) {
  throw new Error("WOPI_JWT_SECRET must be set in production");
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ── Base64url helpers ───────────────────────────────────────────────────────

function base64urlEncode(data: Uint8Array): string {
  const binString = Array.from(data, (b) => String.fromCharCode(b)).join("");
  return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const binString = atob(s);
  return Uint8Array.from(binString, (c) => c.charCodeAt(0));
}

// ── HMAC helpers ────────────────────────────────────────────────────────────

async function hmacSign(data: Uint8Array, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, data as unknown as BufferSource);
  return new Uint8Array(sig);
}

async function hmacVerify(data: Uint8Array, signature: Uint8Array, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, signature as unknown as BufferSource, data as unknown as BufferSource);
}

// ── Token types ─────────────────────────────────────────────────────────────

export interface WopiTokenPayload {
  /** File UUID */
  fid: string;
  /** User ID (Kratos identity) */
  uid: string;
  /** User display name */
  unm: string;
  /** Can write */
  wr: boolean;
  /** Issued at (unix seconds) */
  iat: number;
  /** Expires at (unix seconds) */
  exp: number;
}

// ── Public API ──────────────────────────────────────────────────────────────

const DEFAULT_EXPIRES_SECONDS = 8 * 3600; // 8 hours

export async function generateWopiToken(
  fileId: string,
  userId: string,
  userName: string,
  canWrite: boolean,
  expiresInSeconds = DEFAULT_EXPIRES_SECONDS,
  secret = WOPI_JWT_SECRET,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: WopiTokenPayload = {
    fid: fileId,
    uid: userId,
    unm: userName,
    wr: canWrite,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = base64urlEncode(
    encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const body = base64urlEncode(
    encoder.encode(JSON.stringify(payload)),
  );
  const sigInput = encoder.encode(`${header}.${body}`);
  const sig = await hmacSign(sigInput, secret);

  return `${header}.${body}.${base64urlEncode(sig)}`;
}

export async function verifyWopiToken(
  token: string,
  secret = WOPI_JWT_SECRET,
): Promise<WopiTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;

  // Verify signature
  const sigInput = encoder.encode(`${header}.${body}`);
  const sigBytes = base64urlDecode(sig);
  const valid = await hmacVerify(sigInput, sigBytes, secret);
  if (!valid) return null;

  // Parse payload
  let payload: WopiTokenPayload;
  try {
    payload = JSON.parse(decoder.decode(base64urlDecode(body)));
  } catch {
    return null;
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return payload;
}
