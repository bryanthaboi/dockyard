# Dockyard MCP Server
<p align="center"><img src="./logo.jpg"></p>

**Dockyard** is a **local-first** work-order system for AI-assisted development. Everything runs **on your machine**: a small **Node.js** process exposes **MCP tools** over stdio, a **Fastify** HTTP API, a **`dockyard` CLI**, and an optional **Vite** dashboard. Work orders are plain markdown and JSON on disk (default **`~/.dockyard`**), not locked inside a vendor cloud or a single editor. The design is intentionally **minimal**—few moving parts, quick startup, and predictable behavior—so agents and humans can queue, inspect, and complete work without network dependency or heavy infrastructure. Work order files are never placed within your repo, and are never referenced anywhere else to keep that sort of thing outside of git commits and kept locally. This also serves as another source of memory if you ever need to look back.

If you use Cursor, Codex, Claude Code, VS Code, or similar hosts, Dockyard fits the same **stdio MCP** model you already use for other tools. The HTTP surface is there for scripts and the browser UI; **nothing** in the core workflow requires outbound calls or accounts.

- **Dashboard & API:** `http://127.0.0.1:36969` by default (`DOCKYARD_PORT` to change). The dev dashboard is started with `dockyard dashboard on` when you want the separate Vite viewer.
- **MCP:** one process serves JSON-RPC over **stdio** for compatible clients.

---

## Requirements

- **Node.js 20+**
- **npm**, **pnpm**, or **yarn** (for installing the package or working from source)

---

## Install

### From npm (registry)

The published package includes **pre-built** `dist/` and `dashboard/dist`—no compile step after install.

```bash
npm install -g dockyard
dockyard --help
```

```bash
# or, with pnpm
pnpm add -g dockyard
```

Run without a global install:

```bash
npx dockyard --help
```

