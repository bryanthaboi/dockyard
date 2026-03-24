import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { insertWorkOrderBodySchema, woIdSchema } from "../core/schemas.js";
import type { WorkOrderService } from "../core/work-order-service.js";

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

const queryDateIssue = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  issue: z.string().min(1),
  repo: z.string().min(1).optional(),
});

const optionalQueryPending = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  repo: z.string().min(1).optional(),
  issue: z.string().min(1).optional(),
});

const paramsDateRepoIssueWo = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  repo: z.string().min(1),
  issue: z.string().min(1),
  woId: woIdSchema,
});

const paramsDateIssueWoLegacy = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  issue: z.string().min(1),
  woId: woIdSchema,
});

export async function registerWorkOrderRoutes(
  app: FastifyInstance,
  service: WorkOrderService,
): Promise<void> {
  app.get("/health", async () => ({ ok: true }));

  app.get("/dates", async () => {
    const dates = await service.listDates();
    return { dates };
  });

  app.get<{ Querystring: { date?: string } }>("/issues", async (req, reply) => {
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: "Query parameter date (YYYY-MM-DD) is required" });
    }
    const tracks = await service.listTracks(date);
    return { date, tracks };
  });

  app.get("/work-orders/pending", async (req, reply) => {
    const q = optionalQueryPending.safeParse(req.query);
    if (!q.success) {
      return reply.code(400).send({ error: zodMessage(q.error) });
    }
    const list = await service.getPendingWorkOrders({
      date: q.data.date,
      repo: q.data.repo,
      issue: q.data.issue,
    });
    return { pending: list };
  });

  app.post("/work-orders", async (req, reply) => {
    const body = insertWorkOrderBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: zodMessage(body.error) });
    }
    try {
      const result = await service.insertWorkOrder(body.data);
      return reply.code(201).send(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }
  });

  app.get("/work-orders", async (req, reply) => {
    const q = queryDateIssue.safeParse(req.query);
    if (!q.success) {
      return reply
        .code(400)
        .send({ error: "Query parameters date and issue are required", details: zodMessage(q.error) });
    }
    const list = await service.listWorkOrders(q.data);
    return { workOrders: list };
  });

  /* Register 4-segment routes before 3-segment so /date/repo/issue/wo is not captured as legacy. */
  app.get("/work-orders/:date/:repo/:issue/:woId", async (req, reply) => {
    const p = paramsDateRepoIssueWo.safeParse(req.params);
    if (!p.success) {
      return reply.code(400).send({ error: zodMessage(p.error) });
    }
    const { date, repo, issue, woId } = p.data;
    try {
      const data = await service.getWorkOrderWithMeta({ date, repo, issue, woId });
      return {
        date,
        repo: data.repo,
        issue,
        id: woId,
        status: data.status,
        markdown: data.markdown,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(404).send({ error: msg });
    }
  });

  app.patch("/work-orders/:date/:repo/:issue/:woId/complete", async (req, reply) => {
    const p = paramsDateRepoIssueWo.safeParse(req.params);
    if (!p.success) {
      return reply.code(400).send({ error: zodMessage(p.error) });
    }
    try {
      await service.markWorkOrderComplete(p.data);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }
  });

  /** Legacy disk layout: date/issue/wo (no repo segment). */
  app.get("/work-orders/:date/:issue/:woId", async (req, reply) => {
    const p = paramsDateIssueWoLegacy.safeParse(req.params);
    if (!p.success) {
      return reply.code(400).send({ error: zodMessage(p.error) });
    }
    try {
      const data = await service.getWorkOrderWithMeta({ ...p.data, issue: p.data.issue });
      return {
        date: p.data.date,
        repo: data.repo,
        issue: p.data.issue,
        id: p.data.woId,
        status: data.status,
        markdown: data.markdown,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(404).send({ error: msg });
    }
  });

  app.patch("/work-orders/:date/:issue/:woId/complete", async (req, reply) => {
    const p = paramsDateIssueWoLegacy.safeParse(req.params);
    if (!p.success) {
      return reply.code(400).send({ error: zodMessage(p.error) });
    }
    try {
      await service.markWorkOrderComplete(p.data);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }
  });
}
