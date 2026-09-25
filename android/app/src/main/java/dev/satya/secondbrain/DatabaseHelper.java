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
    private static final int DATABASE_VERSION = 1;
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

            result.put("aiConfigured", hasKey);
            result.put("keyStorageReady", true);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return result;
    }

    public JSONObject createTask(JSONObject json) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        String id = UUID.randomUUID().toString();
        String now = nowIso();
        ContentValues cv = new ContentValues();
        cv.put("id", id);
        cv.put("user_id", DEFAULT_USER_ID);
        cv.put("title", json.getString("title"));
        cv.put("notes", json.optString("notes", ""));
        cv.put("tag", json.optString("tag", ""));
        cv.put("kind", json.optString("kind", "task"));
        cv.put("priority", json.optString("priority", "normal"));
        if (json.has("due_at") && !json.isNull("due_at") && !json.getString("due_at").isEmpty()) {
            cv.put("due_at", json.getString("due_at"));
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
        ContentValues cv = new ContentValues();
        String now = nowIso();
        cv.put("updated_at", now);

        if (patch.has("title")) cv.put("title", patch.getString("title"));
        if (patch.has("notes")) cv.put("notes", patch.getString("notes"));
        if (patch.has("tag")) cv.put("tag", patch.getString("tag"));
        if (patch.has("kind")) cv.put("kind", patch.getString("kind"));
        if (patch.has("priority")) cv.put("priority", patch.getString("priority"));
        if (patch.has("due_at")) {
            if (patch.isNull("due_at") || patch.getString("due_at").isEmpty()) {
                cv.putNull("due_at");
            } else {
                cv.put("due_at", patch.getString("due_at"));
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

    public JSONObject deleteTask(String id) {
        SQLiteDatabase db = getWritableDatabase();
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
        cv.putNull("summary");
        cv.put("created_at", now);
        db.insertOrThrow("journal", null, cv);
        JSONObject res = new JSONObject();
        res.put("id", id);
        return res;
    }

    public JSONObject updateJournal(String id, JSONObject patch) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        if (patch.has("body")) cv.put("body", patch.getString("body"));
        db.update("journal", cv, "id = ? AND user_id = ?", new String[]{id, DEFAULT_USER_ID});
        JSONObject res = new JSONObject();
        res.put("ok", true);
        return res;
    }

    public JSONObject deleteJournal(String id) {
        SQLiteDatabase db = getWritableDatabase();
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
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            String userId = saveMessage("user", message, null);
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

    public JSONObject applyProposal(String messageId) throws Exception {
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

        String now = nowIso();
        db.beginTransaction();
        try {
            for (int i = 0; i < actions.length(); i++) {
                JSONObject a = actions.getJSONObject(i);
                String type = a.optString("type", "");
                String actionId = messageId + "-" + i;

                if ("task".equals(type)) {
                    ContentValues cv = new ContentValues();
                    cv.put("id", actionId);
                    cv.put("user_id", DEFAULT_USER_ID);
                    cv.put("title", a.getString("title"));
                    cv.put("notes", a.optString("notes", ""));
                    cv.put("tag", a.optString("tag", ""));
                    cv.put("kind", a.optString("kind", "task"));
                    cv.put("priority", a.optString("priority", "normal"));
                    if (a.has("due_at") && !a.isNull("due_at") && !a.getString("due_at").isEmpty()) {
                        cv.put("due_at", a.getString("due_at"));
                    } else {
                        cv.putNull("due_at");
                    }
                    cv.put("done", 0);
                    cv.put("created_at", now);
                    cv.put("updated_at", now);
                    db.insertWithOnConflict("tasks", null, cv, SQLiteDatabase.CONFLICT_IGNORE);
                } else if ("journal".equals(type)) {
                    ContentValues cv = new ContentValues();
                    cv.put("id", actionId);
                    cv.put("user_id", DEFAULT_USER_ID);
                    cv.put("body", a.getString("body"));
                    cv.put("summary", a.optString("summary", null));
                    cv.put("created_at", now);
                    db.insertWithOnConflict("journal", null, cv, SQLiteDatabase.CONFLICT_IGNORE);
                } else if ("tracker".equals(type)) {
                    ContentValues cv = new ContentValues();
                    cv.put("id", actionId);
                    cv.put("user_id", DEFAULT_USER_ID);
                    cv.put("title", a.getString("title"));
                    cv.put("due_at", a.optString("due_at", null));
                    cv.put("done", 0);
                    cv.put("created_at", now);
                    db.insertWithOnConflict("trackers", null, cv, SQLiteDatabase.CONFLICT_IGNORE);
                } else if ("profile".equals(type)) {
                    ContentValues cv = new ContentValues();
                    if (a.has("name")) cv.put("name", a.getString("name"));
                    if (a.has("role")) cv.put("role", a.getString("role"));
                    if (a.has("context")) cv.put("context", a.getString("context"));
                    if (a.has("goals")) cv.put("goals", a.getString("goals"));
                    if (cv.size() > 0) {
                        cv.put("onboarded", 1);
                        db.update("users", cv, "id = ?", new String[]{DEFAULT_USER_ID});
                    }
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
            Cursor t = db.rawQuery("SELECT title, substr(notes, 1, 400), tag, kind, priority, due_at, done FROM tasks WHERE user_id = ? ORDER BY done ASC, CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC LIMIT 75", new String[]{DEFAULT_USER_ID});
            while (t.moveToNext()) {
                JSONObject item = new JSONObject();
                item.put("title", t.getString(0));
                item.put("notes", t.getString(1));
                item.put("tag", t.getString(2));
                item.put("kind", t.getString(3));
                item.put("priority", t.getString(4));
                item.put("due_at", t.isNull(5) ? JSONObject.NULL : t.getString(5));
                item.put("done", t.getInt(6) == 1);
                tasks.put(item);
            }
            t.close();
            ctx.put("tasks", tasks);

            // Journal
            JSONArray journal = new JSONArray();
            Cursor j = db.rawQuery("SELECT substr(body, 1, 1200), substr(summary, 1, 600), created_at FROM journal WHERE user_id = ? ORDER BY created_at DESC LIMIT 5", new String[]{DEFAULT_USER_ID});
            while (j.moveToNext()) {
                JSONObject item = new JSONObject();
                item.put("body", j.getString(0));
                item.put("summary", j.isNull(1) ? JSONObject.NULL : j.getString(1));
                item.put("created_at", j.getString(2));
                journal.put(item);
            }
            j.close();
            ctx.put("journal", journal);

            // History
            JSONArray history = new JSONArray();
            Cursor h = db.rawQuery("SELECT role, substr(content, 1, 1500), applied FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 12", new String[]{DEFAULT_USER_ID});
            java.util.ArrayList<JSONObject> hList = new java.util.ArrayList<>();
            while (h.moveToNext()) {
                JSONObject item = new JSONObject();
                item.put("role", h.getString(0));
                item.put("content", h.getString(1));
                item.put("applied", h.getInt(2) == 1);
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
        } catch (Exception e) {
            e.printStackTrace();
        }
        return ctx;
    }
}
