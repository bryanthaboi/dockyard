import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateOutput } from "../core/validation.js";
import type { WorkOrderService } from "../core/work-order-service.js";

function okJson(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

export function createDockyardMcpServer(service: WorkOrderService): McpServer {
  const server = new McpServer(
    { name: "dockyard", version: "0.1.0" },
    {
      instructions:
        "Dockyard: work orders on disk under DOCKYARD_ROOT as date/repo/issue/wo-NNN.md (repo defaults to default on insert). MCP TOOLS workorder_* — not resources. Queue: workorder_list_pending → workorder_get (pass repo from each pending row) → workorder_complete. workorder_list requires date+repo; issue optional. CLI: dockyard pending / list / complete.",
    },
  );

  server.registerTool(
    "workorder_insert",
    {
      description:
        "Create a new work order under date/repo/issue (repo optional, default default). Content must include all required ## sections from Objective through Notes.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Folder date YYYY-MM-DD"),
        repo: z.string().min(1).optional().describe("Repo folder under date, e.g. monorepo or git repo name (default: default)"),
        issue: z.string().min(1).describe("Issue slug (e.g. auth-refactor)"),
        content: z.string().min(1).describe("Markdown body starting at ## Objective with all required sections"),
      },
    },
    async ({ date, repo, issue, content }) => {
      try {
        const result = await service.insertWorkOrder({ date, repo, issue, content });
        return okJson(result);
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "workorder_get",
    {
      description:
        "Read a work order markdown file and its status. Pass repo when multiple repos share the same issue slug, or copy repo from workorder_list_pending.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        repo: z.string().min(1).optional().describe("From pending row or listTracks; omit if unambiguous"),
        issue: z.string().min(1),
        woId: z.string().regex(/^wo-\d{3}$/),
      },
    },
    async (args) => {
      try {
        const data = await service.getWorkOrderWithMeta(args);
        return okJson({
          date: args.date,
          repo: data.repo,
          issue: args.issue,
          id: args.woId,
          status: data.status,
          markdown: data.markdown,
        });
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "workorder_list",
    {
      description:
        "List work order ids and statuses for a date and repo. Pass issue to scope to one track; omit issue to list all issues under that repo. Each item includes issue when listing multiple tracks.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        repo: z.string().min(1),
        issue: z.string().min(1).optional(),
      },
    },
    async ({ date, repo, issue }) => {
      try {
        const workOrders = await service.listWorkOrders({ date, repo, issue });
        return okJson({ workOrders });
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "workorder_list_pending",
    {
      description: "List pending work orders (each row includes repo). Optional filters date, repo, issue.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        repo: z.string().min(1).optional(),
        issue: z.string().min(1).optional(),
      },
    },
    async (args) => {
      try {
        const pending = await service.getPendingWorkOrders({
          date: args.date,
          repo: args.repo,
          issue: args.issue,
        });
        return okJson({ pending });
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "workorder_complete",
    {
      description: "Mark a work order complete in index.json. Pass repo from the pending row when present.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        repo: z.string().min(1).optional(),
        issue: z.string().min(1),
        woId: z.string().regex(/^wo-\d{3}$/),
      },
    },
    async (args) => {
      try {
        await service.markWorkOrderComplete(args);
        return okJson({ ok: true });
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "workorder_next_number",
    {
      description: "Return the next work order number (1-based) for a date/repo/issue. Omit repo if unambiguous.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        repo: z.string().min(1).optional(),
        issue: z.string().min(1),
      },
    },
    async ({ date, repo, issue }) => {
      try {
        const next = await service.getNextWorkOrderNumber(date, issue, repo);
        return okJson({ nextWorkOrderNumber: next });
      } catch (e) {
        return errResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "workorder_validate_output",
    {
      description:
        "Best-effort check that generated code strings do not contain Dockyard leak substrings (work order, wo-, MCP, mcp-root).",
      inputSchema: {
        code: z.string(),
      },
    },
    async ({ code }) => {
      const r = validateOutput(code);
      if (r.ok) return okJson({ ok: true });
      return okJson({ ok: false, reason: r.reason });
    },
  );

  return server;
}
