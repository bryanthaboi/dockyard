# Agent workflow (Dockyard)

Dockyard stores work orders on disk under `DOCKYARD_ROOT` (default `~/.dockyard`). The HTTP API listens on `DOCKYARD_PORT` (default **36969**). The same process exposes MCP tools over **stdio** for Cursor, Codex, Claude Code, VS Code, etc.

**Installing the app, building, running the server, and the full CLI command list** are documented in the project [README.md](../README.md). This file focuses on **how agents should use** Dockyard (MCP lifecycle, templates, HTTP, installers).

## MCP tools vs MCP resources

Dockyard exposes **tools** (`workorder_insert`, `workorder_get`, `workorder_list`, `workorder_list_pending`, `workorder_complete`, `workorder_next_number`, `workorder_validate_output`) over stdio MCP. It does **not** register **resources** or resource templates. Hosts that only “list MCP resources” will show nothing for Dockyard even when the server is configured correctly — use the host’s **tool invocation** UI or API for `workorder_*`, or fall back to the **`dockyard` CLI** (same files under `DOCKYARD_ROOT`). The bundled skill **`dockyard-session-guide`** is written for agents that hit this confusion.

## Lifecycle

1. Break a large task into focused units.
2. For each unit, call **`workorder_insert`** with a `date` (`YYYY-MM-DD`), optional **`repo`** (folder under the date, e.g. git repo name; default `default`), `issue` slug (e.g. `auth-refactor`), and markdown `content` with every required `##` section (see template below). On disk: `DOCKYARD_ROOT/<date>/<repo>/<issue>/wo-NNN.md`. Older trees may be `date/<issue>/` only; the API exposes those as **`repo: legacy`**.
3. Poll **`workorder_list_pending`** (optional filters `date`, `repo`, `issue`). Each row includes **`repo`** — pass it into **`workorder_get`** / **`workorder_complete`** when multiple repos share an issue slug. Items sort by date, repo, issue, then id.
4. Execute the work described in each pending order. Use **`workorder_get`** with `date`, `issue`, `woId`, and `repo` when needed.
5. When finished, call **`workorder_complete`** for that `date`, **`repo`** (from the pending row), `issue`, and `woId`.
6. Before writing generated code into another repository, run **`workorder_validate_output`** on the string. If it returns `ok: false`, revise the output so forbidden substrings are not present (see caveats below).

Optional: use **`workorder_next_number`** to know the next id before drafting the title line (the server still assigns the canonical id on insert).

## Work order markdown template

Agents should follow this shape. The body passed to `workorder_insert` must contain all sections from `## Objective` through `## Notes`. The server normalizes the header (`# Work Order: WO-NNN`, `Status`, `Created`) and assigns `WO-NNN`.

```markdown
## Objective
...

## Agent Instructions
...

## Anchor Files
...

## Related Files
...

## Files to Create
...

## Constraints (DO NOT TOUCH)
...

## Deferred Work
...

## Notes
...
```

## Isolation and `workorder_validate_output`

The checker uses a simple lowercase substring list: `work order`, `wo-`, `MCP`, `mcp-root`. It is **best-effort**: it can false-positive (for example the substring `wo-` inside unrelated words) and it is not a security boundary. Use it as a lint-style guard so obvious references to Dockyard internals do not land in product repos. If a legitimate string must contain a forbidden fragment, rephrase or split the change; there is no in-band escape hatch in the tool.

## HTTP equivalents (for scripts)

| Action            | Method and path |
| ----------------- | ---------------- |
| Create            | `POST /work-orders` (JSON: `date`, optional `repo`, `issue`, `content`) |
| List for issue    | `GET /work-orders?date=&issue=` (optional `&repo=` to disambiguate) |
| List pending      | `GET /work-orders/pending` (optional `?date=&repo=&issue=`) |
| Get one           | `GET /work-orders/:date/:repo/:issue/:woId` (legacy: same URL with three segments after `work-orders` for old `date/issue/` layout) |
| Complete          | `PATCH /work-orders/:date/:repo/:issue/:woId/complete` (legacy three-segment path still supported) |
| List dates        | `GET /dates` |
| List tracks       | `GET /issues?date=` → `{ tracks: [{ repo, issue }] }` |

## CLI for humans and scripts

The **`dockyard`** CLI talks to the **same filesystem** as the server (no HTTP needed for insert/list/pending/complete). Install from npm with **`npm install -g dockyard-mcp`** (command remains `dockyard`), or use `pnpm link --global` / `npm link` from a source clone after `pnpm run build`; see [README.md](../README.md) for install, env vars, and every flag.

