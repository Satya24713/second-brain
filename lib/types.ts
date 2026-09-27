import type { Metric, MetricEntry } from "./tracking";
export type Memory = {
  id: string;
  filename: string;
  title: string;
  summary: string;
  content: string;
  created_at: string;
  updated_at: string;
};
export type Task = {
  id: string;
  title: string;
  notes: string;
  tag: string;
  kind: "task" | "event";
  priority: "normal" | "high" | "low";
  due_at: string | null;
  done: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type Profile = {
  name: string;
  role: string;
  context: string;
  goals: string;
  timezone: string;
  onboarded: number;
};
export type Journal = {
  id: string;
  body: string;
  summary: string | null;
  created_at: string;
};
export type Tracker = {
  id: string;
  title: string;
  due_at: string | null;
  done: number;
};
export type Action = {
  type:
    | "task"
    | "journal"
    | "profile"
    | "tracker"
    | "task_update"
    | "task_delete"
    | "journal_update"
    | "journal_delete"
    | "metric"
    | "metric_update"
    | "metric_delete"
    | "metric_entry"
    | "metric_entry_update"
    | "metric_entry_delete"
    | "memory"
    | "memory_update"
    | "memory_delete";
  id?: string;
  done?: boolean;
  metric_type?: Metric["type"];
  unit?: string;
  goal?: number | null;
  frequency?: Metric["frequency"];
  aggregation?: Metric["aggregation"];
  category?: string;
  tags?: string;
  metric_id?: string;
  metric_ref?: number;
  value?: number;
  recorded_at?: string;
  end_at?: string | null;
  filename?: string;
  content?: string;
  title?: string;
  notes?: string;
  tag?: string;
  kind?: "task" | "event";
  priority?: "normal" | "high" | "low";
  due_at?: string | null;
  body?: string;
  summary?: string;
  name?: string;
  role?: string;
  context?: string;
  goals?: string;
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposal: Action[] | null;
  applied: number;
  created_at: string;
};
export type AppData = {
  tasks: Task[];
  profile: Profile;
  journal: Journal[];
  messages: Message[];
  trackers: Tracker[];
  metrics: Metric[];
  metricEntries: MetricEntry[];
  memories: Memory[];
  aiConfigured: boolean;
  keyStorageReady: boolean;
};
