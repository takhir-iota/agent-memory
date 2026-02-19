import { getDb } from "./db.js";

/**
 * Search across all indexed sessions using regex pattern.
 *
 * @param {string} pattern - Regex pattern (case-insensitive)
 * @param {object} opts
 * @param {string} opts.type - "all" | "user" | "assistant" | "sessions"
 * @param {string} opts.project - Filter by project name (substring match)
 * @param {number} opts.limit - Max results (default 20)
 * @param {number} opts.context - Characters of context around match (default 120)
 * @returns {Array} Search results
 */
export function search(pattern, opts = {}) {
  const db = getDb();
  const { type = "all", project, limit = 20, context = 120 } = opts;

  let regex;
  try {
    regex = new RegExp(pattern, "i");
  } catch {
    console.error(`Invalid regex: ${pattern}`);
    return [];
  }

  if (type === "sessions") {
    return searchSessions(db, regex, { project, limit });
  }

  return searchTurns(db, regex, { type, project, limit, context });
}

function searchSessions(db, regex, { project, limit }) {
  let query = `
    SELECT s.id, s.project, s.first_message, s.started_at, s.updated_at,
           COUNT(t.id) as turn_count
    FROM sessions s
    LEFT JOIN turns t ON t.session_id = s.id
  `;
  const params = [];

  if (project) {
    query += " WHERE s.project LIKE ?";
    params.push(`%${project}%`);
  }

  query += " GROUP BY s.id ORDER BY s.updated_at DESC";

  const rows = db.prepare(query).all(...params);

  return rows
    .filter(
      (r) =>
        regex.test(r.first_message || "") ||
        regex.test(r.project || "")
    )
    .slice(0, limit)
    .map((r) => ({
      type: "session",
      sessionId: r.id.slice(0, 8),
      project: r.project,
      firstMessage: r.first_message?.slice(0, 200),
      turns: r.turn_count,
      started: r.started_at,
      updated: r.updated_at,
    }));
}

function searchTurns(db, regex, { type, project, limit, context }) {
  let query = `
    SELECT t.role, t.content, t.timestamp, t.session_id,
           s.project, s.first_message
    FROM turns t
    JOIN sessions s ON s.id = t.session_id
  `;
  const conditions = [];
  const params = [];

  if (type === "user" || type === "assistant") {
    conditions.push("t.role = ?");
    params.push(type);
  }

  if (project) {
    conditions.push("s.project LIKE ?");
    params.push(`%${project}%`);
  }

  if (conditions.length) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY t.timestamp DESC";

  const rows = db.prepare(query).all(...params);
  const results = [];

  for (const row of rows) {
    const match = regex.exec(row.content);
    if (!match) continue;

    const start = Math.max(0, match.index - context);
    const end = Math.min(row.content.length, match.index + match[0].length + context);
    const snippet = (start > 0 ? "..." : "") +
      row.content.slice(start, end) +
      (end < row.content.length ? "..." : "");

    results.push({
      type: "turn",
      role: row.role,
      snippet: snippet.replace(/\n/g, " "),
      project: row.project,
      sessionId: row.session_id.slice(0, 8),
      sessionTitle: row.first_message?.slice(0, 100),
      timestamp: row.timestamp,
    });

    if (results.length >= limit) break;
  }

  return results;
}

/**
 * List all indexed sessions.
 */
export function listSessions({ project, limit = 30 } = {}) {
  const db = getDb();

  let query = `
    SELECT s.id, s.project, s.first_message, s.started_at, s.updated_at,
           COUNT(t.id) as turn_count
    FROM sessions s
    LEFT JOIN turns t ON t.session_id = s.id
  `;
  const params = [];

  if (project) {
    query += " WHERE s.project LIKE ?";
    params.push(`%${project}%`);
  }

  query += " GROUP BY s.id ORDER BY s.updated_at DESC LIMIT ?";
  params.push(limit);

  return db.prepare(query).all(...params).map((r) => ({
    sessionId: r.id.slice(0, 8),
    project: r.project,
    firstMessage: r.first_message?.slice(0, 120),
    turns: r.turn_count,
    started: r.started_at?.slice(0, 10),
    updated: r.updated_at?.slice(0, 10),
  }));
}

/**
 * Get stats about the indexed data.
 */
export function stats() {
  const db = getDb();
  const sessionCount = db.prepare("SELECT COUNT(*) as c FROM sessions").get().c;
  const turnCount = db.prepare("SELECT COUNT(*) as c FROM turns").get().c;
  const projects = db
    .prepare("SELECT DISTINCT project FROM sessions ORDER BY project")
    .all()
    .map((r) => r.project);

  return { sessions: sessionCount, turns: turnCount, projects };
}
