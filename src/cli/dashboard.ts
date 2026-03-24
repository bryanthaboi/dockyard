import { execFileSync, spawn } from "node:child_process";
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

async function waitUntilPortClosed(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await apiAlreadyUp(port))) return;
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** PIDs listening on TCP `port` (excludes current process). macOS/Linux: lsof. Windows: netstat. */
function getListenPids(port: number): number[] {
  if (process.platform === "win32") {
    try {
      const out = execFileSync("cmd", ["/c", "netstat -ano"], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      });
      const pids = new Set<number>();
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes("LISTENING") || !line.includes(`:${port}`)) continue;
        const m = line.trim().match(/LISTENING\s+(\d+)\s*$/);
        if (m) {
          const n = parseInt(m[1]!, 10);
          if (!Number.isNaN(n) && n > 0 && n !== process.pid) pids.add(n);
        }
      }
      return [...pids];
    } catch {
      return [];
    }
  }
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }).trim();
    if (!out) return [];
    const pids = new Set<number>();
    for (const line of out.split(/\n/)) {
      const n = parseInt(line.trim(), 10);
      if (!Number.isNaN(n) && n > 0 && n !== process.pid) pids.add(n);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function killPid(pid: number, sig: NodeJS.Signals | "SIGKILL"): void {
  if (process.platform === "win32" && sig === "SIGKILL") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/F"], { stdio: "ignore" });
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* ignore */
      }
    }
    return;
  }
  process.kill(pid, sig);
}

/**
 * SIGTERM listeners on `port`, wait, then SIGKILL if /health still responds.
 * @throws if the port stays busy after kills (caller should exit).
 */
async function killListenersOnPort(port: number): Promise<void> {
  let pids = getListenPids(port);
  if (pids.length === 0 && (await apiAlreadyUp(port))) {
    throw new Error(
      `Port ${port} is in use but no listener PID was found (install/use lsof on macOS/Linux, or stop the process yourself).`,
    );
  }
  if (pids.length === 0) return;

  for (const pid of pids) {
    try {
      killPid(pid, "SIGTERM");
      console.error(`Sent SIGTERM to PID ${pid} (listener on port ${port}).`);
    } catch (e) {
      console.error(`SIGTERM PID ${pid}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await waitUntilPortClosed(port, 5000);

  if (await apiAlreadyUp(port)) {
    pids = getListenPids(port);
    for (const pid of pids) {
      try {
        killPid(pid, "SIGKILL");
        console.error(`Sent SIGKILL to PID ${pid} (port ${port} still up).`);
      } catch (e) {
        console.error(`SIGKILL PID ${pid}: ${e instanceof Error ? e.message : e}`);
      }
    }
    await waitUntilPortClosed(port, 4000);
  }

  if (await apiAlreadyUp(port)) {
    throw new Error(`Port ${port} still serves /health after kill — stop it manually (e.g. lsof -nP -iTCP:${port} -sTCP:LISTEN).`);
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
    const dockyardEnv: Record<string, string> = {
      DOCKYARD_VISUALIZER: "1",
      DOCKYARD_ROOT: resolveDockyardRoot(),
    };
    if (process.env.DOCKYARD_PORT) {
      dockyardEnv.DOCKYARD_PORT = process.env.DOCKYARD_PORT;
    }
    backendPid = spawnDetached(process.execPath, [indexJs], {
      cwd: packageRoot,
      env: dockyardEnv,
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
      `(API already on port ${apiPort}; "dockyard dashboard off" only stops a helper or Vite this CLI started — not your IDE MCP server.)`,
    );
  }
}

export type DashboardStopResult = {
  killedVite: boolean;
  killedBackend: boolean;
  hadStartedBackend: boolean;
  apiPort: number;
  hadVite: boolean;
};

/**
 * Stops Vite and/or the helper `node dist/index.js` recorded in `.dockyard-viewer.json`.
 * Does not stop whatever else is listening on `apiPort` (e.g. Dockyard launched as MCP from an IDE).
 */
export function stopDashboardViewer(): DashboardStopResult | null {
  const s = readState();
  if (!s) return null;

  let killedVite = false;
  if (s.vitePid > 0 && isAlive(s.vitePid)) {
    try {
      process.kill(s.vitePid, "SIGTERM");
      killedVite = true;
    } catch {
      /* ignore */
    }
  }

  let killedBackend = false;
  if (s.startedBackend && s.backendPid > 0 && isAlive(s.backendPid)) {
    try {
      process.kill(s.backendPid, "SIGTERM");
      killedBackend = true;
    } catch {
      /* ignore */
    }
  }

  try {
    unlinkSync(statePath());
  } catch {
    /* ignore */
  }

  return {
    killedVite,
    killedBackend,
    hadStartedBackend: s.startedBackend,
    apiPort: s.apiPort,
    hadVite: s.vitePid > 0,
  };
}

export function dashboardOff(): void {
  const r = stopDashboardViewer();
  if (!r) {
    console.error(
      "No saved viewer state — nothing to stop. Expected ~/.dockyard/.dockyard-viewer.json (or DOCKYARD_ROOT/.dockyard-viewer.json).",
    );
    console.error(
      "If something is still on DOCKYARD_PORT, it is not tracked here — usually the MCP server in your editor; restart Dockyard from the host app, or find the PID (e.g. lsof -i :36969).",
    );
    process.exit(1);
  }

  const parts: string[] = [];
  if (r.killedVite) parts.push("Vite dev server");
  if (r.killedBackend) parts.push("helper HTTP API");
  if (parts.length === 0) parts.push("no running PIDs from last state (already exited?)");
  console.error(`Stopped: ${parts.join(", ")}.`);

  if (!r.hadStartedBackend) {
    console.error(
      `Did not stop the process on port ${r.apiPort} — \`dashboard on\` did not start it (likely your IDE MCP server). Restart MCP there to load a new build.`,
    );
  } else if (!r.killedBackend && r.hadStartedBackend) {
    console.error("Helper API PID was already gone; port may still be in use by another process.");
  }
}

/**
 * Stop Vite + recorded helper, kill **whatever is listening on DOCKYARD_PORT** (including IDE MCP),
 * then run `dashboard on` (fresh helper + viewer). Cursor/VS Code will lose MCP until you re-enable the server.
 */
export async function dashboardRestart(packageRoot: string): Promise<void> {
  const port = resolvePort();
  const r = stopDashboardViewer();
  if (r) {
    const parts: string[] = [];
    if (r.killedVite) parts.push("Vite");
    if (r.killedBackend) parts.push("helper API");
    if (parts.length) console.error(`Stopped (from state): ${parts.join(", ")}.`);
  }

  if (await apiAlreadyUp(port)) {
    console.error(`Killing listener(s) on port ${port}…`);
    try {
      await killListenersOnPort(port);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
    console.error(`Port ${port} is free.`);
  }

  await dashboardOn(packageRoot);
}
