import test from "node:test";
import assert from "node:assert/strict";
import { relativeTaskDate, dayKey } from "../lib/dates.ts";
import { taskVisibleOnView } from "../lib/task-display.ts";

test("Today keeps its completed tasks and only pending overdue tasks", () => {
  const today = "2026-09-26";
  assert.equal(taskVisibleOnView("today", today, false, today), true);
  assert.equal(taskVisibleOnView("today", today, true, today), true);
  assert.equal(taskVisibleOnView("today", "2026-09-25", false, today), true);
  assert.equal(taskVisibleOnView("today", "2026-09-25", true, today), false);
  assert.equal(taskVisibleOnView("today", "2026-09-27", false, today), false);
});

test("Upcoming defaults to pending current, future, and undated tasks", () => {
  const today = "2026-09-26";
  for (const due of [today, "2026-10-01", ""])
    assert.equal(taskVisibleOnView("upcoming", due, false, today), true);
  assert.equal(taskVisibleOnView("upcoming", today, true, today), false);
  assert.equal(
    taskVisibleOnView("upcoming", "2026-09-25", false, today),
    false,
  );
});

test("Selecting a past calendar day reveals its completed and pending tasks", () => {
  const today = "2026-09-26";
  const past = "2026-09-20";
  assert.equal(taskVisibleOnView("upcoming", past, true, today, past), true);
  assert.equal(taskVisibleOnView("upcoming", past, false, today, past), true);
  assert.equal(taskVisibleOnView("upcoming", today, false, today, past), false);
});

test("Task dates use Tomorrow, days away, and actual completion dates", () => {
  const now = new Date("2026-09-26T07:00:00Z");
  assert.equal(
    relativeTaskDate("2026-09-27T04:00:00Z", "Asia/Kolkata", false, now),
    "Tomorrow · 9:30 AM",
  );
  assert.equal(
    relativeTaskDate("2026-09-29T04:00:00Z", "Asia/Kolkata", false, now),
    "In 3 days · 9:30 AM",
  );
  assert.equal(
    relativeTaskDate("2026-09-25T04:00:00Z", "Asia/Kolkata", true, now),
    "Completed yesterday · 9:30 AM",
  );
  assert.equal(
    relativeTaskDate("2026-09-23T04:00:00Z", "Asia/Kolkata", true, now),
    "Completed 3 days ago · 9:30 AM",
  );
});

test("Day selection and relative labels use the configured timezone at midnight", () => {
  const now = new Date("2026-09-25T20:00:00Z");
  const due = "2026-09-26T04:00:00Z";
  const tz = "Asia/Kolkata";
  assert.equal(
    taskVisibleOnView("today", dayKey(due, tz), true, dayKey(now, tz)),
    true,
  );
  assert.equal(relativeTaskDate(due, tz, false, now), "Today · 9:30 AM");
});
