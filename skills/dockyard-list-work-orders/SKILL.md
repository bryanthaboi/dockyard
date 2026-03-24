---
name: dockyard-list-work-orders
description: >-
  List work order ids and statuses for one date/issue folder via MCP workorder_list. Use when the user wants an overview of WOs for a specific day and issue, or to choose which wo-NNN to open next.
---

# List Dockyard work orders (one issue)

MCP **tool** (`workorder_list`). Fallback: **`dockyard list --issue … --date …`**. See **`dockyard-session-guide`**.

## Procedure

1. Confirm `date` (`YYYY-MM-DD`) and `issue` (slug).
2. Call MCP tool **`workorder_list`** with `{ date, issue }`.
3. Present `workOrders` as id + status. Empty list means no index yet for that folder.

## Follow-ups

To load full text of one row, use **`workorder_get`**. For only incomplete items across many issues, prefer **`workorder_list_pending`**.
