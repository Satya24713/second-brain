import { z } from "zod";
export const metricFields = {
  title: z.string().trim().min(1).max(240),
  type: z.enum([
    "quantity",
    "duration",
    "count",
    "score",
    "event",
    "yes_no",
    "time_interval",
  ]),
  unit: z.string().trim().max(40).default(""),
  goal: z.number().finite().positive().nullable().default(null),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  aggregation: z
    .enum(["sum", "average", "count", "latest", "max", "streak", "percentage"])
    .default("sum"),
  category: z.string().trim().max(120).default(""),
  tags: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(5000).default(""),
};
export const metricSchema = z.object(metricFields).strict();
export const entrySchema = z
  .object({
    metric_id: z.string().min(1).max(100),
    value: z.number().finite(),
    recorded_at: z
      .string()
      .datetime({ offset: true })
      .transform((v) => new Date(v).toISOString()),
    end_at: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .default(null)
      .transform((v) => (v ? new Date(v).toISOString() : null)),
    notes: z.string().trim().max(5000).default(""),
    tags: z.string().trim().max(500).default(""),
  })
  .strict();
export const memorySchema = z
  .object({
    filename: z
      .string()
      .max(120)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/, "Use a simple .md filename."),
    title: z.string().trim().min(1).max(240),
    summary: z.string().trim().max(500).default(""),
    content: z.string().min(1).max(20000),
  })
  .strict();
