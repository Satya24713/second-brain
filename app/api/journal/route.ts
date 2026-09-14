import { identity, database, endpoint, json, body } from "@/lib/server";
import { journalSchema } from "@/lib/validation";
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await identity(request);
    const { body: entry } = journalSchema.parse(await body(request));
    const id = crypto.randomUUID();
    await database()
      .prepare(
        "INSERT INTO journal (id,user_id,body,created_at) VALUES (?,?,?,?)",
      )
      .bind(id, user, entry, new Date().toISOString())
      .run();
    return json({ id }, 201);
  });
}
