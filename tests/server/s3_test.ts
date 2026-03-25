/**
 * Tests for S3 signing (canonical request, signature), presign URL format,
 * and HTTP operations (listObjects, headObject, getObject, putObject, deleteObject, copyObject).
 */

import {
  assertEquals,
  assertStringIncludes,
  assertNotEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  hmacSha256,
  sha256Hex,
  toHex,
  getSigningKey,
  signRequest,
  listObjects,
  headObject,
  getObject,
  putObject,
  deleteObject,
  copyObject,
} from "../../server/s3.ts";
import { presignUrl, presignGetUrl, presignPutUrl, createMultipartUpload, presignUploadPart, completeMultipartUpload } from "../../server/s3-presign.ts";

const encoder = new TextEncoder();

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

// ── Crypto helper tests ─────────────────────────────────────────────────────

Deno.test("sha256Hex produces correct hex digest", async () => {
  const hash = await sha256Hex(encoder.encode(""));
  assertEquals(
    hash,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

Deno.test("sha256Hex produces correct hex for 'hello'", async () => {
  const hash = await sha256Hex(encoder.encode("hello"));
  assertEquals(
    hash,
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
});

Deno.test("hmacSha256 produces non-empty output", async () => {
  const result = await hmacSha256(encoder.encode("key"), "data");
  const hex = toHex(result);
  assertNotEquals(hex, "");
  assertEquals(hex.length, 64);
});

Deno.test("toHex converts ArrayBuffer to hex string", () => {
  const buf = new Uint8Array([0, 1, 15, 255]).buffer;
  assertEquals(toHex(buf), "00010fff");
});

// ── Signing key derivation ──────────────────────────────────────────────────

Deno.test("getSigningKey returns 32-byte key", async () => {
  const key = await getSigningKey("testSecret", "20240101", "us-east-1");
  assertEquals(new Uint8Array(key).length, 32);
});

Deno.test("getSigningKey is deterministic for same inputs", async () => {
  const key1 = await getSigningKey("secret", "20240101", "us-east-1");
  const key2 = await getSigningKey("secret", "20240101", "us-east-1");
  assertEquals(toHex(key1), toHex(key2));
});

Deno.test("getSigningKey differs with different dates", async () => {
  const key1 = await getSigningKey("secret", "20240101", "us-east-1");
  const key2 = await getSigningKey("secret", "20240102", "us-east-1");
  assertNotEquals(toHex(key1), toHex(key2));
});

// ── signRequest ─────────────────────────────────────────────────────────────

Deno.test("signRequest adds Authorization, x-amz-date, x-amz-content-sha256 headers", async () => {
  const url = new URL("http://localhost:8333/bucket/test-key");
  const headers: Record<string, string> = { host: "localhost:8333" };
  const bodyHash = await sha256Hex(new Uint8Array(0));

  const signed = await signRequest(
    "GET",
    url,
    headers,
    bodyHash,
    "AKID",
    "SECRET",
    "us-east-1",
  );

  assertStringIncludes(signed["Authorization"], "AWS4-HMAC-SHA256");
  assertStringIncludes(signed["Authorization"], "Credential=AKID/");
  assertStringIncludes(signed["Authorization"], "SignedHeaders=");
  assertStringIncludes(signed["Authorization"], "Signature=");
  assertNotEquals(signed["x-amz-date"], undefined);
  assertNotEquals(signed["x-amz-content-sha256"], undefined);
});

Deno.test("signRequest Authorization contains all required components", async () => {
  const url = new URL("http://s3.example.com/bucket/key");
  const headers: Record<string, string> = {
    host: "s3.example.com",
    "content-type": "application/octet-stream",
  };
  const bodyHash = await sha256Hex(encoder.encode("test body"));

  const signed = await signRequest(
    "PUT",
    url,
    headers,
    bodyHash,
    "MyAccessKey",
    "MySecretKey",
    "eu-west-1",
  );

  const auth = signed["Authorization"];
  assertStringIncludes(auth, "Credential=MyAccessKey/");
  assertStringIncludes(auth, "/eu-west-1/s3/aws4_request");
  assertStringIncludes(auth, "content-type");
  assertStringIncludes(auth, "host");
});

// ── Pre-signed URL format ───────────────────────────────────────────────────

Deno.test("presignUrl produces a valid URL with required query params", async () => {
  const url = await presignUrl("GET", "test/file.txt", 3600);
  const parsed = new URL(url);

  assertStringIncludes(parsed.pathname, "test/file.txt");
  assertNotEquals(parsed.searchParams.get("X-Amz-Algorithm"), null);
  assertEquals(parsed.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assertNotEquals(parsed.searchParams.get("X-Amz-Credential"), null);
  assertNotEquals(parsed.searchParams.get("X-Amz-Date"), null);
  assertEquals(parsed.searchParams.get("X-Amz-Expires"), "3600");
  assertNotEquals(parsed.searchParams.get("X-Amz-SignedHeaders"), null);
  assertNotEquals(parsed.searchParams.get("X-Amz-Signature"), null);
});

Deno.test("presignUrl includes extra query params for multipart", async () => {
  const url = await presignUrl("PUT", "test/file.txt", 3600, {
    uploadId: "abc123",
    partNumber: "1",
  });
  const parsed = new URL(url);

  assertEquals(parsed.searchParams.get("uploadId"), "abc123");
  assertEquals(parsed.searchParams.get("partNumber"), "1");
});

Deno.test("presignUrl signature changes with different expiry", async () => {
  const url1 = await presignUrl("GET", "file.txt", 3600);
  const url2 = await presignUrl("GET", "file.txt", 7200);

  const sig1 = new URL(url1).searchParams.get("X-Amz-Signature");
  const sig2 = new URL(url2).searchParams.get("X-Amz-Signature");
  assertNotEquals(sig1, sig2);
});

// ── presignGetUrl ───────────────────────────────────────────────────────────

Deno.test("presignGetUrl produces URL with GET method params", async () => {
  const url = await presignGetUrl("docs/file.pdf");
  const parsed = new URL(url);
  assertStringIncludes(parsed.pathname, "docs/file.pdf");
  assertEquals(parsed.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assertEquals(parsed.searchParams.get("X-Amz-Expires"), "3600"); // default
  assertNotEquals(parsed.searchParams.get("X-Amz-Signature"), null);
});

Deno.test("presignGetUrl respects custom expiry", async () => {
  const url = await presignGetUrl("file.txt", 600);
  const parsed = new URL(url);
  assertEquals(parsed.searchParams.get("X-Amz-Expires"), "600");
});

// ── presignPutUrl ───────────────────────────────────────────────────────────

Deno.test("presignPutUrl includes content-type in signed headers", async () => {
  const url = await presignPutUrl("upload/new.pdf", "application/pdf");
  const parsed = new URL(url);
  assertStringIncludes(parsed.pathname, "upload/new.pdf");
  assertNotEquals(parsed.searchParams.get("X-Amz-Signature"), null);
  const signedHeaders = parsed.searchParams.get("X-Amz-SignedHeaders") ?? "";
  assertStringIncludes(signedHeaders, "content-type");
});

Deno.test("presignPutUrl uses default expiry", async () => {
  const url = await presignPutUrl("file.txt", "text/plain");
  const parsed = new URL(url);
  assertEquals(parsed.searchParams.get("X-Amz-Expires"), "3600");
});

// ── listObjects ─────────────────────────────────────────────────────────────

Deno.test("listObjects parses XML with Contents", async () => {
  mockFetch(() =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <ListBucketResult>
        <IsTruncated>false</IsTruncated>
        <Contents>
          <Key>folder/file1.txt</Key>
          <LastModified>2024-01-15T10:00:00Z</LastModified>
          <Size>12345</Size>
        </Contents>
        <Contents>
          <Key>folder/file2.pdf</Key>
          <LastModified>2024-01-16T11:00:00Z</LastModified>
          <Size>67890</Size>
        </Contents>
      </ListBucketResult>`,
      { status: 200 },
    )
  );

  try {
    const result = await listObjects("folder/");
    assertEquals(result.contents.length, 2);
    assertEquals(result.contents[0].key, "folder/file1.txt");
    assertEquals(result.contents[0].lastModified, "2024-01-15T10:00:00Z");
    assertEquals(result.contents[0].size, 12345);
    assertEquals(result.contents[1].key, "folder/file2.pdf");
    assertEquals(result.contents[1].size, 67890);
    assertEquals(result.isTruncated, false);
    assertEquals(result.commonPrefixes.length, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test("listObjects parses CommonPrefixes", async () => {
  mockFetch(() =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <ListBucketResult>
        <IsTruncated>false</IsTruncated>
        <CommonPrefixes>
          <Prefix>folder/subfolder1/</Prefix>
        </CommonPrefixes>
        <CommonPrefixes>
          <Prefix>folder/subfolder2/</Prefix>
        </CommonPrefixes>
      </ListBucketResult>`,
      { status: 200 },
    )
  );

  try {
    const result = await listObjects("folder/", "/");
    assertEquals(result.commonPrefixes.length, 2);
    assertEquals(result.commonPrefixes[0], "folder/subfolder1/");
    assertEquals(result.commonPrefixes[1], "folder/subfolder2/");
    assertEquals(result.contents.length, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test("listObjects handles truncated results with NextContinuationToken", async () => {
  mockFetch(() =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <ListBucketResult>
        <IsTruncated>true</IsTruncated>
        <NextContinuationToken>token123</NextContinuationToken>
        <Contents>
          <Key>file.txt</Key>
          <LastModified>2024-01-01T00:00:00Z</LastModified>
          <Size>100</Size>
        </Contents>
      </ListBucketResult>`,
      { status: 200 },
    )
  );

  try {
    const result = await listObjects("", undefined, 1);
    assertEquals(result.isTruncated, true);
    assertEquals(result.nextContinuationToken, "token123");
    assertEquals(result.contents.length, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("listObjects throws on non-200 response", async () => {
  mockFetch(() => new Response("Access Denied", { status: 403 }));

  try {
    await assertRejects(
      () => listObjects("test/"),
      Error,
      "ListObjects failed 403",
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("listObjects handles empty result", async () => {
  mockFetch(() =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <ListBucketResult>
        <IsTruncated>false</IsTruncated>
      </ListBucketResult>`,
      { status: 200 },
    )
  );

  try {
    const result = await listObjects("nonexistent/");
    assertEquals(result.contents.length, 0);
    assertEquals(result.commonPrefixes.length, 0);
    assertEquals(result.isTruncated, false);
  } finally {
    restoreFetch();
  }
});

Deno.test("listObjects passes query parameters correctly", async () => {
  let capturedUrl = "";
  mockFetch((url) => {
    capturedUrl = url;
    return new Response(
      `<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>`,
      { status: 200 },
    );
  });

  try {
    await listObjects("myprefix/", "/", 500, "continuation-abc");
    const parsed = new URL(capturedUrl);
    assertEquals(parsed.searchParams.get("list-type"), "2");
    assertEquals(parsed.searchParams.get("prefix"), "myprefix/");
    assertEquals(parsed.searchParams.get("delimiter"), "/");
    assertEquals(parsed.searchParams.get("max-keys"), "500");
    assertEquals(parsed.searchParams.get("continuation-token"), "continuation-abc");
  } finally {
    restoreFetch();
  }
});

// ── headObject ──────────────────────────────────────────────────────────────

Deno.test("headObject returns metadata for existing object", async () => {
  mockFetch(() =>
    new Response(null, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": "54321",
        "last-modified": "Wed, 15 Jan 2024 10:00:00 GMT",
      },
    })
  );

  try {
    const result = await headObject("user/my-files/doc.pdf");
    assertNotEquals(result, null);
    assertEquals(result!.contentType, "application/pdf");
    assertEquals(result!.contentLength, 54321);
    assertEquals(result!.lastModified, "Wed, 15 Jan 2024 10:00:00 GMT");
  } finally {
    restoreFetch();
  }
});

Deno.test("headObject returns null for 404", async () => {
  mockFetch(() => new Response(null, { status: 404 }));

  try {
    const result = await headObject("nonexistent-key");
    assertEquals(result, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("headObject throws on non-404 error", async () => {
  mockFetch(() => new Response("error", { status: 500 }));

  try {
    await assertRejects(
      () => headObject("some-key"),
      Error,
      "HeadObject failed 500",
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("headObject uses defaults for missing headers", async () => {
  mockFetch(() => new Response(null, { status: 200, headers: {} }));

  try {
    const result = await headObject("key");
    assertNotEquals(result, null);
    assertEquals(result!.contentType, "application/octet-stream");
    assertEquals(result!.contentLength, 0);
    assertEquals(result!.lastModified, "");
  } finally {
    restoreFetch();
  }
});

// ── getObject ───────────────────────────────────────────────────────────────

Deno.test("getObject returns the fetch response", async () => {
  mockFetch(() => new Response("file content", { status: 200 }));

  try {
    const resp = await getObject("user/file.txt");
    assertEquals(resp.status, 200);
    const text = await resp.text();
    assertEquals(text, "file content");
  } finally {
    restoreFetch();
  }
});

Deno.test("getObject returns non-200 response without throwing", async () => {
  mockFetch(() => new Response("not found", { status: 404 }));

  try {
    const resp = await getObject("missing.txt");
    assertEquals(resp.status, 404);
    await resp.text(); // drain body
  } finally {
    restoreFetch();
  }
});

// ── putObject ───────────────────────────────────────────────────────────────

Deno.test("putObject succeeds with 200 response", async () => {
  let capturedMethod = "";
  let capturedUrl = "";
  mockFetch((url, init) => {
    capturedMethod = init?.method ?? "";
    capturedUrl = url;
    return new Response("", { status: 200 });
  });

  try {
    await putObject("user/file.txt", encoder.encode("hello"), "text/plain");
    assertEquals(capturedMethod, "PUT");
    assertStringIncludes(capturedUrl, "user/file.txt");
  } finally {
    restoreFetch();
  }
});

Deno.test("putObject throws on non-200 response", async () => {
  mockFetch(() => new Response("Internal Error", { status: 500 }));

  try {
    await assertRejects(
      () => putObject("key", encoder.encode("data"), "text/plain"),
      Error,
      "PutObject failed 500",
    );
  } finally {
    restoreFetch();
  }
});

// ── deleteObject ────────────────────────────────────────────────────────────

Deno.test("deleteObject succeeds with 204 response", async () => {
  let capturedMethod = "";
  mockFetch((_url, init) => {
    capturedMethod = init?.method ?? "";
    return new Response(null, { status: 204 });
  });

  try {
    await deleteObject("user/file.txt");
    assertEquals(capturedMethod, "DELETE");
  } finally {
    restoreFetch();
  }
});

Deno.test("deleteObject succeeds with 404 response (idempotent)", async () => {
  mockFetch(() => new Response("", { status: 404 }));

  try {
    await deleteObject("nonexistent.txt");
    // Should not throw
  } finally {
    restoreFetch();
  }
});

Deno.test("deleteObject throws on 500 error", async () => {
  mockFetch(() => new Response("Server Error", { status: 500 }));

  try {
    await assertRejects(
      () => deleteObject("key"),
      Error,
      "DeleteObject failed 500",
    );
  } finally {
    restoreFetch();
  }
});

// ── copyObject ──────────────────────────────────────────────────────────────

Deno.test("copyObject sends PUT with x-amz-copy-source header", async () => {
  let capturedMethod = "";
  let capturedHeaders: Record<string, string> = {};
  mockFetch((_url, init) => {
    capturedMethod = init?.method ?? "";
    const headers = init?.headers as Record<string, string>;
    capturedHeaders = headers ?? {};
    return new Response("<CopyObjectResult></CopyObjectResult>", { status: 200 });
  });

  try {
    await copyObject("source/file.txt", "dest/file.txt");
    assertEquals(capturedMethod, "PUT");
    // The x-amz-copy-source header should have been sent
    const hasCopySource = Object.keys(capturedHeaders).some(
      (k) => k.toLowerCase() === "x-amz-copy-source",
    );
    assertEquals(hasCopySource, true);
  } finally {
    restoreFetch();
  }
});

Deno.test("copyObject throws on failure", async () => {
  mockFetch(() => new Response("Copy failed", { status: 500 }));

  try {
    await assertRejects(
      () => copyObject("src", "dst"),
      Error,
      "CopyObject failed 500",
    );
  } finally {
    restoreFetch();
  }
});

// ── createMultipartUpload ───────────────────────────────────────────────────

Deno.test("createMultipartUpload returns uploadId from XML response", async () => {
  mockFetch(() =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <InitiateMultipartUploadResult>
        <Bucket>sunbeam-driver</Bucket>
        <Key>test/file.bin</Key>
        <UploadId>upload-id-12345</UploadId>
      </InitiateMultipartUploadResult>`,
      { status: 200 },
    )
  );

  try {
    const uploadId = await createMultipartUpload("test/file.bin", "application/octet-stream");
    assertEquals(uploadId, "upload-id-12345");
  } finally {
    restoreFetch();
  }
});

Deno.test("createMultipartUpload throws on non-200", async () => {
  mockFetch(() => new Response("Error", { status: 500 }));

  try {
    await assertRejects(
      () => createMultipartUpload("test/file.bin", "application/octet-stream"),
      Error,
      "CreateMultipartUpload failed",
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("createMultipartUpload throws when no UploadId in response", async () => {
  mockFetch(() =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <InitiateMultipartUploadResult>
        <Bucket>sunbeam-driver</Bucket>
      </InitiateMultipartUploadResult>`,
      { status: 200 },
    )
  );

  try {
    await assertRejects(
      () => createMultipartUpload("test/file.bin", "application/octet-stream"),
      Error,
      "No UploadId",
    );
  } finally {
    restoreFetch();
  }
});

// ── presignUploadPart ───────────────────────────────────────────────────────

Deno.test("presignUploadPart includes uploadId and partNumber", async () => {
  const url = await presignUploadPart("test/file.bin", "upload-123", 1);
  const parsed = new URL(url);
  assertEquals(parsed.searchParams.get("uploadId"), "upload-123");
  assertEquals(parsed.searchParams.get("partNumber"), "1");
  assertNotEquals(parsed.searchParams.get("X-Amz-Signature"), null);
});

// ── completeMultipartUpload ─────────────────────────────────────────────────

Deno.test("completeMultipartUpload sends XML body with parts", async () => {
  let capturedBody = "";
  mockFetch((_url, init) => {
    capturedBody = typeof init?.body === "string"
      ? init.body
      : new TextDecoder().decode(init?.body as Uint8Array);
    return new Response("<CompleteMultipartUploadResult></CompleteMultipartUploadResult>", { status: 200 });
  });

  try {
    await completeMultipartUpload("test/file.bin", "upload-123", [
      { partNumber: 1, etag: '"etag1"' },
      { partNumber: 2, etag: '"etag2"' },
    ]);
    assertStringIncludes(capturedBody, "<CompleteMultipartUpload>");
    assertStringIncludes(capturedBody, "<PartNumber>1</PartNumber>");
    assertStringIncludes(capturedBody, "<ETag>\"etag1\"</ETag>");
    assertStringIncludes(capturedBody, "<PartNumber>2</PartNumber>");
  } finally {
    restoreFetch();
  }
});

Deno.test("completeMultipartUpload throws on failure", async () => {
  mockFetch(() => new Response("Error", { status: 500 }));

  try {
    await assertRejects(
      () => completeMultipartUpload("key", "upload-123", [{ partNumber: 1, etag: '"etag"' }]),
      Error,
      "CompleteMultipartUpload failed",
    );
  } finally {
    restoreFetch();
  }
});
