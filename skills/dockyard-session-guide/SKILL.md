---
name: dockyard-session-guide
description: >-
  How to use Dockyard in this chat: work orders live under DOCKYARD_ROOT (default ~/.dockyard). Dockyard exposes MCP tools named workorder_* — not MCP resources, so “list resources” will not show Dockyard. Prefer tool calls for workorder_list_pending / workorder_get / workorder_complete; if tools are missing, use the dockyard CLI or enable MCP via dockyard install-agents and restart the host app. Use when the user says to use Dockyard, drain the queue, or complete work orders.
---

# Dockyard in this session

## What is wired up

- **MCP tools** (stdio server, usually named `dockyard` in config): `workorder_insert`, `workorder_get`, `workorder_list`, `workorder_list_pending`, `workorder_complete`, `workorder_next_number`, `workorder_validate_output`.
- **Not MCP resources** — there are no `dockyard://…` style resources. If you only listed MCP resources and saw nothing, that is **normal**. Next step: invoke **tools** (`workorder_*`) from the tool picker / your host’s MCP tool API, or use the **CLI** below.

## Quick check

1. Call **`workorder_list_pending`** with no arguments (full queue). If you get JSON with a `pending` array, you are connected.
2. If that tool is not available: run **`dockyard pending`** in the shell — same data on disk (`DOCKYARD_ROOT`).
3. Still stuck: MCP may be off for this app. From the Dockyard package (after `pnpm run build`): **`dockyard install-agents --targets codex`** (or `cursor`, etc.), then **fully restart** the host (Codex, Cursor, …).

## Drain the queue (happy path)

1. **`workorder_list_pending`** → each item has `date`, `issue`, `id` (`wo-001` style).
2. For each item in order: **`workorder_get`** → implement → verify → **`workorder_complete`** with the same `date`, `issue`, `woId`.
3. Repeat until `pending` is empty.

## CLI equivalents (same files as MCP)

Use when MCP tools are not callable in this session:

| MCP tool | Shell |
| -------- | ----- |
| `workorder_list_pending` | `dockyard pending` (optional `--date`, `--repo`, `--issue`; TSV includes **repo**) |
| `workorder_list` | `dockyard list --repo REPO --issue SLUG --date YYYY-MM-DD` (omit `--repo` if unambiguous) |
| `workorder_complete` | `dockyard complete --repo REPO --issue SLUG --date YYYY-MM-DD --id wo-NNN` |
| `workorder_insert` | `dockyard insert --repo REPO --issue SLUG --date YYYY-MM-DD < body.md` (repo defaults to **default**) |
| `workorder_get` | No `dockyard get`: read `~/.dockyard/<date>/<repo>/<issue>/<id>.md`, or `GET …/work-orders/<date>/<repo>/<issue>/<id>` (older trees: repo **`legacy`**) |

Env: `DOCKYARD_ROOT`, `DOCKYARD_PORT` (default **36969**).

## Deeper docs

In the Dockyard package: **README.md** (install, `install-agents`, `install-skills`, full CLI) and **docs/agent-workflow.md** (lifecycle, HTTP table, MCP targets).
