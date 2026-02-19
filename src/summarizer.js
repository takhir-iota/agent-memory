import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./db.js";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";

const MEMORY_DIR = join(homedir(), ".agent-memory", "projects");
const CLAUDE_PROJECTS = join(homedir(), ".claude", "projects");

const client = new Anthropic();

function getProjectsToSummarize(hoursBack = 24) {
  const db = getDb();
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  return db
    .prepare(
      `SELECT DISTINCT s.project, s.cwd
       FROM sessions s
       LEFT JOIN summaries sm ON sm.session_id = s.id
       WHERE s.updated_at > ?
         AND (sm.session_id IS NULL OR sm.generated_at < s.updated_at)
       ORDER BY s.project`
    )
    .all(since);
}

function getRecentTurns(project, hoursBack = 24) {
  const db = getDb();
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  return db
    .prepare(
      `SELECT t.role, t.content, t.timestamp, s.id as session_id, s.first_message
       FROM turns t
       JOIN sessions s ON s.id = t.session_id
       WHERE s.project = ? AND s.updated_at > ?
       ORDER BY t.timestamp ASC`
    )
    .all(project, since);
}

function markSummarized(sessionIds) {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO summaries (session_id, summary, generated_at)
     VALUES (?, '', ?)
     ON CONFLICT(session_id) DO UPDATE SET generated_at = excluded.generated_at`
  );
  db.transaction(() => {
    for (const id of sessionIds) stmt.run(id, now);
  })();
}

async function summarizeWithClaude(project, turns) {
  const condensed = [];
  let charCount = 0;

  for (const turn of turns) {
    if (charCount > 80000) break;
    const text =
      turn.role === "assistant"
        ? turn.content.slice(0, 500)
        : turn.content.slice(0, 1000);
    condensed.push(`[${turn.role.toUpperCase()}] ${text}`);
    charCount += text.length;
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are extracting key knowledge from a coding session for project "${project}".

Below is a condensed transcript. Extract ONLY:
- Architectural decisions made and why
- Important file paths and what they do
- Patterns/conventions established
- Bugs found and how they were fixed
- User preferences expressed
- Key technical facts about the project

Output as concise bullet points. Skip obvious/generic things. Only include what would be useful context for a future coding session on this project. If there's nothing noteworthy, output "No notable decisions."

Max 15 bullets. No preamble.

TRANSCRIPT:
${condensed.join("\n\n")}`,
      },
    ],
  });

  return response.content[0].text;
}

function resolveProjectDir(project, cwd) {
  if (cwd && existsSync(cwd)) return cwd;
  const candidate = join(homedir(), project);
  if (existsSync(candidate)) return candidate;
  return null;
}

function resolveClaudeProjectDir(cwd) {
  if (!cwd) return null;
  const dirName = cwd.replace(/\//g, "-");
  const claudeDir = join(CLAUDE_PROJECTS, dirName);
  if (existsSync(claudeDir)) return claudeDir;
  return null;
}

function createSymlink(target, linkPath) {
  try {
    if (existsSync(linkPath) || lstatSync(linkPath).isSymbolicLink()) {
      const stat = lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        unlinkSync(linkPath);
      } else {
        console.log(`  Skipped ${linkPath} (regular file exists)`);
        return;
      }
    }
  } catch {
    // lstatSync throws if path doesn't exist — that's fine
  }

  try {
    symlinkSync(target, linkPath);
    console.log(`  Linked ${linkPath}`);
  } catch (err) {
    console.log(`  Could not link ${linkPath}: ${err.message}`);
  }
}

function writeMemory(project, content, cwd) {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });

  const safeProject = project.replace(/\//g, "-");
  const memoryFile = join(MEMORY_DIR, `${safeProject}.md`);

  const date = new Date().toISOString().slice(0, 10);
  const newSection = `## Session Notes (${date})\n\n${content}`;
  const existing = existsSync(memoryFile) ? readFileSync(memoryFile, "utf-8") : "";

  let updated;
  if (!existing) {
    updated = `# ${project} — Agent Memory\n\nLast updated: ${date}\n\n${newSection}\n`;
  } else {
    // Replace today's section if it exists, otherwise prepend after header
    const todayRegex = new RegExp(
      `## Session Notes \\(${date}\\)\\n\\n[\\s\\S]*?(?=\\n## |$)`
    );
    if (todayRegex.test(existing)) {
      updated = existing.replace(todayRegex, newSection);
    } else {
      // Insert after first line that starts with #
      const firstHeading = existing.indexOf("\n## ");
      if (firstHeading > -1) {
        updated =
          existing.slice(0, firstHeading) +
          "\n" +
          newSection +
          "\n" +
          existing.slice(firstHeading);
      } else {
        updated = existing.trimEnd() + "\n\n" + newSection + "\n";
      }
    }
    // Update "Last updated" line
    updated = updated.replace(/Last updated: \d{4}-\d{2}-\d{2}/, `Last updated: ${date}`);
  }

  // Trim to 190 lines
  const lines = updated.split("\n");
  if (lines.length > 190) {
    updated = lines.slice(0, 190).join("\n") + "\n";
  }

  writeFileSync(memoryFile, updated, "utf-8");
  console.log(`  Wrote ${memoryFile}`);

  // Symlink into Claude Code memory
  const claudeDir = resolveClaudeProjectDir(cwd);
  if (claudeDir) {
    const memDir = join(claudeDir, "memory");
    if (!existsSync(memDir)) mkdirSync(memDir, { recursive: true });
    createSymlink(memoryFile, join(memDir, "MEMORY.md"));
  }

  // Symlink into project root for OpenCode
  const projectDir = resolveProjectDir(project, cwd);
  if (projectDir) {
    createSymlink(memoryFile, join(projectDir, "OPENCODE.md"));
  }
}

export async function runSummarizer(hoursBack = 24) {
  const projects = getProjectsToSummarize(hoursBack);

  if (projects.length === 0) {
    console.log("No new sessions to summarize.");
    return;
  }

  console.log(`Found ${projects.length} project(s) with new sessions`);

  for (const { project, cwd } of projects) {
    console.log(`\nSummarizing: ${project}`);
    const turns = getRecentTurns(project, hoursBack);
    if (turns.length === 0) continue;

    const sessionIds = [...new Set(turns.map((t) => t.session_id))];
    console.log(`  ${sessionIds.length} session(s), ${turns.length} turns`);

    try {
      const summary = await summarizeWithClaude(project, turns);
      if (summary && !summary.includes("No notable decisions")) {
        writeMemory(project, summary, cwd);
      } else {
        console.log("  Nothing notable.");
      }
      markSummarized(sessionIds);
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
  }
}
