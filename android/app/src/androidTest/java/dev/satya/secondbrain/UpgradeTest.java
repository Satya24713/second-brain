package dev.satya.secondbrain;

import android.content.Context;
import android.content.ContextWrapper;
import android.database.DatabaseErrorHandler;
import android.database.sqlite.SQLiteDatabase;
import android.test.InstrumentationTestCase;
import java.io.File;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Integration fixtures always use a unique cache database, never the user's database. */
@SuppressWarnings("deprecation")
public class UpgradeTest extends InstrumentationTestCase {
    private DatabaseHelper helper;
    private Context isolatedContext;
    private File fixtureFile;

    @Override
    protected void setUp() throws Exception {
        super.setUp();
        Context base = getInstrumentation().getTargetContext();
        fixtureFile = new File(base.getCacheDir(), "upgrade-test-" + UUID.randomUUID() + ".db");
        isolatedContext = new ContextWrapper(base) {
            @Override public File getDatabasePath(String name) { return fixtureFile; }
            @Override public SQLiteDatabase openOrCreateDatabase(String name, int mode, SQLiteDatabase.CursorFactory factory) {
                return SQLiteDatabase.openOrCreateDatabase(fixtureFile, factory);
            }
            @Override public SQLiteDatabase openOrCreateDatabase(String name, int mode, SQLiteDatabase.CursorFactory factory, DatabaseErrorHandler errorHandler) {
                return SQLiteDatabase.openOrCreateDatabase(fixtureFile.getPath(), factory, errorHandler);
            }
            @Override public boolean deleteDatabase(String name) { return SQLiteDatabase.deleteDatabase(fixtureFile); }
        };
    }

    @Override
    protected void tearDown() throws Exception {
        try {
            if (helper != null) helper.close();
            if (fixtureFile != null) SQLiteDatabase.deleteDatabase(fixtureFile);
        } finally { super.tearDown(); }
    }

    private DatabaseHelper database() {
        if (helper == null) helper = new DatabaseHelper(isolatedContext);
        return helper;
    }

    private JSONObject json(String value) throws Exception { return new JSONObject(value); }
    private JSONObject workspace() { return database().getWorkspaceData(false); }
    private JSONObject row(JSONArray rows, String id) throws Exception {
        for (int i = 0; i < rows.length(); i++) {
            JSONObject value = rows.getJSONObject(i);
            if (id.equals(value.getString("id"))) return value;
        }
        fail("Expected fixture row " + id);
        return null;
    }

    public void testPromptTimestampsNormalizeToUtc() throws Exception {
        assertEquals("2026-09-26T12:00:00.100Z", DatabaseHelper.validTimestamp("2026-09-26T12:00:00.1Z"));
        assertEquals("2026-09-26T12:00:00.120Z", DatabaseHelper.validTimestamp("2026-09-26T12:00:00.12Z"));
        assertEquals("2026-09-26T06:30:00.000Z", DatabaseHelper.validTimestamp("2026-09-26T12:00:00+05:30"));
        try {
            DatabaseHelper.validTimestamp("2026-02-30T12:00:00Z");
            fail("Invalid calendar dates must fail");
        } catch (Exception expected) { assertNotNull(expected.getMessage()); }
    }

