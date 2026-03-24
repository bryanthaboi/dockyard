import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveDockyardRoot, resolvePort } from "./config.js";
import { WorkOrderService } from "./core/work-order-service.js";
import { buildApp } from "./http/app.js";
import { createDockyardMcpServer } from "./mcp/server.js";

/**
 * When an IDE launches Dockyard as MCP, stdio is the MCP transport.
 * When `dockyard dashboard on` spawns a background process, we skip MCP stdio:
 * same `DOCKYARD_ROOT` and HTTP API so the browser can visualize work orders
 * already written by the real MCP server (or CLI).
 */
function visualizerProcess(): boolean {
  const v = process.env.DOCKYARD_VISUALIZER?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isAddrInUseError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const maybe = err as { code?: string };
  return maybe.code === "EADDRINUSE";
}

async function apiHealthUp(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1200),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const root = resolveDockyardRoot();
  const port = resolvePort();
  const service = new WorkOrderService(root);

  let startedHttp = false;
  const app = await buildApp(service);
  try {
    await app.listen({ port, host: "127.0.0.1" });
    startedHttp = true;
    console.error(`[dockyard] HTTP API and dashboard: http://127.0.0.1:${port}`);
  } catch (err) {
    if (!isAddrInUseError(err)) throw err;
    const healthy = await apiHealthUp(port);
    if (healthy) {
      console.error(
        `[dockyard] HTTP API already running on 127.0.0.1:${port}; reusing existing listener.`,
      );
    } else {
      console.error(
        `[dockyard] Port ${port} is already in use by another process. MCP will start, but dashboard/API on this process is disabled.`,
      );
    }
  }
  console.error(`[dockyard] Data root: ${root}`);

  if (visualizerProcess()) {
    if (!startedHttp) {
      await app.close();
    }
    return;
  }

  const mcp = createDockyardMcpServer(service);
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
