import { watch } from "chokidar";
import { join } from "path";
import { homedir } from "os";
import { indexSession } from "./parser.js";
import { closeDb } from "./db.js";

const CLAUDE_PROJECTS = join(homedir(), ".claude", "projects");

console.log(`Watching ${CLAUDE_PROJECTS} for session changes...`);

const watcher = watch(join(CLAUDE_PROJECTS, "**/*.jsonl"), {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
  ignored: /\/subagents\//,
});

watcher.on("add", (path) => handleFile(path, "new"));
watcher.on("change", (path) => handleFile(path, "updated"));

async function handleFile(path, event) {
  try {
    const { newTurns, totalTurns } = await indexSession(path);
    if (newTurns > 0) {
      console.log(
        `[${new Date().toISOString().slice(11, 19)}] ${event}: +${newTurns} turns (${totalTurns} total) — ${path.split("/").slice(-2).join("/")}`
      );
    }
  } catch (err) {
    console.error(`Error indexing ${path}: ${err.message}`);
  }
}

process.on("SIGINT", () => {
  console.log("\nStopping watcher...");
  watcher.close();
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  watcher.close();
  closeDb();
  process.exit(0);
});
