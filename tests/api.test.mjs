import test from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8787";
// Built Worker only: these identity headers simulate the trusted Sites dispatcher.
const user = `qa-${crypto.randomUUID()}`,
  other = `qa-${crypto.randomUUID()}`;
async function request(
  path,
  { method = "GET", body, who = user, headers = {} } = {},
) {
  const r = await fetch(`${base}/api/${path}`, {
    method,
    headers: {
      ...(who
        ? {
            "oai-authenticated-user-id": who,
            "oai-authenticated-user-email": `${who}@example.test`,
          }
        : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Error(`${method} ${path}: ${r.status} ${raw}`);
  }
  return { status: r.status, data, headers: r.headers };
}
test("Persisted API contract and per-user authorization", async (t) => {
  await t.test("anonymous users are rejected", async () =>
    assert.equal((await request("workspace", { who: null })).status, 401),
  );
  await t.test(
    "create user-specific workspace and hide server secrets",
    async () => {
      const r = await request("workspace");
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.tasks, []);
      assert.equal("gemini_key" in r.data.profile, false);
      assert.equal(r.headers.get("cache-control"), "no-store");
    },
  );
  await t.test("validate input and reject cross-origin writes", async () => {
    assert.equal(
      (await request("tasks", { method: "POST", body: { title: " " } })).status,
      400,
    );
    assert.equal(
      (
        await request("tasks", {
          method: "POST",
          body: { title: "Bad origin" },
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
  });
  const made = await request("tasks", {
    method: "POST",
    body: {
      title: "Persistent test task",
      tag: "anything I choose",
      due_at: "2026-09-20T10:00:00+05:30",
    },
  });
  assert.equal(made.status, 201);
  const id = made.data.id;
  await t.test("read after creation returns canonical dates", async () => {
    const r = await request("workspace");
    assert.equal(r.data.tasks[0].id, id);
    assert.equal(r.data.tasks[0].due_at, "2026-09-20T04:30:00.000Z");
  });
  await t.test(
    "other users cannot read, edit, or delete the task",
    async () => {
      assert.deepEqual(
        (await request("workspace", { who: other })).data.tasks,
        [],
      );
      assert.equal(
        (
          await request(`tasks/${id}`, {
            method: "PATCH",
            who: other,
            body: { done: true },
          })
        ).status,
        404,
      );
      assert.equal(
        (await request(`tasks/${id}`, { method: "DELETE", who: other })).status,
        404,
      );
    },
  );
  await t.test("completion, reopening and editing persist", async () => {
    assert.equal(
      (await request(`tasks/${id}`, { method: "PATCH", body: { done: true } }))
        .status,
      200,
    );
    assert.equal((await request("workspace")).data.tasks[0].done, 1);
    assert.equal(
      (
        await request(`tasks/${id}`, {
          method: "PATCH",
          body: { done: false, title: "Edited task" },
        })
      ).status,
      200,
    );
    const r = (await request("workspace")).data.tasks[0];
    assert.equal(r.done, 0);
    assert.equal(r.completed_at, null);
    assert.equal(r.title, "Edited task");
  });
  const journal = await request("journal", {
    method: "POST",
    body: { body: "Unpolished raw journal text." },
  });
  assert.equal(journal.status, 201);
  await t.test("journal editing is isolated and persisted", async () => {
    assert.equal(
      (
        await request(`journal/${journal.data.id}`, {
          method: "PATCH",
          body: { body: "Updated thought." },
          who: other,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(`journal/${journal.data.id}`, {
          method: "PATCH",
          body: { body: "Updated thought." },
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("workspace")).data.journal[0].body,
      "Updated thought.",
    );
  });
  await t.test(
    "missing AI key and malformed key fail without leaking secrets",
    async () => {
      assert.equal(
        (
          await request("assistant", {
            method: "POST",
            body: { message: "Plan my day" },
          })
        ).status,
        503,
      );
      assert.equal(
        (
          await request("settings/gemini", {
            method: "PUT",
            body: { key: "short" },
          })
        ).status,
        400,
      );
    },
  );
  await t.test("unowned proposals cannot be applied", async () =>
    assert.equal(
      (
        await request("assistant/apply", {
          method: "POST",
          body: { messageId: crypto.randomUUID() },
        })
      ).status,
      404,
    ),
  );
  await t.test("cleanup removes only test-owned data", async () => {
    assert.equal(
      (await request(`tasks/${id}`, { method: "DELETE" })).status,
      200,
    );
    assert.equal(
      (await request(`journal/${journal.data.id}`, { method: "DELETE" }))
        .status,
      200,
    );
    assert.deepEqual((await request("workspace")).data.tasks, []);
  });
});
