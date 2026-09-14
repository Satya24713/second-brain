import {
  identity,
  database,
  endpoint,
  json,
  body,
  ApiError,
} from "@/lib/server";
import { taskPatch } from "@/lib/validation";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Context) {
  return endpoint(async () => {
    const user = await identity(request);
    const { id } = await params;
    const patch = taskPatch.parse(await body(request));
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k}=?`);
      vals.push(typeof v === "boolean" ? Number(v) : (v as string | null));
    }
    if ("done" in patch) {
      sets.push("completed_at=?");
      vals.push(patch.done ? new Date().toISOString() : null);
    }
    sets.push("updated_at=?");
    vals.push(new Date().toISOString());
    const result = await database()
      .prepare(`UPDATE tasks SET ${sets.join(",")} WHERE id=? AND user_id=?`)
      .bind(...vals, id, user)
      .run();
    if (!result.meta.changes)
      throw new ApiError(404, "This task could not be found.");
    return json({ ok: true });
  });
}
export async function DELETE(request: Request, { params }: Context) {
  return endpoint(async () => {
    const user = await identity(request);
    const { id } = await params;
    const r = await database()
      .prepare("DELETE FROM tasks WHERE id=? AND user_id=?")
      .bind(id, user)
      .run();
    if (!r.meta.changes)
      throw new ApiError(404, "This task could not be found.");
    return json({ ok: true });
  });
}
