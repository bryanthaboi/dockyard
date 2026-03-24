import { z } from "zod";

export const DATE_DIR_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const woIdSchema = z.string().regex(/^wo-\d{3}$/, "Work order id must be wo-NNN");

export const workOrderStatusSchema = z.enum(["pending", "complete"]);

export const indexJsonSchema = z.object({
  issue: z.string().min(1),
  date: z.string().regex(DATE_DIR_REGEX),
  /** Present on new layout; omitted in older index.json files */
  repo: z.string().min(1).optional(),
  lastWorkOrderNumber: z.number().int().nonnegative(),
  workOrders: z.array(
    z.object({
      id: woIdSchema,
      status: workOrderStatusSchema,
    }),
  ),
});

export type IndexJson = z.infer<typeof indexJsonSchema>;

export const workOrderMetaSchema = z.object({
  id: woIdSchema,
  status: workOrderStatusSchema,
});

export type WorkOrderMeta = z.infer<typeof workOrderMetaSchema>;

export const pendingWorkOrderSchema = workOrderMetaSchema.extend({
  date: z.string().regex(DATE_DIR_REGEX),
  repo: z.string().min(1),
  issue: z.string().min(1),
});

export type PendingWorkOrderRef = z.infer<typeof pendingWorkOrderSchema>;

export const insertWorkOrderBodySchema = z.object({
  date: z.string().regex(DATE_DIR_REGEX),
  /** Folder under date, e.g. git repo name (default: default) */
  repo: z.string().min(1).optional(),
  issue: z.string().min(1),
  content: z.string().min(1),
});
