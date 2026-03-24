---
name: dockyard-list-work-orders
description: >-
  List work order ids and statuses via MCP workorder_list for a date and repo (optional issue). Use for one track (--issue) or all issues under a repo (omit issue).
---

# List Dockyard work orders (repo + date)

MCP **tool** (`workorder_list`). Fallback: **`dockyard list --repo … [--issue …] --date …`**. See **`dockyard-session-guide`**.

## Procedure

1. Confirm `date` (`YYYY-MM-DD`) and **`repo`** (folder under the date; required).
2. Optionally pass **`issue`** to scope to a single track; omit to list every issue folder under that repo.
3. Call MCP tool **`workorder_list`** with `{ date, repo, issue? }`.
4. Present `workOrders`: each item has `id`, `status`, and **`issue`** (folder name; when you passed a single `issue`, it matches that track). Empty list means no data for that scope.

## Follow-ups

To load full text of one row, use **`workorder_get`**. For only incomplete items across many issues, prefer **`workorder_list_pending`**.
