---
name: dockyard-list-pending-work-orders
description: >-
  List incomplete Dockyard work orders via MCP workorder_list_pending. Use when driving a queue, standup summaries, or “what’s left” across all issues; optional filters date and/or issue. Results sort by date, issue, then WO number.
---

# List pending Dockyard work orders

Dockyard registers **`workorder_*` as MCP tools**, not resources — an empty MCP resource list does not mean Dockyard is offline. Prefer invoking this tool directly; if it is missing, use **`dockyard pending`** (same `DOCKYARD_ROOT`). See **`dockyard-session-guide`** for the full picture.

## Procedure

1. Decide scope: global queue (omit both filters), single day (`date` only), or single issue on a day (`date` + `issue`).
2. Call MCP tool **`workorder_list_pending`** with optional `{ date?, issue? }`.
3. Iterate `pending` array entries: each has `date`, `issue`, `id`, `status` (always `pending`).

## Workflow tie-in

Typical loop: list pending → **`workorder_get`** for the first item → do the work → **`workorder_complete`**.
