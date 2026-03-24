import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { formatCodexMcpStdioBlock, stripCodexMcpServerSections } from "./codex-toml.js";
import { readJsonFile, writeJsonFile } from "./merge-json.js";
import { defaultHome, INSTALL_TARGETS, type InstallTarget, type McpEntry } from "./targets.js";

export type InstallAgentsOptions = {
  home: string;
  serverName: string;
  entry: McpEntry;
  dryRun: boolean;
  force: boolean;
  onlyTargets?: Set<string>;
};

export type InstallResult = {
  target: InstallTarget;
  path: string;
  action: "written" | "skipped" | "dry-run" | "would-skip";
};

function mkdirParent(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function mergeMcpServers(
  filePath: string,
  serverName: string,
  serverConfig: Record<string, unknown>,
  force: boolean,
): "written" | "skipped" {
  const data = readJsonFile(filePath);
  const existing = data.mcpServers;
  const mcpServers =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (mcpServers[serverName] && !force) return "skipped";
  mcpServers[serverName] = serverConfig;
  data.mcpServers = mcpServers;
  mkdirParent(filePath);
  writeJsonFile(filePath, data);
  return "written";
}

function mergeVscodeServers(
  filePath: string,
  serverName: string,
  serverConfig: Record<string, unknown>,
  force: boolean,
): "written" | "skipped" {
  const data = readJsonFile(filePath);
  const existing = data.servers;
  const servers =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (servers[serverName] && !force) return "skipped";
  servers[serverName] = serverConfig;
  data.servers = servers;
  mkdirParent(filePath);
  writeJsonFile(filePath, data);
  return "written";
}

function mergeZedContext(
  filePath: string,
  serverName: string,
  serverConfig: Record<string, unknown>,
  force: boolean,
): "written" | "skipped" {
  const data = readJsonFile(filePath);
  const existing = data.context_servers;
  const context_servers =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (context_servers[serverName] && !force) return "skipped";
  context_servers[serverName] = serverConfig;
  data.context_servers = context_servers;
  mkdirParent(filePath);
  writeJsonFile(filePath, data);
  return "written";
}

function mergeCodexToml(
  filePath: string,
  serverName: string,
  entry: McpEntry,
  force: boolean,
): "written" | "skipped" {
  let body = "";
  try {
    body = readFileSync(filePath, "utf8");
  } catch {
    body = "";
  }
  const marker = `[mcp_servers.${serverName}]`;
  if (body.includes(marker) && !force) return "skipped";
  let next = body;
  if (body.includes(marker) && force) {
    next = stripCodexMcpServerSections(body, serverName);
  }
  const block = formatCodexMcpStdioBlock(serverName, entry.command, entry.args, entry.env);
  const out = `${next.trimEnd()}\n\n${block}\n`.trim() + "\n";
  mkdirParent(filePath);
  writeFileSync(filePath, out, "utf8");
  return "written";
}

function wouldSkip(
  target: InstallTarget,
  filePath: string,
  serverName: string,
  force: boolean,
): boolean {
  if (force) return false;
  const marker = `[mcp_servers.${serverName}]`;
  if (target.format === "codexToml") {
    try {
      return readFileSync(filePath, "utf8").includes(marker);
    } catch {
      return false;
    }
  }
  const data = readJsonFile(filePath);
  if (target.format === "mcpServers") {
    const m = data.mcpServers as Record<string, unknown> | undefined;
    return !!(m && typeof m === "object" && serverName in m);
  }
  if (target.format === "vscodeServers") {
    const m = data.servers as Record<string, unknown> | undefined;
    return !!(m && typeof m === "object" && serverName in m);
  }
  if (target.format === "zedContextServers") {
    const m = data.context_servers as Record<string, unknown> | undefined;
    return !!(m && typeof m === "object" && serverName in m);
  }
  return false;
}

function buildServerConfig(target: InstallTarget, entry: McpEntry): Record<string, unknown> {
  if (target.id === "zed") {
    return {
      command: entry.command,
      args: entry.args,
      env: { ...entry.env },
    };
  }
  const base: Record<string, unknown> = {
    command: entry.command,
    args: entry.args,
    env: { ...entry.env },
  };
  if (target.id === "vscode" || target.id === "vscode-insiders") {
    base.type = "stdio";
  }
  if (target.id === "claude-code" || target.id === "claude-desktop") {
    base.type = "stdio";
  }
  return base;
}

export function installDockyardAgents(opts: InstallAgentsOptions): InstallResult[] {
  const results: InstallResult[] = [];
  const home = opts.home || defaultHome();

  for (const target of INSTALL_TARGETS) {
    if (opts.onlyTargets && !opts.onlyTargets.has(target.id)) continue;

    const filePath = target.resolvePath(home);
    if (!filePath) continue;

    const { serverName, entry } = opts;

    if (opts.dryRun) {
      const skip = wouldSkip(target, filePath, serverName, opts.force);
      results.push({
        target,
        path: filePath,
        action: skip ? "would-skip" : "dry-run",
      });
      continue;
    }

    let action: InstallResult["action"] = "skipped";

    if (target.format === "mcpServers") {
      const r = mergeMcpServers(filePath, serverName, buildServerConfig(target, entry), opts.force);
      action = r === "written" ? "written" : "skipped";
    } else if (target.format === "vscodeServers") {
      const r = mergeVscodeServers(filePath, serverName, buildServerConfig(target, entry), opts.force);
      action = r === "written" ? "written" : "skipped";
    } else if (target.format === "zedContextServers") {
      const r = mergeZedContext(filePath, serverName, buildServerConfig(target, entry), opts.force);
      action = r === "written" ? "written" : "skipped";
    } else if (target.format === "codexToml") {
      const r = mergeCodexToml(filePath, serverName, entry, opts.force);
      action = r === "written" ? "written" : "skipped";
    }

    results.push({ target, path: filePath, action });
  }

  return results;
}

export function listDetectedTargets(home: string = defaultHome()): { target: InstallTarget; path: string }[] {
  const out: { target: InstallTarget; path: string }[] = [];
  for (const target of INSTALL_TARGETS) {
    const p = target.resolvePath(home);
    if (p) out.push({ target, path: p });
  }
  return out;
}
