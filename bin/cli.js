#!/usr/bin/env node

import { readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { indexSession } from "../src/parser.js";
import { search, listSessions, stats } from "../src/search.js";
import { closeDb } from "../src/db.js";

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`
agent-memory — local cross-session memory for Claude Code

Commands:
  index                 Index all existing sessions into SQLite
  search <pattern>      Regex search across all sessions
  sessions              List all indexed sessions
  stats                 Show index statistics

Search options:
  --type <all|user|assistant|sessions>   Filter by role (default: all)
  --project <name>                       Filter by project name
  --limit <n>                            Max results (default: 20)
  --context <n>                          Chars of context around match (default: 120)

Examples:
  agent-memory search "auth|token|jwt"
  agent-memory search "refactor" --type user --project speak
  agent-memory sessions --project velvet
  agent-memory index
`);
}

function parseOpts(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--type" && args[i + 1]) opts.type = args[++i];
    else if (args[i] === "--project" && args[i + 1]) opts.project = args[++i];
    else if (args[i] === "--limit" && args[i + 1]) opts.limit = parseInt(args[++i]);
    else if (args[i] === "--context" && args[i + 1]) opts.context = parseInt(args[++i]);
  }
  return opts;
}

function findSessionFiles(dir) {
  const files = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "subagents") {
        files.push(...findSessionFiles(full));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(full);
      }
    }
  } catch {
    // Permission errors, etc.
  }
  return files;
}

async function main() {
  try {
    switch (command) {
      case "index": {
        const projectsDir = join(homedir(), ".claude", "projects");
        const files = findSessionFiles(projectsDir);
        console.log(`Found ${files.length} session files`);

        let totalNew = 0;
        let indexed = 0;
        for (const f of files) {
          try {
            const { newTurns } = await indexSession(f);
            if (newTurns > 0) {
              totalNew += newTurns;
              indexed++;
              process.stdout.write(`\r  Indexed ${indexed} sessions, ${totalNew} new turns...`);
            }
          } catch (err) {
            console.error(`\n  Skipped ${f.split("/").pop()}: ${err.message}`);
          }
        }
        console.log(`\nDone: ${indexed} sessions, ${totalNew} new turns`);

        const s = stats();
        console.log(`Total: ${s.sessions} sessions, ${s.turns} turns across ${s.projects.length} projects`);
        break;
      }

      case "search": {
        const pattern = args[1];
        if (!pattern) {
          console.error("Usage: agent-memory search <pattern>");
          process.exit(1);
        }
        const opts = parseOpts(args.slice(2));
        const results = search(pattern, opts);

        if (results.length === 0) {
          console.log("No matches found.");
          break;
        }

        for (const r of results) {
          if (r.type === "session") {
            console.log(
              `\n[${r.sessionId}] ${r.project} (${r.turns} turns, ${r.started})`
            );
            console.log(`  ${r.firstMessage}`);
          } else {
            const date = r.timestamp?.slice(0, 10) || "?";
            console.log(
              `\n[${r.sessionId}] ${r.project} — ${r.role} (${date})`
            );
            console.log(`  ${r.snippet}`);
          }
        }
        console.log(`\n${results.length} result(s)`);
        break;
      }

      case "sessions": {
        const opts = parseOpts(args.slice(1));
        const sessions = listSessions(opts);

        if (sessions.length === 0) {
          console.log("No sessions indexed. Run: agent-memory index");
          break;
        }

        console.log(
          `${"ID".padEnd(10)} ${"Project".padEnd(25)} ${"Turns".padEnd(7)} ${"Updated".padEnd(12)} First Message`
        );
        console.log("-".repeat(100));
        for (const s of sessions) {
          console.log(
            `${s.sessionId.padEnd(10)} ${(s.project || "").padEnd(25)} ${String(s.turns).padEnd(7)} ${(s.updated || "").padEnd(12)} ${s.firstMessage || ""}`
          );
        }
        break;
      }

      case "stats": {
        const s = stats();
        console.log(`Sessions: ${s.sessions}`);
        console.log(`Turns:    ${s.turns}`);
        console.log(`Projects: ${s.projects.join(", ")}`);
        break;
      }

      default:
        usage();
    }
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error(err.message);
  closeDb();
  process.exit(1);
});
