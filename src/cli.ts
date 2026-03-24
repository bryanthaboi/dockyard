#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { resolveDockyardRoot } from "./config.js";
import { WorkOrderService } from "./core/work-order-service.js";
import { installBundledSkills, listDetectedSkillRoots } from "./install/skill-install.js";
import { dashboardOff, dashboardOn } from "./cli/dashboard.js";
import { installDockyardAgents, listDetectedTargets } from "./install/run.js";

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readContent(file?: string): string {
  if (file) {
    if (file === "-") return readFileSync(0, "utf8");
    return readFileSync(file, "utf8");
  }
  return readFileSync(0, "utf8");
}

function defaultPackageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function dockyardBanner(): string {
  try {
    const raw = readFileSync(join(defaultPackageRoot(), "dockyardlogo.txt"), "utf8").trimEnd();
    return raw ? `${raw}\n\n` : "";
  } catch {
    return "";
  }
}

const program = new Command();
program
  .name("dockyard")
  .description(
    "Work orders on disk, MCP tools, HTTP API, and browser viewer. Viewer: dockyard dashboard on | dockyard dashboard off",
  )
  .version("0.1.0")
  .addHelpText("before", dockyardBanner())
  .addHelpText(
    "after",
    `
Viewer (Vite + API for the same DOCKYARD_ROOT as MCP):
  $ dockyard dashboard on     # prints dashboard URL (5173 with Vite, else API port for static UI)
  $ dockyard dashboard off    # stop processes started by dashboard on
  Needs: pnpm run build (dist/ + node_modules). API port from DOCKYARD_PORT (default 36969).

Layout on disk: DOCKYARD_ROOT/<date>/<repo>/<issue>/wo-NNN.md (older data may use date/<issue>/ only; API exposes that as repo "legacy").

by bryanthaboi — https://boisclub.games
`,
  );

const dashboard = program
  .command("dashboard")
  .description(
    "Browser viewer for work orders on disk (Vite dev server; starts API if nothing listens on DOCKYARD_PORT)",
  );

dashboard
  .command("on")
  .description("Run viewer in background and print the URL to open")
  .option("--package-root <path>", "Dockyard package root (contains dist/, dashboard/, node_modules)")
  .action(async (opts: { packageRoot?: string }) => {
    const root = opts.packageRoot ?? defaultPackageRoot();
    await dashboardOn(root);
  });

dashboard
  .command("off")
  .description("Stop the viewer (and helper API) started by dashboard on")
  .action(() => {
    dashboardOff();
  });

