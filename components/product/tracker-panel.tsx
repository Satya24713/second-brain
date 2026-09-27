"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Flame,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/client";
import { localInput } from "@/lib/dates";
import {
  AGGREGATIONS,
  METRIC_TYPES,
  derivedRatio,
  entriesInRange,
  metricSeries,
  metricStats,
  metricUnit,
  parseMetric,
  parseMetricEntry,
  shiftDay,
  trackerDay,
  trackingRange,
  type Metric,
  type MetricEntry,
  type MetricInput,
  type TrackerRange,
} from "@/lib/tracking";
import { Modal } from "./primitives";
import "@/app/tracker.css";

const typeLabels: Record<Metric["type"], string> = {
  quantity: "Quantity",
  duration: "Duration",
  count: "Count",
  score: "Score",
  event: "Event",
  yes_no: "Yes / no",
  time_interval: "Time interval",
};
const aggregationLabels: Record<Metric["aggregation"], string> = {
  sum: "Total",
  average: "Average",
  count: "Entry count",
  latest: "Latest",
  max: "Highest",
  streak: "Longest daily streak",
  percentage: "Yes / positive percentage",
};
const frequencyLabels = { daily: "day", weekly: "week", monthly: "month" };
const defaultMetric: MetricInput = {
  title: "",
  type: "quantity",
  unit: "",
  goal: null,
  frequency: "daily",
  aggregation: "sum",
  category: "",
  tags: "",
  notes: "",
};
const presets: (MetricInput & { emoji: string })[] = [
  {
    ...defaultMetric,
    title: "Water",
    unit: "ml",
    goal: 2000,
    category: "Health",
    emoji: "💧",
  },
  {
    ...defaultMetric,
    title: "Study",
    type: "duration",
    unit: "min",
    goal: 120,
    category: "Learning",
    emoji: "📚",
  },
  {
    ...defaultMetric,
    title: "Questions solved",
    type: "count",
    unit: "questions",
    goal: 40,
    category: "Learning",
    emoji: "✏️",
  },
  {
    ...defaultMetric,
    title: "Sleep",
    type: "time_interval",
    unit: "hours",
    goal: 8,
    category: "Health",
    emoji: "🌙",
  },
  {
    ...defaultMetric,
    title: "Daily habit",
    type: "yes_no",
    goal: 100,
    aggregation: "percentage",
    category: "Habits",
    emoji: "🌱",
  },
  {
    ...defaultMetric,
    title: "Weight",
    unit: "kg",
    aggregation: "latest",
    category: "Health",
    emoji: "⚖️",
  },
];
function number(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
        value,
      );
}
function tagsOf(value: string) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
function dateLabel(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
function entryTime(value: string, timezone: string) {
  return new Date(value).toLocaleString(undefined, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TrackerPanel({
  metrics = [],
  entries = [],
  timezone,
  onChange,
}: {
  metrics: Metric[];
  entries: MetricEntry[];
  timezone: string;
  onChange: (message: string) => void | Promise<void>;
}) {
  const today = trackerDay(new Date(), timezone);
  const [period, setPeriod] = useState<TrackerRange>("week");
  const [anchor, setAnchor] = useState(today);
  const [customStart, setCustomStart] = useState(shiftDay(today, -29));
  const [customEnd, setCustomEnd] = useState(today);
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<{
    metric: Metric | null;
    preset?: MetricInput;
  } | null>(null);
  const [entryEditor, setEntryEditor] = useState<{
    metric: Metric;
    entry: MetricEntry | null;
  } | null>(null);
  const [chart, setChart] = useState("line");
  const [grouping, setGrouping] = useState<Metric["frequency"]>("daily");
  const [ratioKind, setRatioKind] = useState<"accuracy" | "per_hour">(
    "accuracy",
  );
  const [numeratorId, setNumeratorId] = useState("");
  const [denominatorId, setDenominatorId] = useState("");
  const range = useMemo(
    () => trackingRange(period, anchor, { start: customStart, end: customEnd }),
    [period, anchor, customStart, customEnd],
  );
  const filteredEntries = useMemo(
    () =>
      tag
        ? entries.filter(
            (e) =>
              tagsOf(e.tags).includes(tag) ||
              tagsOf(
                metrics.find((m) => m.id === e.metric_id)?.tags || "",
              ).includes(tag),
          )
        : entries,
    [entries, metrics, tag],
  );
  const visible = metrics.filter(
    (m) =>
      (!category || m.category === category) &&
      (!tag ||
        tagsOf(m.tags).includes(tag) ||
        filteredEntries.some((e) => e.metric_id === m.id)),
  );
  const selected = visible.find((m) => m.id === selectedId) || visible[0];
  const categories = [
    ...new Set(metrics.map((m) => m.category).filter(Boolean)),
  ].sort();
  const tags = [
    ...new Set([...metrics, ...entries].flatMap((m) => tagsOf(m.tags))),
  ].sort();
  const stats = useMemo(
    () =>
      new Map(
        metrics.map((m) => [
          m.id,
          metricStats(m, filteredEntries, range, timezone),
        ]),
      ),
    [metrics, filteredEntries, range, timezone],
  );
  const selectedStats = selected ? stats.get(selected.id)! : null;
  const series = selected
    ? metricSeries(selected, filteredEntries, range, timezone, grouping)
    : [];
  const dailySeries = selected
    ? metricSeries(selected, filteredEntries, range, timezone)
    : [];
  const selectedEntries = selected
    ? entriesInRange(
        filteredEntries.filter((e) => e.metric_id === selected.id),
        range,
        timezone,
      ).sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))
    : [];
  const maxValue = Math.max(1, ...dailySeries.map((p) => p.value || 0));
  const numerator = metrics.find((m) => m.id === numeratorId),
    denominator = metrics.find((m) => m.id === denominatorId);
  const ratio =
    numerator && denominator && numerator.id !== denominator.id
      ? derivedRatio(
          numerator,
          denominator,
          filteredEntries,
          range,
          timezone,
          ratioKind,
        )
      : null;
  const scatterData = selectedEntries.map((e) => ({
    hour:
      Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: timezone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date(e.recorded_at)),
      ) +
      Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: timezone,
          minute: "2-digit",
        }).format(new Date(e.recorded_at)),
      ) /
        60,
    value: e.value,
  }));
  const distribution = (() => {
    if (!selectedEntries.length) return [];
    const values = selectedEntries.map((e) => e.value),
      low = Math.min(...values),
      high = Math.max(...values);
    const step = (high - low) / 5 || 1;
    return Array.from({ length: high === low ? 1 : 5 }, (_, i) => ({
      name:
        high === low
          ? number(low)
          : `${number(low + i * step)}–${number(low + (i + 1) * step)}`,
      count: values.filter(
        (v) =>
          v >= low + i * step &&
          (i === 4 || high === low ? v <= high : v < low + (i + 1) * step),
      ).length,
    }));
  })();
  function move(direction: number) {
    const d = new Date(`${anchor}T12:00:00Z`);
    if (period === "month") {
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + direction);
      setAnchor(d.toISOString().slice(0, 10));
    } else if (period === "year") {
      d.setUTCMonth(0, 1);
      d.setUTCFullYear(d.getUTCFullYear() + direction);
      setAnchor(d.toISOString().slice(0, 10));
    } else setAnchor(shiftDay(anchor, direction * (period === "week" ? 7 : 1)));
  }
  return (
    <section className="tracker-panel" aria-label="Trackers">
      <div className="tracker-heading">
        <div>
          <p className="tracker-eyebrow">A LITTLE EVERY DAY</p>
          <h2>Your progress, in perspective.</h2>
          <p>Track what matters. Notice what changes.</p>
        </div>
        <button
          className="button primary"
          onClick={() => setEditor({ metric: null })}
        >
          <Plus size={16} />
          New tracker
        </button>
      </div>
      <div className="tracker-controls">
        <div className="tracker-periods" aria-label="Time period">
          {(["day", "week", "month", "year", "custom"] as TrackerRange[]).map(
            (p) => (
              <button
                key={p}
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
              >
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ),
          )}
        </div>
        <div className="tracker-filter-row">
          {period === "custom" ? (
            <div className="tracker-custom-dates">
              <input
                aria-label="Start date"
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) =>
                  e.target.value && setCustomStart(e.target.value)
                }
              />
              <span>to</span>
              <input
                aria-label="End date"
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(e) => e.target.value && setCustomEnd(e.target.value)}
              />
            </div>
          ) : (
            <div className="tracker-date-nav">
              <button aria-label="Previous period" onClick={() => move(-1)}>
                <ChevronLeft size={17} />
              </button>
              <input
                aria-label="Date in selected period"
                type="date"
                value={anchor}
                onChange={(e) => e.target.value && setAnchor(e.target.value)}
              />
              <button aria-label="Next period" onClick={() => move(1)}>
                <ChevronRight size={17} />
              </button>
              <button
                className="tracker-today"
                onClick={() => setAnchor(today)}
              >
                Today
              </button>
            </div>
          )}
          <select
            aria-label="Category or subject"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      {!metrics.length ? (
        <div className="tracker-welcome">
          <span className="tracker-welcome-icon">
            <Activity size={30} />
          </span>
          <h3>What would you like to track?</h3>
          <p>
            Start with an idea below, or create your own. Every tracker can have
            its own units, schedule, and goal.
          </p>
          <div className="tracker-presets">
            {presets.map((p) => (
              <button
                key={p.title}
                onClick={() => {
                  setEditor({ metric: null, preset: p });
                }}
              >
                <span>{p.emoji}</span>
                {p.title}
                <Plus size={14} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="tracker-summary">
            <span>
              <strong>{visible.length}</strong> trackers
            </span>
            <span>
              <strong>
                {visible.reduce(
                  (sum, m) => sum + (stats.get(m.id)?.count || 0),
                  0,
                )}
              </strong>{" "}
              entries
            </span>
            <span>
              <Target size={14} />
              <strong>
                {
                  visible.filter((m) => {
                    const s = stats.get(m.id);
                    return s?.progress !== null && (s?.progress || 0) >= 100;
                  }).length
                }
              </strong>{" "}
              goals reached
            </span>
            <small>
              {dateLabel(range.start)}
              {range.start !== range.end && ` – ${dateLabel(range.end)}`}
            </small>
          </div>
          {!visible.length && (
            <p className="tracker-no-data">No trackers match these filters.</p>
          )}
          <div className="tracker-cards">
            {visible.map((m) => {
              const s = stats.get(m.id)!;
              return (
                <article
                  key={m.id}
                  className={`tracker-card ${selected?.id === m.id ? "selected" : ""}`}
                >
                  <button
                    className="tracker-card-select"
                    onClick={() => setSelectedId(m.id)}
                    aria-pressed={selected?.id === m.id}
                  >
                    <span className="tracker-card-kicker">
                      {m.category || typeLabels[m.type]}
                      <span>{aggregationLabels[m.aggregation]}</span>
                    </span>
                    <h3>{m.title}</h3>
                    <div className="tracker-card-value">
                      {number(s.value)}
                      <small>{metricUnit(m)}</small>
                    </div>
                    {s.target !== null && (
                      <>
                        <div
                          className="tracker-progress"
                          role="progressbar"
                          aria-label={`${m.title} goal progress`}
                          aria-valuenow={Math.min(
                            100,
                            Math.max(0, Math.round(s.progress || 0)),
                          )}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <i
                            style={{
                              width: `${Math.min(100, Math.max(0, s.progress || 0))}%`,
                            }}
                          />
                        </div>
                        <span className="tracker-card-goal">
                          {number(s.goalValue ?? 0)} / {number(s.target)}{" "}
                          {metricUnit(m)} · {m.frequency} goals
                        </span>
                      </>
                    )}
                    <span className="tracker-card-trend">
                      {s.change !== null ? (
                        <>
                          {s.change >= 0 ? (
                            <ArrowUpRight size={14} />
                          ) : (
                            <ArrowDownRight size={14} />
                          )}
                          {number(Math.abs(s.change))}% vs previous period
                        </>
                      ) : (
                        <>
                          {s.count
                            ? `${s.count} ${s.count === 1 ? "entry" : "entries"} this period`
                            : "Ready for your first entry"}
                        </>
                      )}
                    </span>
                  </button>
                  <button
                    className="tracker-log-button"
                    onClick={() => setEntryEditor({ metric: m, entry: null })}
                  >
                    <Plus size={15} />
                    Log {m.title.toLowerCase()}
                  </button>
                </article>
              );
            })}
          </div>
          {selected && selectedStats && (
            <section
              className="tracker-detail"
              aria-label={`${selected.title} details`}
            >
              <div className="tracker-detail-heading">
                <div>
                  <p className="tracker-eyebrow">THE BIGGER PICTURE</p>
                  <h3>{selected.title}</h3>
                  {selected.notes && <p>{selected.notes}</p>}
                </div>
                <button
                  className="button quiet"
                  onClick={() => setEditor({ metric: selected })}
                >
                  <Pencil size={14} />
                  Edit tracker
                </button>
              </div>
              <div className="tracker-insights">
                <div>
                  <Flame size={16} />
                  <strong>{selectedStats.streak}</strong>
                  <span>{frequencyLabels[selected.frequency]} streak</span>
                </div>
                <div>
                  <strong>{number(selectedStats.consistency)}%</strong>
                  <span>periods logged</span>
                </div>
                {selected.goal !== null && (
                  <div>
                    <strong>{number(selectedStats.goalCompletion)}%</strong>
                    <span>periods meeting goal</span>
                  </div>
                )}
                {selectedStats.weeklyAverage !== null && (
                  <div>
                    <strong>{number(selectedStats.weeklyAverage)}</strong>
                    <span>{metricUnit(selected)} / week average</span>
                  </div>
                )}
              </div>
              <div className="tracker-chart-toolbar">
                <label className="sr-only" htmlFor="tracker-chart">
                  Visualization
                </label>
                <select
                  id="tracker-chart"
                  value={chart}
                  onChange={(e) => setChart(e.target.value)}
                >
                  <option value="line">Line chart</option>
                  <option value="bar">Bar chart</option>
                  <option value="heatmap">Calendar heatmap</option>
                  <option value="timeline">Timeline</option>
                  <option value="scatter">Time of day</option>
                  <option value="distribution">Distribution</option>
                </select>
                {["line", "bar"].includes(chart) && (
                  <select
                    aria-label="Chart grouping"
                    value={grouping}
                    onChange={(e) =>
                      setGrouping(e.target.value as Metric["frequency"])
                    }
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                )}
                <span>
                  {metricUnit(selected)} · {timezone}
                </span>
              </div>
              {!selectedEntries.length ? (
                <p className="tracker-no-data">
                  No entries in this period. Log a measurement or choose another
                  date.
                </p>
              ) : chart === "heatmap" ? (
                <>
                  <div
                    className="tracker-heatmap"
                    role="img"
                    aria-label="Daily activity heatmap"
                  >
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                      (day) => (
                        <span className="tracker-weekday" key={day}>
                          {day}
                        </span>
                      ),
                    )}
                    {Array.from(
                      {
                        length:
                          (new Date(`${range.start}T12:00:00Z`).getUTCDay() +
                            6) %
                          7,
                      },
                      (_, i) => (
                        <span aria-hidden="true" key={`pad-${i}`} />
                      ),
                    )}
                    {dailySeries.map((p) => (
                      <div
                        key={p.date}
                        title={`${dateLabel(p.date)}: ${number(p.value)} ${metricUnit(selected)}`}
                        style={{
                          background:
                            p.value === null
                              ? "#eff1f5"
                              : `rgba(78, 102, 224, ${0.18 + (Math.max(0, p.value) / maxValue) * 0.82})`,
                        }}
                      >
                        <span>{Number(p.date.slice(-2))}</span>
                      </div>
                    ))}
                  </div>
                  <p className="tracker-chart-note">
                    Each square is a day. Darker squares indicate higher values;
                    gray means no entry.
                  </p>
                </>
              ) : chart === "timeline" ? (
                <div className="tracker-timeline">
                  {selectedEntries.map((e) => (
                    <button
                      key={e.id}
                      onClick={() =>
                        setEntryEditor({ metric: selected, entry: e })
                      }
                    >
                      <span className="tracker-timeline-dot" />
                      <time>{entryTime(e.recorded_at, timezone)}</time>
                      <strong>
                        {selected.type === "yes_no"
                          ? e.value
                            ? "Yes"
                            : "No"
                          : `${number(e.value)} ${selected.unit}`}
                      </strong>
                      {e.notes && <small>{e.notes}</small>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="tracker-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    {chart === "line" ? (
                      <LineChart data={series}>
                        <CartesianGrid stroke="#edf0f6" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) =>
                            dateLabel(v.length === 7 ? `${v}-01` : v)
                          }
                          tick={{ fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={30}
                        />
                        <YAxis
                          width={45}
                          tick={{ fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(v) => [
                            number(Number(v)),
                            metricUnit(selected),
                          ]}
                          labelFormatter={(v) => String(v)}
                        />
                        <Line
                          dataKey="value"
                          name={selected.title}
                          type="monotone"
                          stroke="#536adf"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    ) : chart === "bar" ? (
                      <BarChart data={series}>
                        <CartesianGrid stroke="#edf0f6" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) =>
                            dateLabel(v.length === 7 ? `${v}-01` : v)
                          }
                          tick={{ fontSize: 11 }}
                          minTickGap={30}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          width={45}
                          tick={{ fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(v) => [
                            number(Number(v)),
                            metricUnit(selected),
                          ]}
                        />
                        <Bar
                          dataKey="value"
                          fill="#687ce7"
                          radius={[4, 4, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    ) : chart === "scatter" ? (
                      <ScatterChart>
                        <CartesianGrid stroke="#edf0f6" />
                        <XAxis
                          dataKey="hour"
                          type="number"
                          domain={[0, 24]}
                          name="Hour of day"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => `${v}:00`}
                        />
                        <YAxis
                          dataKey="value"
                          type="number"
                          name={selected.unit || "Value"}
                          width={45}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                        <Scatter
                          data={scatterData}
                          fill="#687ce7"
                          isAnimationActive={false}
                        />
                      </ScatterChart>
                    ) : (
                      <BarChart data={distribution}>
                        <CartesianGrid stroke="#edf0f6" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis
                          allowDecimals={false}
                          width={35}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip />
                        <Bar
                          dataKey="count"
                          name="Entries"
                          fill="#687ce7"
                          radius={[4, 4, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
              <p className="tracker-chart-note">
                {selected.frequency[0].toUpperCase() +
                  selected.frequency.slice(1)}{" "}
                goal
                {selected.goal !== null
                  ? `: at least ${number(selected.goal)} ${metricUnit(selected)}`
                  : " not set"}
                . Comparisons use the elapsed portion of the previous period.
                Goals use full calendar days, weeks, or months, up to today.{" "}
                {selected.aggregation === "percentage" &&
                  "Percentage counts positive entries out of all logged entries."}
              </p>
              {chart !== "timeline" && selectedEntries.length > 0 && (
                <div className="tracker-entry-list">
                  <div className="tracker-entry-list-heading">
                    <h4>Entries</h4>
                    <span>{selectedEntries.length} in this period</span>
                  </div>
                  {selectedEntries.slice(0, 50).map((e) => (
                    <button
                      className="tracker-entry"
                      key={e.id}
                      onClick={() =>
                        setEntryEditor({ metric: selected, entry: e })
                      }
                    >
                      <span>
                        <time>{entryTime(e.recorded_at, timezone)}</time>
                        {e.notes && <small>{e.notes}</small>}
                        {e.tags && <small>{e.tags}</small>}
                      </span>
                      <strong>
                        {selected.type === "yes_no"
                          ? e.value
                            ? "Yes"
                            : "No"
                          : `${number(e.value)} ${selected.unit}`}
                      </strong>
                      <Pencil size={13} />
                    </button>
                  ))}
                  {selectedEntries.length > 50 && (
                    <p className="tracker-chart-note">
                      Showing the latest 50 entries. Choose Timeline to see all
                      entries, or narrow the date range.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
          {metrics.length >= 2 && (
            <section className="tracker-derived">
              <div>
                <p className="tracker-eyebrow">CONNECT THE DOTS</p>
                <h3>Compare two measurements</h3>
                <p>
                  Choose related trackers to calculate accuracy or output per
                  hour.
                </p>
              </div>
              <div className="tracker-derived-fields">
                <select
                  aria-label="Derived metric"
                  value={ratioKind}
                  onChange={(e) => {
                    setRatioKind(e.target.value as typeof ratioKind);
                    setDenominatorId("");
                  }}
                >
                  <option value="accuracy">
                    Accuracy: correct ÷ attempted
                  </option>
                  <option value="per_hour">Output per hour</option>
                </select>
                <select
                  aria-label={
                    ratioKind === "accuracy"
                      ? "Correct answers tracker"
                      : "Output tracker"
                  }
                  value={numeratorId}
                  onChange={(e) => setNumeratorId(e.target.value)}
                >
                  <option value="">
                    {ratioKind === "accuracy"
                      ? "Correct answers tracker"
                      : "Output tracker"}
                  </option>
                  {metrics
                    .filter(
                      (m) =>
                        m.type === "count" ||
                        m.type === "quantity" ||
                        m.type === "event",
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                </select>
                <select
                  aria-label={
                    ratioKind === "accuracy"
                      ? "Attempted answers tracker"
                      : "Time tracker"
                  }
                  value={denominatorId}
                  onChange={(e) => setDenominatorId(e.target.value)}
                >
                  <option value="">
                    {ratioKind === "accuracy"
                      ? "Attempted answers tracker"
                      : "Time tracker"}
                  </option>
                  {metrics
                    .filter(
                      (m) =>
                        m.id !== numeratorId &&
                        (ratioKind === "accuracy"
                          ? ["count", "quantity", "event"].includes(m.type)
                          : ["duration", "time_interval"].includes(m.type)),
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                </select>
              </div>
              <div className="tracker-ratio-value">
                {number(ratio)}
                <small>
                  {ratioKind === "accuracy" ? "% accuracy" : "/ hour"}
                </small>
              </div>
              {numerator && denominator && ratio === null && (
                <p className="tracker-chart-note">
                  Log a nonzero denominator in this period to calculate this
                  measure.
                </p>
              )}
              {ratioKind === "accuracy" && ratio !== null && ratio > 100 && (
                <p className="tracker-chart-note">
                  Correct answers exceed attempted answers. Check that these
                  trackers cover the same questions and period.
                </p>
              )}
            </section>
          )}
        </>
      )}
      {editor && (
        <MetricEditor
          metric={editor.metric}
          preset={editor.preset}
          onClose={() => setEditor(null)}
          onSaved={onChange}
        />
      )}
      {entryEditor && (
        <EntryEditor
          metric={entryEditor.metric}
          entry={entryEditor.entry}
          onClose={() => setEntryEditor(null)}
          onSaved={onChange}
        />
      )}
    </section>
  );
}

function MetricEditor({
  metric,
  preset,
  onClose,
  onSaved,
}: {
  metric: Metric | null;
  preset?: MetricInput;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [form, setForm] = useState<MetricInput>(
    metric || preset || defaultMetric,
  );
  const [goal, setGoal] = useState(form.goal === null ? "" : String(form.goal));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  function field<K extends keyof MetricInput>(key: K, value: MetricInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = parseMetric({
        ...form,
        goal: goal === "" ? null : Number(goal),
      });
      await api(
        metric ? `metrics/${metric.id}` : "metrics",
        metric ? "PATCH" : "POST",
        payload,
      );
      await onSaved(metric ? "Tracker updated" : "Tracker created");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`metrics/${metric!.id}`, "DELETE");
      await onSaved("Tracker deleted");
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={metric ? "Edit tracker" : "Create a tracker"}
      description="One measurement, your own way. Adjust its goal and details whenever you need."
    >
      <form className="editor-form tracker-editor" onSubmit={save}>
        <label>
          Name
          <input
            autoFocus
            required
            maxLength={160}
            value={form.title}
            onChange={(e) => field("title", e.target.value)}
            placeholder="e.g. Water, mood, physics questions"
          />
        </label>
        <div className="field-grid">
          <label>
            Measurement type
            <select
              value={form.type}
              onChange={(e) => {
                const type = e.target.value as Metric["type"];
                setForm((f) => ({
                  ...f,
                  type,
                  unit: ["duration", "time_interval"].includes(type)
                    ? "min"
                    : type === "yes_no" || type === "event"
                      ? ""
                      : f.unit,
                  aggregation:
                    type === "yes_no"
                      ? "percentage"
                      : type === "score"
                        ? "average"
                        : type === "event"
                          ? "count"
                          : "sum",
                }));
                if (type === "yes_no") setGoal("100");
              }}
            >
              {METRIC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabels[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Unit
            <input
              maxLength={40}
              value={form.unit}
              onChange={(e) => field("unit", e.target.value)}
              placeholder={
                form.type === "duration" || form.type === "time_interval"
                  ? "min, hours, or seconds"
                  : "ml, kg, questions, ₹…"
              }
            />
          </label>
          <label>
            Combine entries with
            <select
              value={form.aggregation}
              onChange={(e) =>
                field("aggregation", e.target.value as Metric["aggregation"])
              }
            >
              {AGGREGATIONS.map((a) => (
                <option key={a} value={a}>
                  {aggregationLabels[a]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Goal frequency
            <select
              value={form.frequency}
              onChange={(e) =>
                field("frequency", e.target.value as Metric["frequency"])
              }
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label>
            Goal <span className="optional">optional, at least</span>
            <input
              type="number"
              step="any"
              min="0.000001"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="No goal"
            />
          </label>
          <label>
            Category / subject
            <input
              maxLength={80}
              value={form.category}
              onChange={(e) => field("category", e.target.value)}
              placeholder="Health, chemistry, finance…"
            />
          </label>
        </div>
        <label>
          Tags <span className="optional">comma separated</span>
          <input
            maxLength={300}
            value={form.tags}
            onChange={(e) => field("tags", e.target.value)}
            placeholder="morning, exam prep"
          />
        </label>
        <label>
          Notes
          <textarea
            rows={2}
            maxLength={3000}
            value={form.notes}
            onChange={(e) => field("notes", e.target.value)}
            placeholder="What this measures, or how you want to use it"
          />
        </label>
        {form.aggregation === "percentage" && (
          <p className="form-hint">
            Percentage = entries with a positive value ÷ all entries × 100. Use
            yes / no for habit consistency.
          </p>
        )}
        {form.type === "time_interval" && (
          <p className="form-hint">
            Log a start and end time. Duration is calculated in min, hours, or
            seconds; choose one of these units.
          </p>
        )}
        {metric && (
          <p className="form-hint">
            Changing units or measurement type does not convert existing
            entries.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {deleting && (
          <p className="form-error">
            This removes the tracker and all of its logged entries.
          </p>
        )}
        <div className="dialog-actions">
          {metric && (
            <button
              type="button"
              className={`button ${deleting ? "danger" : "quiet"}`}
              disabled={busy}
              onClick={() => (deleting ? remove() : setDeleting(true))}
            >
              <Trash2 size={15} />
              {deleting ? "Delete tracker & entries" : "Delete"}
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : metric ? "Save changes" : "Create tracker"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EntryEditor({
  metric,
  entry,
  onClose,
  onSaved,
}: {
  metric: Metric;
  entry: MetricEntry | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(
    String(
      entry?.value ??
        (metric.type === "yes_no" || metric.type === "event" ? 1 : ""),
    ),
  );
  const [recordedAt, setRecordedAt] = useState(
    localInput(entry?.recorded_at || new Date().toISOString()),
  );
  const [endAt, setEndAt] = useState(localInput(entry?.end_at || null));
  const [notes, setNotes] = useState(entry?.notes || ""),
    [tags, setTags] = useState(entry?.tags || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (value === "" && metric.type !== "time_interval")
        throw new Error("Enter a value.");
      const payload = parseMetricEntry(
        {
          metric_id: metric.id,
          value: Number(value),
          recorded_at: new Date(recordedAt).toISOString(),
          end_at: endAt ? new Date(endAt).toISOString() : null,
          notes,
          tags,
        },
        metric,
      );
      await api(
        entry ? `metric-entries/${entry.id}` : "metric-entries",
        entry ? "PATCH" : "POST",
        payload,
      );
      await onSaved(entry ? "Entry updated" : "Entry logged");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`metric-entries/${entry!.id}`, "DELETE");
      await onSaved("Entry deleted");
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={
        entry
          ? `Edit ${metric.title.toLowerCase()} entry`
          : `Log ${metric.title.toLowerCase()}`
      }
      description={`${typeLabels[metric.type]} · ${metric.unit || "your measurement"}`}
    >
      <form className="editor-form tracker-editor" onSubmit={save}>
        {metric.type !== "time_interval" && (
          <label>
            {metric.type === "yes_no"
              ? "Did you do it?"
              : `Value${metric.unit ? ` (${metric.unit})` : ""}`}
            {metric.type === "yes_no" ? (
              <select
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            ) : (
              <input
                autoFocus
                required
                type="number"
                inputMode="decimal"
                step={
                  metric.type === "count" || metric.type === "event" ? 1 : "any"
                }
                min={
                  metric.type === "score" || metric.type === "quantity"
                    ? undefined
                    : 0
                }
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
              />
            )}
          </label>
        )}
        <label>
          {metric.type === "time_interval" ? "Started at" : "When"}
          <input
            required
            type="datetime-local"
            value={recordedAt}
            onChange={(e) => setRecordedAt(e.target.value)}
          />
        </label>
        {metric.type === "time_interval" && (
          <label>
            Ended at
            <input
              required
              type="datetime-local"
              value={endAt}
              min={recordedAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </label>
        )}
        <p className="form-hint">
          Enter times in this device’s timezone. Charts use your planning
          timezone.
        </p>
        <label>
          Notes <span className="optional">optional</span>
          <textarea
            rows={2}
            maxLength={3000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it go?"
          />
        </label>
        <label>
          Tags <span className="optional">comma separated</span>
          <input
            maxLength={300}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="morning, chapter 4…"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          {entry && (
            <button
              type="button"
              className={`button ${deleting ? "danger" : "quiet"}`}
              disabled={busy}
              onClick={() => (deleting ? remove() : setDeleting(true))}
            >
              <Trash2 size={15} />
              {deleting ? "Confirm delete" : "Delete"}
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : entry ? "Save changes" : "Log entry"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
