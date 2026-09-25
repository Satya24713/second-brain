"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { dayKey } from "@/lib/dates";
import type { Task } from "@/lib/types";

export function UpcomingCalendar({
  tasks,
  timezone,
  today,
  selected,
  onSelect,
}: {
  tasks: Task[];
  timezone: string;
  today: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const [month, setMonth] = useState(() => (selected || today).slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!task.due_at) continue;
    const date = dayKey(task.due_at, timezone);
    counts.set(date, (counts.get(date) || 0) + 1);
  }
  function moveMonth(delta: number) {
    setMonth(
      new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
        .toISOString()
        .slice(0, 7),
    );
  }
  return (
    <section className="month-calendar" aria-label="Upcoming task calendar">
      <div className="calendar-header">
        <h2 aria-live="polite">
          {first.toLocaleDateString("en", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </h2>
        <div className="calendar-nav">
          <button
            type="button"
            className="calendar-today"
            onClick={() => {
              setMonth(today.slice(0, 7));
              onSelect("");
            }}
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => moveMonth(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
          <span key={i}>{day}</span>
        ))}
      </div>
      <div className="calendar-days">
        {Array.from({ length: offset }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const total = counts.get(date) || 0;
          return (
            <button
              key={date}
              type="button"
              aria-pressed={selected === date}
              aria-current={date === today ? "date" : undefined}
              aria-label={`${new Date(`${date}T12:00:00Z`).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}, ${total} ${total === 1 ? "task" : "tasks"}`}
              className={`${date === today ? "is-today" : ""} ${selected === date ? "selected" : ""}`}
              onClick={() => onSelect(selected === date ? "" : date)}
            >
              {i + 1}
              {total > 0 && <span className="calendar-task-dot" />}
            </button>
          );
        })}
      </div>
      {selected && (
        <button
          type="button"
          className="calendar-clear"
          onClick={() => onSelect("")}
        >
          Show all upcoming <X size={14} />
        </button>
      )}
    </section>
  );
}
