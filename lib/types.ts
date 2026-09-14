export type Task = {
  id: string;
  title: string;
  notes: string;
  tag: string;
  kind: "task" | "event";
  priority: "normal" | "high";
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
  type: "task" | "journal" | "profile" | "tracker";
  title?: string;
  notes?: string;
  tag?: string;
  kind?: "task" | "event";
  priority?: "normal" | "high";
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
  aiConfigured: boolean;
  keyStorageReady: boolean;
};
