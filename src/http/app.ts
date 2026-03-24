import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import type { WorkOrderService } from "../core/work-order-service.js";
import { registerWorkOrderRoutes } from "./routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildApp(service: WorkOrderService): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?$/,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
  });

  await registerWorkOrderRoutes(app, service);

  const dashboardDist = join(__dirname, "..", "..", "dashboard", "dist");
  if (existsSync(dashboardDist)) {
    await app.register(fastifyStatic, {
      root: dashboardDist,
      prefix: "/",
      decorateReply: true,
    });

    app.setNotFoundHandler((request, reply) => {
      const url = request.url.split("?")[0] ?? "";
      if (
        url.startsWith("/work-orders") ||
        url.startsWith("/issues") ||
        url.startsWith("/dates") ||
        url === "/health"
      ) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  } else {
    app.setNotFoundHandler((_request, reply) => {
      return reply.code(404).send({ error: "Not found" });
    });
  }

  return app;
}
