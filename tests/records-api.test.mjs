import test from "node:test";
import assert from "node:assert/strict";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8787";
// Local built Worker only: simulate the trusted dispatcher with synthetic users.
const user = `qa-records-${crypto.randomUUID()}`;
const other = `qa-records-${crypto.randomUUID()}`;

async function request(path, { method = "GET", body, who = user } = {}) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    signal: AbortSignal.timeout(10000),
    headers: {
      ...(who
        ? {
            "oai-authenticated-user-id": who,
            "oai-authenticated-user-email": `${who}@example.test`,
          }
        : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path}: ${response.status} ${text}`);
  }
  return { status: response.status, data };
}

test("Tracker entries and markdown memories persist with owner isolation", async (t) => {
  const created = [];
  async function create(collection, body, who = user) {
    const result = await request(collection, { method: "POST", body, who });
    assert.ok([200, 201].includes(result.status), JSON.stringify(result));
    assert.ok(result.data.id);
    created.push({ collection, id: result.data.id, who });
    return result.data.id;
  }
  t.after(async () => {
    // Only remove records created by these random synthetic identities.
    for (const { collection, id, who } of created.reverse()) {
      const result = await request(`${collection}/${id}`, {
        method: "DELETE",
        who,
      });
      assert.ok([200, 404].includes(result.status), JSON.stringify(result));
    }
  });
  assert.equal((await request("workspace")).status, 200);
  assert.equal((await request("workspace", { who: other })).status, 200);

  await t.test(
    "anonymous collection reads and writes require authentication",
    async () => {
      for (const collection of ["metrics", "metric-entries", "memories"]) {
        assert.equal((await request(collection, { who: null })).status, 401);
        assert.equal(
          (await request(collection, { method: "POST", who: null, body: {} }))
            .status,
          401,
        );
      }
    },
  );

  const metricId = await create("metrics", {
    title: "Water",
    type: "quantity",
    unit: "ml",
    goal: 2000,
    frequency: "daily",
    aggregation: "sum",
    category: "Health",
    tags: "hydration",
    notes: "Synthetic QA record",
  });
  const entryId = await create("metric-entries", {
    metric_id: metricId,
    value: 250,
    recorded_at: "2026-09-26T10:30:00+05:30",
    notes: "Morning water",
    tags: "morning",
  });
  const memoryId = await create("memories", {
    filename: "memory.md",
    title: "Preferences",
    summary: "QA preference",
    content: "# Preferences\n\nStudy in the morning.\n",
  });
  const otherMetricId = await create(
    "metrics",
    { title: "Other water", type: "quantity" },
    other,
  );
  const otherEntryId = await create(
    "metric-entries",
    {
      metric_id: otherMetricId,
      value: 1,
      recorded_at: "2026-09-26T00:00:00Z",
    },
    other,
  );

  await t.test(
    "CRUD and partial updates retain configuration and canonical dates",
    async () => {
      const metric = (await request(`metrics/${metricId}`)).data;
      assert.equal(metric.title, "Water");
      assert.equal(metric.goal, 2000);
      assert.equal("user_id" in metric, false);
      assert.equal(
        (
          await request(`metrics/${metricId}`, {
            method: "PATCH",
            body: { title: "Daily water", goal: 2500 },
          })
        ).status,
        200,
      );
      const updatedMetric = (await request(`metrics/${metricId}`)).data;
      assert.equal(updatedMetric.title, "Daily water");
      assert.equal(updatedMetric.goal, 2500);
      assert.equal(updatedMetric.unit, "ml");
      assert.equal(updatedMetric.tags, "hydration");
      assert.equal(updatedMetric.category, "Health");
      const entry = (await request(`metric-entries/${entryId}`)).data;
      assert.equal(entry.recorded_at, "2026-09-26T05:00:00.000Z");
      assert.equal(entry.end_at, null);
      assert.equal("user_id" in entry, false);
      assert.equal(
        (
          await request(`metric-entries/${entryId}`, {
            method: "PATCH",
            body: { value: 500 },
          })
        ).status,
        200,
      );
      const updatedEntry = (await request(`metric-entries/${entryId}`)).data;
      assert.equal(updatedEntry.value, 500);
      assert.equal(updatedEntry.notes, "Morning water");
      assert.equal(updatedEntry.recorded_at, entry.recorded_at);
      assert.equal(
        (
          await request(`memories/${memoryId}`, {
            method: "PATCH",
            body: { content: "# Preferences\n\nStudy at night.\n" },
          })
        ).status,
        200,
      );
      const memory = (await request(`memories/${memoryId}`)).data;
      assert.equal(memory.content, "# Preferences\n\nStudy at night.\n");
      assert.equal(memory.filename, "memory.md");
      assert.equal(memory.title, "Preferences");
      assert.equal(memory.summary, "QA preference");
      assert.equal("user_id" in memory, false);
      const workspace = (await request("workspace")).data;
      assert.equal(
        workspace.metrics.find((record) => record.id === metricId).goal,
        2500,
      );
      assert.equal(
        workspace.metricEntries.find((record) => record.id === entryId).value,
        500,
      );
      assert.equal(
        workspace.memories.find((record) => record.id === memoryId).content,
        memory.content,
      );
    },
  );

  await t.test(
    "foreign records are absent from listings and cannot be read, edited or deleted",
    async () => {
      for (const [collection, id, body] of [
        ["metrics", metricId, { title: "Stolen" }],
        ["metric-entries", entryId, { value: 999 }],
        ["memories", memoryId, { content: "Stolen" }],
      ]) {
        const listed = await request(collection, { who: other });
        assert.equal(listed.status, 200);
        assert.equal(
          listed.data.some((record) => record.id === id),
          false,
        );
        assert.equal(
          (await request(`${collection}/${id}`, { who: other })).status,
          404,
        );
        assert.equal(
          (
            await request(`${collection}/${id}`, {
              who: other,
              method: "PATCH",
              body,
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await request(`${collection}/${id}`, {
              who: other,
              method: "DELETE",
            })
          ).status,
          404,
        );
      }
      assert.equal(
        (
          await request("metric-entries", {
            method: "POST",
            who: other,
            body: {
              metric_id: metricId,
              value: 1,
              recorded_at: "2026-09-26T00:00:00Z",
            },
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await request(`metric-entries/${entryId}`, {
            method: "PATCH",
            body: { metric_id: otherMetricId },
          })
        ).status,
        404,
      );
      assert.equal(
        (await request(`metric-entries/${entryId}`)).data.metric_id,
        metricId,
      );
    },
  );

  await t.test("markdown filenames are safe and unique per user", async () => {
    for (const filename of ["../memory.md", "memory.txt", "folder/memory.md"]) {
      assert.equal(
        (
          await request("memories", {
            method: "POST",
            body: { filename, title: "Invalid", content: "Test" },
          })
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await request("memories", {
          method: "POST",
          body: { filename: "memory.md", title: "Duplicate", content: "Test" },
        })
      ).status,
      400,
    );
    const secondId = await create("memories", {
      filename: "second.md",
      title: "Second",
      content: "Test",
    });
    assert.equal(
      (
        await request(`memories/${secondId}`, {
          method: "PATCH",
          body: { filename: "memory.md" },
        })
      ).status,
      400,
    );
    await create(
      "memories",
      { filename: "memory.md", title: "Other user", content: "Own memory" },
      other,
    );
  });

  await t.test(
    "invalid metric settings and ownership fields are rejected",
    async () => {
      for (const body of [
        { title: "", type: "quantity" },
        { title: "Water", type: "unknown" },
        { title: "Water", type: "quantity", goal: 0 },
        { title: "Water", type: "quantity", aggregation: "unknown" },
        { title: "Water", type: "quantity", user_id: other },
        { title: "Study", type: "time_interval", unit: "ml" },
      ])
        assert.equal(
          (await request("metrics", { method: "POST", body })).status,
          400,
        );
      assert.equal(
        (
          await request(`metrics/${metricId}`, {
            method: "PATCH",
            body: { user_id: other },
          })
        ).status,
        400,
      );
    },
  );

  await t.test(
    "entry values enforce count, event, boolean and duration semantics",
    async () => {
      for (const [type, invalidValues, validValue] of [
        ["count", [-1, 1.5], 2],
        ["event", [-1, 0.5], 1],
        ["yes_no", [-1, 2, 0.5], 0],
        ["duration", [-1], 1.5],
      ]) {
        const id = await create("metrics", { title: `QA ${type}`, type });
        for (const value of invalidValues) {
          assert.equal(
            (
              await request("metric-entries", {
                method: "POST",
                body: {
                  metric_id: id,
                  value,
                  recorded_at: "2026-09-26T00:00:00Z",
                },
              })
            ).status,
            400,
            `${type}: ${value}`,
          );
        }
        const id2 = await create("metric-entries", {
          metric_id: id,
          value: validValue,
          recorded_at: "2026-09-26T00:00:00Z",
        });
        assert.equal(
          (await request(`metric-entries/${id2}`)).data.value,
          validValue,
        );
      }
    },
  );

  await t.test(
    "intervals derive values from timestamps and reject missing or backwards ends",
    async () => {
      for (const [unit, expected] of [
        ["min", 90],
        ["hours", 1.5],
        ["seconds", 5400],
      ]) {
        const id = await create("metrics", {
          title: `Study ${unit}`,
          type: "time_interval",
          unit,
        });
        const record = {
          metric_id: id,
          value: 999,
          recorded_at: "2026-09-26T10:00:00+05:30",
        };
        for (const end_at of [
          null,
          "2026-09-26T10:00:00+05:30",
          "2026-09-26T09:00:00+05:30",
        ]) {
          assert.equal(
            (
              await request("metric-entries", {
                method: "POST",
                body: { ...record, end_at },
              })
            ).status,
            400,
          );
        }
        const id2 = await create("metric-entries", {
          ...record,
          end_at: "2026-09-26T11:30:00+05:30",
        });
        const entry = (await request(`metric-entries/${id2}`)).data;
        assert.equal(entry.value, expected);
        assert.equal(entry.recorded_at, "2026-09-26T04:30:00.000Z");
        assert.equal(entry.end_at, "2026-09-26T06:00:00.000Z");
        assert.equal(
          (
            await request(`metric-entries/${id2}`, {
              method: "PATCH",
              body: { end_at: "2026-09-26T13:00:00+05:30" },
            })
          ).status,
          200,
        );
        assert.equal(
          (await request(`metric-entries/${id2}`)).data.value,
          expected * 2,
        );
        assert.equal(
          (
            await request(`metric-entries/${id2}`, {
              method: "PATCH",
              body: { recorded_at: "2026-09-26T14:00:00+05:30" },
            })
          ).status,
          400,
        );
      }
    },
  );

  await t.test("deleting a metric cascades only to its entries", async () => {
    assert.equal(
      (await request(`metrics/${metricId}`, { method: "DELETE" })).status,
      200,
    );
    assert.equal((await request(`metrics/${metricId}`)).status, 404);
    assert.equal((await request(`metric-entries/${entryId}`)).status, 404);
    assert.equal(
      (await request("metric-entries")).data.some(
        (entry) => entry.metric_id === metricId,
      ),
      false,
    );
    assert.equal(
      (await request(`metrics/${otherMetricId}`, { who: other })).status,
      200,
    );
    assert.equal(
      (await request(`metric-entries/${otherEntryId}`, { who: other })).status,
      200,
    );
  });

  await t.test("individual entry and memory deletion persist", async () => {
    assert.equal(
      (
        await request(`metric-entries/${otherEntryId}`, {
          method: "DELETE",
          who: other,
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(`metric-entries/${otherEntryId}`, { who: other })).status,
      404,
    );
    assert.equal(
      (await request(`memories/${memoryId}`, { method: "DELETE" })).status,
      200,
    );
    assert.equal((await request(`memories/${memoryId}`)).status, 404);
  });
});
