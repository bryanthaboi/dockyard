import { existsSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

export type McpEntry = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

export type InstallFormat =
  | "mcpServers"
  | "vscodeServers"
  | "zedContextServers"
  | "codexToml";

export type InstallTarget = {
  id: string;
  label: string;
  format: InstallFormat;
  /** Return config file path if this agent should receive an install, else null (skip). */
  resolvePath(home: string): string | null;
};

function isDirectory(p: string): boolean {
  try {
    return statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false;
  } catch {
    return false;
  }
}

function codeUserDir(home: string, insiders: boolean): string {
  if (platform() === "darwin") {
    const name = insiders ? "Code - Insiders" : "Code";
    return join(home, "Library", "Application Support", name, "User");
  }
  if (platform() === "win32") {
    const base = process.env.APPDATA;
    if (!base) return "";
    const name = insiders ? "Code - Insiders" : "Code";
    return join(base, name, "User");
  }
  const name = insiders ? "Code - Insiders" : "Code";
  return join(home, ".config", name, "User");
}

function zedSettingsPath(home: string): string | null {
  const mac = join(home, "Library", "Application Support", "Zed", "settings.json");
  const xdg = join(home, ".config", "zed", "settings.json");
  if (existsSync(mac)) return mac;
  if (existsSync(xdg)) return xdg;
  if (platform() === "darwin") return mac;
  return xdg;
}

export const INSTALL_TARGETS: InstallTarget[] = [
  {
    id: "cursor",
    label: "Cursor",
    format: "mcpServers",
    resolvePath(home) {
      const dir = join(home, ".cursor");
      return isDirectory(dir) ? join(dir, "mcp.json") : null;
    },
  },
  {
    id: "vscode",
    label: "VS Code (stable)",
    format: "vscodeServers",
    resolvePath(home) {
      const u = codeUserDir(home, false);
      return u && isDirectory(u) ? join(u, "mcp.json") : null;
    },
  },
  {
    id: "vscode-insiders",
    label: "VS Code Insiders",
    format: "vscodeServers",
    resolvePath(home) {
      const u = codeUserDir(home, true);
      return u && isDirectory(u) ? join(u, "mcp.json") : null;
    },
  },
  {
    id: "claude-code",
    label: "Claude Code",
    format: "mcpServers",
    resolvePath(home) {
      const dir = join(home, ".claude");
      return isDirectory(dir) ? join(dir, "settings.json") : null;
    },
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    format: "mcpServers",
    resolvePath(home) {
      if (platform() === "darwin") {
        const dir = join(home, "Library", "Application Support", "Claude");
        return isDirectory(dir) ? join(dir, "claude_desktop_config.json") : null;
      }
      if (platform() === "win32") {
        const base = process.env.APPDATA;
        if (!base) return null;
        const dir = join(base, "Claude");
        return isDirectory(dir) ? join(dir, "claude_desktop_config.json") : null;
      }
      const dir = join(home, ".config", "Claude");
      return isDirectory(dir) ? join(dir, "claude_desktop_config.json") : null;
    },
  },
  {
    id: "codex",
    label: "OpenAI Codex CLI",
    format: "codexToml",
    resolvePath(home) {
      const dir = join(home, ".codex");
      return isDirectory(dir) ? join(dir, "config.toml") : null;
    },
  },
  {
    id: "windsurf",
    label: "Windsurf",
    format: "mcpServers",
    resolvePath(home) {
      const dir = join(home, ".codeium", "windsurf");
      return isDirectory(dir) ? join(dir, "mcp_config.json") : null;
    },
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    format: "mcpServers",
    resolvePath(home) {
      const dir = join(home, ".gemini");
      return isDirectory(dir) ? join(dir, "settings.json") : null;
    },
  },
  {
    id: "antigravity",
    label: "Antigravity IDE",
    format: "mcpServers",
    resolvePath(home) {
      const dir = join(home, ".gemini", "antigravity");
      return isDirectory(dir) ? join(dir, "mcp_config.json") : null;
    },
  },
  {
    id: "zed",
    label: "Zed",
    format: "zedContextServers",
    resolvePath(home) {
      const macDir = join(home, "Library", "Application Support", "Zed");
      const xdgDir = join(home, ".config", "zed");
      if (isDirectory(macDir) || isDirectory(xdgDir)) {
        return zedSettingsPath(home);
      }
      return null;
    },
  },
];

export function defaultHome(): string {
  return homedir();
}
