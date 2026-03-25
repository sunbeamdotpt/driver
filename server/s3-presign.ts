/**
 * Pre-signed URL generation for S3 (AWS Signature V4 query-string auth).
 * Supports single-object GET/PUT and multipart upload lifecycle.
 */

import {
  ACCESS_KEY,
  BUCKET,
  getSigningKey,
  hmacSha256,
  REGION,
  SECRET_KEY,
  SEAWEEDFS_S3_URL,
  sha256Hex,
  toHex,
} from "./s3.ts";

const encoder = new TextEncoder();

/**
 * Build a pre-signed URL using AWS SigV4 query-string signing.
 */
export async function presignUrl(
  method: string,
  key: string,
  expiresIn: number,
  extraQuery?: Record<string, string>,
  extraSignedHeaders?: Record<string, string>,
): Promise<string> {
  const url = new URL(`/${BUCKET}/${key}`, SEAWEEDFS_S3_URL);
  const now = new Date();
  const dateStamp =
    now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const shortDate = dateStamp.slice(0, 8);
  const scope = `${shortDate}/${REGION}/s3/aws4_request`;

  // Query parameters required for pre-signed URL
  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${ACCESS_KEY}/${scope}`);
  url.searchParams.set("X-Amz-Date", dateStamp);
  url.searchParams.set("X-Amz-Expires", String(expiresIn));

  // Extra query params (for multipart etc.)
  if (extraQuery) {
    for (const [k, v] of Object.entries(extraQuery)) {
      url.searchParams.set(k, v);
    }
  }

  // Headers to sign
  const headers: Record<string, string> = {
    host: url.host,
    ...extraSignedHeaders,
  };
  const signedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const signedHeadersStr = signedHeaderKeys.join(";");
  url.searchParams.set("X-Amz-SignedHeaders", signedHeadersStr);

  // Sort query params for canonical request
  const sortedParams = [...url.searchParams.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );
  const canonicalQs = sortedParams
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
    )
    .join("&");

  const canonicalHeaders =
    signedHeaderKeys
      .map((k) => {
        const originalKey = Object.keys(headers).find(
          (h) => h.toLowerCase() === k,
        )!;
        return `${k}:${headers[originalKey]}`;
      })
      .join("\n") + "\n";

  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQs,
    canonicalHeaders,
    signedHeadersStr,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    dateStamp,
    scope,
    await sha256Hex(encoder.encode(canonicalRequest)),
  ].join("\n");

  const signingKey = await getSigningKey(SECRET_KEY, shortDate, REGION);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  url.searchParams.set("X-Amz-Signature", signature);

  return url.toString();
}

// ── Public helpers ──────────────────────────────────────────────────────────

const DEFAULT_EXPIRES = 3600; // 1 hour

export function presignGetUrl(
  key: string,
  expiresIn = DEFAULT_EXPIRES,
): Promise<string> {
  return presignUrl("GET", key, expiresIn);
}

export function presignPutUrl(
  key: string,
  contentType: string,
  expiresIn = DEFAULT_EXPIRES,
): Promise<string> {
  return presignUrl("PUT", key, expiresIn, undefined, {
    "content-type": contentType,
  });
}

// ── Multipart upload ────────────────────────────────────────────────────────

export async function createMultipartUpload(
  key: string,
  contentType: string,
): Promise<string> {
  // POST /{bucket}/{key}?uploads to initiate
  const url = new URL(`/${BUCKET}/${key}`, SEAWEEDFS_S3_URL);
  url.searchParams.set("uploads", "");

  const headers: Record<string, string> = {
    host: url.host,
    "content-type": contentType,
  };
  const bodyHash = await sha256Hex(new Uint8Array(0));

  // We need to import signRequest from s3.ts
  const { signRequest } = await import("./s3.ts");
  await signRequest("POST", url, headers, bodyHash);

  const resp = await fetch(url.toString(), {
    method: "POST",
    headers,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`CreateMultipartUpload failed ${resp.status}: ${text}`);
  }

  const xml = await resp.text();
  const uploadId = xml.match(/<UploadId>(.*?)<\/UploadId>/)?.[1];
  if (!uploadId) {
    throw new Error("No UploadId in CreateMultipartUpload response");
  }
  return uploadId;
}

export function presignUploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn = DEFAULT_EXPIRES,
): Promise<string> {
  return presignUrl("PUT", key, expiresIn, {
    uploadId,
    partNumber: String(partNumber),
  });
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const url = new URL(`/${BUCKET}/${key}`, SEAWEEDFS_S3_URL);
  url.searchParams.set("uploadId", uploadId);

  const xmlParts = parts
    .map(
      (p) =>
        `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`,
    )
    .join("");
  const body = encoder.encode(
    `<CompleteMultipartUpload>${xmlParts}</CompleteMultipartUpload>`,
  );

  const headers: Record<string, string> = {
    host: url.host,
    "content-type": "application/xml",
  };
  const bodyHash = await sha256Hex(body);

  const { signRequest } = await import("./s3.ts");
  await signRequest("POST", url, headers, bodyHash);

  const resp = await fetch(url.toString(), {
    method: "POST",
    headers,
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`CompleteMultipartUpload failed ${resp.status}: ${text}`);
  }
  await resp.text();
}
