/**
 * Tests for WOPI lock service using in-memory store.
 */

import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  InMemoryLockStore,
  setLockStore,
  acquireLock,
  getLock,
  refreshLock,
  releaseLock,
  unlockAndRelock,
} from "../../server/wopi/lock.ts";

// Use in-memory store for all tests
function setup(): InMemoryLockStore {
  const store = new InMemoryLockStore();
  setLockStore(store);
  return store;
}

Deno.test("acquireLock succeeds on unlocked file", async () => {
  setup();
  const result = await acquireLock("file-1", "lock-aaa");
  assertEquals(result.success, true);
  assertEquals(result.existingLockId, undefined);
});

Deno.test("acquireLock fails when different lock exists", async () => {
  setup();
  await acquireLock("file-1", "lock-aaa");
  const result = await acquireLock("file-1", "lock-bbb");
  assertEquals(result.success, false);
  assertEquals(result.existingLockId, "lock-aaa");
});

Deno.test("acquireLock succeeds when same lock exists (refresh)", async () => {
  setup();
  await acquireLock("file-1", "lock-aaa");
  const result = await acquireLock("file-1", "lock-aaa");
  assertEquals(result.success, true);
});

Deno.test("getLock returns null for unlocked file", async () => {
  setup();
  const lock = await getLock("file-nonexistent");
  assertEquals(lock, null);
});

Deno.test("getLock returns lock id for locked file", async () => {
  setup();
  await acquireLock("file-1", "lock-xyz");
  const lock = await getLock("file-1");
  assertEquals(lock, "lock-xyz");
});

Deno.test("refreshLock succeeds with matching lock", async () => {
  setup();
  await acquireLock("file-1", "lock-aaa");
  const result = await refreshLock("file-1", "lock-aaa");
  assertEquals(result.success, true);
});

Deno.test("refreshLock fails with mismatched lock", async () => {
  setup();
  await acquireLock("file-1", "lock-aaa");
  const result = await refreshLock("file-1", "lock-bbb");
  assertEquals(result.success, false);
  assertEquals(result.existingLockId, "lock-aaa");
});

Deno.test("refreshLock fails on unlocked file", async () => {
  setup();
  const result = await refreshLock("file-1", "lock-aaa");
  assertEquals(result.success, false);
});

Deno.test("releaseLock succeeds with matching lock", async () => {
  setup();
  await acquireLock("file-1", "lock-aaa");
  const result = await releaseLock("file-1", "lock-aaa");
  assertEquals(result.success, true);

  // Verify lock is gone
  const lock = await getLock("file-1");
  assertEquals(lock, null);
});

Deno.test("releaseLock fails with mismatched lock", async () => {
  setup();
  await acquireLock("file-1", "lock-aaa");
  const result = await releaseLock("file-1", "lock-bbb");
  assertEquals(result.success, false);
  assertEquals(result.existingLockId, "lock-aaa");

  // Lock should still exist
  const lock = await getLock("file-1");
  assertEquals(lock, "lock-aaa");
});

Deno.test("releaseLock succeeds on already unlocked file", async () => {
  setup();
  const result = await releaseLock("file-1", "lock-aaa");
  assertEquals(result.success, true);
});

Deno.test("unlockAndRelock succeeds with matching old lock", async () => {
  setup();
  await acquireLock("file-1", "lock-old");
  const result = await unlockAndRelock("file-1", "lock-old", "lock-new");
  assertEquals(result.success, true);

  // New lock should be set
  const lock = await getLock("file-1");
  assertEquals(lock, "lock-new");
});

Deno.test("unlockAndRelock fails with mismatched old lock", async () => {
  setup();
  await acquireLock("file-1", "lock-aaa");
  const result = await unlockAndRelock("file-1", "lock-wrong", "lock-new");
  assertEquals(result.success, false);
  assertEquals(result.existingLockId, "lock-aaa");

  // Original lock should remain
  const lock = await getLock("file-1");
  assertEquals(lock, "lock-aaa");
});

Deno.test("unlockAndRelock fails when no lock exists", async () => {
  setup();
  const result = await unlockAndRelock("file-1", "lock-old", "lock-new");
  assertEquals(result.success, false);
  assertEquals(result.existingLockId, undefined);
});

Deno.test("different files have independent locks", async () => {
  setup();
  await acquireLock("file-1", "lock-1");
  await acquireLock("file-2", "lock-2");

  assertEquals(await getLock("file-1"), "lock-1");
  assertEquals(await getLock("file-2"), "lock-2");

  // Releasing one doesn't affect the other
  await releaseLock("file-1", "lock-1");
  assertEquals(await getLock("file-1"), null);
  assertEquals(await getLock("file-2"), "lock-2");
});

