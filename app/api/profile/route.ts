import { identity, database, endpoint, json, body } from "@/lib/server";
import { profileSchema } from "@/lib/validation";
export async function PATCH(request: Request) {
  return endpoint(async () => {
    const user = await identity(request);
    const p = profileSchema.parse(await body(request));
    await database()
      .prepare(
        "UPDATE users SET name=?,role=?,context=?,goals=?,timezone=?,onboarded=? WHERE id=?",
      )
      .bind(
        p.name,
        p.role,
        p.context,
        p.goals,
        p.timezone,
        p.onboarded === false ? 0 : 1,
        user,
      )
      .run();
    return json({ ok: true });
  });
}
