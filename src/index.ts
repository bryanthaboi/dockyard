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

async function main(): Promise<void> {
  const root = resolveDockyardRoot();
  const port = resolvePort();
  const service = new WorkOrderService(root);

  const app = await buildApp(service);
  await app.listen({ port, host: "127.0.0.1" });
  console.error(`[dockyard] HTTP API and dashboard: http://127.0.0.1:${port}`);
  console.error(`[dockyard] Data root: ${root}`);

  if (visualizerProcess()) {
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
