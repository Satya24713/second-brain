import { identity, database, endpoint, json, body, ApiError } from "./server";
import { metricSchema, entrySchema, memorySchema } from "./record-schemas";

type Collection = "metrics" | "metric_entries" | "memories";
export function recordRoute(table: Collection) {
  return async (
    request: Request,
    context?: { params: Promise<{ id: string }> },
  ) =>
    endpoint(async () => {
      const user = await identity(request),
        db = database();
      const id = (await context?.params)?.id;
      const old = id
        ? await db
            .prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=?`)
            .bind(id, user)
            .first<Record<string, unknown>>()
        : null;
      if (id && !old) {
        if (request.body) await body(request).catch(() => undefined);
        throw new ApiError(404, "This item no longer exists.");
      }
      if (request.method === "GET") {
        if (old)
          return json(
            Object.fromEntries(
              Object.entries(old).filter(([key]) => key !== "user_id"),
            ),
          );
        const rows = await db
          .prepare(`SELECT * FROM ${table} WHERE user_id=?`)
          .bind(user)
          .all();
        return json(
          rows.results.map((record) =>
            Object.fromEntries(
              Object.entries(record).filter(([key]) => key !== "user_id"),
            ),
          ),
        );
      }
      if (request.method === "DELETE") {
        if (!id) throw new ApiError(400, "Choose an item to delete.");
        const statements =
          table === "metrics"
            ? [
                db
                  .prepare(
                    "DELETE FROM metric_entries WHERE metric_id=? AND user_id=?",
                  )
                  .bind(id, user),
              ]
            : [];
        statements.push(
          db
            .prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`)
            .bind(id, user),
        );
        await db.batch(statements);
        return json({ ok: true });
      }
      const input = await body(request);
      const schema =
        table === "metrics"
          ? metricSchema
          : table === "metric_entries"
            ? entrySchema
            : memorySchema;
      const patch = request.method === "PATCH";
      if (patch && !id) throw new ApiError(400, "Choose an item to update.");
      const cleanOld = Object.fromEntries(
        Object.entries(old || {}).filter(
          ([key]) =>
            !["id", "user_id", "created_at", "updated_at"].includes(key),
        ),
      );
      if (patch) schema.partial().parse(input);
      const parsed = schema.parse(
        patch ? { ...cleanOld, ...input } : input,
      ) as Record<string, unknown>;
      if (table === "metric_entries") {
        const metric = await db
          .prepare("SELECT type,unit FROM metrics WHERE id=? AND user_id=?")
          .bind(parsed.metric_id, user)
          .first<{ type: string; unit: string }>();
        if (!metric) throw new ApiError(404, "Choose an existing tracker.");
        const value = parsed.value as number;
        if (
          ["count", "event"].includes(metric.type) &&
          (!Number.isInteger(value) || value < 0)
        )
          throw new ApiError(400, "Use a nonnegative whole number.");
        if (metric.type === "yes_no" && value !== 0 && value !== 1)
          throw new ApiError(400, "Use 1 for yes or 0 for no.");
        if (metric.type === "duration" && value < 0)
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
            Date.parse(String(parsed.end_at)) -
            Date.parse(String(parsed.recorded_at));
          if (!Number.isFinite(duration) || duration <= 0)
            throw new ApiError(400, "End time must be after start time.");
          parsed.value =
            duration /
            (/^(h|hr|hrs|hour|hours)$/i.test(metric.unit.trim())
              ? 3600000
              : /^(s|sec|secs|second|seconds)$/i.test(metric.unit.trim())
                ? 1000
                : 60000);
        }
      }
      if (
        table === "metrics" &&
        parsed.type === "time_interval" &&
        !/^(h|hr|hrs|hour|hours|s|sec|secs|second|seconds|min|mins|minute|minutes)$/i.test(
          String(parsed.unit).trim(),
        )
      )
        throw new ApiError(
          400,
          "Use minutes, hours, or seconds for intervals.",
        );
      if (table === "memories") {
        const duplicate = await db
          .prepare(
            "SELECT id FROM memories WHERE filename=? AND user_id=? AND id<>?",
          )
          .bind(parsed.filename, user, id || "")
          .first();
        if (duplicate)
          throw new ApiError(
            400,
            "A memory with that filename already exists. Choose another name.",
          );
      }
      const now = new Date().toISOString();
      if (table !== "metric_entries") parsed.updated_at = now;
      if (!patch && table !== "metric_entries") parsed.created_at = now;
      const recordId = id || crypto.randomUUID(),
        fields = Object.entries(parsed);
      if (patch)
        await db
          .prepare(
            `UPDATE ${table} SET ${fields.map(([k]) => `${k}=?`).join(",")} WHERE id=? AND user_id=?`,
          )
          .bind(...fields.map(([, v]) => v), recordId, user)
          .run();
      else
        await db
          .prepare(
            `INSERT INTO ${table} (id,user_id,${fields.map(([k]) => k).join(",")}) VALUES (?, ?, ${fields.map(() => "?").join(",")})`,
          )
          .bind(recordId, user, ...fields.map(([, v]) => v))
          .run();
      return json({ ok: true, id: recordId });
    });
}
