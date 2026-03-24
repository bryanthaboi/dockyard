/**
 * After `pnpm run build`, verifies GET /issues returns `{ tracks: [...] }` (not legacy `{ issues }`)
 * and GET /work-orders with date+repo+issue against a temp DOCKYARD_ROOT.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const { buildApp } = await import(join(repoRoot, "dist", "http", "app.js"));
const { WorkOrderService } = await import(join(repoRoot, "dist", "core", "work-order-service.js"));

const root = await mkdtemp(join(tmpdir(), "dockyard-smoke-"));
try {
  await mkdir(join(root, "2026-03-24", "fanquake", "phase1-gh-issue-refresh"), { recursive: true });
  const idx = {
    issue: "phase1-gh-issue-refresh",
    date: "2026-03-24",
    repo: "fanquake",
    lastWorkOrderNumber: 1,
    workOrders: [{ id: "wo-001", status: "pending" }],
  };
  await writeFile(
    join(root, "2026-03-24", "fanquake", "phase1-gh-issue-refresh", "index.json"),
    `${JSON.stringify(idx, null, 2)}\n`,
    "utf8",
  );

  const service = new WorkOrderService(root);
  const app = await buildApp(service);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address();
  const port = typeof addr === "object" && addr != null ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const issuesRes = await fetch(`${base}/issues?date=2026-03-24`);
  const issuesText = await issuesRes.text();
  let issuesBody;
  try {
    issuesBody = JSON.parse(issuesText);
  } catch {
    console.error("GET /issues non-JSON:", issuesText.slice(0, 300));
    process.exit(1);
  }

  if (!issuesRes.ok) {
    console.error("GET /issues HTTP", issuesRes.status, issuesBody);
    process.exit(1);
  }
  if (Object.prototype.hasOwnProperty.call(issuesBody, "issues")) {
    console.error(
      "FAIL: response contains legacy `issues` key. You are not running this repo's current server (expected `tracks` only). Body:",
      JSON.stringify(issuesBody),
    );
    process.exit(1);
  }
  if (!Array.isArray(issuesBody.tracks)) {
    console.error("FAIL: expected `tracks` array, got:", JSON.stringify(issuesBody));
    process.exit(1);
  }
  const track = issuesBody.tracks.find(
    (x) => x && x.repo === "fanquake" && x.issue === "phase1-gh-issue-refresh",
  );
  if (!track) {
    console.error("FAIL: missing expected track, got tracks:", JSON.stringify(issuesBody.tracks));
    process.exit(1);
  }

  const woRes = await fetch(
    `${base}/work-orders?date=2026-03-24&repo=fanquake&issue=phase1-gh-issue-refresh`,
  );
  const woBody = await woRes.json();
  if (!woRes.ok || !Array.isArray(woBody.workOrders) || woBody.workOrders.length < 1) {
    console.error("FAIL GET /work-orders:", woRes.status, woBody);
    process.exit(1);
  }

  console.log("smoke-http OK — /issues uses `tracks`; work-orders OK");
  await app.close();
} finally {
  await rm(root, { recursive: true, force: true });
}
