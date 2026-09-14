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
