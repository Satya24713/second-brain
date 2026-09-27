import { z } from "zod";
import {
  identity,
  database,
  endpoint,
  json,
  body,
  ApiError,
} from "@/lib/server";
import { actionSchema } from "@/lib/validation";
import { metricSchema, entrySchema, memorySchema } from "@/lib/record-schemas";
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await identity(request);
    const { messageId } = z
      .object({ messageId: z.string().uuid() })
      .strict()
      .parse(await body(request));
    const db = database();
    const message = await db
      .prepare(
        "SELECT proposal,applied FROM messages WHERE id=? AND user_id=? AND role=?",
      )
      .bind(messageId, user, "assistant")
      .first<{ proposal: string | null; applied: number }>();
    if (!message) throw new ApiError(404, "This plan could not be found.");
    if (message.applied) return json({ ok: true, alreadyApplied: true });
    const actions = z
      .array(actionSchema)
      .max(12)
      .parse(JSON.parse(message.proposal || "[]"));
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    // Every insert is conditioned on the same unconsumed proposal; D1 batch is transactional.
    for (const [i, a] of actions.entries()) {
      const id = `${messageId}-${i}`;
      if (!["task", "journal", "profile", "tracker"].includes(a.type)) {
        const kind = a.type.replace(/_(update|delete)$/, "");
        const table = (
          {
            task: "tasks",
            journal: "journal",
            metric: "metrics",
            metric_entry: "metric_entries",
            memory: "memories",
          } as Record<string, string>
        )[kind];
        if (!table) throw new ApiError(400, "Unsupported action.");
        const record = a as unknown as Record<string, unknown>;
        const updating = a.type.endsWith("_update"),
          deleting = a.type.endsWith("_delete");
        const targetId = updating || deleting ? String(record.id) : id;
        const guard =
          "EXISTS (SELECT 1 FROM messages WHERE id=? AND user_id=? AND applied=0)";
        const current =
          updating || deleting
            ? await db
                .prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=?`)
                .bind(targetId, user)
                .first<Record<string, unknown>>()
            : null;
        if ((updating || deleting) && !current)
          throw new ApiError(
            404,
            "An item in this proposal no longer exists. Ask for a fresh plan.",
          );
        if (deleting) {
          if (kind === "metric")
            statements.push(
              db
                .prepare(
                  `DELETE FROM metric_entries WHERE metric_id=? AND user_id=? AND ${guard}`,
                )
                .bind(targetId, user, messageId, user),
            );
          statements.push(
            db
              .prepare(
                `DELETE FROM ${table} WHERE id=? AND user_id=? AND ${guard}`,
              )
              .bind(targetId, user, messageId, user),
          );
          continue;
        }
        let fields: Record<string, unknown> = Object.fromEntries(
          Object.entries(record).filter(
            ([k]) => !["type", "id", "metric_ref"].includes(k),
          ),
        );
        if (kind === "metric") {
          if (fields.metric_type) {
            fields.type = fields.metric_type;
            delete fields.metric_type;
          }
          const old = current
            ? Object.fromEntries(
                Object.entries(current).filter(
                  ([k]) =>
                    !["id", "user_id", "created_at", "updated_at"].includes(k),
                ),
              )
            : {};
          fields = metricSchema.parse({ ...old, ...fields });
          if (
            fields.type === "time_interval" &&
            !/^(h|hr|hrs|hour|hours|s|sec|secs|second|seconds|min|mins|minute|minutes)$/i.test(
              String(fields.unit).trim(),
            )
          )
            throw new ApiError(
              400,
              "Use minutes, hours, or seconds for intervals.",
            );
        }
        if (kind === "metric_entry") {
          if (typeof record.metric_ref === "number") {
            if (
              record.metric_ref >= i ||
              actions[record.metric_ref]?.type !== "metric"
            )
              throw new ApiError(
                400,
                "An entry must refer to an earlier tracker creation.",
              );
            fields.metric_id = `${messageId}-${record.metric_ref}`;
          }
          const old = current
            ? Object.fromEntries(
                Object.entries(current).filter(
                  ([k]) => !["id", "user_id"].includes(k),
                ),
              )
            : {};
          fields = entrySchema.parse({ ...old, ...fields });
          const linked =
            typeof record.metric_ref === "number"
              ? actions[record.metric_ref]
              : null;
          const metric =
            linked?.type === "metric"
              ? { type: linked.metric_type, unit: linked.unit }
              : await db
                  .prepare(
                    "SELECT type,unit FROM metrics WHERE id=? AND user_id=?",
                  )
                  .bind(fields.metric_id, user)
                  .first<{ type: string; unit: string }>();
          if (!metric)
            throw new ApiError(
              404,
              "The tracker for this entry no longer exists.",
            );
          if (
            ["count", "event"].includes(metric.type) &&
            (!Number.isInteger(fields.value) || Number(fields.value) < 0)
          )
            throw new ApiError(
              400,
              "Counts must be nonnegative whole numbers.",
            );
          if (
            metric.type === "yes_no" &&
            fields.value !== 0 &&
            fields.value !== 1
          )
            throw new ApiError(400, "Yes/no entries must be 0 or 1.");
          if (metric.type === "duration" && Number(fields.value) < 0)
            throw new ApiError(400, "Duration cannot be negative.");
          if (metric.type === "time_interval") {
            if (
              !/^(h|hr|hrs|hour|hours|s|sec|secs|second|seconds|min|mins|minute|minutes)$/i.test(
                metric.unit.trim(),
              )
            )
              throw new ApiError(
                400,
                "Use minutes, hours, or seconds for intervals.",
              );
            const duration =
              Date.parse(String(fields.end_at)) -
              Date.parse(String(fields.recorded_at));
            if (!Number.isFinite(duration) || duration <= 0)
              throw new ApiError(400, "An interval must end after it starts.");
            fields.value =
              duration /
              (/^(h|hr|hrs|hour|hours)$/i.test(metric.unit)
                ? 3600000
                : /^(s|sec|secs|second|seconds)$/i.test(metric.unit)
                  ? 1000
                  : 60000);
          }
        }
        if (kind === "memory") {
          const old = current
            ? Object.fromEntries(
                Object.entries(current).filter(
                  ([k]) =>
                    !["id", "user_id", "created_at", "updated_at"].includes(k),
                ),
              )
            : {};
          fields = memorySchema.parse({ ...old, ...fields });
        }
        if (kind === "task" && "done" in fields) {
          fields.completed_at = fields.done ? now : null;
          fields.done = Number(fields.done);
        }
        if (["task", "metric", "memory"].includes(kind))
          fields.updated_at = now;
        if (!updating && kind !== "metric_entry") fields.created_at = now;
        const pairs = Object.entries(fields);
        if (updating) {
          if (pairs.length)
            statements.push(
              db
                .prepare(
                  `UPDATE ${table} SET ${pairs.map(([k]) => `${k}=?`).join(",")} WHERE id=? AND user_id=? AND ${guard}`,
                )
                .bind(
                  ...pairs.map(([, v]) => v),
                  targetId,
                  user,
                  messageId,
                  user,
                ),
            );
        } else
          statements.push(
            db
              .prepare(
                `INSERT INTO ${table} (id,user_id,${pairs.map(([k]) => k).join(",")}) SELECT ?,?,${pairs.map(() => "?").join(",")} WHERE ${guard} ON CONFLICT(id) DO NOTHING`,
              )
              .bind(
                targetId,
                user,
                ...pairs.map(([, v]) => v),
                messageId,
                user,
              ),
          );
        continue;
      }
      if (a.type === "task")
        statements.push(
          db
            .prepare(
              "INSERT INTO tasks (id,user_id,title,notes,tag,kind,priority,due_at,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM messages WHERE id=? AND user_id=? AND applied=0) ON CONFLICT(id) DO NOTHING",
            )
            .bind(
              id,
              user,
              a.title,
              a.notes,
              a.tag,
              a.kind,
              a.priority,
              a.due_at,
              now,
              now,
              messageId,
              user,
            ),
        );
      if (a.type === "journal")
        statements.push(
          db
            .prepare(
              "INSERT INTO journal (id,user_id,body,summary,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM messages WHERE id=? AND user_id=? AND applied=0) ON CONFLICT(id) DO NOTHING",
            )
            .bind(id, user, a.body, a.summary || null, now, messageId, user),
        );
      if (a.type === "tracker")
        statements.push(
          db
            .prepare(
              "INSERT INTO trackers (id,user_id,title,due_at,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM messages WHERE id=? AND user_id=? AND applied=0) ON CONFLICT(id) DO NOTHING",
            )
            .bind(id, user, a.title, a.due_at, now, messageId, user),
        );
      if (a.type === "profile") {
        const fields = Object.entries(a).filter(([k]) => k !== "type");
        if (fields.length)
          statements.push(
            db
              .prepare(
                `UPDATE users SET ${fields.map(([k]) => `${k}=?`).join(",")},onboarded=1 WHERE id=? AND EXISTS (SELECT 1 FROM messages WHERE id=? AND user_id=? AND applied=0)`,
              )
              .bind(...fields.map(([, v]) => v), user, messageId, user),
          );
      }
    }
    statements.push(
      db
        .prepare(
          "UPDATE messages SET applied=1 WHERE id=? AND user_id=? AND applied=0",
        )
        .bind(messageId, user),
    );
    await db.batch(statements);
    return json({ ok: true, count: actions.length });
  });
}
