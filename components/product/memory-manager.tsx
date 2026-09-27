"use client";
import { useRef, useState } from "react";
import {
  FileText,
  Plus,
  Download,
  Upload,
  Trash2,
  X,
  Save,
} from "lucide-react";
import { api } from "@/lib/client";
import type { Memory } from "@/lib/types";
import "@/app/memory.css";

export function MemoryManager({
  memories,
  onChange,
}: {
  memories: Memory[];
  onChange: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Memory | null | undefined>();
  const [filename, setFilename] = useState("memory.md");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  function edit(memory: Memory | null) {
    setEditing(memory);
    setFilename(memory?.filename || "memory.md");
    setTitle(memory?.title || "");
    setSummary(memory?.summary || "");
    setContent(memory?.content || "");
    setError("");
    setDeleting(null);
  }
  async function save() {
    if (!title.trim() || !content.trim()) {
      setError("Add a title and some memory content.");
      return;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/.test(filename)) {
      setError("Use a simple filename ending in .md, such as memory.md.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(
        editing ? `memories/${editing.id}` : "memories",
        editing ? "PATCH" : "POST",
        { filename, title, summary, content },
      );
      await onChange();
      setEditing(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await api(`memories/${id}`, "DELETE");
      await onChange();
      setDeleting(null);
      if (editing?.id === id) setEditing(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function download(memory: Memory) {
    if (window.AndroidBridge?.exportMemoryFile) {
      window.AndroidBridge.exportMemoryFile(memory.filename, memory.content);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([memory.content], { type: "text/markdown;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = memory.filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="memory-manager" aria-label="Memory files">
      <div className="memory-heading">
        <div>
          <h3>
            <FileText size={18} /> Memory
          </h3>
          <p>
            Markdown notes the assistant can recall. Attach a file with + in
            chat to include it in your next message.
          </p>
        </div>
      </div>
      <div className="memory-actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => edit(null)}
          disabled={busy}
        >
          <Plus size={15} /> New memory
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <Upload size={15} /> Import .md
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".md,.txt,text/markdown,text/plain"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (file.size > 24000) {
            setError("Choose a memory file under 24 KB.");
            return;
          }
          try {
            const text = await file.text();
            edit(null);
            setFilename(
              file.name
                .replace(/[^a-zA-Z0-9._-]/g, "_")
                .replace(/\.(txt|md)$/i, "") + ".md",
            );
            setTitle(file.name.replace(/\.(txt|md)$/i, ""));
            setContent(text);
          } catch {
            setError("Could not read that file.");
          }
        }}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {editing !== undefined ? (
        <div className="memory-editor editor-form">
          <label>
            Title
            <input
              value={title}
              maxLength={240}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Things to remember"
            />
          </label>
          <label>
            Filename
            <input
              value={filename}
              maxLength={120}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="memory.md"
            />
          </label>
          <label>
            Short description
            <input
              value={summary}
              maxLength={500}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Helps the assistant decide when to recall this file"
            />
          </label>
          <label>
            Markdown content
            <textarea
              className="memory-source"
              rows={9}
              value={content}
              maxLength={20000}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# About me&#10;Preferences, context and facts to remember…"
            />
          </label>
          <div className="memory-actions">
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void save()}
            >
              <Save size={15} /> {busy ? "Saving…" : "Save memory"}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setEditing(undefined)}
            >
              <X size={15} /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="memory-list">
          {memories.length === 0 ? (
            <p className="memory-empty">
              No memory files yet. Add one here, or ask the assistant to
              remember something.
            </p>
          ) : (
            memories.map((memory) => (
              <article key={memory.id}>
                <button
                  type="button"
                  className="memory-open"
                  onClick={() => edit(memory)}
                >
                  <FileText size={18} />
                  <span>
                    <strong>{memory.title}</strong>
                    <small>{memory.filename}</small>
                    {memory.summary && <p>{memory.summary}</p>}
                  </span>
                </button>
                <div className="memory-row-actions">
                  <button
                    type="button"
                    title="Export markdown"
                    aria-label={`Export ${memory.filename}`}
                    onClick={() => download(memory)}
                  >
                    <Download size={16} />
                  </button>
                  <button
                    type="button"
                    title="Delete memory"
                    aria-label={`Delete ${memory.filename}`}
                    onClick={() => setDeleting(memory.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {deleting === memory.id && (
                  <div className="memory-delete">
                    <span>Delete this memory file?</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(memory.id)}
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => setDeleting(null)}>
                      Cancel
                    </button>
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
