import { z } from "zod";
import { metricSchema, entrySchema, memorySchema } from "./record-schemas.ts";
const text = (max: number) => z.string().trim().max(max);
export const dueSchema = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .transform((value) => (value ? new Date(value).toISOString() : null));
export const taskSchema = z
  .object({
    title: text(240).min(1, "Give your task a title."),
    notes: text(5000).default(""),
    tag: text(60).default(""),
    kind: z.enum(["task", "event"]).default("task"),
    priority: z.enum(["normal", "high", "low"]).default("normal"),
    due_at: dueSchema.default(null),
  })
  .strict();
export const taskPatch = taskSchema
  .partial()
  .extend({ done: z.boolean().optional() })
  .strict();
export const profileSchema = z
  .object({
    name: text(100).min(1),
    role: text(100),
    context: text(1000),
    goals: text(2000),
    timezone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid timezone."),
    onboarded: z.boolean().optional(),
  })
  .strict();
export const journalSchema = z.object({ body: text(12000).min(1) }).strict();
export const actionSchema = z.discriminatedUnion("type", [
  taskPatch.extend({ type: z.literal("task_update"), id: text(100).min(1) }),
  z.object({ type: z.literal("task_delete"), id: text(100).min(1) }).strict(),
  journalSchema
    .partial()
    .extend({
      type: z.literal("journal_update"),
      id: text(100).min(1),
      summary: text(2000).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("journal_delete"), id: text(100).min(1) })
    .strict(),
  metricSchema
    .omit({ type: true })
    .extend({
      type: z.literal("metric"),
      metric_type: metricSchema.shape.type,
    }),
  metricSchema
    .omit({ type: true })
    .partial()
    .extend({
      type: z.literal("metric_update"),
      id: text(100).min(1),
      metric_type: metricSchema.shape.type.optional(),
    }),
  z.object({ type: z.literal("metric_delete"), id: text(100).min(1) }).strict(),
  entrySchema.extend({
    type: z.literal("metric_entry"),
    metric_id: text(100).min(1).optional(),
    metric_ref: z.number().int().min(0).max(11).optional(),
  }),
  entrySchema
    .partial()
    .extend({ type: z.literal("metric_entry_update"), id: text(100).min(1) }),
  z
    .object({ type: z.literal("metric_entry_delete"), id: text(100).min(1) })
    .strict(),
  memorySchema.extend({ type: z.literal("memory") }),
  memorySchema
    .partial()
    .extend({ type: z.literal("memory_update"), id: text(100).min(1) }),
  z.object({ type: z.literal("memory_delete"), id: text(100).min(1) }).strict(),
  taskSchema.extend({ type: z.literal("task") }),
  z
    .object({
      type: z.literal("journal"),
      body: text(12000).min(1),
      summary: text(2000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("profile"),
      name: text(100).min(1).optional(),
      role: text(100).optional(),
      context: text(1000).optional(),
      goals: text(2000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tracker"),
      title: text(240).min(1),
      due_at: dueSchema.default(null),
    })
    .strict(),
]);
export const aiResultSchema = z
  .object({
    reply: text(10000),
    actions: z.array(actionSchema).max(12),
    recall: z.array(text(100).min(1)).max(6).optional(),
  })
  .strict()
  .refine(
    (result) => !!result.reply || !!result.recall?.length,
    "A final reply is required.",
  );
