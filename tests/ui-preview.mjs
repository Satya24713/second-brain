// Local UI QA only: synthetic tasks and a deliberately delayed reply stream.
// Does not read the user's database, profile, or Gemini key.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve("android/app/src/main/assets/www");
const now = new Date();
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
}).format(now);
const future = new Date(new Date(today).getTime() + 2 * 86400000)
  .toISOString()
  .slice(0, 10);
const make = (id, title, tag, priority, date, done = 0) => ({
  id,
  title,
  tag,
  priority,
  due_at: date + "T09:00:00+05:30",
  done,
  kind: "task",
  notes: "",
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
  completed_at: null,
});
const data = {
  profile: {
    name: "Preview",
    role: "",
    context: "",
    goals: "",
    timezone: "Asia/Kolkata",
    onboarded: 1,
  },
  tasks: [
    make("one", "Finish the physics assignment", "college", "high", today),
    make("two", "Review lecture notes", "study", "normal", today),
    make("three", "Read for 20 minutes", "personal", "low", today),
    make("four", "Pack my bag", "personal", "low", today, 1),
    make("five", "Academic Audit", "college", "normal", future),
    {
      ...make(
        "six",
        "Sessional Test — Calculus and Linear Algebra",
        "exam",
        "high",
        future,
      ),
      kind: "event",
    },
  ],
  journal: [],
  messages: [],
  trackers: [],
  metrics: [{ id: "water", title: "Water", type: "quantity", unit: "ml", goal: 2000, frequency: "daily", aggregation: "sum", category: "Health", tags: "daily", notes: "", created_at: now.toISOString(), updated_at: now.toISOString() }],
  metricEntries: [{ id: "water-one", metric_id: "water", value: 500, recorded_at: now.toISOString(), end_at: null, notes: "Morning glass", tags: "" }],
  memories: [{ id: "memory-one", filename: "memory.md", title: "Study preferences", summary: "How I like to study", content: "# Study preferences\nI prefer 25-minute study sessions.", created_at: now.toISOString(), updated_at: now.toISOString() }],
  aiConfigured: true,
  keyStorageReady: true,
};
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const send = (value) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(value));
    };
    if (url.pathname === "/mobile") {
      const width = Number(url.searchParams.get("width")) || 390;
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<html><head><title>Second Brain — mobile QA</title></head><body style="margin:0;background:#eef1f5;display:grid;place-items:center;min-height:100vh"><iframe title="Mobile app preview" src="/" style="border:0;width:${Math.max(320, Math.min(width, 760))}px;height:844px;background:white;box-shadow:0 8px 60px #16213c20"></iframe></body></html>`,
      );
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      let body = "";
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      if (url.pathname === "/api/workspace") return send(data);
      const [, , collection, recordId] = url.pathname.split("/");
      const key = { metrics: "metrics", "metric-entries": "metricEntries", memories: "memories" }[collection];
      if (key) {
        if (req.method === "POST") {
          const id = crypto.randomUUID();
          data[key].push({ ...payload, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
          return send({ id, ok: true });
        }
        const record = data[key].find(item => item.id === recordId);
        if (!record) { res.statusCode = 404; return send({ error: "Not found" }); }
        if (req.method === "PATCH") Object.assign(record, payload);
        if (req.method === "DELETE") { data[key] = data[key].filter(item => item.id !== recordId); if (key === "metrics") data.metricEntries = data.metricEntries.filter(item => item.metric_id !== recordId); }
        return send(req.method === "GET" ? record : { ok: true });
      }
      if (url.pathname.startsWith("/api/tasks/") && req.method === "PATCH") {
        Object.assign(
          data.tasks.find((t) => t.id === url.pathname.split("/").at(-1)),
          payload,
        );
        return send({ ok: true });
      }
      if (url.pathname === "/api/assistant" && req.method === "POST") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
        });
        const reply =
          "Let’s start with your physics assignment. Work on the first question for 20 minutes, then take a short break. After that, review your lecture notes. You already have one task complete today — a good start.";
        const raw = JSON.stringify({ reply, actions: [] });
        await new Promise((resolve) => setTimeout(resolve, 1800));
        for (let i = 0; i < raw.length; i += 8) {
          if (res.destroyed) return;
          res.write(
            `data: ${JSON.stringify({ type: "chunk", text: raw.slice(i, i + 8) })}\n\n`,
          );
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        if (payload.message.includes("fail")) {
          res.end(
            `data: ${JSON.stringify({ type: "error", error: "Preview: connection interrupted. Your message is ready to retry." })}\n\n`,
          );
          return;
        }
        const userId = crypto.randomUUID(),
          id = crypto.randomUUID();
        data.messages.push(
          {
            id: userId,
            role: "user",
            content: payload.message,
            proposal: null,
            applied: 0,
            created_at: now.toISOString(),
          },
          {
            id,
            role: "assistant",
            content: reply,
            proposal: [],
            applied: 0,
            created_at: now.toISOString(),
          },
        );
        res.end(
          `data: ${JSON.stringify({ type: "done", result: { id, userId, reply, actions: [] } })}\n\n`,
        );
        return;
      }
      if (url.pathname === "/api/assistant" && req.method === "DELETE") {
        data.messages = [];
        return send({ ok: true });
      }
      res.statusCode = 404;
      return send({ error: "QA endpoint not implemented" });
    }
    try {
      const relative =
        decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
      const target = path.resolve(root, relative);
      if (!target.startsWith(root + path.sep)) throw Error("Invalid path");
      const file = await fs.readFile(target);
      const type =
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".woff2": "font/woff2",
          ".svg": "image/svg+xml",
        }[path.extname(target)] || "application/octet-stream";
      res.setHeader("Content-Type", type);
      res.end(file);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  })
  .listen(4173, "127.0.0.1", () =>
    console.log("UI QA: http://127.0.0.1:4173/mobile"),
  );
