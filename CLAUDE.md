# Agent Memory Repo

This repo is the shared cross-session memory layer for Claude Code and OpenCode.
Both tools read/write `MEMORY.md` as their project-level context when working in this directory.

## How It Works
- **oneContext** (aline-ai) watches `~/.claude/projects/` for session JSONL, indexes into `~/.aline/db/aline.db`, and provides `onecontext search` for cross-session recall.
- **Claude Code** auto-memory writes to `~/.claude/projects/{project}/memory/MEMORY.md` per-project.
- **OpenCode** uses `OPENCODE.md` in project root as its memory file.
- This repo centralizes the shared knowledge both agents should have.

## Rules
- Keep `MEMORY.md` under 200 lines (Claude Code auto-memory truncation limit).
- Use topic files (`patterns.md`, `decisions.md`, etc.) for detailed notes.
- Before starting a task in any project, search oneContext: `onecontext search "<keywords>" -t turn`
- After completing significant work, update the relevant project's memory file.
