---
name: dockyard-get-work-order
description: >-
  Load one Dockyard work order’s markdown and status via MCP workorder_get. Use when the user asks to read, review, summarize, or execute a specific WO identified by date, issue slug, and wo-NNN id.
---

# Get Dockyard work order

This is an MCP **tool** (`workorder_get`), not a resource. If the tool is not in the session, read `~/.dockyard/<date>/<issue>/<id>.md` or use the HTTP GET in `docs/agent-workflow.md`. See **`dockyard-session-guide`**.

## Procedure

1. Obtain `date` (`YYYY-MM-DD`), `issue` (slug matching the folder under that date), and `woId` (`wo-001` style).
2. Call MCP tool **`workorder_get`** with `{ date, issue, woId }`.
3. Use the returned `status` (`pending` | `complete`) and `markdown` for the user’s request.

## Notes

Status is authoritative in the index; the markdown body may still show `Status: pending` in the header—prefer the JSON `status` field when they differ.
