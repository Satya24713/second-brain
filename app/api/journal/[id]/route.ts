import {
  identity,
  database,
  endpoint,
  json,
  body,
  ApiError,
} from "@/lib/server";
import { journalSchema } from "@/lib/validation";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Context) {
  return endpoint(async () => {
    const user = await identity(request);
    const { id } = await params;
    const entry = journalSchema.parse(await body(request));
    const r = await database()
      .prepare(
        "UPDATE journal SET body=?,summary=NULL WHERE id=? AND user_id=?",
      )
      .bind(entry.body, id, user)
      .run();
    if (!r.meta.changes)
      throw new ApiError(404, "This thought could not be found.");
    return json({ ok: true });
  });
}
export async function DELETE(request: Request, { params }: Context) {
  return endpoint(async () => {
    const user = await identity(request);
    const { id } = await params;
    const r = await database()
      .prepare("DELETE FROM journal WHERE id=? AND user_id=?")
      .bind(id, user)
      .run();
    if (!r.meta.changes)
      throw new ApiError(404, "This thought could not be found.");
    return json({ ok: true });
  });
}
