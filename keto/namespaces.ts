/**
 * Ory Keto OPL (Ory Permission Language) namespace definitions.
 *
 * This file defines the permission model deployed to Keto.
 * It is NOT executed by Deno — it uses Keto's OPL type system
 * (Namespace, Context, SubjectSet) and is consumed by the Keto
 * server at deploy time.
 *
 * Hierarchy: Bucket → Folder → File
 * Permissions cascade downward through `parents` relations.
 */

// deno-lint-ignore-file no-unused-vars

/* ── Namespace / Context / SubjectSet are Keto OPL built-ins ── */
/* They are declared here so the file type-checks as valid TS.  */

interface Namespace {
  related?: Record<string, unknown[]>;
  permits?: Record<string, (ctx: Context) => boolean>;
}

interface Context {
  subject: unknown;
}

type SubjectSet<N, R extends string> = unknown;

// ─── Namespaces ──────────────────────────────────────────────────────────────

class User implements Namespace {}

class Group implements Namespace {
  related: {
    members: (User | Group)[];
  };
}

class Bucket implements Namespace {
  related: {
    owners: User[];
    editors: (User | SubjectSet<Group, "members">)[];
    viewers: (User | SubjectSet<Group, "members">)[];
  };

  permits = {
    write: (ctx: Context): boolean =>
      this.related.owners.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject),

    read: (ctx: Context): boolean =>
      this.permits.write(ctx) ||
      this.related.viewers.includes(ctx.subject),

    delete: (ctx: Context): boolean =>
      this.related.owners.includes(ctx.subject),
  };
}

class Folder implements Namespace {
  related: {
    owners: User[];
    editors: (User | SubjectSet<Group, "members">)[];
    viewers: (User | SubjectSet<Group, "members">)[];
    parents: (Folder | Bucket)[];
  };

  permits = {
    write: (ctx: Context): boolean =>
      this.related.owners.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject) ||
      // @ts-ignore — Keto OPL traverse
      this.related.parents.traverse((p: Folder | Bucket) =>
        p.permits.write(ctx),
      ),

    read: (ctx: Context): boolean =>
      this.permits.write(ctx) ||
      this.related.viewers.includes(ctx.subject) ||
      // @ts-ignore — Keto OPL traverse
      this.related.parents.traverse((p: Folder | Bucket) =>
        p.permits.read(ctx),
      ),

    delete: (ctx: Context): boolean =>
      this.related.owners.includes(ctx.subject) ||
      // @ts-ignore — Keto OPL traverse
      this.related.parents.traverse((p: Folder | Bucket) =>
        p.permits.delete(ctx),
      ),
  };
}

class File implements Namespace {
  related: {
    owners: User[];
    editors: (User | SubjectSet<Group, "members">)[];
    viewers: (User | SubjectSet<Group, "members">)[];
    parents: Folder[];
  };

  permits = {
    write: (ctx: Context): boolean =>
      this.related.owners.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject) ||
      // @ts-ignore — Keto OPL traverse
      this.related.parents.traverse((p: Folder) => p.permits.write(ctx)),

    read: (ctx: Context): boolean =>
      this.permits.write(ctx) ||
      this.related.viewers.includes(ctx.subject) ||
      // @ts-ignore — Keto OPL traverse
      this.related.parents.traverse((p: Folder) => p.permits.read(ctx)),

    delete: (ctx: Context): boolean =>
      this.related.owners.includes(ctx.subject) ||
      // @ts-ignore — Keto OPL traverse
      this.related.parents.traverse((p: Folder) => p.permits.delete(ctx)),
  };
}
