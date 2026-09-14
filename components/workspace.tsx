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
  Link2,
  X,
  Clock,
  SlidersHorizontal,
  Flag,
  LogOut,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { api } from "@/lib/client";
import { dayKey, formatDue, daysAway } from "@/lib/dates";
import type { AppData, Task, Journal } from "@/lib/types";
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
  const [aiError, setAiError] = useState("");
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
    load();
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
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [data?.messages.length, aiBusy]);
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
  const overdue = tasks.filter(
    (t) => !t.done && t.due_at && dayKey(t.due_at, tz) < today,
  );
  const future = tasks
    .filter((t) => !t.done && t.due_at && dayKey(t.due_at, tz) > today)
    .sort((a, b) => a.due_at!.localeCompare(b.due_at!));
  const upcomingEvents = future.filter((t) => t.kind === "event").slice(0, 3);
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
        ? a.priority === b.priority
          ? 0
          : a.priority === "high"
            ? -1
            : 1
        : sort === "newest"
          ? b.created_at.localeCompare(a.created_at)
          : (a.due_at || "z").localeCompare(b.due_at || "z"),
    );
  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of filtered) {
      const date = task.due_at ? dayKey(task.due_at, tz) : "";
      const key =
        view === "today"
          ? date < today
            ? "Needs a new plan"
            : "On your list"
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
  }, [filtered, tz, today, view]);
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
  async function sendPrompt(e?: React.FormEvent) {
    e?.preventDefault();
    if (!prompt.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError("");
    try {
      await api("assistant", "POST", { message: prompt });
      setPrompt("");
      await load();
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
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
        <div>
          <strong>Your second brain</strong>
          <span>A little help, when you need it</span>
        </div>
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
      <div className="assistant-content">
        {!data?.messages.length ? (
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
            {data.messages.map((m) => (
              <Reveal key={m.id} className={`message ${m.role}`}>
                <span className="message-role">
                  {m.role === "user" ? "You" : "Second Brain"}
                </span>
                <p>{m.content}</p>
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
            Thinking through your next step…
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
            placeholder="A task, a thought, anything…"
            aria-label="Message your second brain"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendPrompt();
              }
            }}
          />
          <div>
            <span>Shift + Enter for a new line</span>
            <button
              className="send-button"
              aria-label="Send message"
              disabled={!prompt.trim() || aiBusy || !data?.aiConfigured}
            >
              <ArrowUp size={19} />
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
        <a className="brand" href="/">
          <span className="brand-mark">
            <Link2 size={24} />
          </span>
          <span>
            second brain<span className="brand-period">.</span>
          </span>
        </a>
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
                <span className="tag-dot" />
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
          <div className="headspace-note">
            <span>
              Less to hold.
              <br />
              More room to think.
            </span>
            <div className="note-line" />
          </div>
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
          <div className="breadcrumb">
            <span>My workspace</span>
            <ChevronRight size={13} />
            <strong>{nav.find((n) => n.id === view)?.label}</strong>
          </div>
          <span className="mobile-brand">
            <Link2 size={22} />
            second brain.
          </span>
          <div className="topbar-actions">
            <button
              className="icon-button mobile-search"
              aria-label="Search tasks"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={19} />
            </button>
            <span className="private-label">Your space, at your pace</span>
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
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {view === "today"
                    ? new Intl.DateTimeFormat("en", {
                        timeZone: tz,
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      }).format(now)
                    : view === "upcoming"
                      ? "A LITTLE LOOK AHEAD"
                      : view === "journal"
                        ? "A PLACE TO LET IT OUT"
                        : "EVERYTHING, IN ONE PLACE"}
                </div>
                <h1>
                  {view === "today"
                    ? "A little more headspace."
                    : view === "upcoming"
                      ? "Good things take a plan."
                      : view === "journal"
                        ? "Out of your head. Onto here."
                        : "Your tasks. Your pace."}
                </h1>
                <p>
                  {view === "today"
                    ? pending
                      ? `${pending} ${pending === 1 ? "thing" : "things"} for today. One small step at a time.`
                      : "You have room to choose what matters today."
                    : view === "upcoming"
                      ? "Keep what’s coming in sight, and out of your head."
                      : view === "journal"
                        ? "Thoughts don’t need to be tidy to belong here."
                        : "A home for the things you want to get to."}
                </p>
              </div>
              <button
                className="button primary add-desktop"
                onClick={() => setEditing(null)}
              >
                <Plus size={17} />
                Add task<kbd>N</kbd>
              </button>
            </div>
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
                {!data?.profile.onboarded && (
                  <div className="onboarding-note">
                    <div>
                      <span className="mini-sparkle">
                        <Sparkles size={17} />
                      </span>
                      <span>
                        <strong>Make this space yours.</strong>
                        <small>
                          A little about you helps your brain make better plans.
                        </small>
                      </span>
                    </div>
                    <button onClick={() => setSettings(true)}>
                      Set up your space <ArrowUpRight size={16} />
                    </button>
                  </div>
                )}
                {view === "today" && (
                  <div className="today-overview">
                    <div className="focus-card">
                      <div className="focus-top">
                        <span>
                          <Sun size={16} /> TODAY, AT A GLANCE
                        </span>
                        <span>
                          {completed}/{todayTasks.length} complete
                        </span>
                      </div>
                      <div className="focus-main">
                        <div>
                          <strong>
                            {pending === 0
                              ? "A fresh page."
                              : `${pending} small ${pending === 1 ? "step" : "steps"}.`}
                          </strong>
                          <p>
                            {completed > 0
                              ? "Look at you, making room. Keep it gentle."
                              : "You don’t have to do everything. Just the next thing."}
                          </p>
                        </div>
                        <div
                          className="progress-ring"
                          style={
                            {
                              "--progress": `${todayTasks.length ? (completed / todayTasks.length) * 100 : 0}%`,
                            } as React.CSSProperties
                          }
                        >
                          <span>
                            {completed === todayTasks.length &&
                            completed > 0 ? (
                              <Check size={22} />
                            ) : (
                              <Sun size={25} strokeWidth={1.2} />
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      className="plan-card"
                      onClick={() =>
                        startPrompt(
                          "Help me choose one manageable next step from my tasks today.",
                        )
                      }
                    >
                      <Sparkles size={20} />
                      <strong>Not sure where to start?</strong>
                      <span>
                        Let’s find your next small step.
                        <ArrowUpRight size={17} />
                      </span>
                    </button>
                  </div>
                )}
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
                      <div className="section-title">
                        <h2>
                          {view === "today"
                            ? "Your day, made manageable"
                            : view === "upcoming"
                              ? "On the horizon"
                              : tag
                                ? `# ${tag}`
                                : "The whole picture"}
                        </h2>
                        <span>
                          {view === "today"
                            ? `${overdue.length ? `${overdue.length} overdue · ` : ""}${pending} planned`
                            : selected.filter((t) => !t.done).length + " to do"}
                        </span>
                      </div>
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
                        {filtered.length ? (
                          groups.map(([label, list]) => (
                            <section className="task-group" key={label}>
                              {view !== "all" && (
                                <h3>
                                  {label}
                                  <span>{list.length}</span>
                                </h3>
                              )}
                              {list.map((task) => (
                                <TaskRow
                                  key={task.id}
                                  task={task}
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
                                ? "Nothing matches just yet."
                                : status === "done"
                                  ? "Small wins go here."
                                  : view === "upcoming"
                                    ? "Nothing around the corner."
                                    : view === "today"
                                      ? "A little breathing room."
                                      : "A home for your next small step."
                            }
                          >
                            {query || tag
                              ? "Try another search or clear your filter."
                              : status === "done"
                                ? "Every finished task is a little less to carry."
                                : view === "upcoming"
                                  ? "Add a future task or event, and we’ll keep it in sight."
                                  : "Add what’s on your mind. One thing is a good start."}
                          </Empty>
                        )}
                      </div>
                      <button
                        className="quick-add"
                        onClick={() => setEditing(null)}
                      >
                        <Plus size={18} />
                        <span>Add a task</span>
                        <span className="quick-add-hint">
                          Get it out of your head
                        </span>
                      </button>
                    </section>
                    {view === "today" && (
                      <section className="horizon-section">
                        <div className="section-title">
                          <h2>Around the corner</h2>
                          <button
                            className="text-button"
                            onClick={() => changeView("upcoming")}
                          >
                            View upcoming
                            <ArrowUpRight size={14} />
                          </button>
                        </div>
                        {(upcomingEvents.length
                          ? upcomingEvents
                          : future.slice(0, 2)
                        ).length ? (
                          <div className="event-grid">
                            {(upcomingEvents.length
                              ? upcomingEvents
                              : future.slice(0, 2)
                            ).map((t) => (
                              <button
                                className="event-card"
                                onClick={() => setEditing(t)}
                                key={t.id}
                              >
                                <div className="event-date">
                                  <strong>
                                    {new Intl.DateTimeFormat("en", {
                                      day: "numeric",
                                      timeZone: tz,
                                    }).format(new Date(t.due_at!))}
                                  </strong>
                                  <span>
                                    {new Intl.DateTimeFormat("en", {
                                      month: "short",
                                      timeZone: tz,
                                    }).format(new Date(t.due_at!))}
                                  </span>
                                </div>
                                <span>
                                  <strong>{t.title}</strong>
                                  <small>
                                    {t.tag || "Upcoming"} ·{" "}
                                    {daysAway(t.due_at!, tz)} days away
                                  </small>
                                </span>
                                <ChevronRight size={16} />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="horizon-empty">
                            <CalendarDays size={19} />
                            <p>
                              No deadlines on the horizon.
                              <span>
                                Future you has a little breathing room.
                              </span>
                            </p>
                            <button
                              className="text-button"
                              onClick={() => {
                                setView("upcoming");
                                setEditing(null);
                              }}
                            >
                              Plan ahead
                              <Plus size={15} />
                            </button>
                          </div>
                        )}
                      </section>
                    )}
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
                <footer className="workspace-footer">
                  <span>A little progress is still progress.</span>
                  <span>Made for your kind of mind.</span>
                </footer>
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
        <a
          className="signout-link"
          href="/signout-with-chatgpt?return_to=/"
          target="_top"
        >
          <LogOut size={15} />
          Sign out
        </a>
      </div>
    </Modal>
  );
}
