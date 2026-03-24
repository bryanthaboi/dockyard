/** Remove OpenAI Codex `[mcp_servers.<key>]` and nested `[mcp_servers.<key>.env]` sections. */
export function stripCodexMcpServerSections(toml: string, key: string): string {
  const mainHeader = `[mcp_servers.${key}]`;
  const envHeader = `[mcp_servers.${key}.env]`;
  const lines = toml.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    if (trimmed === mainHeader) {
      i++;
      while (i < lines.length) {
        const t = lines[i]!.trim();
        if (t === envHeader) {
          i++;
          while (i < lines.length && !lines[i]!.trim().startsWith("[")) i++;
          continue;
        }
        if (t.startsWith("[")) break;
        i++;
      }
      continue;
    }
    if (trimmed === envHeader) {
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("[")) i++;
      continue;
    }
    out.push(lines[i]!);
    i++;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function formatCodexMcpStdioBlock(
  key: string,
  command: string,
  args: string[],
  env: Record<string, string>,
): string {
  const argLines = args.map((a) => `  ${tomlDoubleQuoted(a)},`).join("\n");
  const envLines =
    Object.keys(env).length > 0
      ? `\n[mcp_servers.${key}.env]\n${Object.entries(env)
          .map(([k, v]) => `${k} = ${tomlDoubleQuoted(v)}`)
          .join("\n")}`
      : "";
  return `
[mcp_servers.${key}]
enabled = true
command = ${tomlDoubleQuoted(command)}
args = [
${argLines}
]${envLines}
`.trim();
}

function tomlDoubleQuoted(s: string): string {
  const escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}
