import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DB_DIR = join(homedir(), ".agent-memory");
const DB_PATH = join(DB_DIR, "sessions.db");

let _db;

export function getDb() {
  if (_db) return _db;

  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      cwd TEXT,
      first_message TEXT,
      started_at TEXT,
      updated_at TEXT,
      lines_indexed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT,
      uuid TEXT,
      UNIQUE(session_id, uuid)
    );

    CREATE TABLE IF NOT EXISTS summaries (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id),
      summary TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
    CREATE INDEX IF NOT EXISTS idx_turns_content ON turns(content);
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
  `);

  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