Quick examples:

```bash
dockyard insert --repo my-app --issue my-feature --date 2026-03-24 < wo-body.md
dockyard list --repo my-app --issue my-feature --date 2026-03-24
dockyard pending   # TSV: date, repo, issue, id
dockyard complete --repo my-app --issue my-feature --date 2026-03-24 --id wo-001
```

---

## Registering MCP in editors (`install-agents`)

**Prerequisite:** `pnpm run build` (or `npm run build`) so `dist/index.js` exists.

Dockyard’s process is **`node <package>/dist/index.js`** (stdio MCP plus HTTP on `DOCKYARD_PORT`). The installer merges that into each tool’s config **only when that tool’s data directory already exists** under your home folder.

```bash
dockyard install-agents --list              # show config files that would be updated
dockyard install-agents --dry-run           # would-write vs would-skip
dockyard install-agents                     # add server id "dockyard" (default)
dockyard install-agents --force             # replace existing "dockyard" entry
dockyard install-agents --targets cursor,codex
```

- **`--package-root`** — Use if you run `dockyard` from outside the repo; must point at the folder containing `dist/` and `skills/`.
- **`--script`** — Override the server entry path instead of `<package-root>/dist/index.js`.
- **`--name`** — MCP server key in each file (default `dockyard`).
- Environment written into configs includes **`DOCKYARD_ROOT`** (from your environment or default `~/.dockyard`) and **`DOCKYARD_PORT`** if set.

**Targets and formats** (aligned with each product’s documented MCP layout):

| Target | Detected path | Format |
| ------ | ------------- | ------ |
| `cursor` | `~/.cursor/mcp.json` | JSON `mcpServers` |
| `vscode` | `…/Code/User/mcp.json` | JSON `servers` + `"type": "stdio"` ([VS Code reference](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration)) |
| `vscode-insiders` | `…/Code - Insiders/User/mcp.json` | same |
| `claude-code` | `~/.claude/settings.json` | JSON `mcpServers` + `"type": "stdio"` ([Claude Code MCP](https://code.claude.com/docs/en/mcp)) |
| `claude-desktop` | `…/Claude/claude_desktop_config.json` | JSON `mcpServers` |
| `codex` | `~/.codex/config.toml` | TOML `[mcp_servers.dockyard]` with `command` / `args` / `[mcp_servers.dockyard.env]` ([Codex config reference](https://developers.openai.com/codex/config-reference/)) |
| `windsurf` | `~/.codeium/windsurf/mcp_config.json` | JSON `mcpServers` |
| `gemini` | `~/.gemini/settings.json` | JSON `mcpServers` ([Gemini CLI MCP](https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html)) |
| `zed` | `~/Library/Application Support/Zed/settings.json` or `~/.config/zed/settings.json` | JSON `context_servers` ([Zed MCP](https://zed.dev/docs/ai/mcp)) |

Folders such as `~/.agents` do not have one de-facto MCP file format across tools; nothing is written there until a stable convention exists.

**Invalid JSON** in an existing config file causes the installer to **throw** rather than overwrite your file. Restart the host app after changing MCP config.

---

## Agent skills (`install-skills`)

**Prerequisite:** the package root must contain a `skills/` directory (ships with this repo).

One **skill per MCP tool** lives under [`skills/`](../skills/) (Codex-style: `SKILL.md` + optional `agents/openai.yaml` + `references/`). Copy them into each tool’s skills directory so agents surface the right workflow when using Dockyard:

```bash
dockyard install-skills --list
dockyard install-skills --dry-run
dockyard install-skills
dockyard install-skills --force
dockyard install-skills --targets cursor,codex
```

| Target | Skills directory (created as needed) |
| ------ | ------------------------------------ |
| `cursor` | `~/.cursor/skills/` |
| `codex` | `$CODEX_HOME/skills` or `~/.codex/skills/` |
| `claude-code` | `~/.claude/skills/` |
| `gemini` | `~/.gemini/skills/` |
| `windsurf` | `~/.codeium/windsurf/skills/` |
| `zed` | `…/Zed/skills/` or `~/.config/zed/skills/` |

Bundled skills: `dockyard-session-guide` (read first when draining the queue or debugging “is Dockyard connected?”), `dockyard-insert-work-order`, `dockyard-get-work-order`, `dockyard-list-work-orders`, `dockyard-list-pending-work-orders`, `dockyard-complete-work-order`, `dockyard-next-work-order-number`, `dockyard-validate-output`.

Validate with Codex’s checker when available:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/<name>
```
