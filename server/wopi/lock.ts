/**
 * Valkey (Redis)-backed WOPI lock service with TTL.
 * Uses an injectable store interface so tests can use an in-memory Map.
 */

const LOCK_TTL_SECONDS = 30 * 60; // 30 minutes
const KEY_PREFIX = "wopi:lock:";

// ── Store interface ─────────────────────────────────────────────────────────

export interface LockStore {
  /** Get value for key, or null if missing/expired. */
  get(key: string): Promise<string | null>;
  /**
   * Set key=value only if key does not exist. Returns true if set, false if conflict.
   * TTL in seconds.
   */
  setNX(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** Set key=value unconditionally with TTL. */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Delete key. */
  del(key: string): Promise<void>;
  /** Set TTL on existing key (returns false if key doesn't exist). */
  expire(key: string, ttlSeconds: number): Promise<boolean>;
}

// ── In-memory store (for tests + development) ──────────────────────────────

export class InMemoryLockStore implements LockStore {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const existing = await this.get(key);
    if (existing !== null) return false;
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    entry.expiresAt = Date.now() + ttlSeconds * 1000;
    return true;
  }
}

// ── Valkey (Redis) store using ioredis ──────────────────────────────────────

export class ValkeyLockStore implements LockStore {
  private client: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ex: string, ttl: number, nx: string): Promise<string | null>;
    set(key: string, value: string, ex: string, ttl: number): Promise<string | null>;
    del(key: string): Promise<number>;
    expire(key: string, ttl: number): Promise<number>;
  };

  constructor() {
    // Lazy-init to avoid import issues in tests
    const url = Deno.env.get("VALKEY_URL") ?? "redis://localhost:6379/2";
    // deno-lint-ignore no-explicit-any
    const Redis = (globalThis as any).Redis ?? null;
    if (!Redis) {
      throw new Error("ioredis not available — use InMemoryLockStore for tests");
    }
    this.client = new Redis(url);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, "EX", ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.expire(key, ttlSeconds);
    return result === 1;
  }
}

// ── Lock service ────────────────────────────────────────────────────────────

let _store: LockStore | null = null;

export function setLockStore(store: LockStore): void {
  _store = store;
}

function getStore(): LockStore {
  if (!_store) {
    // Try Valkey, fall back to in-memory
    try {
      _store = new ValkeyLockStore();
    } catch {
      console.warn("WOPI lock: falling back to in-memory store");
      _store = new InMemoryLockStore();
    }
  }
  return _store;
}

export interface LockResult {
  success: boolean;
  existingLockId?: string;
}

export async function acquireLock(
  fileId: string,
  lockId: string,
): Promise<LockResult> {
  const store = getStore();
  const key = KEY_PREFIX + fileId;
  const set = await store.setNX(key, lockId, LOCK_TTL_SECONDS);
  if (set) return { success: true };

  const existing = await store.get(key);
  if (existing === lockId) {
    // Same lock — refresh TTL
    await store.expire(key, LOCK_TTL_SECONDS);
    return { success: true };
  }
  return { success: false, existingLockId: existing ?? undefined };
}

export async function getLock(fileId: string): Promise<string | null> {
  const store = getStore();
  return store.get(KEY_PREFIX + fileId);
}

export async function refreshLock(
  fileId: string,
  lockId: string,
): Promise<LockResult> {
  const store = getStore();
  const key = KEY_PREFIX + fileId;
  const existing = await store.get(key);

  if (existing === null) {
    return { success: false };
  }
  if (existing !== lockId) {
    return { success: false, existingLockId: existing };
  }

  await store.expire(key, LOCK_TTL_SECONDS);
  return { success: true };
}

export async function releaseLock(
  fileId: string,
  lockId: string,
): Promise<LockResult> {
  const store = getStore();
  const key = KEY_PREFIX + fileId;
  const existing = await store.get(key);

  if (existing === null) {
    return { success: true }; // Already unlocked
  }
  if (existing !== lockId) {
    return { success: false, existingLockId: existing };
  }

  await store.del(key);
  return { success: true };
}

export async function unlockAndRelock(
  fileId: string,
  oldLockId: string,
  newLockId: string,
): Promise<LockResult> {
  const store = getStore();
  const key = KEY_PREFIX + fileId;
  const existing = await store.get(key);

  if (existing !== oldLockId) {
    return { success: false, existingLockId: existing ?? undefined };
  }

  await store.set(key, newLockId, LOCK_TTL_SECONDS);
  return { success: true };
}
