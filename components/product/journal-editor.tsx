"use client";
import { useState } from "react";
import { Modal } from "./primitives";
import { api } from "@/lib/client";
import type { Journal } from "@/lib/types";
export function JournalEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry: Journal;
  onClose: () => void;
  onSaved: (m: string) => Promise<void>;
}) {
  const [body, setBody] = useState(entry.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  async function save(remove = false) {
    setBusy(true);
    setError("");
    try {
      await api(
        `journal/${entry.id}`,
        remove ? "DELETE" : "PATCH",
        remove ? undefined : { body },
      );
      await onSaved(remove ? "Thought deleted" : "Thought updated");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title="Your thought"
      description="Keep the words that matter to you."
    >
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          Journal entry
          <textarea
            rows={8}
            maxLength={12000}
            required
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className={`button ${confirm ? "danger" : "quiet"}`}
            type="button"
            disabled={busy}
            onClick={() => (confirm ? save(true) : setConfirm(true))}
          >
            {confirm ? "Confirm delete" : "Delete"}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
