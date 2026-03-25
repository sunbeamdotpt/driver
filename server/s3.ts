/**
 * S3 client using AWS Signature V4 (Web Crypto API, no external SDK).
 * Generalised from kratos-admin/server/s3.ts to support full CRUD + list + copy.
 */

import { withSpan } from "./telemetry.ts";

const SEAWEEDFS_S3_URL =
  Deno.env.get("SEAWEEDFS_S3_URL") ??
  "http://seaweedfs-filer.storage.svc.cluster.local:8333";
const ACCESS_KEY = Deno.env.get("SEAWEEDFS_ACCESS_KEY") ?? "";
const SECRET_KEY = Deno.env.get("SEAWEEDFS_SECRET_KEY") ?? "";
const BUCKET = Deno.env.get("S3_BUCKET") ?? "sunbeam-driver";
const REGION = Deno.env.get("S3_REGION") ?? "us-east-1";

const encoder = new TextEncoder();

// ── Crypto helpers ──────────────────────────────────────────────────────────

export async function hmacSha256(
  key: ArrayBuffer | Uint8Array,
  data: string,
): Promise<ArrayBuffer> {
  const keyBuf =
    key instanceof Uint8Array
      ? key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength)
      : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return toHex(hash);
}

export function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Signing ────────────────────────────────────────────────────────────────

export async function getSigningKey(
  secretKey: string,
  shortDate: string,
  region: string,
): Promise<ArrayBuffer> {
  let key: ArrayBuffer = await hmacSha256(
    encoder.encode("AWS4" + secretKey),
    shortDate,
  );
  key = await hmacSha256(key, region);
  key = await hmacSha256(key, "s3");
  key = await hmacSha256(key, "aws4_request");
  return key;
}

/**
 * Build canonical query string from URLSearchParams, sorted by key.
 */
function canonicalQueryString(params: URLSearchParams): string {
  const entries = [...params.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );
  return entries
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
    )
    .join("&");
}

export interface SignedHeaders {
  [key: string]: string;
}

export async function signRequest(
  method: string,
  url: URL,
  headers: Record<string, string>,
  bodyHash: string,
  accessKey: string = ACCESS_KEY,
  secretKey: string = SECRET_KEY,
  region: string = REGION,
): Promise<Record<string, string>> {
  const now = new Date();
  const dateStamp =
    now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const shortDate = dateStamp.slice(0, 8);
  const scope = `${shortDate}/${region}/s3/aws4_request`;

  headers["x-amz-date"] = dateStamp;
  headers["x-amz-content-sha256"] = bodyHash;

  const signedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const signedHeaders = signedHeaderKeys.join(";");

  const canonicalHeaders =
    signedHeaderKeys
      .map((k) => {
        const originalKey = Object.keys(headers).find(
          (h) => h.toLowerCase() === k,
        )!;
        return `${k}:${headers[originalKey]}`;
      })
      .join("\n") + "\n";

  const qs = canonicalQueryString(url.searchParams);

  const canonicalRequest = [
    method,
    url.pathname,
    qs,
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    dateStamp,
    scope,
    await sha256Hex(encoder.encode(canonicalRequest)),
  ].join("\n");

  const signingKey = await getSigningKey(secretKey, shortDate, region);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  headers[
    "Authorization"
  ] = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return headers;
}

// ── Low-level S3 request ────────────────────────────────────────────────────