    public void testVersionOneMigrationPreservesTasks() throws Exception {
        try (SQLiteDatabase legacy = SQLiteDatabase.openOrCreateDatabase(fixtureFile, null)) {
            legacy.execSQL("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT '', context TEXT NOT NULL DEFAULT '', goals TEXT NOT NULL DEFAULT '', timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', onboarded INTEGER NOT NULL DEFAULT 1, gemini_key TEXT, created_at TEXT NOT NULL)");
            legacy.execSQL("CREATE TABLE tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', tag TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'task', priority TEXT NOT NULL DEFAULT 'normal', due_at TEXT, done INTEGER NOT NULL DEFAULT 0, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
            legacy.execSQL("CREATE TABLE journal (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL, summary TEXT, created_at TEXT NOT NULL)");
            legacy.execSQL("CREATE TABLE messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, proposal TEXT, applied INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)");
            legacy.execSQL("CREATE TABLE trackers (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, due_at TEXT, done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)");
            legacy.execSQL("INSERT INTO users (id,name,created_at) VALUES ('default_user','Migration fixture','2026-09-25T08:00:00.000Z')");
            legacy.execSQL("INSERT INTO tasks (id,user_id,title,notes,done,completed_at,due_at,created_at,updated_at) VALUES ('legacy-task','default_user','Keep completed task','Keep these notes',1,'2026-09-25T09:00:00.000Z','2026-09-25T08:00:00.000Z','2026-09-25T08:00:00.000Z','2026-09-25T09:00:00.000Z')");
            legacy.setVersion(1);
        }
        JSONObject data = workspace();
        assertEquals(2, database().getReadableDatabase().getVersion());
        JSONObject task = row(data.getJSONArray("tasks"), "legacy-task");
        assertEquals("Keep completed task", task.getString("title"));
        assertEquals("Keep these notes", task.getString("notes"));
        assertTrue(task.getBoolean("done"));
        assertEquals("2026-09-25T09:00:00.000Z", task.getString("completed_at"));
        assertEquals("Migration fixture", data.getJSONObject("profile").getString("name"));
        assertEquals(0, data.getJSONArray("metrics").length());
        assertEquals(0, data.getJSONArray("metricEntries").length());
        assertEquals(0, data.getJSONArray("memories").length());
        database().createMemory(json("{\"title\":\"After upgrade\",\"content\":\"Still here\"}"));
        assertEquals(1, workspace().getJSONArray("memories").length());
        assertEquals(1, workspace().getJSONArray("tasks").length());
    }

    public void testMetricEntryCrudAndCascade() throws Exception {
        String metric = database().createMetric(json("{\"title\":\"Water\",\"type\":\"quantity\",\"unit\":\"ml\",\"goal\":2000,\"frequency\":\"daily\",\"aggregation\":\"sum\"}")).getString("id");
        database().updateMetric(metric, json("{\"title\":\"Daily water\",\"goal\":2500}"));
        JSONObject savedMetric = row(workspace().getJSONArray("metrics"), metric);
        assertEquals("Daily water", savedMetric.getString("title"));
        assertEquals(2500.0, savedMetric.getDouble("goal"), 0.001);
        JSONObject values = json("{\"value\":500,\"recorded_at\":\"2026-09-26T09:30:00+05:30\",\"notes\":\"Morning\"}").put("metric_id", metric);
        String entry = database().createMetricEntry(values).getString("id");
        database().updateMetricEntry(entry, json("{\"value\":750,\"tags\":\"home\"}"));
        JSONObject savedEntry = row(workspace().getJSONArray("metricEntries"), entry);
        assertEquals(750.0, savedEntry.getDouble("value"), 0.001);
        assertEquals("2026-09-26T04:00:00.000Z", savedEntry.getString("recorded_at"));
        assertEquals("Morning", savedEntry.getString("notes"));
        assertEquals("home", savedEntry.getString("tags"));
        database().deleteMetricEntry(entry);
        assertEquals(0, workspace().getJSONArray("metricEntries").length());
        database().createMetricEntry(values);
        database().deleteMetric(metric);
        assertEquals(0, workspace().getJSONArray("metrics").length());
        assertEquals(0, workspace().getJSONArray("metricEntries").length());
    }

    public void testIntervalDurationAndBooleanValidation() throws Exception {
        String sleep = database().createMetric(json("{\"title\":\"Sleep\",\"type\":\"time_interval\",\"unit\":\"hours\",\"aggregation\":\"average\"}")).getString("id");
        JSONObject interval = json("{\"value\":0,\"recorded_at\":\"2026-09-25T22:00:00Z\",\"end_at\":\"2026-09-26T06:30:00Z\"}").put("metric_id", sleep);
        String entry = database().createMetricEntry(interval).getString("id");
        assertEquals(8.5, row(workspace().getJSONArray("metricEntries"), entry).getDouble("value"), 0.001);
        try {
            database().createMetricEntry(interval.put("end_at", "2026-09-25T20:00:00Z"));
            fail("An interval ending before its start must fail");
        } catch (Exception expected) { assertNotNull(expected.getMessage()); }
        String habit = database().createMetric(json("{\"title\":\"Read\",\"type\":\"yes_no\",\"aggregation\":\"percentage\"}")).getString("id");
        try {
            database().createMetricEntry(new JSONObject().put("metric_id", habit).put("value", 2));
            fail("Yes/no entries only accept 0 or 1");
        } catch (Exception expected) { assertNotNull(expected.getMessage()); }
        assertEquals(1, workspace().getJSONArray("metricEntries").length());
    }

    public void testMemoryCrudAndMetadataCatalog() throws Exception {
        String memory = database().createMemory(json("{\"title\":\"Study preferences\",\"filename\":\"memory.md\",\"summary\":\"Study context\",\"content\":\"# Preferences\\nStudy in the morning.\"}")).getString("id");
        JSONObject catalog = row(database().getAiContext().getJSONArray("memoryCatalog"), memory);
        assertEquals("memory.md", catalog.getString("filename"));
        assertEquals("Study context", catalog.getString("summary"));
        assertFalse("The catalog should contain metadata only", catalog.has("content"));
        assertTrue(database().getMemory(memory).getString("content").contains("morning"));
        database().updateMemory(memory, json("{\"title\":\"Updated preferences\",\"content\":\"# Preferences\\nStudy in the evening.\"}"));
        JSONObject saved = database().getMemory(memory);
        assertEquals("Updated preferences", saved.getString("title"));
        assertEquals("memory.md", saved.getString("filename"));
        assertTrue(saved.getString("content").contains("evening"));
        database().deleteMemory(memory);
        assertEquals(0, workspace().getJSONArray("memories").length());
    }

    public void testProposalUpdatesDeletesCreatesAndAppliesOnce() throws Exception {
        String keep = database().createTask(json("{\"title\":\"Revise chemistry\"}")).getString("id");
        String remove = database().createTask(json("{\"title\":\"Duplicate task\"}")).getString("id");
        JSONArray actions = new JSONArray()
            .put(new JSONObject().put("type", "task_update").put("id", keep).put("title", "Chemistry revised").put("done", true))
            .put(new JSONObject().put("type", "task_delete").put("id", remove))
            .put(json("{\"type\":\"metric\",\"metric_type\":\"count\",\"title\":\"Questions solved\",\"unit\":\"questions\",\"goal\":50}"))
            .put(json("{\"type\":\"metric_entry\",\"metric_ref\":2,\"value\":20,\"recorded_at\":\"2026-09-26T10:00:00Z\"}"))
            .put(json("{\"type\":\"memory\",\"title\":\"Exam plan\",\"filename\":\"exam.md\",\"content\":\"Review chemistry this week.\"}"));
        String message = database().saveMessage("assistant", "Prepared changes", actions.toString());
        assertEquals(5, database().applyProposal(message).getInt("count"));
        JSONObject data = workspace();
        assertEquals(1, data.getJSONArray("tasks").length());
        JSONObject task = row(data.getJSONArray("tasks"), keep);
        assertEquals("Chemistry revised", task.getString("title"));
        assertTrue(task.getBoolean("done"));
        assertFalse(task.isNull("completed_at"));
        assertEquals(1, data.getJSONArray("metrics").length());
        assertEquals("count", data.getJSONArray("metrics").getJSONObject(0).getString("type"));
        assertEquals(20.0, data.getJSONArray("metricEntries").getJSONObject(0).getDouble("value"), 0.001);
        assertEquals(1, data.getJSONArray("memories").length());
        assertTrue(database().applyProposal(message).getBoolean("alreadyApplied"));
        assertEquals(1, workspace().getJSONArray("metrics").length());
        assertEquals(1, workspace().getJSONArray("metricEntries").length());
    }

    public void testFailedProposalRollsBackEarlierChanges() throws Exception {
        String task = database().createTask(json("{\"title\":\"Original title\"}")).getString("id");
        JSONArray actions = new JSONArray()
            .put(new JSONObject().put("type", "task_update").put("id", task).put("title", "Should roll back"))
            .put(json("{\"type\":\"metric_entry\",\"metric_id\":\"missing-fixture-metric\",\"value\":5}"));
        String message = database().saveMessage("assistant", "Invalid plan fixture", actions.toString());
        try {
            database().applyProposal(message);
            fail("Applying a missing metric reference should fail");
        } catch (Exception expected) { assertNotNull(expected.getMessage()); }
        assertEquals("Original title", row(workspace().getJSONArray("tasks"), task).getString("title"));
        assertFalse(row(workspace().getJSONArray("messages"), message).getBoolean("applied"));
        assertEquals(0, workspace().getJSONArray("metricEntries").length());
    }

    public void testInvalidGoalsValuesAndDuplicateMemoryNamesAreRejected() throws Exception {
        for (Object goal : new Object[]{0, -1, "20"}) {
            try {
                database().createMetric(new JSONObject().put("title", "Invalid fixture").put("goal", goal));
                fail("Goals must be positive numbers");
            } catch (Exception expected) { assertNotNull(expected.getMessage()); }
        }
        assertEquals(0, workspace().getJSONArray("metrics").length());
        String metric = database().createMetric(json("{\"title\":\"Water\",\"type\":\"quantity\"}")).getString("id");
        try {
            database().createMetricEntry(new JSONObject().put("metric_id", metric).put("value", "500"));
            fail("Numeric strings should not silently become logged values");
        } catch (Exception expected) { assertNotNull(expected.getMessage()); }
        try {
            database().createMetric(json("{\"title\":\"Sleep\",\"type\":\"time_interval\",\"unit\":\"bananas\"}"));
            fail("Time intervals must use a duration unit");
        } catch (Exception expected) { assertNotNull(expected.getMessage()); }
        String original = database().createMemory(json("{\"title\":\"Original\",\"filename\":\"memory.md\",\"content\":\"Keep this\"}")).getString("id");
        try {
            database().createMemory(json("{\"title\":\"Duplicate\",\"filename\":\"memory.md\",\"content\":\"Different\"}"));
            fail("A duplicate memory filename must not overwrite or duplicate the file");
        } catch (Exception expected) { assertNotNull(expected.getMessage()); }
        String second = database().createMemory(json("{\"title\":\"Second\",\"filename\":\"other.md\",\"content\":\"Other\"}")).getString("id");
        try {
            database().updateMemory(second, json("{\"filename\":\"memory.md\"}"));
            fail("Renaming to an existing memory filename must fail");
        } catch (Exception expected) { assertNotNull(expected.getMessage()); }
        assertEquals("Keep this", database().getMemory(original).getString("content"));
        assertEquals("other.md", database().getMemory(second).getString("filename"));
        assertEquals(2, workspace().getJSONArray("memories").length());
    }
}