If the package name `dockyard` is already taken on the public registry when you publish, use a [scoped name](https://docs.npmjs.com/cli/v10/using-npm/scope) (e.g. `@your-scope/dockyard`) in `package.json` instead.

Then continue with **[Register MCP + skills](#registering-mcp-and-skills)** below (the `dockyard` CLI resolves its own install path for `install-agents` / `install-skills`).

---

### From source (clone, tarball, or local folder)

For development or if you prefer to build yourself:

1. **Get the source** (clone, unzip a release, or copy the folder).

2. **Install dependencies** from the package root:

   ```bash
   pnpm install
   ```

   (Equivalent: `npm install`.)

3. **Optional environment file** — copy [`.env.example`](.env.example) to `.env` in the same directory if you want to set variables in one place. Dockyard also reads the shell environment.

   | Variable | Meaning |
   |----------|---------|
   | `DOCKYARD_ROOT` | Where work orders are stored (default: `~/.dockyard`) |
   | `DOCKYARD_PORT` | HTTP port (default: `36969`) |

4. **Build** (TypeScript + dashboard assets):

   ```bash
   pnpm run build
   ```

5. **Put `dockyard` on your PATH** (pick one):

   - **pnpm (recommended):** from the package root  
     `pnpm link --global`  
     Then `dockyard --help` should work in any terminal.

   - **npm:** from the package root  
     `npm link`  
     (same idea: global shim to this package’s `bin`.)

   - **Without a global link:** call the CLI by path:

     ```bash
     node /absolute/path/to/dockyard/dist/cli.js --help
     ```

   Until you link or use the full path, examples below assume `dockyard` is available.

## Registering MCP and skills

1. **Register MCP + skills in your editors** (after `pnpm run build` when using **from source**; from **npm**, pre-built assets are already in the installed package):

   ```bash
   dockyard install-agents --list
   dockyard install-agents --dry-run
   dockyard install-agents
   ```

   ```bash
   dockyard install-skills --list
   dockyard install-skills
   ```

   Restart each host app (Cursor, VS Code, Codex, etc.) after MCP config changes. The skill **`dockyard-session-guide`** tells agents that Dockyard uses MCP **tools** (`workorder_*`), not MCP **resources** — so “list resources” may be empty while Dockyard is still available. Details and target tables: [docs/agent-workflow.md](docs/agent-workflow.md).

---

## Run the server

From the package root, after `pnpm run build`:

```bash
pnpm start
```

This runs `node dist/index.js`: **HTTP + dashboard** on `127.0.0.1:36969` and **MCP over stdio**. When an IDE launches Dockyard as an MCP server, it typically runs this same entrypoint; the HTTP listener still starts so the dashboard is available.

**Development** (TypeScript watch + Vite on port 5173 proxying API to 36969):

```bash
pnpm run dev
```

---

## Dashboard

- **Production / `pnpm start`:** open `http://127.0.0.1:36969` (or your `DOCKYARD_PORT`).
- **`pnpm run dev`:** use `http://127.0.0.1:5173` so the Vite dev server can proxy API calls to the backend.
- **CLI viewer (after `pnpm run build`):** `dockyard dashboard on` starts Vite in the background (and a helper API if nothing is listening on `DOCKYARD_PORT`); `dockyard dashboard off` stops what `on` started. Same `DOCKYARD_ROOT` as MCP.
- **Branding assets:** put `logo.jpg` (or `favicon.svg`) in [`dashboard/public/`](dashboard/public/); they are copied into `dashboard/dist` at build time and served by the API or Vite. The header tries `/logo.jpg` first, then falls back to the bundled favicon.

---

## CLI reference

All commands use `DOCKYARD_ROOT` / `DOCKYARD_PORT` from the environment unless you only touch work orders via the CLI (storage still uses `DOCKYARD_ROOT`).

### Global options

```text
dockyard --help
dockyard --version
```

### Work orders (no HTTP server required)

| Command | Purpose |
|---------|---------|
| `dockyard insert` | Create a work order from markdown **stdin** or `--file` |
| `dockyard list` | List work order ids and statuses for one issue + date |
| `dockyard pending` | List pending work orders (all issues or filtered) |
| `dockyard complete` | Mark one work order complete in the index |

**`dockyard insert`**

- **Required:** `--issue <slug>` (e.g. `auth-refactor`; stored as a normalized slug).
- **Optional:** `--repo <slug>` — folder under the date (default **`default`**, e.g. your app or git repo name).
- **Optional:** `--date YYYY-MM-DD` (default: **today** in local time).
- **Optional:** `--file <path>` — read body from file; use `-` for stdin explicitly. If omitted, body is read from **stdin**.

```bash
dockyard insert --repo my-app --issue my-feature --date 2026-03-24 < body.md
dockyard insert --issue my-feature --file body.md
```

On success, prints one line: the new id (e.g. `wo-001`). The markdown body must include every required `##` section from **Objective** through **Notes** (see [docs/agent-workflow.md](docs/agent-workflow.md)).

**`dockyard list`**

- **Required:** `--issue <slug>`
- **Optional:** `--repo <slug>` — disambiguate when several repos share an issue; use **`legacy`** for old `date/<issue>/` trees.
- **Optional:** `--date YYYY-MM-DD` (default: **today**)

Output: TSV lines `wo-001<TAB>pending` or `complete`.

```bash
dockyard list --repo my-app --issue my-feature
dockyard list --issue my-feature --date 2026-03-24
```

**`dockyard pending`**

- **Optional:** `--date YYYY-MM-DD`, `--repo <slug>`, `--issue <slug>`  
  Omit filters to list all pending work orders (sorted by date, repo, issue, id).

Output: TSV `date<TAB>repo<TAB>issue<TAB>wo-001`.

```bash
dockyard pending
dockyard pending --date 2026-03-24
dockyard pending --repo my-app
```

**`dockyard complete`**

- **Required:** `--issue <slug>`, `--date YYYY-MM-DD`, `--id wo-001`
- **Optional:** `--repo <slug>` (omit if unambiguous; **`legacy`** for old layout)

```bash
dockyard complete --repo my-app --issue my-feature --date 2026-03-24 --id wo-001
```

Silent on success; errors go to stderr.

---

### `dockyard dashboard`

| Command | Purpose |
|---------|---------|
| `dockyard dashboard on` | Start Vite in the background; print `http://127.0.0.1:5173` (or the chosen port). Starts a helper API on `DOCKYARD_PORT` only if nothing is already listening. |
| `dockyard dashboard off` | Stop processes recorded from the last `on` run. |

**`dockyard dashboard on`**

- **Optional:** `--package-root <path>` — repo root with `dist/`, `dashboard/`, `node_modules` (default: inferred from the CLI).

Requires `pnpm run build`. Uses the same `DOCKYARD_ROOT` / `DOCKYARD_PORT` as MCP.

```bash
dockyard dashboard on
dockyard dashboard off
```

---

### `dockyard install-agents`

Writes MCP config snippets for tools whose data directories already exist under your home folder. Requires a built server: `dist/index.js`.

| Flag | Meaning |
|------|---------|
| `--list` | Print detected config files; no writes |
| `--dry-run` | Show would-write / would-skip per tool |
| `--force` | Replace existing server entry named by `--name` |
| `--name <id>` | MCP server id in JSON/TOML (default: `dockyard`) |
| `--package-root <path>` | Root of this repo (contains `dist/`) if CLI is not run from there |
| `--script <path>` | Full path to server entry instead of `<package-root>/dist/index.js` |
| `--targets <ids>` | Comma-separated: `cursor`, `codex`, `vscode`, `vscode-insiders`, `claude-code`, `claude-desktop`, `windsurf`, `gemini`, `zed` |

```bash
dockyard install-agents --list
dockyard install-agents --dry-run
dockyard install-agents
dockyard install-agents --force --targets cursor,codex
```

If `dist/index.js` is missing, run `pnpm run build` first.

---

### `dockyard install-skills`

Copies bundled skills from `skills/` into each detected tool’s skills directory.

| Flag | Meaning |
|------|---------|
| `--list` | Print target skill directories |
| `--dry-run` | Per skill: would copy or would skip |
| `--force` | Overwrite existing skill folders with the same name |
| `--package-root <path>` | Repo root containing `skills/` |
| `--targets <ids>` | `cursor`, `codex`, `claude-code`, `gemini`, `windsurf`, `zed` |

```bash
dockyard install-skills --list
dockyard install-skills --dry-run
dockyard install-skills
```

---

## Where data lives

```text
$DOCKYARD_ROOT/
  YYYY-MM-DD/
    <repo-slug>/
      <issue-slug>/
        index.json
        wo-001.md
        ...
```

Older data may still be `YYYY-MM-DD/<issue-slug>/` (no repo segment); tools treat that as **`repo: legacy`**.

Default: `DOCKYARD_ROOT` = `~/.dockyard`.

---

## Agents and MCP

- **Tool names:** `workorder_insert`, `workorder_get`, `workorder_list`, `workorder_list_pending`, `workorder_complete`, `workorder_next_number`, `workorder_validate_output`.
- **Human-oriented workflow, HTTP table, validation caveats:** [docs/agent-workflow.md](docs/agent-workflow.md).

---

## Publishing to npm (maintainers)

1. Bump **`version`** in [`package.json`](package.json).
2. Ensure you are logged in: `npm login`.
3. From the repo root:

   ```bash
   npm publish
   ```

   The **`prepack`** script runs **`npm run build`** so the tarball always contains fresh **`dist/`** and **`dashboard/dist/`**.

4. Inspect the artifact without publishing:

   ```bash
   npm pack --dry-run
   ```

**Note:** This repo lists **`dashboard/`** in [`pnpm-workspace.yaml`](pnpm-workspace.yaml) for local dev. Publishing uses the **root** [`package.json`](package.json) only; the published tarball is defined by the **`files`** field there (not the dashboard workspace package).

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `dockyard: command not found` | Run `pnpm link --global` from the package root, or use `node /path/to/dist/cli.js` |
| `Server script not found` on `install-agents` | Run `pnpm run build` |
| MCP server fails to start in the IDE | Ensure `node` is on PATH; check `DOCKYARD_ROOT` paths; restart the IDE |
| Dashboard 404 | Run `pnpm run build` so `dashboard/dist` exists; `pnpm start` serves it |
| Invalid JSON error during `install-agents` | Fix the target config file the error names; the installer refuses to overwrite broken JSON |

---

## License (GNU GPL v3.0)

Dockyard is **fully open source** under the [**GNU General Public License v3.0**](LICENSE.md) (GPL-3.0). You may run, study, modify, and share this software freely. If you **distribute** a modified version (including as part of a larger product), the GPL requires that you:

- **License your changes under GPL-3.0** as well (copyleft).
- **Include** this project’s **copyright and license notices**, and **prominently note** that you changed the files.
- **Provide** corresponding **source code** to anyone who receives the program from you (as the GPL defines “convey”).

If you **fork** [this repository](https://github.com/bryanthaboi/dockyard), keep a clear link or attribution to the upstream project and retain [`LICENSE.md`](LICENSE.md) with your fork. This is a short summary, not legal advice—the full terms are in **LICENSE.md**.
___
# me
<p align="center">
<a href="https://boisclub.games">
by bryanthaboi
</a>
</p>
<p align="center">
you can support me by playing my games on steam. right now im working on a card game and the playtest is live. ill probably forget to update this text here so if the games already released and the playtest is over im sorry about that lol.
</p>
<p align="center">
<a href="https://store.steampowered.com/app/4509030/Boya_Coya?utm_source=github_dockyard">Boya Coya</a>
</p>