async function s3Fetch(
  method: string,
  path: string,
  opts: {
    query?: Record<string, string>;
    body?: Uint8Array | ReadableStream<Uint8Array> | null;
    contentType?: string;
    extraHeaders?: Record<string, string>;
  } = {},
): Promise<Response> {
  const url = new URL(path, SEAWEEDFS_S3_URL);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    host: url.host,
    ...opts.extraHeaders,
  };
  if (opts.contentType) headers["content-type"] = opts.contentType;

  // For streaming bodies we can't hash upfront; use UNSIGNED-PAYLOAD
  let bodyHash: string;
  let fetchBody: BodyInit | null = null;

  if (opts.body instanceof ReadableStream) {
    bodyHash = "UNSIGNED-PAYLOAD";
    fetchBody = opts.body;
  } else if (opts.body) {
    bodyHash = await sha256Hex(opts.body);
    fetchBody = opts.body as unknown as BodyInit;
  } else {
    bodyHash = await sha256Hex(new Uint8Array(0));
  }

  await signRequest(method, url, headers, bodyHash);

  return fetch(url.toString(), {
    method,
    headers,
    body: fetchBody,
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ListObjectsResult {
  contents: { key: string; lastModified: string; size: number }[];
  commonPrefixes: string[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export async function listObjects(
  prefix: string,
  delimiter?: string,
  maxKeys?: number,
  continuationToken?: string,
): Promise<ListObjectsResult> {
  return withSpan("s3.listObjects", { "s3.prefix": prefix }, async () => {
    const query: Record<string, string> = {
      "list-type": "2",
      prefix,
    };
    if (delimiter) query["delimiter"] = delimiter;
    if (maxKeys) query["max-keys"] = String(maxKeys);
    if (continuationToken) query["continuation-token"] = continuationToken;

    const resp = await s3Fetch("GET", `/${BUCKET}/`, { query });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`ListObjects failed ${resp.status}: ${text}`);

    // Minimal XML parsing (no external deps)
    const contents: ListObjectsResult["contents"] = [];
    const contentMatches = text.matchAll(
      /<Contents>([\s\S]*?)<\/Contents>/g,
    );
    for (const m of contentMatches) {
      const block = m[1];
      const key = block.match(/<Key>(.*?)<\/Key>/)?.[1] ?? "";
      const lastModified =
        block.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] ?? "";
      const size = parseInt(block.match(/<Size>(.*?)<\/Size>/)?.[1] ?? "0", 10);
      contents.push({ key, lastModified, size });
    }

    const commonPrefixes: string[] = [];
    const prefixMatches = text.matchAll(
      /<CommonPrefixes>\s*<Prefix>(.*?)<\/Prefix>\s*<\/CommonPrefixes>/g,
    );
    for (const m of prefixMatches) {
      commonPrefixes.push(m[1]);
    }

    const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(text);
    const nextToken =
      text.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/)?.[1];

    return {
      contents,
      commonPrefixes,
      isTruncated,
      nextContinuationToken: nextToken,
    };
  });
}

export async function headObject(
  key: string,
): Promise<{ contentType: string; contentLength: number; lastModified: string } | null> {
  return withSpan("s3.headObject", { "s3.key": key }, async () => {
    const resp = await s3Fetch("HEAD", `/${BUCKET}/${key}`);
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`HeadObject failed ${resp.status}`);
    return {
      contentType: resp.headers.get("content-type") ?? "application/octet-stream",
      contentLength: parseInt(resp.headers.get("content-length") ?? "0", 10),
      lastModified: resp.headers.get("last-modified") ?? "",
    };
  });
}

export async function getObject(key: string): Promise<Response> {
  return withSpan("s3.getObject", { "s3.key": key }, async () => {
    const resp = await s3Fetch("GET", `/${BUCKET}/${key}`);
    return resp;
  });
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  return withSpan("s3.putObject", { "s3.key": key, "s3.content_type": contentType }, async () => {
    const resp = await s3Fetch("PUT", `/${BUCKET}/${key}`, {
      body,
      contentType,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`PutObject failed ${resp.status}: ${text}`);
    }
    // Drain response body
    await resp.text();
  });
}

export async function deleteObject(key: string): Promise<void> {
  return withSpan("s3.deleteObject", { "s3.key": key }, async () => {
    const resp = await s3Fetch("DELETE", `/${BUCKET}/${key}`);
    if (!resp.ok && resp.status !== 404) {
      const text = await resp.text();
      throw new Error(`DeleteObject failed ${resp.status}: ${text}`);
    }
    await resp.text();
  });
}

export async function copyObject(
  sourceKey: string,
  destKey: string,
): Promise<void> {
  return withSpan("s3.copyObject", { "s3.source_key": sourceKey, "s3.dest_key": destKey }, async () => {
    const resp = await s3Fetch("PUT", `/${BUCKET}/${destKey}`, {
      extraHeaders: {
        "x-amz-copy-source": `/${BUCKET}/${sourceKey}`,
      },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`CopyObject failed ${resp.status}: ${text}`);
    }
    await resp.text();
  });
}

// Re-export config for use in presigning
export {
  ACCESS_KEY,
  BUCKET,
  REGION,
  SECRET_KEY,
  SEAWEEDFS_S3_URL,
};