program
  .command("insert")
  .description("Insert a work order (markdown from stdin unless --file)")
  .requiredOption("--issue <slug>", "Issue name or slug")
  .option("--repo <slug>", "Repo folder under the date (default: default)", "default")
  .option("--date <ymd>", "Date folder YYYY-MM-DD", todayLocal)
  .option("--file <path>", "Read markdown from file (- for stdin explicitly)")
  .action(async (opts: { issue: string; date: string; repo?: string; file?: string }) => {
    const service = new WorkOrderService(resolveDockyardRoot());
    const content = readContent(opts.file);
    if (!content.trim()) {
      console.error("No content: pipe markdown or use --file");
      process.exit(1);
    }
    try {
      const { id } = await service.insertWorkOrder({
        date: opts.date,
        repo: opts.repo,
        issue: opts.issue,
        content,
      });
      console.log(id);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List work orders for an issue on a date (defaults --date to today)")
  .requiredOption("--issue <slug>", "Issue name or slug")
  .option("--repo <slug>", "Repo folder (omit if only one match; use legacy for old date/issue layout)")
  .option("--date <ymd>", "Date folder YYYY-MM-DD", todayLocal)
  .action(async (opts: { issue: string; date: string; repo?: string }) => {
    const service = new WorkOrderService(resolveDockyardRoot());
    const workOrders = await service.listWorkOrders(opts);
    for (const w of workOrders) {
      console.log(`${w.id}\t${w.status}`);
    }
  });

program
  .command("pending")
  .description("List pending work orders (optionally scoped)")
  .option("--issue <slug>", "Filter by issue")
  .option("--repo <slug>", "Filter by repo")
  .option("--date <ymd>", "Filter by date")
  .action(async (opts: { issue?: string; date?: string; repo?: string }) => {
    const service = new WorkOrderService(resolveDockyardRoot());
    const pending = await service.getPendingWorkOrders({
      date: opts.date,
      repo: opts.repo,
      issue: opts.issue,
    });
    for (const p of pending) {
      console.log(`${p.date}\t${p.repo}\t${p.issue}\t${p.id}`);
    }
  });

program
  .command("complete")
  .description("Mark a work order complete")
  .requiredOption("--issue <slug>", "Issue name or slug")
  .option("--repo <slug>", "Repo folder (omit if unambiguous; legacy for old layout)")
  .requiredOption("--date <ymd>", "Date folder YYYY-MM-DD")
  .requiredOption("--id <woId>", "Work order id e.g. wo-001")
  .action(async (opts: { issue: string; date: string; id: string; repo?: string }) => {
    const service = new WorkOrderService(resolveDockyardRoot());
    try {
      await service.markWorkOrderComplete({
        date: opts.date,
        repo: opts.repo,
        issue: opts.issue,
        woId: opts.id,
      });
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  });

program
  .command("install-agents")
  .description(
    "Merge Dockyard MCP (stdio) into detected tool configs: Cursor, VS Code, Claude, Codex, Windsurf, Gemini CLI, Zed",
  )
  .option("--list", "Print detected config paths and exit")
  .option("--dry-run", "Show would-write / would-skip per tool without modifying files")
  .option("--force", "Overwrite an existing entry for --name")
  .option("--name <id>", "Server id in each config", "dockyard")
  .option("--package-root <path>", "Dockyard package root (contains dist/index.js)")
  .option("--script <path>", "Server entry script (overrides dist/index.js under package root)")
  .option("--targets <ids>", "Comma-separated target ids (e.g. cursor,codex,vscode)")
  .action((opts: {
    list?: boolean;
    dryRun?: boolean;
    force?: boolean;
    name: string;
    packageRoot?: string;
    script?: string;
    targets?: string;
  }) => {
    const home = homedir();
    if (opts.list) {
      const rows = listDetectedTargets(home);
      if (rows.length === 0) {
        console.error("No supported agent directories detected under your home folder.");
        return;
      }
      for (const { target, path } of rows) {
        console.log(`${target.id}\t${target.label}\t${path}`);
      }
      return;
    }

    const root = opts.packageRoot ?? defaultPackageRoot();
    const script = opts.script ?? join(root, "dist", "index.js");
    if (!existsSync(script)) {
      console.error("Server script not found:", script);
      console.error("Run pnpm run build (or npm run build) in the Dockyard repo, or pass --script.");
      process.exit(1);
    }

    const onlyTargets = opts.targets
      ? new Set(
          opts.targets
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        )
      : undefined;

    const env: Record<string, string> = {
      DOCKYARD_ROOT: resolveDockyardRoot(),
    };
    if (process.env.DOCKYARD_PORT) {
      env.DOCKYARD_PORT = process.env.DOCKYARD_PORT;
    }

    try {
      const results = installDockyardAgents({
        home,
        serverName: opts.name ?? "dockyard",
        entry: {
          command: "node",
          args: [script],
          env,
        },
        dryRun: Boolean(opts.dryRun),
        force: Boolean(opts.force),
        onlyTargets,
      });

      if (results.length === 0) {
        console.error("No supported agent directories detected. Try: dockyard install-agents --list");
        process.exit(1);
      }

      for (const r of results) {
        console.log(`${r.action}\t${r.target.id}\t${r.path}`);
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  });

program
  .command("install-skills")
  .description(
    "Copy bundled Dockyard skills from this package into each detected tool’s skills directory (Cursor, Codex, Claude, Gemini, Windsurf, Zed)",
  )
  .option("--list", "Print detected skills roots and exit")
  .option("--dry-run", "Show per-skill would-copy / would-skip without writing")
  .option("--force", "Overwrite existing skill folders of the same name")
  .option("--package-root <path>", "Dockyard package root (contains skills/ folder)")
  .option("--targets <ids>", "Comma-separated: cursor,codex,claude-code,gemini,windsurf,zed")
  .action((opts: {
    list?: boolean;
    dryRun?: boolean;
    force?: boolean;
    packageRoot?: string;
    targets?: string;
  }) => {
    const home = homedir();
    const root = opts.packageRoot ?? defaultPackageRoot();
    const sourceSkillsDir = join(root, "skills");

    if (!existsSync(sourceSkillsDir)) {
      console.error("Bundled skills not found:", sourceSkillsDir);
      process.exit(1);
    }

    if (opts.list) {
      const rows = listDetectedSkillRoots(home);
      if (rows.length === 0) {
        console.error("No supported agent directories detected for skill install.");
        return;
      }
      for (const { target, skillsRoot } of rows) {
        console.log(`${target.id}\t${target.label}\t${skillsRoot}`);
      }
      return;
    }

    const onlyTargets = opts.targets
      ? new Set(
          opts.targets
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        )
      : undefined;

    try {
      const results = installBundledSkills({
        sourceSkillsDir,
        home,
        dryRun: Boolean(opts.dryRun),
        force: Boolean(opts.force),
        onlyTargets,
      });

      if (results.length === 0) {
        console.error("No skill install targets detected. Try: dockyard install-skills --list");
        process.exit(1);
      }

      for (const r of results) {
        for (const c of r.copies) {
          console.log(`${c.action}\t${r.target.id}\t${c.skill}\t${r.skillsRoot}`);
        }
        if (r.copies.length === 0) {
          console.log(`no-bundled-skills\t${r.target.id}\t\t${r.skillsRoot}`);
        }
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  });

await program.parseAsync(process.argv);
