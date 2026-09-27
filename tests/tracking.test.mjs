import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateEntries,
  comparisonRange,
  derivedRatio,
  entriesInRange,
  metricSeries,
  metricStats,
  parseMetric,
  parseMetricEntry,
  previousRange,
  trackerDay,
  trackingRange,
} from "../lib/tracking.ts";

test("Current weeks and months compare their elapsed portion against the previous calendar period", () => {
  assert.deepEqual(
    comparisonRange(
      { start: "2026-09-21", end: "2026-09-27" },
      { start: "2026-09-21", end: "2026-09-23" },
    ),
    { start: "2026-09-14", end: "2026-09-16" },
  );
  assert.deepEqual(
    comparisonRange(
      { start: "2026-09-01", end: "2026-09-30" },
      { start: "2026-09-01", end: "2026-09-26" },
    ),
    { start: "2026-08-01", end: "2026-08-26" },
  );
});

const water = {
  id: "water",
  title: "Water",
  type: "quantity",
  unit: "ml",
  goal: 2000,
  frequency: "daily",
  aggregation: "sum",
  category: "Health",
  tags: "",
  notes: "",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};
function entry(
  value,
  recorded_at,
  metric_id = "water",
  id = `${metric_id}-${recorded_at}`,
) {
  return {
    id,
    metric_id,
    value,
    recorded_at,
    end_at: null,
    notes: "",
    tags: "",
  };
}
const utc = "UTC";

