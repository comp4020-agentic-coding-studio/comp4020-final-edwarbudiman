import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type DB = DatabaseSync;

// Migrations run in order at boot; PRAGMA user_version records how many have
// been applied. Append, never edit one that has shipped.
const MIGRATIONS: string[] = [
  // 1: the core loop (docs/backlog.md §2)
  `
  CREATE TABLE users (
    id          INTEGER PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email       TEXT UNIQUE COLLATE NOCASE,
    pw_hash     TEXT NOT NULL,
    is_demo     INTEGER NOT NULL DEFAULT 0,
    anonymous   INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE boards (
    id          INTEGER PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN ('user', 'channel')),
    owner_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL COLLATE NOCASE,
    name        TEXT NOT NULL,
    visibility  TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'key', 'list')),
    key_hash    TEXT,
    created_at  INTEGER NOT NULL,
    UNIQUE (kind, slug)
  );
  CREATE TABLE board_members (
    board_id    INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (board_id, user_id)
  );
  CREATE TABLE notes (
    id          INTEGER PRIMARY KEY,
    board_id    INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    color       TEXT NOT NULL,
    x           REAL NOT NULL,
    y           REAL NOT NULL,
    z           INTEGER NOT NULL,
    visibility  TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
    version     INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
  CREATE INDEX notes_board ON notes(board_id);
  `,
  // 2: allow/deny lists by username for channels (F-02)
  `
  CREATE TABLE board_access (
    board_id    INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    username    TEXT NOT NULL COLLATE NOCASE,
    rule        TEXT NOT NULL CHECK (rule IN ('allow', 'deny')),
    PRIMARY KEY (board_id, username)
  );
  `,
  // 3: labels on notes, a JSON array of strings (filtering happens in the client)
  `
  ALTER TABLE notes ADD COLUMN labels TEXT NOT NULL DEFAULT '[]';
  `,
];

export function openDb(dataDir: string): DB {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "app.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  const { user_version: applied } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let i = applied; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

/** Run fn inside a transaction. */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
