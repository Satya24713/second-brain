"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Sun,
  CalendarDays,
  Inbox,
  BookOpen,
  Plus,
  Search,
  Settings,
  PanelRightClose,
  Sparkles,
  ArrowUp,
  ArrowUpRight,
  ChevronRight,
  Check,
  CheckCheck,
  Hash,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Link2,
  X,
  SlidersHorizontal,
  LogOut,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { api, streamAssistant } from "@/lib/client";
import { dayKey, formatDue } from "@/lib/dates";
import type { AppData, Task, Journal, Message } from "@/lib/types";
import { UpcomingCalendar } from "./product/upcoming-calendar";
import { priorityRank, tagColors } from "@/lib/task-display";
import { TaskEditor } from "./product/task-editor";
import { TaskRow } from "./product/task-row";
import { JournalEditor } from "./product/journal-editor";
import { Reminders } from "./product/reminders";
import {
  Empty,
  FilterTabs,
  Modal,
  Reveal,
  MobileAssistant,
} from "./product/primitives";
type View = "today" | "upcoming" | "all" | "journal";
const nav = [
  { id: "today" as View, label: "Today", icon: Sun },
  { id: "upcoming" as View, label: "Upcoming", icon: CalendarDays },
  { id: "all" as View, label: "All tasks", icon: Inbox },
  { id: "journal" as View, label: "Journal", icon: BookOpen },
];
export default function Workspace() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("today");
  const [status, setStatus] = useState("active");
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [settings, setSettings] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiHidden, setAiHidden] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [pendingChat, setPendingChat] = useState<Message[]>([]);
  const aiRequest = useRef(false);
  const followChat = useRef(true);
  const chatScroll = useRef<HTMLDivElement>(null);
  const [calendarDate, setCalendarDate] = useState("");
  const [aiError, setAiError] = useState("");
  const [clearingAi, setClearingAi] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [journalDraft, setJournalDraft] = useState("");
  const [journalBusy, setJournalBusy] = useState(false);
  const [sort, setSort] = useState("due");
  const [now, setNow] = useState(new Date());
  const bottom = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [journalEditing, setJournalEditing] = useState<Journal | null>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width:1050px)");
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const load = useCallback(async () => {
    try {
      const next = await api<AppData>("workspace");
      setData(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (document.querySelector("[role=dialog]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") setAiOpen(false);
      if (
        e.key === "n" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !(e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        setEditing(null);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  useEffect(() => {
    if (followChat.current && chatScroll.current)
      chatScroll.current.scrollTop = chatScroll.current.scrollHeight;
  }, [data?.messages.length, pendingChat, aiBusy, aiOpen]);
  const tz = data?.profile.timezone || "Asia/Kolkata";
  const today = dayKey(now, tz);
  const tasks = data?.tasks || [];
  const tags = useMemo(
    () =>
      Array.from(
        new Set((data?.tasks || []).map((t) => t.tag).filter(Boolean)),
      ).sort(),
    [data?.tasks],
  );
  const todayTasks = tasks.filter(
    (t) => t.due_at && dayKey(t.due_at, tz) === today,
  );
  const completed = todayTasks.filter((t) => t.done).length;
  const pending = todayTasks.filter((t) => !t.done).length;
  const selected = tasks.filter(
    (t) =>
      view === "all" ||
      (view === "today" && t.due_at && dayKey(t.due_at, tz) <= today) ||
      (view === "upcoming" && t.due_at && dayKey(t.due_at, tz) > today),
  );
  const filtered = selected
    .filter(
      (t) =>
        (status === "all" || (status === "done" ? !!t.done : !t.done)) &&
        (!tag || t.tag === tag) &&
        (!query ||
          `${t.title} ${t.tag} ${t.notes}`
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort((a, b) =>
      sort === "priority"
        ? priorityRank(a.priority) - priorityRank(b.priority)
        : sort === "newest"
          ? b.created_at.localeCompare(a.created_at)
          : (a.due_at || "z").localeCompare(b.due_at || "z"),
    );
  const visibleTasks =
    view === "upcoming" && calendarDate
      ? filtered.filter(
          (task) => task.due_at && dayKey(task.due_at, tz) === calendarDate,
        )
      : filtered;
  const progress = todayTasks.length
    ? Math.round((completed / todayTasks.length) * 100)
    : 0;
  const chatMessages = [...(data?.messages || []), ...pendingChat];
  const groups = (() => {
    const map = new Map<string, Task[]>();
    for (const task of visibleTasks) {
      const date = task.due_at ? dayKey(task.due_at, tz) : "";
      const key =
        view === "today"
          ? date < today
            ? "Overdue"
            : "Today"
          : view === "upcoming"
            ? task.due_at
              ? new Intl.DateTimeFormat("en", {
                  timeZone: tz,
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                }).format(new Date(task.due_at))
              : "No date"
            : "Your tasks";
      map.set(key, [...(map.get(key) || []), task]);
    }
    return Array.from(map);
  })();
  async function saved(message: string) {
    await load();
    toast.success(message);
  }
  async function toggle(task: Task) {
    if (busyIds.has(task.id)) return;
    setBusyIds((s) => new Set(s).add(task.id));
    try {
      await api(`tasks/${task.id}`, "PATCH", { done: !task.done });
      await load();
      toast.success(
        task.done ? "Task reopened" : "A little lighter. Task complete.",
        {
          action: {
            label: "Undo",
            onClick: () => {
              void api(`tasks/${task.id}`, "PATCH", { done: !!task.done })
                .then(load)
                .catch((e) => toast.error(e.message));
            },
          },
        },
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(task.id);
        return n;
      });
    }
  }
  function changeView(v: View) {
    setView(v);
    setCalendarDate("");
    setTag("");
    setQuery("");
    setStatus("active");
  }
  function startPrompt(value: string) {
    setPrompt(value);
    setAiOpen(true);
    setAiHidden(false);
    setTimeout(() => promptRef.current?.focus(), 50);
  }
  const clearChat = useCallback(async () => {
    if (clearingAi || aiBusy) return;
    setClearingAi(true);
    setAiError("");
    try {
      await api("assistant", "DELETE");
      setData((d) => (d ? { ...d, messages: [] } : d));
      setConfirmClear(false);
      setPendingChat([]);
      toast.success("Chat context cleared. Starting fresh.");
    } catch (e) {
      const msg = (e as Error).message || "Could not clear chat context.";
      setAiError(msg);
      toast.error(msg);
    } finally {
      setClearingAi(false);
    }
  }, [clearingAi, aiBusy]);

  async function sendPrompt(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || aiRequest.current || clearingAi || !data?.aiConfigured)
      return;

    if (
      trimmed.toLowerCase() === "/clear" ||
      trimmed.toLowerCase() === "clear"
    ) {
      setPrompt("");
      await clearChat();
      return;
    }

    aiRequest.current = true;
    setAiBusy(true);
    setAiError("");
    setPrompt("");
    followChat.current = true;
    const sentAt = new Date().toISOString();
    const optimisticUser: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      proposal: null,
      applied: 0,
      created_at: sentAt,
    };
    const optimisticReply: Message = {
      ...optimisticUser,
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };
    setPendingChat([optimisticUser, optimisticReply]);
    try {
      const result = await streamAssistant(trimmed, (content) => {
        setPendingChat([optimisticUser, { ...optimisticReply, content }]);
      });
      setData((current) =>
        current
          ? {
              ...current,
              messages: [
                ...current.messages,
                { ...optimisticUser, id: result.userId || optimisticUser.id },
                {
                  ...optimisticReply,
                  id: result.id,
                  content: result.reply,
                  proposal: result.actions || result.proposal || [],
                },
              ],
            }
          : current,
      );
      setPendingChat([]);
    } catch (e) {
      setAiError((e as Error).message);
      setPrompt((draft) => draft || trimmed);
    } finally {
      aiRequest.current = false;
      setAiBusy(false);
    }
  }
  async function applyProposal(id: string) {
    setBusyIds((s) => new Set(s).add(id));
    try {
      await api("assistant/apply", "POST", { messageId: id });
      await saved("Plan added to your workspace");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }
  async function saveJournal(e: React.FormEvent) {
    e.preventDefault();
    setJournalBusy(true);
    try {
      await api("journal", "POST", { body: journalDraft });
      setJournalDraft("");
      await saved("Thought saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setJournalBusy(false);
    }
  }
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => unknown;
        };
      }
    ).modelContext;
    if (!context) return;
    const abort = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "start_task_creation",
          title: "Open task editor",
          description: "Open the task creation form. Does not save a task.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute(input: unknown) {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).length
            )
              throw Error("Expected an empty object");
            setEditing(null);
            return { editor: "open", saved: false };
          },
        },
        { signal: abort.signal },
      ),
    ).catch(() => {});
    return () => abort.abort();
  }, []);
  const assistant = (
    <>
      <div className="assistant-heading">
        <span className="assistant-icon">
          <Sparkles size={17} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>Your second brain</strong>
          <span>A little help, when you need it</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginLeft: "auto",
          }}
        >
          {!!data?.messages?.length && (
            <button
              className="icon-button"
              type="button"
              aria-label={
                confirmClear
                  ? "Click again to confirm clearing chat context"
                  : "Clear chat context and start fresh"
              }
              title={
                confirmClear
                  ? "Click again to confirm"
                  : "Clear chat context and restart fresh"
              }
              disabled={aiBusy || clearingAi}
              onClick={() => {
                if (confirmClear) {
                  void clearChat();
                } else {
                  setConfirmClear(true);
                  setTimeout(() => setConfirmClear(false), 3500);
                }
              }}
              style={{
                width: "auto",
                height: "30px",
                padding: "0 9px",
                borderRadius: "8px",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "0.75rem",
                fontWeight: 500,
                color: confirmClear ? "#dc2626" : "#475569",
                background: confirmClear ? "#fef2f2" : "#f8fafc",
                border: confirmClear
                  ? "1px solid #fecaca"
                  : "1px solid #e2e8f0",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <RotateCcw size={12} className={clearingAi ? "spin" : ""} />
              <span>
                {clearingAi
                  ? "Clearing…"
                  : confirmClear
                    ? "Confirm clear?"
                    : "Clear"}
              </span>
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Close assistant"
            onClick={() => {
              setAiOpen(false);
              setAiHidden(true);
            }}
          >
            <PanelRightClose size={18} />
          </button>
        </div>
      </div>
      <div
        className="assistant-content"
        ref={chatScroll}
        onScroll={(e) => {
          const node = e.currentTarget;
          followChat.current =
            node.scrollHeight - node.scrollTop - node.clientHeight < 90;
        }}
      >
        {!chatMessages.length ? (
          <div className="assistant-intro">
            <span className="sparkle-well">
              <Sparkles size={27} strokeWidth={1.3} />
            </span>
            <h2>What’s on your mind?</h2>
            <p>
              Drop a thought. Untangle a task.
              <br />
              We’ll find the next small step.
            </p>
            <div className="prompt-options">
              <button
                onClick={() =>
                  startPrompt("Help me choose a realistic plan for today.")
                }
              >
                <Sun size={16} />
                <span>Help me plan my day</span>
                <ArrowUpRight size={15} />
              </button>
              <button
                onClick={() =>
                  startPrompt(
                    "I have a test coming up. Help me make a preparation plan.",
                  )
                }
              >
                <CalendarDays size={16} />
                <span>Prepare for something coming up</span>
                <ArrowUpRight size={15} />
              </button>
              <button
                onClick={() =>
                  startPrompt(
                    "I have a lot on my mind. Help me sort through it, one question at a time.",
                  )
                }
              >
                <BookOpen size={16} />
                <span>Make sense of a brain dump</span>
                <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
        ) : (
          <div className="messages">
            {chatMessages.map((m) => (
              <Reveal key={m.id} className={`message ${m.role}`}>
                <span className="message-role">
                  {m.role === "user" ? "You" : "Second Brain"}
                </span>
                <p>
                  {m.content ||
                    (aiBusy
                      ? "Thinking…"
                      : "Reply interrupted. Send again to retry.")}
                  {aiBusy && m.id === pendingChat[1]?.id && !!m.content && (
                    <span className="stream-cursor" aria-hidden="true" />
                  )}
                </p>
                {m.proposal?.length ? (
                  <div className="proposal">
                    <strong>
                      {m.proposal.length}{" "}
                      {m.proposal.length === 1
                        ? "suggested change"
                        : "suggested changes"}
                    </strong>
                    {m.proposal.map((a, i) => (
                      <div className="proposal-item" key={i}>
                        <span className="proposal-type">
                          {a.kind === "event" ? "event" : a.type}
                        </span>
                        <span>
                          {a.title ||
                            a.body?.slice(0, 160) ||
                            "Update your profile"}
                          {a.due_at && <small>{formatDue(a.due_at, tz)}</small>}
                        </span>
                      </div>
                    ))}
                    <button
                      className="button primary"
                      disabled={!!m.applied || busyIds.has(m.id)}
                      onClick={() => applyProposal(m.id)}
                    >
                      {m.applied ? (
                        <>
                          <Check size={15} />
                          Added to your workspace
                        </>
                      ) : busyIds.has(m.id) ? (
                        "Saving…"
                      ) : (
                        "Add to my workspace"
                      )}
                    </button>
                  </div>
                ) : null}
              </Reveal>
            ))}
          </div>
        )}
        {aiBusy && (
          <p role="status" className="thinking">
            <LoaderCircle className="spin" size={16} />
            {pendingChat[1]?.content ? "Replying…" : "Waiting for a reply…"}
          </p>
        )}
        <div ref={bottom} />
      </div>
      <div className="assistant-compose">
        {!data?.aiConfigured && (
          <button className="connect-notice" onClick={() => setSettings(true)}>
            <Link2 size={15} />
            <span>Connect Gemini to start planning</span>
            <ChevronRight size={15} />
          </button>
        )}
        {aiError && (
          <p role="alert" className="form-error">
            {aiError}
          </p>
        )}
        <form onSubmit={sendPrompt}>
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={6000}
            rows={2}
            placeholder={
              data?.messages?.length
                ? "A task, a thought, or type /clear…"
                : "A task, a thought, anything…"
            }
            aria-label="Message your second brain"
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void sendPrompt();
              }
            }}
          />
          <div>
            <span>
              {data?.messages?.length ? (
                <>
                  Type{" "}
                  <code
                    style={{
                      background: "#f1f5f9",
                      padding: "1px 4px",
                      borderRadius: "4px",
                      fontSize: "0.72rem",
                      fontFamily: "monospace",
                    }}
                  >
                    /clear
                  </code>{" "}
                  to restart fresh
                </>
              ) : (
                "Shift + Enter for a new line"
              )}
            </span>
            <button
              className="send-button"
              aria-label="Send message"
              disabled={
                !prompt.trim() || aiBusy || clearingAi || !data?.aiConfigured
              }
            >
              {aiBusy ? (
                <LoaderCircle size={19} className="spin" />
              ) : (
                <ArrowUp size={19} />
              )}
            </button>
          </div>
        </form>
        <p className="assistant-footnote">
          Suggestions are yours to review. You’re in control.
        </p>
      </div>
    </>
  );
  return (
    <div className={`workspace ${aiHidden ? "assistant-hidden" : ""}`}>
      <Toaster position="bottom-center" richColors />
      <Reminders tasks={tasks} onOpen={setEditing} />
      <a href="#main-content" className="skip-link">
        Skip to tasks
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          type="button"
          onClick={() => changeView("today")}
        >
          <span className="brand-mark">
            <Link2 size={24} />
          </span>
          <span>
            second brain<span className="brand-period">.</span>
          </span>
        </button>
        <button className="sidebar-search" onClick={() => setSearchOpen(true)}>
          <Search size={17} />
          <span>Find anything</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="nav-label">MY WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <button
              className={view === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => changeView(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "today" && pending > 0 && (
                <span className="nav-count">{pending}</span>
              )}
              {item.id === "all" && (
                <span className="quiet-count">
                  {tasks.filter((t) => !t.done).length || ""}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="tag-nav">
          <div className="nav-label">
            YOUR TAGS <Hash size={13} />
          </div>
          {tags.length ? (
            tags.map((t) => (
              <button
                key={t}
                className={`tag-nav-item ${tag === t ? "active" : ""}`}
                onClick={() => {
                  setTag(t);
                  setView("all");
                }}
              >
                <span
                  className="tag-dot"
                  style={{
                    background: tagColors(t, tags)["--tag-color"],
                    borderColor: tagColors(t, tags)["--tag-color"],
                  }}
                />
                {t}
                <span>
                  {tasks.filter((x) => x.tag === t && !x.done).length}
                </span>
              </button>
            ))
          ) : (
            <p>Make your own as you go.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <button className="profile-button" onClick={() => setSettings(true)}>
            <span className="avatar">
              {data?.profile.name?.slice(0, 1).toUpperCase() || "S"}
            </span>
            <span>
              <strong>{data?.profile.name || "Your workspace"}</strong>
              <small>Personal workspace</small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <h1 className="workspace-title">
            {view === "today"
              ? new Intl.DateTimeFormat("en-GB", {
                  timeZone: tz,
                  day: "numeric",
                  month: "short",
                  weekday: "long",
                }).format(now)
              : nav.find((n) => n.id === view)?.label}
          </h1>
          <div className="topbar-actions">
            <button
              className="icon-button mobile-search"
              aria-label="Search tasks"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={19} />
            </button>
            <button
              aria-label="Ask your second brain"
              aria-expanded={aiOpen}
              className="assistant-toggle"
              onClick={() => {
                setAiOpen(true);
                setAiHidden(false);
              }}
            >
              <Sparkles size={16} />
              <span>Ask your brain</span>
            </button>
            <button
              className="icon-button mobile-settings"
              aria-label="Settings"
              onClick={() => setSettings(true)}
            >
              <Settings size={19} />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <Reveal>
            {loading ? (
              <div
                className="loading-state"
                role="status"
                aria-label="Loading your workspace"
              >
                <div />
                <div />
                <div />
                <p>Finding your headspace…</p>
              </div>
            ) : error ? (
              <div className="error-state" role="alert">
                <h3>Let’s try that again.</h3>
                <p>{error}</p>
                <button
                  className="button secondary"
                  onClick={() => {
                    setLoading(true);
                    load();
                  }}
                >
                  <RefreshCw size={16} />
                  Retry
                </button>
              </div>
            ) : (
              <>
                {view === "journal" ? (
                  <div className="journal-view">
                    <form className="journal-composer" onSubmit={saveJournal}>
                      <textarea
                        aria-label="Journal entry"
                        placeholder="What’s taking up space in your head?"
                        value={journalDraft}
                        onChange={(e) => setJournalDraft(e.target.value)}
                        maxLength={12000}
                        rows={5}
                      />
                      <div>
                        <span>Just for you. No perfect words needed.</span>
                        <button
                          className="button primary"
                          disabled={!journalDraft.trim() || journalBusy}
                        >
                          {journalBusy ? "Saving…" : "Save thought"}
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                    </form>
                    <div className="section-title">
                      <h2>Your thoughts</h2>
                      <span>{data?.journal.length || 0} entries</span>
                    </div>
                    {data?.journal.length ? (
                      data.journal.map((entry) => (
                        <article className="journal-entry" key={entry.id}>
                          <time>{formatDue(entry.created_at, tz)}</time>
                          <p>{entry.body}</p>
                          {entry.summary && (
                            <div className="journal-summary">
                              <Sparkles size={15} />
                              <p>{entry.summary}</p>
                            </div>
                          )}
                          <div className="journal-actions">
                            <button
                              className="text-button"
                              onClick={() =>
                                startPrompt(
                                  `Help me reflect on this journal entry and suggest a small next step. Do not save a duplicate entry.\n\n${entry.body.slice(0, 5000)}`,
                                )
                              }
                            >
                              Reflect with my brain
                              <ArrowUpRight size={14} />
                            </button>
                            <button
                              className="text-button"
                              onClick={() => setJournalEditing(entry)}
                            >
                              Edit thought
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <Empty
                        icon={<BookOpen size={24} />}
                        heading="A blank page, without the pressure."
                      >
                        A thought, a good moment, a messy brain dump. Start
                        anywhere.
                      </Empty>
                    )}
                  </div>
                ) : (
                  <>
                    <section className="task-section">
                      <div className="task-toolbar">
                        <FilterTabs
                          value={status}
                          onChange={setStatus}
                          items={[
                            {
                              id: "active",
                              label: "To do",
                              count: selected.filter((t) => !t.done).length,
                            },
                            {
                              id: "done",
                              label: "Completed",
                              count: selected.filter((t) => t.done).length,
                            },
                          ]}
                        />
                        <label className="sort-control">
                          <SlidersHorizontal size={14} />
                          <select
                            aria-label="Sort tasks"
                            value={sort}
                            onChange={(e) => setSort(e.target.value)}
                          >
                            <option value="due">By date</option>
                            <option value="priority">By priority</option>
                            <option value="newest">Newest</option>
                          </select>
                        </label>
                      </div>
                      {view === "today" && (
                        <div className="daily-progress">
                          <div
                            role="progressbar"
                            aria-label="Today’s task progress"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progress}
                            aria-valuetext={
                              completed +
                              " of " +
                              todayTasks.length +
                              " tasks complete"
                            }
                            className="progress-track"
                          >
                            <span style={{ width: progress + "%" }} />
                          </div>
                          <span>{progress}%</span>
                        </div>
                      )}
                      {view === "upcoming" && (
                        <UpcomingCalendar
                          tasks={filtered}
                          timezone={tz}
                          today={today}
                          selected={calendarDate}
                          onSelect={setCalendarDate}
                        />
                      )}
                      {(tag || query) && (
                        <div className="active-filter">
                          {tag || `Search: ${query}`}
                          <button
                            className="icon-button"
                            aria-label="Clear filter"
                            onClick={() => {
                              setTag("");
                              setQuery("");
                            }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}
                      <div
                        id="task-panel"
                        role="tabpanel"
                        aria-label={
                          status === "done" ? "Completed tasks" : "Tasks to do"
                        }
                      >
                        {visibleTasks.length ? (
                          groups.map(([label, list]) => (
                            <section className="task-group" key={label}>
                              {(view === "upcoming" ||
                                (view === "today" && label === "Overdue")) && (
                                <h3>
                                  {label}
                                  <span>{list.length}</span>
                                </h3>
                              )}
                              {list.map((task) => (
                                <TaskRow
                                  key={task.id}
                                  task={task}
                                  tags={tags}
                                  timezone={tz}
                                  busy={busyIds.has(task.id)}
                                  onToggle={() => toggle(task)}
                                  onEdit={() => setEditing(task)}
                                />
                              ))}
                            </section>
                          ))
                        ) : (
                          <Empty
                            icon={
                              status === "done" ? (
                                <CheckCheck size={24} />
                              ) : view === "upcoming" ? (
                                <CalendarDays size={24} />
                              ) : (
                                <Sun size={25} strokeWidth={1.4} />
                              )
                            }
                            heading={
                              query || tag
                                ? "No matching tasks"
                                : status === "done"
                                  ? "No completed tasks"
                                  : view === "upcoming"
                                    ? calendarDate
                                      ? "No tasks on this date"
                                      : "No upcoming tasks"
                                    : view === "today"
                                      ? "All clear for today"
                                      : "No tasks yet"
                            }
                          >
                            {query || tag
                              ? "Try another search or clear your filter."
                              : status === "done"
                                ? "Complete a task to see it here."
                                : view === "upcoming"
                                  ? "Add a task or choose another date."
                                  : "Add a task to get started."}
                          </Empty>
                        )}
                      </div>
                      <button
                        className="quick-add"
                        onClick={() => setEditing(null)}
                      >
                        <Plus size={18} />
                        <span>Add a task</span>
                      </button>
                    </section>
                  </>
                )}
                {!!data?.trackers.length && view === "today" && (
                  <section className="followups">
                    <div className="section-title">
                      <h2>A gentle check-in</h2>
                    </div>
                    {data.trackers.map((t) => (
                      <div key={t.id}>
                        <button
                          onClick={() =>
                            startPrompt(`Let's check in on: ${t.title}`)
                          }
                        >
                          <Sparkles size={15} />
                          {t.title}
                          <ArrowUpRight size={14} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Finish check-in ${t.title}`}
                          onClick={async () => {
                            try {
                              await api(`trackers/${t.id}`, "PATCH", {
                                done: true,
                              });
                              await saved("Check-in finished");
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          <Check size={16} />
                        </button>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
          </Reveal>
        </main>
      </div>
      {compact ? (
        <MobileAssistant open={aiOpen} onOpenChange={setAiOpen}>
          {assistant}
        </MobileAssistant>
      ) : (
        <aside className="assistant-panel" aria-label="Your second brain">
          {assistant}
        </aside>
      )}
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.slice(0, 2).map((n) => (
          <button
            key={n.id}
            aria-current={view === n.id ? "page" : undefined}
            className={view === n.id ? "active" : ""}
            onClick={() => changeView(n.id)}
          >
            <n.icon size={20} />
            <span>{n.label}</span>
          </button>
        ))}
        <button
          className="mobile-add"
          aria-label="Add task"
          onClick={() => setEditing(null)}
        >
          <Plus size={25} />
        </button>
        {nav.slice(2).map((n) => (
          <button
            key={n.id}
            aria-current={view === n.id ? "page" : undefined}
            className={view === n.id ? "active" : ""}
            onClick={() => changeView(n.id)}
          >
            <n.icon size={20} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {editing !== undefined && (
        <TaskEditor
          task={editing}
          tags={tags}
          defaultDate={view === "today" ? new Date().toISOString() : ""}
          onClose={() => setEditing(undefined)}
          onSaved={saved}
        />
      )}
      <Modal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Find a little clarity"
        description="Search your tasks, notes, and tags."
      >
        <label className="search-input">
          <Search size={18} />
          <input
            autoFocus
            aria-label="Search all tasks"
            placeholder="What are you looking for?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="search-results">
          {query.trim() ? (
            tasks
              .filter((t) =>
                `${t.title} ${t.notes} ${t.tag}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .slice(0, 20)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSearchOpen(false);
                    setQuery("");
                    setEditing(t);
                  }}
                >
                  <span>
                    {t.title}
                    <small>{t.tag || "Task"}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))
          ) : (
            <p>Start with a word you remember.</p>
          )}
          {query.trim() &&
            !tasks.some((t) =>
              `${t.title} ${t.notes} ${t.tag}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            ) && <p>No matching tasks. Try a different word.</p>}
        </div>
      </Modal>
      {journalEditing && (
        <JournalEditor
          entry={journalEditing}
          onClose={() => setJournalEditing(null)}
          onSaved={saved}
        />
      )}{" "}
      {settings && data && (
        <SettingsPanel
          data={data}
          onClose={() => setSettings(false)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
function SettingsPanel({
  data,
  onClose,
  onSaved,
}: {
  data: AppData;
  onClose: () => void;
  onSaved: (m: string) => Promise<void>;
}) {
  const [profile, setProfile] = useState(data.profile);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(data.aiConfigured);
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy("profile");
    setError("");
    try {
      await api("profile", "PATCH", { ...profile, onboarded: true });
      await onSaved("Your space is ready");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function connect() {
    setBusy("key");
    setError("");
    try {
      await api("settings/gemini", "PUT", { key });
      setKey("");
      setConnected(true);
      await onSaved("Gemini connected");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function disconnect() {
    setBusy("key");
    setError("");
    try {
      await api("settings/gemini", "DELETE");
      setConnected(false);
      await onSaved("Gemini disconnected");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title={
        data.profile.onboarded
          ? "Your space, your settings"
          : "Let’s make this yours."
      }
      description="A little context helps your second brain understand what matters."
      wide
    >
      <div className="settings-scroll">
        <form className="editor-form" onSubmit={saveProfile}>
          <div className="field-grid">
            <label>
              Your name
              <input
                required
                value={profile.name}
                maxLength={100}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
              />
            </label>
            <label>
              What do you do?
              <input
                value={profile.role}
                maxLength={100}
                onChange={(e) =>
                  setProfile({ ...profile, role: e.target.value })
                }
                placeholder="Student, designer, figuring it out…"
              />
            </label>
          </div>
          <label>
            Your world right now
            <input
              value={profile.context}
              maxLength={1000}
              onChange={(e) =>
                setProfile({ ...profile, context: e.target.value })
              }
              placeholder="School, college, work, or what’s keeping you busy"
            />
          </label>
          <label>
            What are you working towards?
            <textarea
              rows={2}
              value={profile.goals}
              maxLength={2000}
              onChange={(e) =>
                setProfile({ ...profile, goals: e.target.value })
              }
              placeholder="No goal is too small."
            />
          </label>
          <label>
            Planning timezone
            <input
              value={profile.timezone}
              onChange={(e) =>
                setProfile({ ...profile, timezone: e.target.value })
              }
              list="timezones"
            />
            <datalist id="timezones">
              <option value="Asia/Kolkata" />
              <option value="Europe/London" />
              <option value="America/New_York" />
              <option value="America/Los_Angeles" />
              <option value="UTC" />
            </datalist>
          </label>
          <div className="dialog-actions">
            <button className="button primary" disabled={!!busy}>
              {busy === "profile" ? "Saving…" : "Save my profile"}
            </button>
          </div>
        </form>
        <section className="gemini-settings">
          <div>
            <span className="assistant-icon">
              <Sparkles size={18} />
            </span>
            <span>
              <h3>Connect your Gemini</h3>
              <p>
                {connected
                  ? "Connected and ready to help."
                  : "Your ideas, with a little intelligence."}
              </p>
            </span>
            {connected && (
              <span className="connection-badge">
                <Check size={13} />
                Connected
              </span>
            )}
          </div>
          <p>
            Your key is encrypted on the server and never saved in this browser.
            When you chat, Gemini receives your message and relevant workspace
            context.
          </p>
          <label>
            Gemini API key
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                connected
                  ? "Enter a new key to replace it"
                  : "Paste your API key"
              }
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="key-actions">
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
            >
              Get a Gemini key <ArrowUpRight size={13} />
            </a>
            <button
              className="button secondary"
              disabled={!key.trim() || !!busy || !data.keyStorageReady}
              onClick={connect}
            >
              {busy === "key"
                ? "Connecting…"
                : connected
                  ? "Replace key"
                  : "Connect Gemini"}
            </button>
          </div>
          {!data.keyStorageReady && (
            <p className="form-error">
              Secure key storage is being set up. Please try again shortly.
            </p>
          )}
          {connected && (
            <button
              className="text-button danger-text"
              onClick={disconnect}
              disabled={!!busy}
            >
              Disconnect Gemini
            </button>
          )}
        </section>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <p className="reminder-info">
          Gentle reminders appear while this app is open. Your dated tasks stay
          in Today and Upcoming when you return.
        </p>
        {typeof window !== "undefined" && window.AndroidBridge ? (
          <p
            className="reminder-info"
            style={{ textAlign: "center", marginTop: "1rem" }}
          >
            Second Brain for Android • Offline Ready
          </p>
        ) : (
          <a
            className="signout-link"
            href="/signout-with-chatgpt?return_to=/"
            target="_top"
          >
            <LogOut size={15} />
            Sign out
          </a>
        )}
      </div>
    </Modal>
  );
}
