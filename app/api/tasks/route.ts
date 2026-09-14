import { identity, database, endpoint, json, body } from "@/lib/server";
import { taskSchema } from "@/lib/validation";
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await identity(request);
    const t = taskSchema.parse(await body(request));
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await database()
      .prepare(
        "INSERT INTO tasks (id,user_id,title,notes,tag,kind,priority,due_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        user,
        t.title,
        t.notes,
        t.tag,
        t.kind,
        t.priority,
        t.due_at,
        now,
        now,
      )
      .run();
    return json({ id }, 201);
  });
}
