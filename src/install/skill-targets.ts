import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function isDirectory(p: string): boolean {
  try {
    return statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false;
  } catch {
    return false;
  }
}

export type SkillInstallTarget = {
  id: string;
  label: string;
  /** Parent skills directory (each Dockyard skill is copied as a subfolder here). */
  resolveSkillsDir(home: string): string | null;
};

function codexHome(home: string): string {
  return process.env.CODEX_HOME?.trim() || join(home, ".codex");
}

export const SKILL_INSTALL_TARGETS: SkillInstallTarget[] = [
  {
    id: "cursor",
    label: "Cursor",
    resolveSkillsDir(home) {
      return isDirectory(join(home, ".cursor")) ? join(home, ".cursor", "skills") : null;
    },
  },
  {
    id: "codex",
    label: "OpenAI Codex CLI",
    resolveSkillsDir(home) {
      const root = codexHome(home);
      return isDirectory(root) ? join(root, "skills") : null;
    },
  },
  {
    id: "claude-code",
    label: "Claude Code",
    resolveSkillsDir(home) {
      return isDirectory(join(home, ".claude")) ? join(home, ".claude", "skills") : null;
    },
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    resolveSkillsDir(home) {
      return isDirectory(join(home, ".gemini")) ? join(home, ".gemini", "skills") : null;
    },
  },
  {
    id: "windsurf",
    label: "Windsurf",
    resolveSkillsDir(home) {
      const root = join(home, ".codeium", "windsurf");
      return isDirectory(root) ? join(root, "skills") : null;
    },
  },
  {
    id: "zed",
    label: "Zed",
    resolveSkillsDir(home) {
      const mac = join(home, "Library", "Application Support", "Zed");
      const xdg = join(home, ".config", "zed");
      if (isDirectory(mac)) return join(mac, "skills");
      if (isDirectory(xdg)) return join(xdg, "skills");
      return null;
    },
  },
];

export function defaultHomeDir(): string {
  return homedir();
}
