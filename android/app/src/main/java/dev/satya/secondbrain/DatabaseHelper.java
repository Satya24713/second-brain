package dev.satya.secondbrain;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

public class DatabaseHelper extends SQLiteOpenHelper {
    private static final String DATABASE_NAME = "second_brain.db";
    private static final int DATABASE_VERSION = 2;
    public static final String DEFAULT_USER_ID = "default_user";

    public DatabaseHelper(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
    }

    private static String nowIso() {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        return sdf.format(new Date());
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE users (" +
                "id TEXT PRIMARY KEY, " +
                "name TEXT NOT NULL, " +
                "role TEXT NOT NULL DEFAULT '', " +
                "context TEXT NOT NULL DEFAULT '', " +
                "goals TEXT NOT NULL DEFAULT '', " +
                "timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', " +
                "onboarded INTEGER NOT NULL DEFAULT 1, " +
                "gemini_key TEXT, " +
                "created_at TEXT NOT NULL)");

        db.execSQL("CREATE TABLE tasks (" +
                "id TEXT PRIMARY KEY, " +
                "user_id TEXT NOT NULL, " +
                "title TEXT NOT NULL, " +
                "notes TEXT NOT NULL DEFAULT '', " +
                "tag TEXT NOT NULL DEFAULT '', " +
                "kind TEXT NOT NULL DEFAULT 'task', " +
                "priority TEXT NOT NULL DEFAULT 'normal', " +
                "due_at TEXT, " +
                "done INTEGER NOT NULL DEFAULT 0, " +
                "completed_at TEXT, " +
                "created_at TEXT NOT NULL, " +
                "updated_at TEXT NOT NULL)");

        db.execSQL("CREATE TABLE journal (" +
                "id TEXT PRIMARY KEY, " +
                "user_id TEXT NOT NULL, " +
                "body TEXT NOT NULL, " +
                "summary TEXT, " +
                "created_at TEXT NOT NULL)");

        db.execSQL("CREATE TABLE messages (" +
                "id TEXT PRIMARY KEY, " +
                "user_id TEXT NOT NULL, " +
                "role TEXT NOT NULL, " +
                "content TEXT NOT NULL, " +
                "proposal TEXT, " +
                "applied INTEGER NOT NULL DEFAULT 0, " +
                "created_at TEXT NOT NULL)");

        db.execSQL("CREATE TABLE trackers (" +
                "id TEXT PRIMARY KEY, " +
                "user_id TEXT NOT NULL, " +
                "title TEXT NOT NULL, " +
                "due_at TEXT, " +
                "done INTEGER NOT NULL DEFAULT 0, " +
                "created_at TEXT NOT NULL)");

        createMeasurementTables(db);

        // Initialize default user
        ContentValues userValues = new ContentValues();
        userValues.put("id", DEFAULT_USER_ID);
        userValues.put("name", "My Space");
        userValues.put("role", "");
        userValues.put("context", "");
        userValues.put("goals", "");
        userValues.put("timezone", TimeZone.getDefault().getID());
        userValues.put("onboarded", 1);
        userValues.put("created_at", nowIso());
        db.insert("users", null, userValues);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) createMeasurementTables(db);
    }

    private void createMeasurementTables(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS metrics (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'quantity', unit TEXT NOT NULL DEFAULT '', goal REAL, frequency TEXT NOT NULL DEFAULT 'daily', aggregation TEXT NOT NULL DEFAULT 'sum', category TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS metric_entries (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, metric_id TEXT NOT NULL, value REAL NOT NULL, recorded_at TEXT NOT NULL, end_at TEXT, notes TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '')");
        db.execSQL("CREATE INDEX IF NOT EXISTS metric_entries_metric_date ON metric_entries(metric_id, recorded_at)");
        db.execSQL("CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, filename TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    }

    private JSONArray queryObjects(String sql, String[] args) throws Exception {
        JSONArray result = new JSONArray();
        try (Cursor c = getReadableDatabase().rawQuery(sql, args)) {
            while (c.moveToNext()) {
                JSONObject row = new JSONObject();
                for (int i = 0; i < c.getColumnCount(); i++) {
                    String name = c.getColumnName(i);
                    if (c.isNull(i)) row.put(name, JSONObject.NULL);
                    else if (c.getType(i) == Cursor.FIELD_TYPE_FLOAT) row.put(name, c.getDouble(i));
                    else if (c.getType(i) == Cursor.FIELD_TYPE_INTEGER) row.put(name, c.getLong(i));
                    else row.put(name, c.getString(i));
                }
                result.put(row);
            }
        }
        return result;
    }

    private JSONArray listMetrics() throws Exception {
        return queryObjects("SELECT id,title,type,unit,goal,frequency,aggregation,category,tags,notes,created_at,updated_at FROM metrics WHERE user_id = ? ORDER BY created_at DESC", new String[]{DEFAULT_USER_ID});
    }

    private JSONArray listMetricEntries() throws Exception {
        return queryObjects("SELECT id,metric_id,value,recorded_at,end_at,notes,tags FROM metric_entries WHERE user_id = ? ORDER BY recorded_at DESC", new String[]{DEFAULT_USER_ID});
    }

    private JSONArray listMemories(boolean includeContent) throws Exception {
        return queryObjects("SELECT id,filename,title,summary," + (includeContent ? "content," : "") + "created_at,updated_at FROM memories WHERE user_id = ? ORDER BY updated_at DESC", new String[]{DEFAULT_USER_ID});
    }

    public JSONObject getWorkspaceData(boolean hasKey) {
        JSONObject result = new JSONObject();
        SQLiteDatabase db = getReadableDatabase();
        try {
            // Profile
            JSONObject profile = new JSONObject();
            Cursor userCursor = db.rawQuery("SELECT name, role, context, goals, timezone, onboarded FROM users WHERE id = ?", new String[]{DEFAULT_USER_ID});
            if (userCursor.moveToFirst()) {
                profile.put("name", userCursor.getString(0));
                profile.put("role", userCursor.getString(1));
                profile.put("context", userCursor.getString(2));
                profile.put("goals", userCursor.getString(3));
                profile.put("timezone", userCursor.getString(4));
                profile.put("onboarded", userCursor.getInt(5) == 1);
            } else {
                profile.put("name", "My Space");
                profile.put("role", "");
                profile.put("context", "");
                profile.put("goals", "");
                profile.put("timezone", TimeZone.getDefault().getID());
                profile.put("onboarded", true);
            }
            userCursor.close();
            result.put("profile", profile);

            // Tasks
            JSONArray tasks = new JSONArray();
            Cursor taskCursor = db.rawQuery("SELECT id, title, notes, tag, kind, priority, due_at, done, completed_at, created_at, updated_at FROM tasks WHERE user_id = ? ORDER BY created_at DESC", new String[]{DEFAULT_USER_ID});
            while (taskCursor.moveToNext()) {
                JSONObject t = new JSONObject();
                t.put("id", taskCursor.getString(0));
                t.put("title", taskCursor.getString(1));
                t.put("notes", taskCursor.getString(2));
                t.put("tag", taskCursor.getString(3));
                t.put("kind", taskCursor.getString(4));
                t.put("priority", taskCursor.getString(5));
                t.put("due_at", taskCursor.isNull(6) ? JSONObject.NULL : taskCursor.getString(6));
                t.put("done", taskCursor.getInt(7) == 1);
                t.put("completed_at", taskCursor.isNull(8) ? JSONObject.NULL : taskCursor.getString(8));
                t.put("created_at", taskCursor.getString(9));
                t.put("updated_at", taskCursor.getString(10));
                tasks.put(t);
            }
            taskCursor.close();
            result.put("tasks", tasks);

            // Journal
            JSONArray journal = new JSONArray();
            Cursor jCursor = db.rawQuery("SELECT id, body, summary, created_at FROM journal WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", new String[]{DEFAULT_USER_ID});
            while (jCursor.moveToNext()) {
                JSONObject j = new JSONObject();
                j.put("id", jCursor.getString(0));
                j.put("body", jCursor.getString(1));
                j.put("summary", jCursor.isNull(2) ? JSONObject.NULL : jCursor.getString(2));
                j.put("created_at", jCursor.getString(3));
                journal.put(j);
            }
            jCursor.close();
            result.put("journal", journal);

            // Messages
            JSONArray messages = new JSONArray();
            Cursor mCursor = db.rawQuery("SELECT id, role, content, proposal, applied, created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 40", new String[]{DEFAULT_USER_ID});
            // Reverse to display oldest first
            java.util.ArrayList<JSONObject> list = new java.util.ArrayList<>();
            while (mCursor.moveToNext()) {
                JSONObject m = new JSONObject();
                m.put("id", mCursor.getString(0));
                m.put("role", mCursor.getString(1));
                m.put("content", mCursor.getString(2));
                String prop = mCursor.getString(3);
                if (prop != null && !prop.trim().isEmpty()) {
                    if (prop.trim().startsWith("[")) {
                        m.put("proposal", new JSONArray(prop));
                    } else {
                        JSONObject pObj = new JSONObject(prop);
                        m.put("proposal", pObj.optJSONArray("actions") != null ? pObj.getJSONArray("actions") : JSONObject.NULL);
                    }
                } else {
                    m.put("proposal", JSONObject.NULL);
                }
                m.put("applied", mCursor.getInt(4) == 1);
                m.put("created_at", mCursor.getString(5));
                list.add(m);
            }
            mCursor.close();
            for (int i = list.size() - 1; i >= 0; i--) {
                messages.put(list.get(i));
            }
            result.put("messages", messages);

            // Trackers
            JSONArray trackers = new JSONArray();
            Cursor trCursor = db.rawQuery("SELECT id, title, due_at, done FROM trackers WHERE user_id = ? AND done = 0 ORDER BY created_at DESC LIMIT 50", new String[]{DEFAULT_USER_ID});
            while (trCursor.moveToNext()) {
                JSONObject tr = new JSONObject();
                tr.put("id", trCursor.getString(0));
                tr.put("title", trCursor.getString(1));
                tr.put("due_at", trCursor.isNull(2) ? JSONObject.NULL : trCursor.getString(2));
                tr.put("done", trCursor.getInt(3) == 1);
                trackers.put(tr);
            }
            trCursor.close();
            result.put("trackers", trackers);

            result.put("metrics", listMetrics());
            result.put("metricEntries", listMetricEntries());
            result.put("memories", listMemories(true));

            result.put("aiConfigured", hasKey);
            result.put("keyStorageReady", true);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return result;
    }

    private String requiredText(JSONObject json, String name, int max) throws Exception {
        if (json.isNull(name)) throw new Exception(name + " is required.");
        String value = json.getString(name).trim();
        if (value.isEmpty() || value.length() > max) throw new Exception(name + " must contain 1 to " + max + " characters.");
        return value;
    }

    private String choice(String value, String allowed, String field) throws Exception {
        for (String option : allowed.split("\\|")) if (option.equals(value)) return value;
        throw new Exception("Choose a valid " + field + ".");
    }

    private String limitedText(JSONObject json, String name, int max) throws Exception {
        String value = json.isNull(name) ? "" : json.optString(name, "");
        if (value.length() > max) throw new Exception(name + " must be under " + max + " characters.");
        return value;
    }

    private double finiteNumber(JSONObject json, String field) throws Exception {
        Object raw = json.get(field);
        if (!(raw instanceof Number)) throw new Exception(field + " must be a number.");
        double number = ((Number) raw).doubleValue();
        if (Double.isNaN(number) || Double.isInfinite(number)) throw new Exception(field + " must be a finite number.");
        return number;
    }

    public static String validTimestamp(String value) throws Exception {
        if (value == null || !value.matches("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?(Z|[+-]\\d{2}:\\d{2})$")) {
            throw new Exception("Use a date and time with a timezone.");
        }
        String normalized = value.replaceFirst("Z$", "+00:00");
        normalized = normalized.replaceFirst("\\.(\\d)([+-])", ".$100$2").replaceFirst("\\.(\\d{2})([+-])", ".$10$2");
        String format = normalized.contains(".") ? "yyyy-MM-dd'T'HH:mm:ss.SSSXXX" : "yyyy-MM-dd'T'HH:mm:ssXXX";
        SimpleDateFormat parser = new SimpleDateFormat(format, Locale.US);
        parser.setLenient(false);
        java.text.ParsePosition position = new java.text.ParsePosition(0);
        Date date = parser.parse(normalized, position);
        if (date == null || position.getIndex() != normalized.length()) throw new Exception("Choose a valid date and time.");
        SimpleDateFormat utc = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        utc.setTimeZone(TimeZone.getTimeZone("UTC"));
        return utc.format(date);
    }

    private void requireExists(String table, String id) throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id FROM " + table + " WHERE id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID})) {
            if (!c.moveToFirst()) throw new Exception("This item could not be found. Refresh and try again.");
        }
    }

    public JSONObject createMetric(JSONObject json) throws Exception {
        ContentValues cv = metricValues(json, true);
        validateIntervalUnit(cv.getAsString("type"), cv.getAsString("unit"));
        String id = UUID.randomUUID().toString();
        cv.put("id", id);
        cv.put("user_id", DEFAULT_USER_ID);
        cv.put("created_at", nowIso());
        getWritableDatabase().insertOrThrow("metrics", null, cv);
        return new JSONObject().put("id", id);
    }

    private ContentValues metricValues(JSONObject json, boolean create) throws Exception {
        ContentValues cv = new ContentValues();
        if (create || json.has("title")) cv.put("title", requiredText(json, "title", 240));
        if (create || json.has("type") || json.has("metric_type")) cv.put("type", choice(json.optString("metric_type", json.optString("type", "quantity")), "quantity|duration|count|score|event|yes_no|time_interval", "metric type"));
        if (create || json.has("frequency")) cv.put("frequency", choice(json.optString("frequency", "daily"), "daily|weekly|monthly", "frequency"));
        if (create || json.has("aggregation")) cv.put("aggregation", choice(json.optString("aggregation", "sum"), "sum|average|count|latest|max|streak|percentage", "aggregation"));
        for (String field : new String[]{"unit", "category", "tags", "notes"}) if (create || json.has(field)) cv.put(field, limitedText(json, field, "notes".equals(field) ? 5000 : "tags".equals(field) ? 500 : "category".equals(field) ? 120 : 40));
        if (json.has("goal") && !json.isNull("goal")) {
            double goal = finiteNumber(json, "goal");
            if (goal <= 0) throw new Exception("Goal must be greater than zero, or leave it empty.");
            cv.put("goal", goal);
        }
        else if (create || json.has("goal")) cv.putNull("goal");
        cv.put("updated_at", nowIso());
        return cv;
    }

    public JSONObject updateMetric(String id, JSONObject json) throws Exception {
        requireExists("metrics", id);
        ContentValues cv = metricValues(json, false);
        JSONObject old = queryObjects("SELECT type,unit FROM metrics WHERE id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID}).getJSONObject(0);
        validateIntervalUnit(cv.containsKey("type") ? cv.getAsString("type") : old.getString("type"), cv.containsKey("unit") ? cv.getAsString("unit") : old.getString("unit"));
        getWritableDatabase().update("metrics", cv, "id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        return new JSONObject().put("ok", true);
    }

    private void validateIntervalUnit(String type, String unit) throws Exception {
        if ("time_interval".equals(type) && (unit == null || !unit.trim().toLowerCase(Locale.US).matches("min|mins|minute|minutes|h|hr|hrs|hour|hours|s|sec|secs|second|seconds"))) {
            throw new Exception("Time interval trackers need minutes, hours or seconds as their unit.");
        }
    }

    public JSONObject deleteMetric(String id) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            requireExists("metrics", id);
            db.delete("metric_entries", "metric_id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
            db.delete("metrics", "id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
            db.setTransactionSuccessful();
            return new JSONObject().put("ok", true);
        } finally { db.endTransaction(); }
    }

    private ContentValues entryValues(JSONObject json) throws Exception {
        String metricId = requiredText(json, "metric_id", 200);
        requireExists("metrics", metricId);
        ContentValues cv = new ContentValues();
        cv.put("metric_id", metricId);
        double value = finiteNumber(json, "value");
        JSONObject metric = queryObjects("SELECT type,unit FROM metrics WHERE id = ? AND user_id = ?", new String[]{metricId, DEFAULT_USER_ID}).getJSONObject(0);
        String type = metric.getString("type");
        validateIntervalUnit(type, metric.optString("unit", ""));
        if (("count".equals(type) || "event".equals(type)) && (value < 0 || value != Math.floor(value))) throw new Exception("Counts must be whole numbers of zero or more.");
        if ("yes_no".equals(type) && value != 0 && value != 1) throw new Exception("Use 1 for yes or 0 for no.");
        if ("duration".equals(type) && value < 0) throw new Exception("Duration cannot be negative.");
        String recordedAt = validTimestamp(json.optString("recorded_at", nowIso()));
        cv.put("recorded_at", recordedAt);
        if (json.has("end_at") && !json.isNull("end_at") && !json.optString("end_at").isEmpty()) {
            String endAt = validTimestamp(json.getString("end_at"));
            if (endAt.compareTo(recordedAt) <= 0) throw new Exception("End time must be after start time.");
            cv.put("end_at", endAt);
            if ("time_interval".equals(type)) {
                SimpleDateFormat parser = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                parser.setTimeZone(TimeZone.getTimeZone("UTC"));
                long duration = parser.parse(endAt).getTime() - parser.parse(recordedAt).getTime();
                String unit = metric.optString("unit", "min").trim().toLowerCase(Locale.US);
                value = duration / (unit.matches("h|hr|hrs|hour|hours") ? 3600000.0 : unit.matches("s|sec|secs|second|seconds") ? 1000.0 : 60000.0);
            }
        } else cv.putNull("end_at");
        if ("time_interval".equals(type) && cv.getAsString("end_at") == null) throw new Exception("Choose both a start and end time.");
        cv.put("value", value);
        cv.put("notes", limitedText(json, "notes", 5000));
        cv.put("tags", limitedText(json, "tags", 500));
        return cv;
    }

    public JSONObject createMetricEntry(JSONObject json) throws Exception {
        ContentValues cv = entryValues(json);
        String id = UUID.randomUUID().toString();
        cv.put("id", id);
        cv.put("user_id", DEFAULT_USER_ID);
        getWritableDatabase().insertOrThrow("metric_entries", null, cv);
        return new JSONObject().put("id", id);
    }

    public JSONObject updateMetricEntry(String id, JSONObject patch) throws Exception {
        JSONArray rows = queryObjects("SELECT metric_id,value,recorded_at,end_at,notes,tags FROM metric_entries WHERE id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        if (rows.length() == 0) throw new Exception("This entry could not be found.");
        JSONObject merged = rows.getJSONObject(0);
        java.util.Iterator<String> keys = patch.keys();
        while (keys.hasNext()) { String key = keys.next(); merged.put(key, patch.get(key)); }
        getWritableDatabase().update("metric_entries", entryValues(merged), "id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        return new JSONObject().put("ok", true);
    }

    public JSONObject deleteMetricEntry(String id) throws Exception {
        requireExists("metric_entries", id);
        getWritableDatabase().delete("metric_entries", "id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        return new JSONObject().put("ok", true);
    }

    private ContentValues memoryValues(JSONObject json, boolean create) throws Exception {
        ContentValues cv = new ContentValues();
        if (create || json.has("title")) cv.put("title", requiredText(json, "title", 240));
        if (create || json.has("filename")) {
            String filename = json.optString("filename", "memory.md").trim();
            if (filename.length() > 120 || !filename.matches("^[a-zA-Z0-9][a-zA-Z0-9._-]*\\.md$")) throw new Exception("Use a simple .md filename, such as memory.md.");
            cv.put("filename", filename);
        }
        if (create || json.has("summary")) cv.put("summary", limitedText(json, "summary", 500));
        if (create || json.has("content")) {
            String content = json.optString("content", "");
            if (content.trim().isEmpty() || content.length() > 20000) throw new Exception("Write memory content between 1 and 20,000 characters.");
            cv.put("content", content);
        }
        cv.put("updated_at", nowIso());
        return cv;
    }

    private void requireAvailableMemoryFilename(String filename, String exceptId) throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id FROM memories WHERE filename = ? AND user_id = ? AND id <> ?", new String[]{filename, DEFAULT_USER_ID, exceptId == null ? "" : exceptId})) {
            if (c.moveToFirst()) throw new Exception("A memory file with this filename already exists. Choose another filename or edit the existing memory.");
        }
    }

    public synchronized JSONObject createMemory(JSONObject json) throws Exception {
        ContentValues cv = memoryValues(json, true);
        requireAvailableMemoryFilename(cv.getAsString("filename"), null);
        String id = UUID.randomUUID().toString();
        cv.put("id", id);
        cv.put("user_id", DEFAULT_USER_ID);
        cv.put("created_at", nowIso());
        getWritableDatabase().insertOrThrow("memories", null, cv);
        return new JSONObject().put("id", id);
    }

    public JSONObject getMemory(String id) throws Exception {
        JSONArray rows = queryObjects("SELECT id,filename,title,summary,content,created_at,updated_at FROM memories WHERE id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        if (rows.length() == 0) throw new Exception("This memory file could not be found.");
        return rows.getJSONObject(0);
    }

    public synchronized JSONObject updateMemory(String id, JSONObject json) throws Exception {
        requireExists("memories", id);
        ContentValues cv = memoryValues(json, false);
        if (cv.containsKey("filename")) requireAvailableMemoryFilename(cv.getAsString("filename"), id);
        getWritableDatabase().update("memories", cv, "id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        return new JSONObject().put("ok", true);
    }

    public JSONObject deleteMemory(String id) throws Exception {
        requireExists("memories", id);
        getWritableDatabase().delete("memories", "id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        return new JSONObject().put("ok", true);
    }

    public JSONObject createTask(JSONObject json) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        String id = UUID.randomUUID().toString();
        String now = nowIso();
        ContentValues cv = new ContentValues();
        cv.put("id", id);
        cv.put("user_id", DEFAULT_USER_ID);
        cv.put("title", requiredText(json, "title", 240));
        cv.put("notes", limitedText(json, "notes", 5000));
        cv.put("tag", limitedText(json, "tag", 60));
        cv.put("kind", choice(json.optString("kind", "task"), "task|event", "task kind"));
        cv.put("priority", choice(json.optString("priority", "normal"), "normal|high|low", "priority"));
        if (json.has("due_at") && !json.isNull("due_at") && !json.getString("due_at").isEmpty()) {
            cv.put("due_at", validTimestamp(json.getString("due_at")));
        } else {
            cv.putNull("due_at");
        }
        cv.put("done", 0);
        cv.put("created_at", now);
        cv.put("updated_at", now);
        db.insertOrThrow("tasks", null, cv);
        JSONObject res = new JSONObject();
        res.put("id", id);
        return res;
    }

    public JSONObject updateTask(String id, JSONObject patch) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        requireExists("tasks", id);
        ContentValues cv = new ContentValues();
        String now = nowIso();
        cv.put("updated_at", now);

        if (patch.has("title")) cv.put("title", requiredText(patch, "title", 240));
        if (patch.has("notes")) cv.put("notes", limitedText(patch, "notes", 5000));
        if (patch.has("tag")) cv.put("tag", limitedText(patch, "tag", 60));
        if (patch.has("kind")) cv.put("kind", choice(patch.getString("kind"), "task|event", "task kind"));
        if (patch.has("priority")) cv.put("priority", choice(patch.getString("priority"), "normal|high|low", "priority"));
        if (patch.has("due_at")) {
            if (patch.isNull("due_at") || patch.getString("due_at").isEmpty()) {
                cv.putNull("due_at");
            } else {
                cv.put("due_at", validTimestamp(patch.getString("due_at")));
            }
        }
        if (patch.has("done")) {
            boolean done = patch.getBoolean("done");
            cv.put("done", done ? 1 : 0);
            cv.put("completed_at", done ? now : null);
        }
        db.update("tasks", cv, "id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        JSONObject res = new JSONObject();
        res.put("ok", true);
        return res;
    }

    public JSONObject deleteTask(String id) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        requireExists("tasks", id);
        db.delete("tasks", "id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        JSONObject res = new JSONObject();
        try {
            res.put("ok", true);
        } catch (Exception ignored) {}
        return res;
    }

    public JSONObject createJournal(JSONObject json) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        String id = UUID.randomUUID().toString();
        String now = nowIso();
        ContentValues cv = new ContentValues();
        cv.put("id", id);
        cv.put("user_id", DEFAULT_USER_ID);
        cv.put("body", json.getString("body"));
        if (json.has("summary") && !json.isNull("summary")) cv.put("summary", json.getString("summary"));
        else cv.putNull("summary");
        cv.put("created_at", now);
        db.insertOrThrow("journal", null, cv);
        JSONObject res = new JSONObject();
        res.put("id", id);
        return res;
    }

    public JSONObject updateJournal(String id, JSONObject patch) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        requireExists("journal", id);
        ContentValues cv = new ContentValues();
        if (patch.has("body")) cv.put("body", patch.getString("body"));
        if (patch.has("summary")) {
            if (patch.isNull("summary")) cv.putNull("summary");
            else cv.put("summary", patch.getString("summary"));
        }
        if (cv.size() > 0) db.update("journal", cv, "id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        JSONObject res = new JSONObject();
        res.put("ok", true);
        return res;
    }

    public JSONObject deleteJournal(String id) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        requireExists("journal", id);
        db.delete("journal", "id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        JSONObject res = new JSONObject();
        try {
            res.put("ok", true);
        } catch (Exception ignored) {}
        return res;
    }

    public JSONObject updateProfile(JSONObject profile) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        if (profile.has("name")) cv.put("name", profile.getString("name"));
        if (profile.has("role")) cv.put("role", profile.getString("role"));
        if (profile.has("context")) cv.put("context", profile.getString("context"));
        if (profile.has("goals")) cv.put("goals", profile.getString("goals"));
        if (profile.has("timezone")) cv.put("timezone", profile.getString("timezone"));
        cv.put("onboarded", 1);
        db.update("users", cv, "id = ?", new String[]{DEFAULT_USER_ID});
        JSONObject res = new JSONObject();
        res.put("ok", true);
        return res;
    }

    public JSONObject updateTracker(String id, JSONObject body) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        if (body.has("done")) {
            cv.put("done", body.getBoolean("done") ? 1 : 0);
        }
        int rows = db.update("trackers", cv, "id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        if (rows == 0) {
            throw new Exception("This check-in could not be found.");
        }
        JSONObject res = new JSONObject();
        res.put("ok", true);
        return res;
    }

    public String saveMessage(String role, String content, String proposalJson) {
        SQLiteDatabase db = getWritableDatabase();
        String id = UUID.randomUUID().toString();
        ContentValues cv = new ContentValues();
        cv.put("id", id);
        cv.put("user_id", DEFAULT_USER_ID);
        cv.put("role", role);
        cv.put("content", content);
        cv.put("proposal", proposalJson);
        cv.put("applied", 0);
        cv.put("created_at", nowIso());
        db.insertOrThrow("messages", null, cv);
        return id;
    }

    public JSONObject saveConversation(String message, String reply, JSONArray actions) throws Exception {
        return saveConversation(message, reply, actions, nowIso());
    }

    public JSONObject saveConversation(String message, String reply, JSONArray actions, String sentAt) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            String userId = saveMessage("user", message, null);
            ContentValues sentTimestamp = new ContentValues();
            sentTimestamp.put("created_at", validTimestamp(sentAt));
            db.update("messages", sentTimestamp, "id = ?", new String[]{userId});
            String id = saveMessage("assistant", reply, actions.toString());
            // Keep the pair in order even when both inserts share a millisecond.
            ContentValues timestamp = new ContentValues();
            SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            dateFormat.setTimeZone(TimeZone.getTimeZone("UTC"));
            timestamp.put("created_at", dateFormat.format(new Date(System.currentTimeMillis() + 1)));
            db.update("messages", timestamp, "id = ?", new String[]{id});
            JSONObject result = new JSONObject().put("id", id).put("userId", userId)
                .put("reply", reply).put("actions", actions);
            db.setTransactionSuccessful();
            return result;
        } finally { db.endTransaction(); }
    }

    public JSONObject clearMessages() throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        int deleted = db.delete("messages", "user_id = ?", new String[]{DEFAULT_USER_ID});
        JSONObject res = new JSONObject();
        res.put("ok", true);
        res.put("cleared", true);
        res.put("count", deleted);
        return res;
    }

    public synchronized JSONObject applyProposal(String messageId) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        Cursor c = db.rawQuery("SELECT proposal, applied FROM messages WHERE id = ? AND user_id = ?", new String[]{messageId, DEFAULT_USER_ID});
        if (!c.moveToFirst()) {
            c.close();
            throw new Exception("This plan could not be found.");
        }
        int applied = c.getInt(1);
        if (applied == 1) {
            c.close();
            JSONObject res = new JSONObject();
            res.put("ok", true);
            res.put("alreadyApplied", true);
            return res;
        }
        String proposalStr = c.getString(0);
        c.close();

        if (proposalStr == null || proposalStr.isEmpty()) {
            JSONObject res = new JSONObject();
            res.put("ok", true);
            res.put("count", 0);
            return res;
        }

        JSONArray actions;
        if (proposalStr.trim().startsWith("[")) {
            actions = new JSONArray(proposalStr);
        } else {
            JSONObject prop = new JSONObject(proposalStr);
            actions = prop.optJSONArray("actions");
            if (actions == null) actions = new JSONArray();
        }

        db.beginTransaction();
        try {
            java.util.HashMap<Integer, String> createdMetrics = new java.util.HashMap<>();
            for (int i = 0; i < actions.length(); i++) {
                JSONObject a = actions.getJSONObject(i);
                String type = a.optString("type", "");
                JSONObject fields = new JSONObject(a.toString());
                fields.remove("type");
                switch (type) {
                    case "task": createTask(fields); break;
                    case "task_update": updateTask(a.getString("id"), fields); break;
                    case "task_delete": deleteTask(a.getString("id")); break;
                    case "journal": createJournal(fields); break;
                    case "journal_update": updateJournal(a.getString("id"), fields); break;
                    case "journal_delete": deleteJournal(a.getString("id")); break;
                    case "profile": updateProfile(fields); break;
                    case "metric": createdMetrics.put(i, createMetric(fields).getString("id")); break;
                    case "tracker":
                        ContentValues followup = new ContentValues();
                        followup.put("id", UUID.randomUUID().toString());
                        followup.put("user_id", DEFAULT_USER_ID);
                        followup.put("title", requiredText(fields, "title", 500));
                        if (fields.has("due_at") && !fields.isNull("due_at")) followup.put("due_at", validTimestamp(fields.getString("due_at")));
                        followup.put("done", 0);
                        followup.put("created_at", nowIso());
                        db.insertOrThrow("trackers", null, followup);
                        break;
                    case "metric_update": updateMetric(a.getString("id"), fields); break;
                    case "metric_delete": deleteMetric(a.getString("id")); break;
                    case "metric_entry":
                        if (a.has("metric_ref")) {
                            String metricId = createdMetrics.get(a.getInt("metric_ref"));
                            if (metricId == null) throw new Exception("The entry must refer to an earlier tracker creation action.");
                            fields.put("metric_id", metricId);
                        }
                        createMetricEntry(fields); break;
                    case "metric_entry_update": updateMetricEntry(a.getString("id"), fields); break;
                    case "metric_entry_delete": deleteMetricEntry(a.getString("id")); break;
                    case "memory": createMemory(fields); break;
                    case "memory_update": updateMemory(a.getString("id"), fields); break;
                    case "memory_delete": deleteMemory(a.getString("id")); break;
                    default: throw new Exception("This plan contains an unsupported action. Ask the assistant to try again.");
                }
            }

            ContentValues msgCv = new ContentValues();
            msgCv.put("applied", 1);
            db.update("messages", msgCv, "id = ? AND user_id = ?", new String[]{messageId, DEFAULT_USER_ID});

            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }

        JSONObject res = new JSONObject();
        res.put("ok", true);
        res.put("count", actions.length());
        return res;
    }

    public JSONObject getAiContext() {
        JSONObject ctx = new JSONObject();
        SQLiteDatabase db = getReadableDatabase();
        try {
            ctx.put("now", nowIso());

            // Profile
            JSONObject profile = new JSONObject();
            Cursor u = db.rawQuery("SELECT name, role, context, goals, timezone FROM users WHERE id = ?", new String[]{DEFAULT_USER_ID});
            if (u.moveToFirst()) {
                profile.put("name", u.getString(0));
                profile.put("role", u.getString(1));
                profile.put("context", u.getString(2));
                profile.put("goals", u.getString(3));
                profile.put("timezone", u.getString(4));
            }
            u.close();
            ctx.put("profile", profile);

            // Tasks
            JSONArray tasks = new JSONArray();
            Cursor t = db.rawQuery("SELECT title, substr(notes, 1, 400), tag, kind, priority, due_at, done, id, completed_at FROM tasks WHERE user_id = ? ORDER BY done ASC, CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC LIMIT 100", new String[]{DEFAULT_USER_ID});
            while (t.moveToNext()) {
                JSONObject item = new JSONObject();
                item.put("title", t.getString(0));
                item.put("notes", t.getString(1));
                item.put("tag", t.getString(2));
                item.put("kind", t.getString(3));
                item.put("priority", t.getString(4));
                item.put("due_at", t.isNull(5) ? JSONObject.NULL : t.getString(5));
                item.put("done", t.getInt(6) == 1);
                item.put("id", t.getString(7));
                item.put("completed_at", t.isNull(8) ? JSONObject.NULL : t.getString(8));
                tasks.put(item);
            }
            t.close();
            ctx.put("tasks", tasks);

            // Journal
            JSONArray journal = new JSONArray();
            Cursor j = db.rawQuery("SELECT substr(body, 1, 1200), substr(summary, 1, 600), created_at, id FROM journal WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", new String[]{DEFAULT_USER_ID});
            while (j.moveToNext()) {
                JSONObject item = new JSONObject();
                item.put("body", j.getString(0));
                item.put("summary", j.isNull(1) ? JSONObject.NULL : j.getString(1));
                item.put("created_at", j.getString(2));
                item.put("id", j.getString(3));
                journal.put(item);
            }
            j.close();
            ctx.put("journal", journal);

            // History
            JSONArray history = new JSONArray();
            Cursor h = db.rawQuery("SELECT role, substr(content, 1, 1500), applied, created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 12", new String[]{DEFAULT_USER_ID});
            java.util.ArrayList<JSONObject> hList = new java.util.ArrayList<>();
            while (h.moveToNext()) {
                JSONObject item = new JSONObject();
                item.put("role", h.getString(0));
                item.put("content", h.getString(1));
                item.put("applied", h.getInt(2) == 1);
                item.put("sent_at", h.getString(3));
                hList.add(item);
            }
            h.close();
            for (int i = hList.size() - 1; i >= 0; i--) {
                history.put(hList.get(i));
            }
            ctx.put("history", history);

            // Trackers
            JSONArray trackers = new JSONArray();
            Cursor tr = db.rawQuery("SELECT title, due_at FROM trackers WHERE user_id = ? AND done = 0 LIMIT 20", new String[]{DEFAULT_USER_ID});
            while (tr.moveToNext()) {
                JSONObject item = new JSONObject();
                item.put("title", tr.getString(0));
                item.put("due_at", tr.isNull(1) ? JSONObject.NULL : tr.getString(1));
                trackers.put(item);
            }
            tr.close();
            ctx.put("followups", trackers);
            ctx.put("metrics", listMetrics());
            ctx.put("metricEntries", queryObjects("SELECT id,metric_id,value,recorded_at,end_at,notes,tags FROM metric_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 200", new String[]{DEFAULT_USER_ID}));
            ctx.put("memoryCatalog", listMemories(false));
        } catch (Exception e) {
            e.printStackTrace();
        }
        return ctx;
    }
}
