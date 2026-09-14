import { z } from "zod";
import { identity, database, endpoint, json, body } from "@/lib/server";
import { plan } from "@/lib/gemini";
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await identity(request);
    const { message } = z
      .object({ message: z.string().trim().min(1).max(6000) })
      .strict()
      .parse(await body(request));
    const result = await plan(user, message);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await database().batch([
      database()
        .prepare(
          "INSERT INTO messages (id,user_id,role,content,created_at) VALUES (?,?,?,?,?)",
        )
        .bind(crypto.randomUUID(), user, "user", message, now),
      database()
        .prepare(
          "INSERT INTO messages (id,user_id,role,content,proposal,created_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(
          id,
          user,
          "assistant",
          result.reply,
          JSON.stringify(result.actions),
          new Date(Date.now() + 1).toISOString(),
        ),
    ]);
    return json({ id, reply: result.reply, actions: result.actions });
  });
}
