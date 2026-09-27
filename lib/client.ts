import { partialReply, readSSE } from "./assistant-stream";
import type { Action } from "./types";

type AssistantResult = {
  id: string;
  userId?: string;
  reply: string;
  actions?: Action[];
  proposal?: Action[];
};
type BridgeEvent =
  | { type: "chunk"; text: string }
  | { type: "done"; result: unknown }
  | { type: "error"; error: string };
const bridgeRequests = new Map<string, (event: BridgeEvent) => void>();

declare global {
  interface Window {
    AndroidBridge?: {
      exportMemoryFile?: (filename: string, content: string) => void;
      handleApiAsync?: (
        id: string,
        path: string,
        method: string,
        bodyJson: string,
      ) => void;
      handleApi: (
        path: string,
        method: string,
        bodyJson: string,
      ) => string | Promise<string>;
    };
    onAndroidApiEvent?: (id: string, event: BridgeEvent) => void;
  }
}

function nativeRequest<T>(
  path: string,
  method: string,
  body?: unknown,
  onChunk?: (text: string) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      bridgeRequests.delete(id);
      reject(
        new Error(
          "The request timed out. Reopen chat to check whether your reply was saved.",
        ),
      );
    }, 180000);
    window.onAndroidApiEvent = (requestId, event) =>
      bridgeRequests.get(requestId)?.(event);
    bridgeRequests.set(id, (event) => {
      if (event.type === "chunk") {
        onChunk?.(event.text);
        return;
      }
      clearTimeout(timer);
      bridgeRequests.delete(id);
      if (event.type === "error") reject(new Error(event.error));
      else resolve(event.result as T);
    });
    try {
      window.AndroidBridge!.handleApiAsync!(
        id,
        path,
        method,
        body === undefined ? "" : JSON.stringify(body),
      );
    } catch (error) {
      clearTimeout(timer);
      bridgeRequests.delete(id);
      reject(error);
    }
  });
}

export async function streamAssistant(
  message: string,
  onText: (text: string) => void,
  context: {
    sent_at?: string;
    timezone?: string;
    attached_memory_ids?: string[];
  } = {},
): Promise<AssistantResult> {
  const payload = {
    message,
    sent_at: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...context,
  };
  let raw = "";
  const onChunk = (chunk: string) => {
    raw += chunk;
    const text = partialReply(raw);
    if (text) onText(text);
  };
  if (window.AndroidBridge?.handleApiAsync)
    return nativeRequest<AssistantResult>(
      "assistant",
      "POST",
      payload,
      onChunk,
    );
  if (window.AndroidBridge)
    throw new Error("Install the updated app to use live chat.");
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      result.error || "Could not send your message. Please try again.",
    );
  }
  if (!response.body) throw new Error("The reply stream could not be opened.");
  for await (const event of readSSE(response.body)) {
    const data = JSON.parse(event) as BridgeEvent;
    if (data.type === "chunk") onChunk(data.text);
    else if (data.type === "error") throw new Error(data.error);
    else if (data.type === "done") return data.result as AssistantResult;
  }
  throw new Error("The reply was interrupted. Please try again.");
}

export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (typeof window !== "undefined" && window.AndroidBridge) {
    if (window.AndroidBridge.handleApiAsync)
      return nativeRequest<T>(path, method, body);
    try {
      const responseStr = await Promise.resolve(
        window.AndroidBridge.handleApi(
          path,
          method,
          body !== undefined ? JSON.stringify(body) : "",
        ),
      );
      const result = JSON.parse(responseStr);
      if (result && typeof result === "object" && "error" in result) {
        throw new Error(result.error || "Could not save. Please try again.");
      }
      return result as T;
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error("Could not reach your workspace. Please try again.");
    }
  }

  const response = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Could not reach your workspace. Please try again.");
  }
  if (!response.ok)
    throw new Error(
      (result as { error?: string }).error ||
        "Could not save. Please try again.",
    );
  return result as T;
}