test("Tracker dates and intervals respect local days across UTC midnight", () => {
  assert.equal(
    trackerDay("2026-09-25T20:00:00Z", "Asia/Kolkata"),
    "2026-09-26",
  );
  const items = [
    entry(500, "2026-09-25T20:00:00Z"),
    entry(200, "2026-09-26T20:00:00Z"),
  ];
  assert.equal(
    entriesInRange(
      items,
      { start: "2026-09-26", end: "2026-09-26" },
      "Asia/Kolkata",
    ).length,
    1,
  );
});
test("Calendar ranges handle leap years, Monday weeks, and equal-length prior periods", () => {
  assert.deepEqual(trackingRange("month", "2024-02-11"), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.deepEqual(trackingRange("week", "2026-09-27"), {
    start: "2026-09-21",
    end: "2026-09-27",
  });
  assert.deepEqual(previousRange({ start: "2026-09-21", end: "2026-09-23" }), {
    start: "2026-09-18",
    end: "2026-09-20",
  });
});
test("Aggregations preserve zero values and choose latest by timestamp, not input order", () => {
  const items = [
    entry(0, "2026-09-26T12:00:00Z"),
    entry(10, "2026-09-25T12:00:00Z"),
  ];
  assert.equal(aggregateEntries(items, "latest", utc), 0);
  assert.equal(aggregateEntries(items, "average", utc), 5);
  assert.equal(aggregateEntries(items, "sum", utc), 10);
  assert.equal(aggregateEntries(items, "count", utc), 2);
  assert.equal(aggregateEntries(items, "percentage", utc), 50);
  assert.equal(aggregateEntries([], "sum", utc), null);
});
test("Chart gaps stay empty and weekly groups combine only their own metric", () => {
  const items = [
    entry(100, "2026-09-21T10:00:00Z"),
    entry(400, "2026-09-23T10:00:00Z"),
    entry(999, "2026-09-23T10:00:00Z", "other"),
  ];
  const range = { start: "2026-09-21", end: "2026-09-27" };
  const daily = metricSeries(water, items, range, utc);
  assert.equal(daily.length, 7);
  assert.equal(daily[1].value, null);
  assert.equal(metricSeries(water, items, range, utc, "weekly")[0].value, 500);
});
test("Goal consistency uses elapsed days and current unfinished day preserves prior streak", () => {
  const items = [
    entry(2100, "2026-09-21T10:00:00Z"),
    entry(2200, "2026-09-22T10:00:00Z"),
  ];
  const stats = metricStats(
    water,
    items,
    { start: "2026-09-21", end: "2026-09-27" },
    utc,
    new Date("2026-09-23T12:00:00Z"),
  );
  assert.equal(stats.value, 4300);
  assert.equal(stats.target, 6000);
  assert.equal(stats.streak, 2);
  assert.equal(stats.periods, 3);
  assert.ok(Math.abs(stats.consistency - 66.66666666666666) < 0.0001);
  assert.equal(stats.change, null);
  assert.equal(
    metricStats(
      water,
      items,
      { start: "2026-09-21", end: "2026-09-27" },
      utc,
      new Date("2026-09-24T12:00:00Z"),
    ).streak,
    0,
  );
});
test("Average goals are not multiplied by elapsed days; percentage change handles zero safely", () => {
  const score = { ...water, aggregation: "average", goal: 80 };
  const items = [
    entry(0, "2026-09-20T12:00:00Z"),
    entry(90, "2026-09-21T12:00:00Z"),
  ];
  const stats = metricStats(
    score,
    items,
    { start: "2026-09-21", end: "2026-09-22" },
    utc,
    new Date("2026-09-22T18:00:00Z"),
  );
  assert.equal(stats.target, 80);
  assert.equal(stats.change, null);
  assert.equal(stats.dailyAverage, null);
});
test("Durations derive numeric value from actual elapsed time, including DST transition", () => {
  const sleep = { ...water, id: "sleep", type: "time_interval", unit: "hours" };
  const result = parseMetricEntry(
    {
      metric_id: "sleep",
      value: 999,
      recorded_at: "2026-11-01T00:00:00-04:00",
      end_at: "2026-11-01T08:00:00-05:00",
    },
    sleep,
  );
  assert.equal(result.value, 9);
  assert.throws(
    () =>
      parseMetricEntry(
        {
          metric_id: "sleep",
          value: 0,
          recorded_at: "2026-09-26T08:00:00Z",
          end_at: "2026-09-26T07:00:00Z",
        },
        sleep,
      ),
    /end must be after/,
  );
});
test("Validation rejects malformed numbers, dates, unsupported metrics, and fractional counts", () => {
  assert.equal(parseMetric({ ...water, title: " Water " }).title, "Water");
  assert.throws(() => parseMetric({ ...water, goal: -1 }), /goal/);
  assert.throws(() => parseMetric({ ...water, type: "anything" }), /supported/);
  assert.throws(
    () =>
      parseMetricEntry(
        { metric_id: "water", value: NaN, recorded_at: "2026-09-26T10:00:00Z" },
        water,
      ),
    /valid number/,
  );
  assert.throws(
    () =>
      parseMetricEntry(
        { metric_id: "water", value: 1, recorded_at: "2026-09-26" },
        water,
      ),
    /timestamp/,
  );
  assert.throws(
    () =>
      parseMetricEntry(
        { metric_id: "water", value: 1.5, recorded_at: "2026-09-26T10:00:00Z" },
        { ...water, type: "count" },
      ),
    /whole number/,
  );
  assert.throws(
    () =>
      parseMetricEntry(
        { metric_id: "water", value: 2, recorded_at: "2026-09-26T10:00:00Z" },
        { ...water, type: "yes_no" },
      ),
    /yes or no/,
  );
});
test("Configured accuracy and productivity use matching time ranges and convert minutes", () => {
  const correct = { ...water, id: "correct", type: "count" };
  const attempted = { ...water, id: "attempted", type: "count" };
  const study = { ...water, id: "study", type: "duration", unit: "min" };
  const items = [
    entry(40, "2026-09-26T12:00:00Z", "correct"),
    entry(50, "2026-09-26T12:00:00Z", "attempted"),
    entry(120, "2026-09-26T12:00:00Z", "study"),
    entry(999, "2026-09-20T12:00:00Z", "correct"),
  ];
  const range = { start: "2026-09-26", end: "2026-09-26" };
  assert.equal(
    derivedRatio(correct, attempted, items, range, utc, "accuracy"),
    80,
  );
  assert.equal(derivedRatio(correct, study, items, range, utc, "per_hour"), 20);
  assert.equal(
    derivedRatio(correct, attempted, [], range, utc, "accuracy"),
    null,
  );
  assert.equal(
    derivedRatio(correct, attempted, items, range, utc, "per_hour"),
    null,
  );
  assert.equal(
    derivedRatio(
      correct,
      { ...study, unit: "sessions" },
      items,
      range,
      utc,
      "per_hour",
    ),
    null,
  );
});

test("Weekly goals include earlier weekdays even when viewing one day", () => {
  const weekly = { ...water, frequency: "weekly", goal: 5000 };
  const stats = metricStats(
    weekly,
    [entry(3000, "2026-09-21T12:00:00Z"), entry(2500, "2026-09-23T12:00:00Z")],
    { start: "2026-09-23", end: "2026-09-23" },
    utc,
    new Date("2026-09-23T18:00:00Z"),
  );
  assert.equal(stats.value, 2500);
  assert.equal(stats.goalValue, 5500);
  assert.equal(stats.target, 5000);
  assert.equal(stats.goalCompletion, 100);
});

test("Signed quantities support refunds; time intervals reject ambiguous units", () => {
  assert.equal(
    parseMetricEntry(
      { metric_id: "water", value: -200, recorded_at: "2026-09-26T10:00:00Z" },
      water,
    ).value,
    -200,
  );
  assert.throws(
    () => parseMetric({ ...water, type: "time_interval", unit: "sessions" }),
    /unit/,
  );
});
