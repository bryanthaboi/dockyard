---
name: dockyard-insert-work-order
description: >-
  Create a new Dockyard work order on disk via MCP tool workorder_insert. Use when the user wants to queue structured agent work, split a feature into trackable units, or log tasks under a dated issue slug. Requires markdown body with sections from ## Objective through ## Notes; see references/work-order-body-template.md.
---

# Insert Dockyard work order

MCP **tool** (`workorder_insert`). Fallback: **`dockyard insert --issue … --date … < body.md`**. See **`dockyard-session-guide`**.

## Procedure

1. Choose `date` (`YYYY-MM-DD`, usually today in the task timezone) and `issue` (slug, e.g. `matchmaking-api`).
2. Build `content` starting at `## Objective`. Load [references/work-order-body-template.md](references/work-order-body-template.md) if you need the exact required headings.
3. Call MCP tool **`workorder_insert`** with `{ date, issue, content }`.
4. Read the JSON response for `id` (e.g. `wo-003`). Tell the user that id; do not invent numbering.

## Errors

If the tool reports missing sections, add the required `##` headings and retry.

## Isolation

Work orders live under `DOCKYARD_ROOT` (default `~/.dockyard`), not in the app repo. When later emitting code for product repos, run **`workorder_validate_output`** on that code before finishing.
