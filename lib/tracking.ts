/** Shared, timezone-aware measurement engine. Entries retain their original units. */
export const METRIC_TYPES = [
  "quantity",
  "duration",
  "count",
  "score",
  "event",
  "yes_no",
  "time_interval",
] as const;
export const AGGREGATIONS = [
  "sum",
  "average",
  "count",
  "latest",
  "max",
  "streak",
  "percentage",
] as const;
export type Metric = {
  id: string;
  title: string;
  type: (typeof METRIC_TYPES)[number];
  unit: string;
  goal: number | null;
  frequency: "daily" | "weekly" | "monthly";
  aggregation: (typeof AGGREGATIONS)[number];
  category: string;
  tags: string;
  notes: string;
  created_at: string;
  updated_at: string;
};
export type MetricEntry = {
  id: string;
  metric_id: string;
  value: number;
  recorded_at: string;
  end_at: string | null;
  notes: string;
  tags: string;
};
export type MetricInput = Omit<Metric, "id" | "created_at" | "updated_at">;
export type EntryInput = Omit<MetricEntry, "id">;
export type TrackerRange = "day" | "week" | "month" | "year" | "custom";
export type DateRange = { start: string; end: string };
const DAY = 86400000;

function shortText(value: unknown, max: number, field: string) {
  if (typeof value !== "string" || value.length > max)
    throw new Error(`${field} must be text of at most ${max} characters.`);
  return value.trim();
}
export function parseMetric(input: unknown): MetricInput {
  if (!input || typeof input !== "object")
    throw new Error("A tracker is required.");
  const b = input as Record<string, unknown>;
  const title = shortText(b.title, 160, "Title");
  if (!title) throw new Error("Give your tracker a name.");
  if (!METRIC_TYPES.includes(b.type as Metric["type"]))
    throw new Error("Choose a supported measurement type.");
  if (!AGGREGATIONS.includes(b.aggregation as Metric["aggregation"]))
    throw new Error("Choose a supported aggregation.");
  if (!["daily", "weekly", "monthly"].includes(String(b.frequency)))
    throw new Error("Choose a daily, weekly, or monthly goal.");
  const goal =
    b.goal === null || b.goal === undefined || b.goal === "" ? null : b.goal;
  if (
    goal !== null &&
    (typeof goal !== "number" || !Number.isFinite(goal) || goal <= 0)
  )
    throw new Error("A goal must be greater than zero, or left blank.");
  if (
    b.type === "time_interval" &&
    secondsPerUnit(String(b.unit ?? "")) === null
  )
    throw new Error("Time intervals need a unit of min, hours, or seconds.");
  return {
    title,
    type: b.type as Metric["type"],
    unit: shortText(b.unit ?? "", 40, "Unit"),
    goal,
    frequency: b.frequency as Metric["frequency"],
    aggregation: b.aggregation as Metric["aggregation"],
    category: shortText(b.category ?? "", 80, "Category"),
    tags: shortText(b.tags ?? "", 300, "Tags"),
    notes: shortText(b.notes ?? "", 3000, "Notes"),
  };
}
function isoTimestamp(value: unknown, field: string) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error(`${field} must be a valid timestamp with timezone.`);
  return new Date(value).toISOString();
}
function secondsPerUnit(unit: string): number | null {
  const normalized = unit.toLowerCase().trim();
  if (["h", "hr", "hrs", "hour", "hours"].includes(normalized)) return 3600;
  if (["s", "sec", "secs", "second", "seconds"].includes(normalized)) return 1;
  if (["m", "min", "mins", "minute", "minutes"].includes(normalized)) return 60;
  return null;
}
export function durationValue(start: string, end: string, unit: string) {
  const divisor = secondsPerUnit(unit);
  if (divisor === null)
    throw new Error("Time intervals need a unit of min, hours, or seconds.");
  return (Date.parse(end) - Date.parse(start)) / 1000 / divisor;
}
export function parseMetricEntry(input: unknown, metric: Metric): EntryInput {
  if (!input || typeof input !== "object")
    throw new Error("An entry is required.");
  const b = input as Record<string, unknown>;
  if (b.metric_id !== metric.id)
    throw new Error("The entry belongs to a different tracker.");
  const recorded_at = isoTimestamp(b.recorded_at, "Entry time");
  const end_at = b.end_at ? isoTimestamp(b.end_at, "End time") : null;
  let value = b.value;
  if (metric.type === "time_interval") {
    if (!end_at || Date.parse(end_at) <= Date.parse(recorded_at))
      throw new Error("The end must be after the start.");
    value = durationValue(recorded_at, end_at, metric.unit);
  }
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Enter a valid number.");
  if (
    ["duration", "count", "event", "time_interval"].includes(metric.type) &&
    value < 0
  )
    throw new Error("This measurement cannot be negative.");
  if (["count", "event"].includes(metric.type) && !Number.isInteger(value))
    throw new Error("Enter a whole number.");
  if (metric.type === "yes_no" && value !== 0 && value !== 1)
    throw new Error("Choose yes or no.");
  return {
    metric_id: metric.id,
    value,
    recorded_at,
    end_at,
    notes: shortText(b.notes ?? "", 3000, "Notes"),
    tags: shortText(b.tags ?? "", 300, "Tags"),
  };
}
export function trackerDay(value: string | Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function shiftDay(date: string, delta: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + delta * DAY)
    .toISOString()
    .slice(0, 10);
}
export function daysInRange(range: DateRange) {
  const days =
    Math.round((Date.parse(range.end) - Date.parse(range.start)) / DAY) + 1;
  if (!Number.isFinite(days) || days < 1 || days > 3660) return [];
  return Array.from({ length: days }, (_, i) => shiftDay(range.start, i));
}
export function trackingRange(
  period: TrackerRange,
  anchor: string,
  custom?: DateRange,
): DateRange {
  if (period === "custom") return custom || { start: anchor, end: anchor };
  if (period === "day") return { start: anchor, end: anchor };
  const d = new Date(`${anchor}T12:00:00Z`);
  if (period === "week") {
    const start = shiftDay(anchor, -((d.getUTCDay() + 6) % 7));
    return { start, end: shiftDay(start, 6) };
  }
  if (period === "month")
    return {
      start: `${anchor.slice(0, 7)}-01`,
      end: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12))
        .toISOString()
        .slice(0, 10),
    };
  return {
    start: `${anchor.slice(0, 4)}-01-01`,
    end: `${anchor.slice(0, 4)}-12-31`,
  };
}
export function previousRange(range: DateRange) {
  const length = daysInRange(range).length;
  return {
    start: shiftDay(range.start, -length),
    end: shiftDay(range.start, -1),
  };
}
export function comparisonRange(range: DateRange, elapsed: DateRange) {
  let prior = previousRange(range);
  if (
    range.start.endsWith("-01-01") &&
    range.end === `${range.start.slice(0, 4)}-12-31`
  )
    prior = trackingRange("year", shiftDay(range.start, -1));
  else if (
    range.start.endsWith("-01") &&
    trackingRange("month", range.start).end === range.end
  )
    prior = trackingRange("month", shiftDay(range.start, -1));
  const length = daysInRange(elapsed).length;
  if (!length) return { start: prior.start, end: shiftDay(prior.start, -1) };
  const end = shiftDay(prior.start, length - 1);
  return { start: prior.start, end: end < prior.end ? end : prior.end };
}
export function entriesInRange(
  entries: MetricEntry[],
  range: DateRange,
  timezone: string,
) {
  return entries.filter((e) => {
    const key = trackerDay(e.recorded_at, timezone);
    return key >= range.start && key <= range.end;
  });
}
function longestRun(keys: string[]) {
  let longest = 0,
    current = 0,
    previous = "";
  for (const key of [...new Set(keys)].sort()) {
    current = previous && key === shiftDay(previous, 1) ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = key;
  }
  return longest;
}
export function aggregateEntries(
  entries: MetricEntry[],
  aggregation: Metric["aggregation"],
  timezone: string,
): number | null {
  if (!entries.length) return null;
  switch (aggregation) {
    case "count":
      return entries.length;
    case "average":
      return entries.reduce((s, e) => s + e.value, 0) / entries.length;
    case "max":
      return Math.max(...entries.map((e) => e.value));
    case "latest":
      return entries.reduce((last, e) =>
        Date.parse(e.recorded_at) > Date.parse(last.recorded_at) ? e : last,
      ).value;
    case "percentage":
      return (entries.filter((e) => e.value > 0).length / entries.length) * 100;
    case "streak":
      return longestRun(
        entries
          .filter((e) => e.value > 0)
          .map((e) => trackerDay(e.recorded_at, timezone)),
      );
    default:
      return entries.reduce((s, e) => s + e.value, 0);
  }
}
export function bucketKey(day: string, frequency: Metric["frequency"]) {
  if (frequency === "monthly") return day.slice(0, 7);
  if (frequency === "weekly") return trackingRange("week", day).start;
  return day;
}
export function metricSeries(
  metric: Metric,
  entries: MetricEntry[],
  range: DateRange,
  timezone: string,
  frequency: Metric["frequency"] = "daily",
) {
  const buckets = new Map<string, MetricEntry[]>();
  for (const day of daysInRange(range))
    if (!buckets.has(bucketKey(day, frequency)))
      buckets.set(bucketKey(day, frequency), []);
  for (const e of entriesInRange(
    entries.filter((e) => e.metric_id === metric.id),
    range,
    timezone,
  ))
    buckets
      .get(bucketKey(trackerDay(e.recorded_at, timezone), frequency))
      ?.push(e);
  return [...buckets].map(([date, items]) => ({
    date,
    value: aggregateEntries(items, metric.aggregation, timezone),
    count: items.length,
  }));
}
export function metricStats(
  metric: Metric,
  entries: MetricEntry[],
  range: DateRange,
  timezone: string,
  now = new Date(),
) {
  const own = entries.filter((e) => e.metric_id === metric.id);
  const today = trackerDay(now, timezone);
  const elapsed = {
    start: range.start,
    end: range.end > today ? today : range.end,
  };
  const current = entriesInRange(own, elapsed, timezone);
  const prior = entriesInRange(own, comparisonRange(range, elapsed), timezone);
  const value = aggregateEntries(current, metric.aggregation, timezone);
  const previous = aggregateEntries(prior, metric.aggregation, timezone);
  // A weekly/monthly goal always considers its whole calendar period, even in Day view.
  const goalRange =
    metric.frequency === "daily"
      ? elapsed
      : {
          start: trackingRange(
            metric.frequency === "weekly" ? "week" : "month",
            elapsed.start,
          ).start,
          end: trackingRange(
            metric.frequency === "weekly" ? "week" : "month",
            elapsed.end,
          ).end,
        };
  if (goalRange.end > today) goalRange.end = today;
  const periods = daysInRange(elapsed).length
    ? metricSeries(metric, own, goalRange, timezone, metric.frequency)
    : [];
  const goalValue = aggregateEntries(
    entriesInRange(own, goalRange, timezone),
    metric.aggregation,
    timezone,
  );
  const logged = periods.filter((p) => p.count > 0).length;
  const achieved = periods.filter(
    (p) =>
      p.value !== null &&
      (metric.goal === null ? p.value > 0 : p.value >= metric.goal),
  ).length;
  const dayCount = daysInRange(elapsed).length;
  const additive =
    metric.aggregation === "sum" || metric.aggregation === "count";
  const target =
    metric.goal === null || !periods.length
      ? null
      : metric.goal * (additive ? periods.length : 1);
  let streak = 0;
  // A current incomplete goal period does not break yesterday's streak.
  const allDays = own
    .map((e) => trackerDay(e.recorded_at, timezone))
    .filter((d) => d <= today)
    .sort();
  if (allDays.length) {
    const history = metricSeries(
      metric,
      own,
      { start: allDays[0], end: today },
      timezone,
      metric.frequency,
    );
    for (let i = history.length - 1; i >= 0; i--) {
      const p = history[i];
      const success =
        p.value !== null &&
        (metric.goal === null ? p.value > 0 : p.value >= metric.goal);
      if (success) streak++;
      else if (i !== history.length - 1) break;
    }
  }
  return {
    value,
    previous,
    change:
      value !== null && previous !== null && previous !== 0
        ? ((value - previous) / Math.abs(previous)) * 100
        : null,
    count: current.length,
    consistency: periods.length ? (logged / periods.length) * 100 : 0,
    goalCompletion: periods.length ? (achieved / periods.length) * 100 : 0,
    target,
    goalValue,
    progress: target && goalValue !== null ? (goalValue / target) * 100 : null,
    streak,
    dailyAverage:
      additive && value !== null && dayCount ? value / dayCount : null,
    weeklyAverage:
      additive && value !== null && dayCount ? (value / dayCount) * 7 : null,
    periods: periods.length,
  };
}
export function metricUnit(metric: Metric) {
  if (metric.aggregation === "percentage") return "%";
  if (metric.aggregation === "count") return "entries";
  if (metric.aggregation === "streak") return "days";
  return metric.unit;
}
export function derivedRatio(
  numerator: Metric,
  denominator: Metric,
  entries: MetricEntry[],
  range: DateRange,
  timezone: string,
  kind: "accuracy" | "per_hour",
) {
  const a = entriesInRange(
    entries.filter((e) => e.metric_id === numerator.id),
    range,
    timezone,
  ).reduce((s, e) => s + e.value, 0);
  const b = entriesInRange(
    entries.filter((e) => e.metric_id === denominator.id),
    range,
    timezone,
  ).reduce((s, e) => s + e.value, 0);
  if (b <= 0 || a < 0) return null;
  if (kind === "accuracy") return (a / b) * 100;
  if (!["duration", "time_interval"].includes(denominator.type)) return null;
  const seconds = secondsPerUnit(denominator.unit);
  if (seconds === null) return null;
  const hours = (b * seconds) / 3600;
  return hours > 0 ? a / hours : null;
}