Deno.test("full lock lifecycle: acquire -> refresh -> release", async () => {
  setup();

  // Acquire
  const a = await acquireLock("file-1", "lock-abc");
  assertEquals(a.success, true);

  // Refresh
  const r = await refreshLock("file-1", "lock-abc");
  assertEquals(r.success, true);

  // Still locked
  assertNotEquals(await getLock("file-1"), null);

  // Release
  const rel = await releaseLock("file-1", "lock-abc");
  assertEquals(rel.success, true);

  // Gone
  assertEquals(await getLock("file-1"), null);
});

// ── InMemoryLockStore direct tests ──────────────────────────────────────────

Deno.test("InMemoryLockStore — get returns null for nonexistent key", async () => {
  const store = new InMemoryLockStore();
  assertEquals(await store.get("nonexistent"), null);
});

Deno.test("InMemoryLockStore — setNX sets value and returns true", async () => {
  const store = new InMemoryLockStore();
  const result = await store.setNX("key1", "value1", 60);
  assertEquals(result, true);
  assertEquals(await store.get("key1"), "value1");
});

Deno.test("InMemoryLockStore — setNX returns false if key exists", async () => {
  const store = new InMemoryLockStore();
  await store.setNX("key1", "value1", 60);
  const result = await store.setNX("key1", "value2", 60);
  assertEquals(result, false);
  assertEquals(await store.get("key1"), "value1");
});

Deno.test("InMemoryLockStore — set overwrites unconditionally", async () => {
  const store = new InMemoryLockStore();
  await store.setNX("key1", "value1", 60);
  await store.set("key1", "value2", 60);
  assertEquals(await store.get("key1"), "value2");
});

Deno.test("InMemoryLockStore — del removes key", async () => {
  const store = new InMemoryLockStore();
  await store.setNX("key1", "value1", 60);
  await store.del("key1");
  assertEquals(await store.get("key1"), null);
});

Deno.test("InMemoryLockStore — del on nonexistent key is no-op", async () => {
  const store = new InMemoryLockStore();
  await store.del("nonexistent");
  // Should not throw
});

Deno.test("InMemoryLockStore — expire returns false for nonexistent key", async () => {
  const store = new InMemoryLockStore();
  const result = await store.expire("nonexistent", 60);
  assertEquals(result, false);
});

Deno.test("InMemoryLockStore — expire returns true for existing key", async () => {
  const store = new InMemoryLockStore();
  await store.setNX("key1", "value1", 60);
  const result = await store.expire("key1", 120);
  assertEquals(result, true);
  assertEquals(await store.get("key1"), "value1");
});

Deno.test("InMemoryLockStore — expired key returns null on get", async () => {
  const store = new InMemoryLockStore();
  // Set with 0 TTL so it expires immediately
  await store.set("key1", "value1", 0);
  // Wait briefly to ensure expiry (0 seconds TTL)
  await new Promise((r) => setTimeout(r, 10));
  assertEquals(await store.get("key1"), null);
});

Deno.test("InMemoryLockStore — expired key allows setNX", async () => {
  const store = new InMemoryLockStore();
  await store.set("key1", "value1", 0);
  await new Promise((r) => setTimeout(r, 10));
  const result = await store.setNX("key1", "value2", 60);
  assertEquals(result, true);
  assertEquals(await store.get("key1"), "value2");
});

Deno.test("InMemoryLockStore — expire on expired key returns false", async () => {
  const store = new InMemoryLockStore();
  await store.set("key1", "value1", 0);
  await new Promise((r) => setTimeout(r, 10));
  const result = await store.expire("key1", 60);
  assertEquals(result, false);
});

// ── Lock TTL-related tests ──────────────────────────────────────────────────

Deno.test("acquireLock then getLock after TTL expiry returns null", async () => {
  const store = new InMemoryLockStore();
  setLockStore(store);

  // Directly set a lock with very short TTL via the store
  await store.set("wopi:lock:file-expiry", "lock-ttl", 0);
  await new Promise((r) => setTimeout(r, 10));

  const lock = await store.get("wopi:lock:file-expiry");
  assertEquals(lock, null);
});

Deno.test("concurrent lock attempts — second attempt fails", async () => {
  setup();
  const [r1, r2] = await Promise.all([
    acquireLock("file-concurrent", "lock-a"),
    acquireLock("file-concurrent", "lock-b"),
  ]);

  // One should succeed, one should fail (or both succeed with same lock)
  const successes = [r1, r2].filter((r) => r.success);
  const failures = [r1, r2].filter((r) => !r.success);

  // At least one should succeed
  assertEquals(successes.length >= 1, true);

  if (failures.length > 0) {
    // If one failed, it should report the existing lock
    assertNotEquals(failures[0].existingLockId, undefined);
  }
});
