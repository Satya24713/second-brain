import test from "node:test";
import assert from "node:assert/strict";
import { partialReply, readSSE } from "../lib/assistant-stream.ts";
import { readFile } from "node:fs/promises";
import ts from "typescript";

test("Partial replies remain safe across every character boundary", () => {
  const reply = 'Hello!\nQuote: "study". Path: C:\\notes. Emoji: 🙂';
  const raw = JSON.stringify({
    actions: [{ title: "Do not show this", notes: '"reply": "hidden"' }],
    reply,
  });
  let last = "";
  for (let i = 0; i <= raw.length; i++) {
    const value = partialReply(raw.slice(0, i));
    assert.ok(reply.startsWith(value));
    assert.ok(value.startsWith(last));
    last = value;
  }
  assert.equal(last, reply);
  assert.equal(partialReply('{"reply":"A\\uD83D'), "A");
  assert.equal(partialReply('{"reply":"A\\uD83D\\uDE42'), "A🙂");
});

test("SSE decodes split UTF-8, CRLF, comments, multiline data and a final event", async () => {
  const bytes = new TextEncoder().encode(
    ": heartbeat\r\ndata: hello 🙂\r\ndata: next\r\n\r\ndata: final",
  );
  const body = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const events = [];
  for await (const event of readSSE(body)) events.push(event);
  assert.deepEqual(events, ["hello 🙂\nnext", "final"]);
});

const source = (
  await readFile(new URL("../lib/client.ts", import.meta.url), "utf8")
).replace(
  '"./assistant-stream"',
  JSON.stringify(new URL("../lib/assistant-stream.ts", import.meta.url).href),
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { streamAssistant } = await import(
  "data:text/javascript;base64," + Buffer.from(output).toString("base64")
);

test("Native chat resolves asynchronously and delivers text before completion", async () => {
  let requestId;
  globalThis.window = {
    AndroidBridge: {
      handleApiAsync(id) {
        requestId = id;
      },
    },
  };
  const updates = [];
  let resolved = false;
  const promise = streamAssistant("hello", (text) => updates.push(text)).then(
    (result) => {
      resolved = true;
      return result;
    },
  );
  assert.equal(resolved, false);
  window.onAndroidApiEvent(requestId, {
    type: "chunk",
    text: '{"reply":"Hello',
  });
  assert.deepEqual(updates, ["Hello"]);
  assert.equal(resolved, false);
  window.onAndroidApiEvent(requestId, {
    type: "done",
    result: { id: "reply-id", reply: "Hello!", actions: [] },
  });
  assert.equal((await promise).reply, "Hello!");
  // A late callback from a finished request cannot affect the next conversation.
  window.onAndroidApiEvent(requestId, { type: "chunk", text: " stale" });
  assert.deepEqual(updates, ["Hello"]);
});

test("Native errors preserve partial text and reject instead of remaining busy", async () => {
  let requestId;
  globalThis.window = {
    AndroidBridge: {
      handleApiAsync(id) {
        requestId = id;
      },
    },
  };
  let partial;
  const promise = streamAssistant("hello", (text) => {
    partial = text;
  });
  window.onAndroidApiEvent(requestId, {
    type: "chunk",
    text: '{"reply":"Some text',
  });
  window.onAndroidApiEvent(requestId, {
    type: "error",
    error: "Network interrupted",
  });
  await assert.rejects(promise, /Network interrupted/);
  assert.equal(partial, "Some text");
});

test("Web chat emits progressive text, then requires a saved completion event", async () => {
  globalThis.window = {};
  const originalFetch = globalThis.fetch;
  let controller;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(c) {
          controller = c;
        },
      }),
    );
  const updates = [];
  const pending = streamAssistant("hello", (text) => updates.push(text));
  await new Promise((resolve) => setImmediate(resolve));
  const emit = (event) =>
    controller.enqueue(
      new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
    );
  emit({ type: "chunk", text: '{"reply":"First' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(updates, ["First"]);
  emit({ type: "chunk", text: ' second","actions":[]}' });
  emit({
    type: "done",
    result: { id: "saved", reply: "First second", actions: [] },
  });
  assert.equal((await pending).id, "saved");
  assert.equal(updates.at(-1), "First second");
  const interrupted = streamAssistant("hello", () => {});
  await new Promise((resolve) => setImmediate(resolve));
  controller.close();
  await assert.rejects(interrupted, /interrupted/);
  globalThis.fetch = originalFetch;
});
