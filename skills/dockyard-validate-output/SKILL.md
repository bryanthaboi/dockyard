---
name: dockyard-validate-output
description: >-
  Run MCP tool workorder_validate_output on a code string before committing or pasting into product repos. Use when Dockyard workflow requires checking generated code for forbidden substrings (best-effort lint). Triggers when the user wants leakage checks, “sanity check this patch,” or policy compliance on emitted source.
---

# Validate generated code (Dockyard policy)

MCP **tool** (`workorder_validate_output`); not an MCP resource. See **`dockyard-session-guide`** if the tool is missing.

## Procedure

1. Take the final `code` string (full file or patch body—tool scans the whole string).
2. Call MCP tool **`workorder_validate_output`** with `{ code }`.
3. If `{ ok: false, reason: ... }`, rewrite to remove the forbidden fragment and re-run until `ok: true` or explain why rephrase is impossible.

## What it checks

Lowercase substring scan for: `work order`, `wo-`, `MCP`, `mcp-root`. Expect false positives (e.g. unrelated `wo-` inside words).

## Scope

This does not replace security review; it only reduces accidental Dockyard terminology in shipped code.
