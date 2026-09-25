import { z } from "zod";
import {
  identity,
  database,
  endpoint,
  json,
  body,
  ApiError,
} from "@/lib/server";
import { plan } from "@/lib/gemini";
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await identity(request);
    const { message } = z
      .object({ message: z.string().trim().min(1).max(6000) })
      .strict()
      .parse(await body(request));
    const run = async (
      onChunk?: (text: string) => void,
      signal?: AbortSignal,
    ) => {
      const result = await plan(user, message, onChunk, signal);
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await database().batch([
        database()
          .prepare(
            "INSERT INTO messages (id,user_id,role,content,created_at) VALUES (?,?,?,?,?)",
          )
          .bind(userId, user, "user", message, now),
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
      return { id, userId, reply: result.reply, actions: result.actions };
    };
    if (!request.headers.get("accept")?.includes("text/event-stream"))
      return json(await run());
    const abort = new AbortController();
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: unknown) => {
          if (!closed)
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
        };
        try {
          const result = await run(
            (text) => emit({ type: "chunk", text }),
            AbortSignal.any([abort.signal, request.signal]),
          );
          emit({ type: "done", result });
        } catch (error) {
          emit({
            type: "error",
            error:
              error instanceof ApiError
                ? error.message
                : "The reply could not be completed. Please try again.",
          });
        } finally {
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      },
      cancel() {
        closed = true;
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  });
}

export async function DELETE(request: Request) {
  return endpoint(async () => {
    const user = await identity(request);
    await database()
      .prepare("DELETE FROM messages WHERE user_id=?")
      .bind(user)
      .run();
    return json({ ok: true, cleared: true });
  });
}
