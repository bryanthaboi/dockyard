import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveDockyardRoot, resolvePort } from "../config.js";

const VITE_PORT = 5173;

type ViewerState = {
  backendPid: number;
  vitePid: number;
  apiPort: number;
  vitePort: number;
  startedBackend: boolean;
  startedAt: string;
};

function statePath(): string {
  return join(resolveDockyardRoot(), ".dockyard-viewer.json");
}

function isAlive(pid: number): boolean {
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
    return JSON.parse(readFileSync(p, "utf8")) as ViewerState;
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

function resolveViteBin(packageRoot: string): string {
  const require = createRequire(join(packageRoot, "package.json"));
  const vitePkgJson = require.resolve("vite/package.json");
  const bin = join(vitePkgJson, "..", "bin", "vite.js");
  if (!existsSync(bin)) {
    throw new Error(`Vite CLI missing at ${bin}; run pnpm install in the Dockyard package root`);
  }
  return bin;
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
    const viteOk = isAlive(existing.vitePid);
    const backendOk = existing.startedBackend ? isAlive(existing.backendPid) : true;
    if (viteOk && (!existing.startedBackend || backendOk)) {
      console.log(`http://127.0.0.1:${existing.vitePort}`);
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

  let vitePid: number;
  try {
    const viteBin = resolveViteBin(packageRoot);
    vitePid = spawnDetached(process.execPath, [
      viteBin,
      "dev",
      "--config",
      "dashboard/vite.config.ts",
      "--port",
      String(VITE_PORT),
      "--strictPort",
    ], { cwd: packageRoot });
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

  writeState({
    backendPid: startedBackend ? backendPid : 0,
    vitePid,
    apiPort,
    vitePort: VITE_PORT,
    startedBackend,
    startedAt: new Date().toISOString(),
  });

  console.log(`http://127.0.0.1:36969`);
  console.error(
    "Open the URL in your browser — shows work orders on disk.",
  );
  if (!startedBackend) {
    console.error(
      `(use "dockyard dashboard off" to turn the dashboard off.)`,
    );
  }
}

export function dashboardOff(): void {
  const s = readState();
  if (!s) {
    console.error("No saved viewer state — nothing to stop (look for .dockyard-viewer.json under DOCKYARD_ROOT).");
    process.exit(1);
  }

  if (isAlive(s.vitePid)) {
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

  console.error("Viewer stopped (Vite" + (s.startedBackend ? " + local API helper" : "") + ").");
}
