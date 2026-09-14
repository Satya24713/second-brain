import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ZodError } from "zod";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const database = () => {
  if (!env.DB)
    throw new ApiError(
      503,
      "Your workspace is temporarily unavailable. Please try again.",
    );
  return env.DB;
};
export async function identity(request?: Request) {
  if (request && !["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      // Drain small rejected bodies so a keep-alive connection remains usable.
      await readLimited(request).catch(() => undefined);
      throw new ApiError(403, "This request could not be verified.");
    }
  }
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "Please sign in to open your workspace.");
  await database()
    .prepare(
      "INSERT INTO users (id,name,created_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING",
    )
    .bind(
      user.userId,
      user.fullName || user.email.split("@")[0],
      new Date().toISOString(),
    )
    .run();
  return user.userId;
}
export async function body(request: Request) {
  const raw = await readLimited(request);
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Please check your entry and try again.");
  }
}
async function readLimited(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 32000)
    throw new ApiError(413, "That message is too long.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32000) {
        await reader.cancel();
        throw new ApiError(413, "That message is too long.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function endpoint(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (e) {
    if (e instanceof ZodError)
      return json(
        { error: e.issues[0]?.message || "Please check the fields." },
        400,
      );
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error(
      "Workspace operation failed",
      e instanceof Error ? e.name : "Unknown error",
    );
    return json(
      {
        error:
          "Something went wrong. Your changes have not been confirmed. Please try again.",
      },
      503,
    );
  }
}
