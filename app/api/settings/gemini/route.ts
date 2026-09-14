import { z } from "zod";
import { identity, database, endpoint, json, body } from "@/lib/server";
import { encryptKey } from "@/lib/keys";
import { checkKey, limitAI } from "@/lib/gemini";
export async function PUT(request: Request) {
  return endpoint(async () => {
    const id = await identity(request);
    const { key } = z
      .object({
        key: z
          .string()
          .trim()
          .min(20, "Please enter your full Gemini API key.")
          .max(256),
      })
      .strict()
      .parse(await body(request));
    await limitAI(id);
    await checkKey(key);
    const encrypted = await encryptKey(key, id);
    await database()
      .prepare("UPDATE users SET gemini_key=? WHERE id=?")
      .bind(encrypted, id)
      .run();
    return json({ connected: true });
  });
}
export async function DELETE(request: Request) {
  return endpoint(async () => {
    const id = await identity(request);
    await database()
      .prepare("UPDATE users SET gemini_key=NULL WHERE id=?")
      .bind(id)
      .run();
    return json({ connected: false });
  });
}
