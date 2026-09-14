"use client";
import { useState } from "react";
import { Trash2, LoaderCircle } from "lucide-react";
import { Modal } from "./primitives";
import { api } from "@/lib/client";
import { localInput } from "@/lib/dates";
import type { Task } from "@/lib/types";
export function TaskEditor({
  task,
  tags,
  defaultDate,
  onClose,
  onSaved,
}: {
  task: Task | null;
  tags: string[];
  defaultDate: string;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(task?.title || "");
  const [notes, setNotes] = useState(task?.notes || "");
  const [tag, setTag] = useState(task?.tag || "");
  const [kind, setKind] = useState(task?.kind || "task");
  const [priority, setPriority] = useState(task?.priority || "normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const due = String(new FormData(e.currentTarget).get("due_at") || "");
    setBusy(true);
    setError("");
    try {
      await api(task ? `tasks/${task.id}` : "tasks", task ? "PATCH" : "POST", {
        title,
        notes,
        tag,
        kind,
        priority,
        due_at: due ? new Date(due).toISOString() : null,
      });
      await onSaved(task ? "Changes saved" : "Task added");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`tasks/${task!.id}`, "DELETE");
      await onSaved("Task deleted");
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title={task ? "Task details" : "Make a little room in your head"}
      description={
        task
          ? "Change the plan whenever you need to."
          : "Capture it now. You can figure out the details later."
      }
    >
      <form onSubmit={save} className="editor-form">
        <label>
          What needs doing?
          <input
            autoFocus
            required
            maxLength={240}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Revise chemistry, chapter 4"
          />
        </label>
        <label>
          Notes <span className="optional">optional</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={5000}
            placeholder="A next step, a link, anything helpful…"
            rows={3}
          />
        </label>
        <div className="field-grid">
          <label>
            When <span className="optional">optional</span>
            <input
              type="datetime-local"
              name="due_at"
              defaultValue={localInput(task?.due_at || defaultDate || null)}
            />
          </label>
          <label>
            Tag <span className="optional">your own words</span>
            <input
              list="task-tags"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              maxLength={60}
              placeholder="e.g. college"
            />
            <datalist id="task-tags">
              {tags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <label>
            Type
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "task" | "event")}
            >
              <option value="task">Task</option>
              <option value="event">Event / test</option>
            </select>
          </label>
          <label>
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "normal" | "high")}
            >
              <option value="normal">Normal</option>
              <option value="high">Important</option>
            </select>
          </label>
        </div>
        <p className="form-hint">
          Dates are entered in this device’s timezone.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          {task && (
            <button
              className={`button ${deleting ? "danger" : "quiet"}`}
              type="button"
              onClick={() => (deleting ? remove() : setDeleting(true))}
              disabled={busy}
            >
              <Trash2 size={16} />
              {deleting ? "Confirm delete" : "Delete"}
            </button>
          )}
          <button
            className="button secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy && <LoaderCircle size={16} className="spin" />}
            {task ? "Save changes" : "Add task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
