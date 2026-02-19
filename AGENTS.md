# Agent Instructions

## For All Agents (Claude Code, OpenCode, Codex)

### Memory Protocol
1. **On session start**: Check `MEMORY.md` and `OPENCODE.md` in this repo for project context.
2. **When context is missing**: Run `onecontext search "<query>"` to find relevant past sessions.
3. **On session end**: Update the relevant memory file with key decisions, patterns discovered, or architectural choices made.

### OneContext Search Protocol
Always follow broad-to-deep:
1. `onecontext search "<keywords>" -t session` - find relevant sessions
2. `onecontext search "<keywords>" -t turn` - find specific turns
3. `onecontext search "<keywords>" -t content --turns <ids>` - deep dive only when needed

### What to Record
- Architectural decisions and why they were made
- Patterns that work (and patterns that don't)
- Key file paths and project structure
- User preferences confirmed across sessions
- Solutions to recurring problems

### What NOT to Record
- Session-specific temporary state
- Unverified assumptions from a single file read
- Anything that duplicates CLAUDE.md or project-level configs
