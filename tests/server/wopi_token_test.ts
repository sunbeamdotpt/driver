/**
 * Tests for WOPI token generation and verification.
 */

import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  generateWopiToken,
  verifyWopiToken,
} from "../../server/wopi/token.ts";

const TEST_SECRET = "test-secret-for-wopi-tokens";

Deno.test("generateWopiToken returns a JWT with 3 parts", async () => {
  const token = await generateWopiToken(
    "file-123",
    "user-456",
    "Test User",
    true,
    3600,
    TEST_SECRET,
  );
  const parts = token.split(".");
  assertEquals(parts.length, 3);
});

Deno.test("verifyWopiToken validates a valid token", async () => {
  const token = await generateWopiToken(
    "file-abc",
    "user-def",
    "Alice",
    true,
    3600,
    TEST_SECRET,
  );
  const payload = await verifyWopiToken(token, TEST_SECRET);
  assertNotEquals(payload, null);
  assertEquals(payload!.fid, "file-abc");
  assertEquals(payload!.uid, "user-def");
  assertEquals(payload!.unm, "Alice");
  assertEquals(payload!.wr, true);
});

Deno.test("verifyWopiToken returns payload with canWrite=false", async () => {
  const token = await generateWopiToken(
    "file-123",
    "user-789",
    "Bob",
    false,
    3600,
    TEST_SECRET,
  );
  const payload = await verifyWopiToken(token, TEST_SECRET);
  assertNotEquals(payload, null);
  assertEquals(payload!.wr, false);
});

Deno.test("verifyWopiToken rejects expired tokens", async () => {
  const token = await generateWopiToken(
    "file-123",
    "user-456",
    "Test",
    true,
    -10,
    TEST_SECRET,
  );
  const payload = await verifyWopiToken(token, TEST_SECRET);
  assertEquals(payload, null);
});

Deno.test("verifyWopiToken rejects tampered tokens", async () => {
  const token = await generateWopiToken(
    "file-123",
    "user-456",
    "Test",
    true,
    3600,
    TEST_SECRET,
  );

  const parts = token.split(".");
  const tamperedPayload = parts[1].slice(0, -1) +
    (parts[1].slice(-1) === "A" ? "B" : "A");
  const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

  const payload = await verifyWopiToken(tampered, TEST_SECRET);
  assertEquals(payload, null);
});

Deno.test("verifyWopiToken rejects wrong secret", async () => {
  const token = await generateWopiToken(
    "file-123",
    "user-456",
    "Test",
    true,
    3600,
    TEST_SECRET,
  );
  const payload = await verifyWopiToken(token, "wrong-secret");
  assertEquals(payload, null);
});

Deno.test("verifyWopiToken rejects malformed tokens", async () => {
  assertEquals(await verifyWopiToken("", TEST_SECRET), null);
  assertEquals(await verifyWopiToken("a.b", TEST_SECRET), null);
  assertEquals(await verifyWopiToken("not-a-jwt", TEST_SECRET), null);
  assertEquals(await verifyWopiToken("a.b.c.d", TEST_SECRET), null);
});

Deno.test("generated tokens have correct iat and exp", async () => {
  const before = Math.floor(Date.now() / 1000);
  const token = await generateWopiToken(
    "file-123",
    "user-456",
    "Test",
    true,
    7200,
    TEST_SECRET,
  );
  const after = Math.floor(Date.now() / 1000);

  const payload = await verifyWopiToken(token, TEST_SECRET);
  assertNotEquals(payload, null);

  assertEquals(payload!.iat >= before, true);
  assertEquals(payload!.iat <= after, true);
  assertEquals(payload!.exp, payload!.iat + 7200);
});

Deno.test("two tokens for different files have different signatures", async () => {
  const t1 = await generateWopiToken("file-1", "user-1", "A", true, 3600, TEST_SECRET);
  const t2 = await generateWopiToken("file-2", "user-1", "A", true, 3600, TEST_SECRET);
  assertNotEquals(t1, t2);
});

Deno.test("verifyWopiToken with tampered header rejects", async () => {
  const token = await generateWopiToken(
    "file-123",
    "user-456",
    "Test",
    true,
    3600,
    TEST_SECRET,
  );
  const parts = token.split(".");
  // Change the header
  const tamperedHeader = parts[0].slice(0, -1) +
    (parts[0].slice(-1) === "A" ? "B" : "A");
  const tampered = `${tamperedHeader}.${parts[1]}.${parts[2]}`;

  const payload = await verifyWopiToken(tampered, TEST_SECRET);
  assertEquals(payload, null);
});

Deno.test("verifyWopiToken with tampered signature rejects", async () => {
  const token = await generateWopiToken(
    "file-123",
    "user-456",
    "Test",
    true,
    3600,
    TEST_SECRET,
  );
  const parts = token.split(".");
  const tamperedSig = parts[2].slice(0, -1) +
    (parts[2].slice(-1) === "A" ? "B" : "A");
  const tampered = `${parts[0]}.${parts[1]}.${tamperedSig}`;

  const payload = await verifyWopiToken(tampered, TEST_SECRET);
  assertEquals(payload, null);
});

Deno.test("token roundtrip preserves all payload fields", async () => {
  const token = await generateWopiToken(
    "file-roundtrip",
    "user-roundtrip",
    "Roundtrip User",
    false,
    1800,
    TEST_SECRET,
  );
  const payload = await verifyWopiToken(token, TEST_SECRET);
  assertNotEquals(payload, null);
  assertEquals(payload!.fid, "file-roundtrip");
  assertEquals(payload!.uid, "user-roundtrip");
  assertEquals(payload!.unm, "Roundtrip User");
  assertEquals(payload!.wr, false);
  assertEquals(typeof payload!.iat, "number");
  assertEquals(typeof payload!.exp, "number");
});
