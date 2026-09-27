import { env } from "cloudflare:workers";
import { identity, database, endpoint, json } from "@/lib/server";
export async function GET() {
  return endpoint(async () => {
    const id = await identity();
    const db = database();
    const [
      profile,
      tasks,
      journal,
      messages,
      trackers,
      metrics,
      metricEntries,
      memories,
    ] = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          "SELECT name,role,context,goals,timezone,onboarded,gemini_key IS NOT NULL AS has_key FROM users WHERE id=?",
        )
        .bind(id),
      db
        .prepare(
          "SELECT id,title,notes,tag,kind,priority,due_at,done,completed_at,created_at,updated_at FROM tasks WHERE user_id=? ORDER BY created_at DESC",
        )
        .bind(id),
      db
        .prepare(
          "SELECT id,body,summary,created_at FROM journal WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
        )
        .bind(id),
      db
        .prepare(
          "SELECT id,role,content,proposal,applied,created_at FROM messages WHERE user_id=? ORDER BY created_at DESC LIMIT 40",
        )
        .bind(id),
      db
        .prepare(
          "SELECT id,title,due_at,done FROM trackers WHERE user_id=? AND done=0 ORDER BY created_at DESC LIMIT 50",
        )
        .bind(id),
      db
        .prepare(
          "SELECT id,title,type,unit,goal,frequency,aggregation,category,tags,notes,created_at,updated_at FROM metrics WHERE user_id=? ORDER BY created_at DESC",
        )
        .bind(id),
      db
        .prepare(
          "SELECT id,metric_id,value,recorded_at,end_at,notes,tags FROM metric_entries WHERE user_id=? ORDER BY recorded_at DESC",
        )
        .bind(id),
      db
        .prepare(
          "SELECT id,filename,title,summary,content,created_at,updated_at FROM memories WHERE user_id=? ORDER BY updated_at DESC",
        )
        .bind(id),
    ]);
    const { has_key, ...safeProfile } = profile.results[0];
    return json({
      profile: safeProfile,
      tasks: tasks.results,
      journal: journal.results,
      messages: messages.results.reverse().map((m) => ({
        ...m,
        proposal: m.proposal ? JSON.parse(m.proposal as string) : null,
      })),
      trackers: trackers.results,
      metrics: metrics.results,
      metricEntries: metricEntries.results,
      memories: memories.results,
      aiConfigured: !!has_key || !!env.GEMINI_API_KEY,
      keyStorageReady: !!env.KEY_ENCRYPTION_SECRET,
    });
  });
}
