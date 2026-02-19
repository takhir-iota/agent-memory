import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { createInterface } from "readline";
import { basename, dirname } from "path";
import { getDb } from "./db.js";

/**
 * Extract text content from a message object.
 * Claude Code messages can have string or array content.
 */
function extractText(message) {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
}

/**
 * Parse a Claude Code JSONL session file and index it into SQLite.
 * Streams line-by-line to handle large files.
 * Returns { newTurns, totalTurns } count.
 */
export async function indexSession(filePath) {
  const db = getDb();

  // Get file size to use as change marker
  const fileStat = await stat(filePath);
  const fileSize = fileStat.size;

  // Derive project name from directory structure
  const dirName = basename(dirname(filePath));
  const project = dirName
    .replace(/^-Users-[^-]+-?/, "")
    .replace(/-/g, "/")
    || "home";

  // Check if already indexed at this file size
  const sessionFileName = basename(filePath, ".jsonl");
  const existing = db
    .prepare("SELECT lines_indexed FROM sessions WHERE id = ?")
    .get(sessionFileName);

  if (existing && existing.lines_indexed >= fileSize) {
    return { newTurns: 0, totalTurns: 0 };
  }

  let sessionId = null;
  let cwd = null;
  let firstMessage = null;
  let startedAt = null;
  let updatedAt = null;
  const turns = [];

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    // Skip non-message entries
    if (!entry.type || !["user", "assistant"].includes(entry.type)) continue;
    if (!entry.message) continue;

    if (!sessionId) sessionId = entry.sessionId;
    if (!cwd) cwd = entry.cwd;
    if (!startedAt) startedAt = entry.timestamp;
    updatedAt = entry.timestamp;

    const text = extractText(entry.message);
    if (!text.trim()) continue;

    // Capture first user message as session title
    if (!firstMessage && entry.type === "user") {
      firstMessage = text.slice(0, 500);
    }

    turns.push({
      role: entry.type,
      content: text.slice(0, 50000), // Cap individual turn content
      timestamp: entry.timestamp,
      uuid: entry.uuid,
    });
  }

  if (!sessionId) sessionId = sessionFileName;
  if (turns.length === 0) return { newTurns: 0, totalTurns: 0 };

  // Upsert session
  db.prepare(`
    INSERT INTO sessions (id, project, cwd, first_message, started_at, updated_at, lines_indexed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      updated_at = excluded.updated_at,
      lines_indexed = excluded.lines_indexed,
      first_message = COALESCE(excluded.first_message, first_message)
  `).run(sessionId, project, cwd, firstMessage, startedAt, updatedAt, fileSize);

  // Insert turns (skip duplicates via uuid)
  const insertTurn = db.prepare(`
    INSERT OR IGNORE INTO turns (session_id, role, content, timestamp, uuid)
    VALUES (?, ?, ?, ?, ?)
  `);

  let newTurns = 0;
  const insertAll = db.transaction(() => {
    for (const turn of turns) {
      const result = insertTurn.run(
        sessionId,
        turn.role,
        turn.content,
        turn.timestamp,
        turn.uuid
      );
      if (result.changes > 0) newTurns++;
    }
  });
  insertAll();

  return { newTurns, totalTurns: turns.length };
}
