const FORBIDDEN = ["work order", "wo-", "MCP", "mcp-root"] as const;

export function validateOutput(code: string): { ok: true } | { ok: false; reason: string } {
  const lower = code.toLowerCase();
  for (const f of FORBIDDEN) {
    if (lower.includes(f.toLowerCase())) {
      return { ok: false, reason: `Forbidden substring: ${f}` };
    }
  }
  return { ok: true };
}

export function forbiddenList(): readonly string[] {
  return FORBIDDEN;
}
