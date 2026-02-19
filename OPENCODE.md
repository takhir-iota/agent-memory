# Agent Memory - OpenCode Context

## Overview
This repo is the shared cross-session memory layer. Use `onecontext search` to pull past session context.

## Workflow
1. Before starting a task, run: `onecontext search "<keywords>" -t turn`
2. Review findings and apply relevant context
3. After completing work, update memory files here with key decisions/patterns

## Active Projects
- **velvet-match** (~/velvet-match) - Godot 4.6 adult match-3 game
- **IOTA ERP** (iota.uz) - Open-source ERP/CRM
- **GRANIT** - Euroasia Insurance platform (consulting)

## Cross-Session Search
```bash
# Broad search across sessions
onecontext search "keyword|synonym" -t session
# Detailed search in specific turns
onecontext search "keyword" -t turn --from 0 --to 30
# Deep dive into raw content
onecontext search "keyword" -t content --turns t123,t456
```
