---
name: dockyard-next-work-order-number
description: >-
  Read the next 1-based work order sequence number for a date/issue via MCP workorder_next_number. Use when drafting titles or planning how many WOs to create before calling workorder_insert (the server still assigns the canonical id on insert).
---

# Next Dockyard work order number

MCP **tool** (`workorder_next_number`); not an MCP resource. See **`dockyard-session-guide`** if the tool is missing.

## Procedure

1. Provide `date` (`YYYY-MM-DD`) and `issue` (slug).
2. Call MCP tool **`workorder_next_number`** with `{ date, issue }`.
3. Use `nextWorkOrderNumber` from the JSON response for planning only; after **`workorder_insert`**, trust the returned `id`.

## Example

If the response is `{ "nextWorkOrderNumber": 4 }`, the next insert will become `wo-004` unless numbering rules change in a future release—always use the insert response as final.
