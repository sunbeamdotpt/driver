/**
 * Lightweight HTTP client for Ory Keto — no SDK, just fetch.
 */

import { withSpan } from "./telemetry.ts";

const KETO_READ_URL = Deno.env.get("KETO_READ_URL") ??
  "http://keto-read.ory.svc.cluster.local:4466";
const KETO_WRITE_URL = Deno.env.get("KETO_WRITE_URL") ??
  "http://keto-write.ory.svc.cluster.local:4467";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RelationTuple {
  namespace: string;
  object: string;
  relation: string;
  subject_id?: string;
  subject_set?: {
    namespace: string;
    object: string;
    relation: string;
  };
}

export interface RelationPatch {
  action: "insert" | "delete";
  relation_tuple: RelationTuple;
}

// ── Check ────────────────────────────────────────────────────────────────────

/**
 * Check whether `subjectId` has `relation` on `namespace:object`.
 * Returns false on network errors instead of throwing.
 */
export async function checkPermission(
  namespace: string,
  object: string,
  relation: string,
  subjectId: string,
): Promise<boolean> {
  return withSpan("keto.checkPermission", { "keto.namespace": namespace, "keto.relation": relation }, async () => {
    try {
      const res = await fetch(
        `${KETO_READ_URL}/relation-tuples/check/openapi`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ namespace, object, relation, subject_id: subjectId }),
        },
      );
      if (!res.ok) return false;
      const body = await res.json();
      return body.allowed === true;
    } catch {
      return false;
    }
  });
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Create a relationship tuple with a direct subject.
 */
export async function createRelationship(
  namespace: string,
  object: string,
  relation: string,
  subjectId: string,
): Promise<void> {
  return withSpan("keto.createRelationship", { "keto.namespace": namespace, "keto.relation": relation }, async () => {
    const res = await fetch(`${KETO_WRITE_URL}/admin/relation-tuples`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namespace, object, relation, subject_id: subjectId }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Keto createRelationship failed (${res.status}): ${text}`,
      );
    }
  });
}

/**
 * Create a relationship tuple with a subject set (e.g. parent folder).
 */
export async function createRelationshipWithSubjectSet(
  namespace: string,
  object: string,
  relation: string,
  subjectSetNamespace: string,
  subjectSetObject: string,
  subjectSetRelation: string,
): Promise<void> {
  return withSpan("keto.createRelationshipWithSubjectSet", { "keto.namespace": namespace, "keto.relation": relation }, async () => {
    const res = await fetch(`${KETO_WRITE_URL}/admin/relation-tuples`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namespace,
        object,
        relation,
        subject_set: {
          namespace: subjectSetNamespace,
          object: subjectSetObject,
          relation: subjectSetRelation,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Keto createRelationshipWithSubjectSet failed (${res.status}): ${text}`,
      );
    }
  });
}

// ── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a relationship tuple.
 */
export async function deleteRelationship(
  namespace: string,
  object: string,
  relation: string,
  subjectId: string,
): Promise<void> {
  return withSpan("keto.deleteRelationship", { "keto.namespace": namespace, "keto.relation": relation }, async () => {
    const params = new URLSearchParams({ namespace, object, relation, subject_id: subjectId });
    const res = await fetch(
      `${KETO_WRITE_URL}/admin/relation-tuples?${params}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Keto deleteRelationship failed (${res.status}): ${text}`,
      );
    }
  });
}

// ── Batch ────────────────────────────────────────────────────────────────────

/**
 * Apply a batch of insert/delete patches atomically.
 */
export async function batchWriteRelationships(
  patches: RelationPatch[],
): Promise<void> {
  return withSpan("keto.batchWriteRelationships", { "keto.patch_count": patches.length }, async () => {
    const res = await fetch(`${KETO_WRITE_URL}/admin/relation-tuples`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patches),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Keto batchWriteRelationships failed (${res.status}): ${text}`,
      );
    }
  });
}

// ── List ─────────────────────────────────────────────────────────────────────

/**
 * List relationship tuples matching the given filters.
 */
export async function listRelationships(
  namespace: string,
  object?: string,
  relation?: string,
  subjectId?: string,
): Promise<RelationTuple[]> {
  return withSpan("keto.listRelationships", { "keto.namespace": namespace }, async () => {
    const params = new URLSearchParams({ namespace });
    if (object) params.set("object", object);
    if (relation) params.set("relation", relation);
    if (subjectId) params.set("subject_id", subjectId);

    const res = await fetch(
      `${KETO_READ_URL}/relation-tuples?${params}`,
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Keto listRelationships failed (${res.status}): ${text}`);
    }
    const body = await res.json();
    return body.relation_tuples ?? [];
  });
}

// ── Expand ───────────────────────────────────────────────────────────────────

/**
 * Expand a permission tree for debugging / UI display.
 */
export async function expandPermission(
  namespace: string,
  object: string,
  relation: string,
  maxDepth?: number,
): Promise<unknown> {
  return withSpan("keto.expandPermission", { "keto.namespace": namespace, "keto.relation": relation }, async () => {
    const res = await fetch(
      `${KETO_READ_URL}/relation-tuples/expand`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namespace, object, relation, max_depth: maxDepth ?? 3 }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Keto expandPermission failed (${res.status}): ${text}`);
    }
    return await res.json();
  });
}
