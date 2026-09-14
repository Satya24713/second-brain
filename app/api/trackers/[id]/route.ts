import { z } from "zod";
import {
  identity,
  database,
  endpoint,
  json,
  body,
  ApiError,
} from "@/lib/server";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return endpoint(async () => {
    const user = await identity(request);
    const { id } = await params;
    const { done } = z
      .object({ done: z.boolean() })
      .strict()
      .parse(await body(request));
    const r = await database()
      .prepare("UPDATE trackers SET done=? WHERE id=? AND user_id=?")
      .bind(Number(done), id, user)
      .run();
    if (!r.meta.changes)
      throw new ApiError(404, "This check-in could not be found.");
    return json({ ok: true });
  });
}
