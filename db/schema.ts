import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  context: text("context").notNull().default(""),
  goals: text("goals").notNull().default(""),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  onboarded: integer("onboarded").notNull().default(0),
  geminiKey: text("gemini_key"),
  createdAt: text("created_at").notNull(),
});
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    tag: text("tag").notNull().default(""),
    kind: text("kind").notNull().default("task"),
    priority: text("priority").notNull().default("normal"),
    dueAt: text("due_at"),
    done: integer("done").notNull().default(0),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("idx_tasks_user_due").on(t.userId, t.dueAt)],
);
export const journal = sqliteTable(
  "journal",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    summary: text("summary"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_journal_user_created").on(t.userId, t.createdAt)],
);
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    content: text("content").notNull(),
    proposal: text("proposal"),
    applied: integer("applied").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_messages_user_created").on(t.userId, t.createdAt)],
);
export const trackers = sqliteTable(
  "trackers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    dueAt: text("due_at"),
    done: integer("done").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_trackers_user").on(t.userId)],
);
export const aiUsage = sqliteTable("ai_usage", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  window: integer("window").notNull(),
  count: integer("count").notNull(),
});
export const metrics = sqliteTable(
  "metrics",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    type: text("type").notNull(),
    unit: text("unit").notNull().default(""),
    goal: real("goal"),
    frequency: text("frequency").notNull().default("daily"),
    aggregation: text("aggregation").notNull().default("sum"),
    category: text("category").notNull().default(""),
    tags: text("tags").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("idx_metrics_user").on(t.userId)],
);
export const metricEntries = sqliteTable(
  "metric_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    metricId: text("metric_id")
      .notNull()
      .references(() => metrics.id),
    value: real("value").notNull(),
    recordedAt: text("recorded_at").notNull(),
    endAt: text("end_at"),
    notes: text("notes").notNull().default(""),
    tags: text("tags").notNull().default(""),
  },
  (t) => [
    index("idx_metric_entries_user_time").on(
      t.userId,
      t.metricId,
      t.recordedAt,
    ),
  ],
);
export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    filename: text("filename").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("idx_memories_user_filename").on(t.userId, t.filename)],
);
