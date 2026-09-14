import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8787";
const user = `qa-plan-${crypto.randomUUID()}`,
  id = crypto.randomUUID();
const quote = (s) => `'${s.replaceAll("'", "''")}'`;
const proposal = JSON.stringify([
  { type: "task", title: "Prepare for chemistry", tag: "college" },
  {
    type: "journal",
    body: "My original words.",
    summary: "A manageable next step.",
  },
  { type: "tracker", title: "Check preparation progress" },
  { type: "profile", goals: "Make room for learning" },
]);
mkdirSync(".sites-runtime", { recursive: true });
writeFileSync(
  ".sites-runtime/apply-fixture.sql",
  `INSERT INTO users(id,name,created_at) VALUES (${quote(user)},'Test user','2026-09-13T00:00:00Z'); INSERT INTO messages(id,user_id,role,content,proposal,created_at) VALUES (${quote(id)},${quote(user)},'assistant','Test proposal',${quote(proposal)},'2026-09-13T00:00:00Z');`,
);
const seed = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "dist/server/wrangler.json",
    "--persist-to",
    ".wrangler/state",
    "--file",
    ".sites-runtime/apply-fixture.sql",
  ],
  { encoding: "utf8" },
);
if (seed.status !== 0) throw Error(`Fixture setup failed: ${seed.stderr}`);
async function request(path, method = "GET", body) {
  const r = await fetch(`${base}/api/${path}`, {
    method,
    headers: {
      "oai-authenticated-user-id": user,
      "oai-authenticated-user-email": "qa-plan@example.test",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
test("Concurrent plan acceptance is atomic and idempotent", async () => {
  const result = await Promise.all([
    request("assistant/apply", "POST", { messageId: id }),
    request("assistant/apply", "POST", { messageId: id }),
  ]);
  assert.equal(result[0].status, 200);
  assert.equal(result[1].status, 200);
  const w = (await request("workspace")).data;
  assert.equal(w.tasks.length, 1);
  assert.equal(w.journal.length, 1);
  assert.equal(w.trackers.length, 1);
  assert.equal(w.profile.goals, "Make room for learning");
  assert.equal(w.messages[0].applied, 1);
  assert.equal(
    (await request("assistant/apply", "POST", { messageId: id })).data
      .alreadyApplied,
    true,
  );
  await request(`tasks/${w.tasks[0].id}`, "DELETE");
  await request(`journal/${w.journal[0].id}`, "DELETE");
  await request(`trackers/${w.trackers[0].id}`, "PATCH", { done: true });
});
