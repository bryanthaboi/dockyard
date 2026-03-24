---
name: dockyard-complete-work-order
description: >-
  Mark a Dockyard work order complete in index.json via MCP workorder_complete. Use after the work described in that WO is done and verified; requires date, issue slug, and wo-NNN id.
---

# Complete Dockyard work order

MCP **tool** only — not exposed as a resource. Fallback: **`dockyard complete --issue … --date … --id wo-NNN`**. See **`dockyard-session-guide`**.

## Procedure

1. Confirm `date`, `issue`, and `woId` (`wo-001` format).
2. Call MCP tool **`workorder_complete`** with `{ date, issue, woId }`.
3. On success, response includes `{ ok: true }`. The markdown file is not rewritten; status in the index is source of truth.

## When not to use

Do not mark complete if work failed or was deferred—update product code or add a new WO instead.
