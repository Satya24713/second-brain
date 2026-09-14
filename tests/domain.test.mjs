import test from "node:test";
import assert from "node:assert/strict";
import {
  taskSchema,
  taskPatch,
  profileSchema,
  aiResultSchema,
} from "../lib/validation.ts";
import { dayKey } from "../lib/dates.ts";
test("Today uses the planning timezone across UTC midnight", () => {
  assert.equal(dayKey("2026-09-13T20:00:00Z", "Asia/Kolkata"), "2026-09-14");
  assert.equal(
    dayKey("2026-09-13T20:00:00Z", "America/New_York"),
    "2026-09-13",
  );
});
test("Date-only strings cannot silently become timed tasks", () => {
  assert.equal(
    taskSchema.safeParse({ title: "Test", due_at: "2026-09-20" }).success,
    false,
  );
  assert.equal(
    taskSchema.parse({ title: "Test", due_at: "2026-09-20T10:00:00+05:30" })
      .due_at,
    "2026-09-20T04:30:00.000Z",
  );
});
test("Freeform tags and undated tasks survive validation", () => {
  const t = taskSchema.parse({
    title: " Buy notebook ",
    tag: "my own unusual tag",
  });
  assert.equal(t.title, "Buy notebook");
  assert.equal(t.tag, "my own unusual tag");
  assert.equal(t.due_at, null);
});
test("Reject blank titles, ownership injection, bad dates, and string booleans", () => {
  for (const x of [
    { title: " " },
    { title: "a", user_id: "someone-else" },
    { title: "a", due_at: "wrong" },
  ])
    assert.equal(taskSchema.safeParse(x).success, false);
  assert.equal(taskPatch.safeParse({ done: "false" }).success, false);
});
test("Require valid profile timezone and constrain AI to supported actions", () => {
  assert.equal(
    profileSchema.safeParse({
      name: "A",
      role: "",
      context: "",
      goals: "",
      timezone: "Mars/Space",
    }).success,
    false,
  );
  assert.equal(
    aiResultSchema.safeParse({
      reply: "Delete all",
      actions: [{ type: "delete_all" }],
    }).success,
    false,
  );
  assert.equal(
    aiResultSchema.safeParse({
      reply: "Profile",
      actions: [{ type: "profile", name: "" }],
    }).success,
    false,
  );
});
test("Valid reviewed plans retain an event, preparation, journal and follow-up", () => {
  const r = aiResultSchema.parse({
    reply: "Here is a small plan.",
    actions: [
      {
        type: "task",
        title: "Chemistry test",
        kind: "event",
        due_at: "2026-09-20T10:00:00+05:30",
      },
      { type: "task", title: "Review chapter 4", tag: "college" },
      {
        type: "journal",
        body: "My own raw words.",
        summary: "One small step feels possible.",
      },
      { type: "tracker", title: "How is chemistry preparation going?" },
    ],
  });
  assert.equal(r.actions.length, 4);
  assert.equal(r.actions[2].body, "My own raw words.");
});
