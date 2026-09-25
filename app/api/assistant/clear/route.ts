import { identity, database, endpoint, json } from "@/lib/server";

export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await identity(request);
    await database()
      .prepare("DELETE FROM messages WHERE user_id=?")
      .bind(user)
      .run();
    return json({ ok: true, cleared: true });
  });
}

export async function DELETE(request: Request) {
  return POST(request);
}
