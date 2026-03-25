import sql from "./db.ts";

const MIGRATIONS = [
  {
    name: "001_create_files",
    up: `
      CREATE TABLE IF NOT EXISTS files (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        s3_key      TEXT NOT NULL UNIQUE,
        filename    TEXT NOT NULL,
        mimetype    TEXT NOT NULL DEFAULT 'application/octet-stream',
        size        BIGINT NOT NULL DEFAULT 0,
        owner_id    TEXT NOT NULL,
        parent_id   UUID REFERENCES files(id) ON DELETE CASCADE,
        is_folder   BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at  TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_files_owner  ON files(owner_id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_files_s3key  ON files(s3_key);
    `,
  },
  {
    name: "002_create_user_file_state",
    up: `
      CREATE TABLE IF NOT EXISTS user_file_state (
        user_id     TEXT NOT NULL,
        file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        favorited   BOOLEAN NOT NULL DEFAULT false,
        last_opened TIMESTAMPTZ,
        PRIMARY KEY (user_id, file_id)
      );
    `,
  },
  {
    name: "004_folder_sizes",
    up: `
      -- Recompute a single folder's size from its direct + nested descendants.
      -- Called after any file size change, create, delete, or move.
      CREATE OR REPLACE FUNCTION recompute_folder_size(folder_id UUID)
      RETURNS BIGINT LANGUAGE SQL AS $$
        WITH RECURSIVE descendants AS (
          -- Direct children of this folder
          SELECT id, size, is_folder
          FROM files
          WHERE parent_id = folder_id AND deleted_at IS NULL
          UNION ALL
          -- Recurse into subfolders
          SELECT f.id, f.size, f.is_folder
          FROM files f
          JOIN descendants d ON f.parent_id = d.id
          WHERE f.deleted_at IS NULL
        )
        SELECT COALESCE(SUM(size) FILTER (WHERE NOT is_folder), 0)
        FROM descendants;
      $$;

      -- Propagate size updates from a file up through all ancestor folders.
      CREATE OR REPLACE FUNCTION propagate_folder_sizes(start_parent_id UUID)
      RETURNS VOID LANGUAGE plpgsql AS $$
      DECLARE
        current_id UUID := start_parent_id;
        computed  BIGINT;
      BEGIN
        WHILE current_id IS NOT NULL LOOP
          computed := recompute_folder_size(current_id);
          UPDATE files SET size = computed WHERE id = current_id AND is_folder = true;
          SELECT parent_id INTO current_id FROM files WHERE id = current_id;
        END LOOP;
      END;
      $$;
    `,
  },
  {
    name: "003_create_migrations_table",
    up: `
      CREATE TABLE IF NOT EXISTS _migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `,
  },
];

async function migrate() {
  // Ensure migrations table exists first
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  for (const migration of MIGRATIONS) {
    const [existing] = await sql`
      SELECT name FROM _migrations WHERE name = ${migration.name}
    `;
    if (existing) {
      console.log(`  skip: ${migration.name}`);
      continue;
    }
    console.log(`  apply: ${migration.name}`);
    await sql.unsafe(migration.up);
    await sql`INSERT INTO _migrations (name) VALUES (${migration.name})`;
  }
  console.log("Migrations complete.");
}

if (import.meta.main) {
  await migrate();
  await sql.end();
}

export { migrate };
