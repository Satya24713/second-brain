import { z } from "zod";
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
    priority: z.enum(["normal", "high"]).default("normal"),
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
  .object({ reply: text(10000).min(1), actions: z.array(actionSchema).max(12) })
  .strict();
