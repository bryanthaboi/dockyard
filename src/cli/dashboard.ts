import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveDockyardRoot, resolvePort } from "../config.js";

const VITE_PORT = 5173;

type ViewerState = {
  backendPid: number;
  /** 0 = static dashboard (no Vite); otherwise detached Vite dev PID */
  vitePid: number;
  apiPort: number;
  /** Port shown to the user (Vite dev port or API port for static bundle) */
  viewerPort: number;
  startedBackend: boolean;
  startedAt: string;
};

function statePath(): string {
  return join(resolveDockyardRoot(), ".dockyard-viewer.json");
}

function isAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readState(): ViewerState | null {
  const p = statePath();
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as ViewerState & { vitePort?: number };
    if (raw.viewerPort == null && raw.vitePort != null) {
      raw.viewerPort = raw.vitePort;
    }
    return raw as ViewerState;
  } catch {
    return null;
  }
}

function writeState(s: ViewerState): void {
  const p = statePath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(s, null, 2)}\n`, "utf8");
}

async function apiAlreadyUp(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(600) });
    return r.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(port: number, timeoutMs = 20000): Promise<void> {
  const url = `http://127.0.0.1:${port}/health`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Dockyard API did not respond on http://127.0.0.1:${port}/health`);
}

function spawnDetached(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> },
): number {
  const child = spawn(command, args, {
    cwd: options.cwd,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ...options.env },
  });
  child.unref();
  const pid = child.pid;
  if (pid == null) throw new Error("Failed to spawn process");
  return pid;
}

function tryResolveViteBin(packageRoot: string): string | null {
  try {
    const require = createRequire(join(packageRoot, "package.json"));
    const vitePkgJson = require.resolve("vite/package.json");
    const bin = join(vitePkgJson, "..", "bin", "vite.js");
    if (!existsSync(bin)) return null;
    return bin;
  } catch {
    return null;
  }
}

function hasStaticDashboard(packageRoot: string): boolean {
  return existsSync(join(packageRoot, "dashboard", "dist", "index.html"));
}

export async function dashboardOn(packageRoot: string): Promise<void> {
  const indexJs = join(packageRoot, "dist", "index.js");
  if (!existsSync(indexJs)) {
    console.error("Missing dist/index.js — run: pnpm run build");
    process.exit(1);
  }

  const apiPort = resolvePort();
  const existing = readState();
  if (existing) {
    const viteRunning = existing.vitePid > 0 && isAlive(existing.vitePid);
    const staticMode = existing.vitePid === 0;
    const backendOk = existing.startedBackend ? isAlive(existing.backendPid) : true;
    const apiOk = await apiAlreadyUp(existing.apiPort);
    const sessionOk =
      (viteRunning || (staticMode && apiOk)) && (!existing.startedBackend || backendOk);
    if (sessionOk) {
      const url = `http://127.0.0.1:${existing.viewerPort}`;
      console.log(url);
      console.error(
        "(viewer already running — open the URL above; same work orders your MCP server writes under DOCKYARD_ROOT)",
      );
      return;
    }
    try {
      unlinkSync(statePath());
    } catch {
      /* ignore */
    }
  }

  let backendPid = 0;
  let startedBackend = false;

  if (!(await apiAlreadyUp(apiPort))) {
    backendPid = spawnDetached(process.execPath, [indexJs], {
      cwd: packageRoot,
      env: { DOCKYARD_VISUALIZER: "1" },
    });
    startedBackend = true;
    await waitForHealth(apiPort);
  }

  const viteBin = tryResolveViteBin(packageRoot);
  const viteConfig = join(packageRoot, "dashboard", "vite.config.ts");
  const canViteDev = Boolean(viteBin && existsSync(viteConfig));

  let vitePid = 0;
  let viewerPort: number;

  if (canViteDev) {
    try {
      vitePid = spawnDetached(process.execPath, [
        viteBin!,
        "dev",
        "--config",
        "dashboard/vite.config.ts",
        "--port",
        String(VITE_PORT),
        "--strictPort",
      ], { cwd: packageRoot });
      viewerPort = VITE_PORT;
    } catch (e) {
      if (startedBackend && backendPid > 0) {
        try {
          process.kill(backendPid, "SIGTERM");
        } catch {
          /* ignore */
        }
      }
      throw e;
    }
  } else if (hasStaticDashboard(packageRoot)) {
    viewerPort = apiPort;
    console.error(
      "Vite not installed (normal for npm installs) — using the dashboard bundled with the HTTP API.",
    );
  } else {
    if (startedBackend && backendPid > 0) {
      try {
        process.kill(backendPid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
    console.error(
      "Cannot start dashboard: no Vite dev deps and no dashboard/dist/index.html. Run `pnpm run build` from the Dockyard source tree, or reinstall the published package.",
    );
    process.exit(1);
  }

  writeState({
    backendPid: startedBackend ? backendPid : 0,
    vitePid,
    apiPort,
    viewerPort,
    startedBackend,
    startedAt: new Date().toISOString(),
  });

  console.log(`http://127.0.0.1:${viewerPort}/`);
  console.error("Open the URL in your browser — work orders on disk (same DOCKYARD_ROOT as MCP).");
  if (!startedBackend) {
    console.error(
      `(API already on port ${apiPort}; "dockyard dashboard off" only stops a helper or Vite we started.)`,
    );
  }
}

export function dashboardOff(): void {
  const s = readState();
  if (!s) {
    console.error("No saved viewer state — nothing to stop (look for .dockyard-viewer.json under DOCKYARD_ROOT).");
    process.exit(1);
  }

  const viewerPort = s.viewerPort ?? (s as { vitePort?: number }).vitePort ?? VITE_PORT;

  if (s.vitePid > 0 && isAlive(s.vitePid)) {
    try {
      process.kill(s.vitePid, "SIGTERM");
    } catch {
      /* ignore */
    }
  }

  if (s.startedBackend && s.backendPid > 0 && isAlive(s.backendPid)) {
    try {
      process.kill(s.backendPid, "SIGTERM");
    } catch {
      /* ignore */
    }
  }

  try {
    unlinkSync(statePath());
  } catch {
    /* ignore */
  }

  const mode =
    s.vitePid > 0 ? "Vite dev + " : viewerPort === s.apiPort ? "static UI + " : "";
  const backendNote = s.startedBackend ? "local API helper" : "external API";
  console.error(`Viewer stopped (${mode}${backendNote}).`);
}
