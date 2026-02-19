# agent-memory

Local cross-session memory for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [OpenCode](https://opencode.ai). Indexes your coding sessions into SQLite and auto-summarizes key decisions so your next session starts with full context.

**No cloud. No auth. No telemetry.** Everything runs on your machine.

## Why

AI coding agents forget everything between sessions. You re-explain the same architecture, the same conventions, the same bugs. This tool fixes that:

1. **Watches** `~/.claude/projects/` for session JSONL files
2. **Indexes** every user/assistant turn into a local SQLite database
3. **Summarizes** recent sessions via Claude Haiku — extracts decisions, file paths, patterns, bugs
4. **Writes** summaries to memory files that Claude Code and OpenCode auto-load on next session start

Your agents get smarter over time, automatically.

## Install

```bash
git clone https://github.com/takhir-iota/agent-memory.git
cd agent-memory
npm install
npm link   # makes `agent-memory` available globally
```

Requires Node.js 18+ and an [Anthropic API key](https://console.anthropic.com/) for summarization.

```bash
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc
source ~/.zshrc
```

## Usage

### Index existing sessions

```bash
agent-memory index
# Found 83 session files
# Done: 66 sessions, 5507 new turns
# Total: 79 sessions, 5925 turns across 8 projects
```

### Search across sessions

```bash
agent-memory search "auth|token|jwt"
agent-memory search "refactor" --type user --project speak
agent-memory search "skeleton" --limit 5
```

Options:
- `--type <all|user|assistant|sessions>` — filter by role
- `--project <name>` — filter by project (substring match)
- `--limit <n>` — max results (default: 20)
- `--context <n>` — characters around match (default: 120)

### Summarize recent sessions

```bash
agent-memory summarize        # last 24 hours
agent-memory summarize 48     # last 48 hours
```

Calls Claude Haiku to distill sessions into per-project memory files at `~/.agent-memory/projects/`. These get symlinked to:

- `~/.claude/projects/{project}/memory/MEMORY.md` — Claude Code reads this automatically
- `~/{project}/OPENCODE.md` — OpenCode reads this automatically

### Other commands

```bash
agent-memory sessions                    # list all indexed sessions
agent-memory sessions --project speak    # filter by project
agent-memory stats                       # show totals
```

## Background Daemons (macOS)

Two launchd services keep everything up to date automatically:

### Watcher — indexes sessions in real-time

```bash
# Install
cp com.agent-memory.watcher.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.agent-memory.watcher.plist

# Check
cat ~/.agent-memory/watcher.log
```

### Summarizer — runs hourly

```bash
# Install (requires ANTHROPIC_API_KEY in the plist)
cp com.agent-memory.summarizer.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.agent-memory.summarizer.plist

# Check
cat ~/.agent-memory/summarizer.log
```

## How It Works

```
You use Claude Code / OpenCode
  │
  ▼
Claude writes ~/.claude/projects/…/session.jsonl
  │
  ▼
Watcher detects change (chokidar, 2s debounce)
  │
  ▼
Parser streams JSONL line-by-line → SQLite
  │
  ▼
Summarizer (hourly) calls Claude Haiku
  │
  ▼
Writes ~/.agent-memory/projects/{project}.md
  │
  ├──▶ symlink → Claude Code MEMORY.md
  └──▶ symlink → OpenCode OPENCODE.md
  │
  ▼
Next session auto-loads memory → better context
```

## Architecture

- **`src/watcher.js`** — chokidar file watcher on `~/.claude/projects/**/*.jsonl`
- **`src/parser.js`** — streams JSONL line-by-line (handles 500MB+ files), extracts user/assistant turns
- **`src/db.js`** — SQLite via better-sqlite3 (WAL mode), stores sessions + turns
- **`src/search.js`** — regex search across all indexed turns with project/role filtering
- **`src/summarizer.js`** — calls Claude Haiku to distill recent turns into memory bullets
- **`bin/cli.js`** — CLI entrypoint

Data lives at `~/.agent-memory/sessions.db`. Delete it and re-run `agent-memory index` to rebuild.

## Motivation

Built as a replacement for [onecontext-ai](https://www.npmjs.com/package/onecontext-ai) (aline-ai) which requires Supabase auth, sends session data to a third-party Vercel backend, includes remote kill switches, and tracks LLM usage for billing. This project does the same useful things — indexing, search, summarization — with zero cloud dependencies.

## License

MIT
