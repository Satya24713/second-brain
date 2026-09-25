"use client";
import { Check, CalendarDays, ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";
import { tagColors, priorityLabel } from "@/lib/task-display";
import type { Task } from "@/lib/types";
import { formatDue, dayKey } from "@/lib/dates";
export function TaskRow({
  task,
  tags,
  timezone,
  busy,
  onToggle,
  onEdit,
}: {
  task: Task;
  tags: string[];
  timezone: string;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const overdue =
    task.due_at &&
    !task.done &&
    dayKey(task.due_at, timezone) < dayKey(new Date(), timezone);
  return (
    <div
      className={`task-row ${task.tag ? "tagged-task" : ""} ${task.done ? "is-done" : ""}`}
      style={
        task.tag ? (tagColors(task.tag, tags) as CSSProperties) : undefined
      }
    >
      <button
        className="check-target"
        aria-label={`${task.done ? "Reopen" : "Complete"} ${task.title}`}
        aria-pressed={!!task.done}
        onClick={onToggle}
        disabled={busy}
      >
        <span className="task-check">
          {!!task.done && <Check size={13} strokeWidth={3} />}
        </span>
      </button>
      <button className="task-body" onClick={onEdit}>
        <span className="task-title">
          {task.kind === "event" && <CalendarDays size={16} />}
          <span>{task.title}</span>
        </span>
        {(task.tag || task.due_at || task.notes) && (
          <span className="task-meta">
            {task.tag && <span className="tag"># {task.tag}</span>}
            {task.due_at && (
              <span className={overdue ? "overdue" : ""}>
                {overdue ? "Overdue · " : ""}
                {formatDue(task.due_at, timezone)}
              </span>
            )}
            {task.notes && !task.due_at && (
              <span className="note-preview">{task.notes}</span>
            )}
          </span>
        )}
      </button>
      <span
        className={`priority-dot priority-${task.priority}`}
        role="img"
        aria-label={`${priorityLabel(task.priority)} priority`}
        title={`${priorityLabel(task.priority)} priority`}
      />
      <button
        className="icon-button row-edit"
        onClick={onEdit}
        aria-label={`Edit ${task.title}`}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
