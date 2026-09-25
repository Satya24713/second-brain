package dev.satya.secondbrain;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class AndroidBridge {
    private static final String PREFS_NAME = "second_brain_prefs";
    private static final String PREF_GEMINI_KEY = "gemini_api_key";
    private static final String DEFAULT_MODEL = "gemini-3.5-flash-lite";
    private static final String[] CANDIDATE_MODELS = {
        "gemini-3.5-flash-lite",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash"
    };

    private final Context context;
    private final DatabaseHelper dbHelper;
    private final SharedPreferences prefs;
    private final WebView webView;
    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private final AtomicBoolean assistantBusy = new AtomicBoolean(false);
    private volatile boolean closed = false;

    public AndroidBridge(Context context, DatabaseHelper dbHelper, WebView webView) {
        this.context = context;
        this.dbHelper = dbHelper;
        this.webView = webView;
        this.prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    // Return to JavaScript immediately so the WebView can paint the sent message.
    @JavascriptInterface
    public void handleApiAsync(String requestId, String path, String method, String bodyJson) {
        if (closed) return;
        executor.execute(() -> {
            boolean chat = "assistant".equals(path) && "POST".equalsIgnoreCase(method);
            boolean acquired = false;
            try {
                if (chat) {
                    acquired = assistantBusy.compareAndSet(false, true);
                    if (!acquired) throw new Exception("A reply is already being generated.");
                }
                JSONObject result = chat
                    ? assistant(new JSONObject(bodyJson), text -> emitChunk(requestId, text))
                    : new JSONObject(handleApi(path, method, bodyJson));
                if (result.has("error")) throw new Exception(result.getString("error"));
                emit(requestId, new JSONObject().put("type", "done").put("result", result));
            } catch (Exception error) {
                try { emit(requestId, new JSONObject().put("type", "error").put("error", error.getMessage() == null ? "Could not complete the request." : error.getMessage())); }
                catch (Exception ignored) { }
            } finally {
                if (acquired) assistantBusy.set(false);
            }
        });
    }

    private void emitChunk(String requestId, String text) {
        try { emit(requestId, new JSONObject().put("type", "chunk").put("text", text)); }
        catch (Exception ignored) { }
    }

    private void emit(String requestId, JSONObject event) {
        if (closed) return;
        // JSON quoting prevents model text from being interpreted as JavaScript.
        String script = "window.onAndroidApiEvent && window.onAndroidApiEvent("
            + JSONObject.quote(requestId) + "," + event.toString() + ");";
        webView.post(() -> { if (!closed) webView.evaluateJavascript(script, null); });
    }

    public void close() {
        closed = true;
        executor.shutdown();
        new Thread(() -> {
            try { executor.awaitTermination(180, java.util.concurrent.TimeUnit.SECONDS); }
            catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            dbHelper.close();
        }, "second-brain-cleanup").start();
    }

    private interface ChunkListener { void accept(String text); }

    private JSONObject assistant(JSONObject body, ChunkListener listener) throws Exception {
        String key = getGeminiKey();
        if (key == null || key.isEmpty()) throw new Exception("Connect Gemini in Settings to start a conversation.");
        String message = body.getString("message").trim();
        if (message.isEmpty() || message.length() > 6000) throw new Exception("Use a message between 1 and 6000 characters.");
        JSONObject result = callGeminiAssistant(key, message, dbHelper.getAiContext(), listener);
        String reply = result.getString("reply");
        JSONArray actions = result.getJSONArray("actions");
        if (reply.trim().isEmpty() || actions.length() > 12) throw new Exception("Gemini returned an incomplete plan. Try again.");
        return dbHelper.saveConversation(message, reply, actions);
    }

    private String getGeminiKey() {
        return prefs.getString(PREF_GEMINI_KEY, null);
    }

    private boolean hasGeminiKey() {
        String key = getGeminiKey();
        return key != null && !key.trim().isEmpty();
    }

    @JavascriptInterface
    public String handleApi(String path, String method, String bodyJson) {
        try {
            if (path == null) path = "";
            if (method == null) method = "GET";
            method = method.toUpperCase();
            JSONObject body = (bodyJson != null && !bodyJson.trim().isEmpty() && !bodyJson.equals("null"))
                    ? new JSONObject(bodyJson) : new JSONObject();

            if ("workspace".equals(path) && "GET".equals(method)) {
                return dbHelper.getWorkspaceData(hasGeminiKey()).toString();
            }

            if ("tasks".equals(path) && "POST".equals(method)) {
                return dbHelper.createTask(body).toString();
            }

            if (path.startsWith("tasks/")) {
                String id = path.substring("tasks/".length());
                if ("PATCH".equals(method)) {
                    return dbHelper.updateTask(id, body).toString();
                } else if ("DELETE".equals(method)) {
                    return dbHelper.deleteTask(id).toString();
                }
            }

            if ("journal".equals(path) && "POST".equals(method)) {
                return dbHelper.createJournal(body).toString();
            }

            if (path.startsWith("journal/")) {
                String id = path.substring("journal/".length());
                if ("PATCH".equals(method)) {
                    return dbHelper.updateJournal(id, body).toString();
                } else if ("DELETE".equals(method)) {
                    return dbHelper.deleteJournal(id).toString();
                }
            }

            if ("profile".equals(path) && ("POST".equals(method) || "PATCH".equals(method))) {
                return dbHelper.updateProfile(body).toString();
            }

            if ("settings/gemini".equals(path)) {
                if ("DELETE".equals(method) || body.optBoolean("disconnect", false)) {
                    prefs.edit().remove(PREF_GEMINI_KEY).apply();
                    JSONObject res = new JSONObject();
                    res.put("ok", true);
                    res.put("connected", false);
                    return res.toString();
                }

                if ("PUT".equals(method) || "POST".equals(method)) {
                    String key = body.optString("key", "").trim();
                    if (key.isEmpty() || key.length() < 20) {
                        return errorJson("Please enter your full Gemini API key.");
                    }

                    // Validate key with Gemini
                    String valErr = testGeminiKey(key);
                    if (valErr != null) {
                        return errorJson(valErr);
                    }

                    prefs.edit().putString(PREF_GEMINI_KEY, key).apply();
                    JSONObject res = new JSONObject();
                    res.put("ok", true);
                    res.put("connected", true);
                    return res.toString();
                }

                return errorJson("Method " + method + " not supported for settings/gemini");
            }

            if (path.startsWith("trackers/")) {
                String id = path.substring("trackers/".length());
                if ("PATCH".equals(method)) {
                    return dbHelper.updateTracker(id, body).toString();
                }
            }

            if ("assistant".equals(path) && "POST".equals(method)) {
                return assistant(body, text -> {}).toString();
            }

            if ("assistant/apply".equals(path) && "POST".equals(method)) {
                String messageId = body.getString("messageId");
                return dbHelper.applyProposal(messageId).toString();
            }

            if (("assistant".equals(path) && "DELETE".equals(method)) ||
                ("assistant/clear".equals(path) && ("POST".equals(method) || "DELETE".equals(method)))) {
                return dbHelper.clearMessages().toString();
            }

            return errorJson("Endpoint not found: " + path);
        } catch (Exception e) {
            e.printStackTrace();
            return errorJson(e.getMessage() != null ? e.getMessage() : "An unexpected error occurred.");
        }
    }

    private String errorJson(String message) {
        try {
            JSONObject err = new JSONObject();
            err.put("error", message);
            return err.toString();
        } catch (Exception e) {
            return "{\"error\":\"Error processing request\"}";
        }
    }

    private String testGeminiKey(String key) {
        try {
            URL url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("x-goog-api-key", key);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                return null;
            }
            InputStream is = conn.getErrorStream();
            if (is != null) {
                try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                    try {
                        JSONObject errObj = new JSONObject(sb.toString());
                        if (errObj.has("error")) {
                            JSONObject inner = errObj.getJSONObject("error");
                            String msg = inner.optString("message", "");
                            if (!msg.isEmpty()) return msg;
                        }
                    } catch (Exception ignored) {}
                }
            }
            if (code == 400 || code == 401 || code == 403) {
                return "Gemini could not use this key (HTTP " + code + "). Check the key and its project permissions.";
            }
            return "Gemini returned error HTTP " + code + ". Please verify your key.";
        } catch (Exception e) {
            e.printStackTrace();
            return "Could not reach Gemini service: " + e.getMessage() + ". Check your internet connection.";
        }
    }

    private JSONObject callGeminiAssistant(String key, String userPrompt, JSONObject contextObj, ChunkListener listener) throws Exception {
        String systemPrompt = "You are Second Brain, a calm, practical personal planning assistant. Use short natural sentences. " +
                "Ask at most one focused question at a time. Support the user's agency; avoid guilt or diagnoses. " +
                "Help capture tasks, plan Today, prepare for tests/events, and reflect on journal entries. " +
                "Learn their role, school/college/work context and goals conversationally. Categories/tags are freeform: reuse user words. " +
                "Preserve raw journal writing verbatim; put any concise reflection in summary. " +
                "Never invent user facts: actions are proposals until applied. Do not propose duplicates of existing tasks. " +
                "Ask to clarify ambiguous dates; due_at must be an ISO timestamp with explicit offset or null for undated items. " +
                "Return JSON with {reply, actions}, with reply first. " +
                "For each action, include type ('task', 'journal', 'profile', 'tracker'). " +
                "For type task: include title, notes, tag, kind ('task' or 'event'), priority ('normal' for medium, 'high' for urgent, or 'low'), due_at. " +
                "For journal: include type, body, summary. " +
                "For profile: include type and actually changed fields (name, role, context, goals). " +
                "For tracker: include type, title, due_at. " +
                "Maximum 12 small, useful actions. If no actions are needed, actions should be []. " +
                "CONTEXT: " + contextObj.toString();

        JSONObject root = new JSONObject();
        JSONObject systemInstruction = new JSONObject();
        JSONArray sysParts = new JSONArray();
        sysParts.put(new JSONObject().put("text", systemPrompt));
        systemInstruction.put("parts", sysParts);
        root.put("systemInstruction", systemInstruction);

        JSONArray contents = new JSONArray();
        JSONObject userMsg = new JSONObject();
        userMsg.put("role", "user");
        JSONArray userParts = new JSONArray();
        userParts.put(new JSONObject().put("text", userPrompt));
        userMsg.put("parts", userParts);
        contents.put(userMsg);
        root.put("contents", contents);

        JSONObject genConfig = new JSONObject();
        genConfig.put("temperature", 0.35);
        genConfig.put("maxOutputTokens", 6000);
        genConfig.put("responseMimeType", "application/json");
        root.put("generationConfig", genConfig);

        byte[] postBytes = root.toString().getBytes(StandardCharsets.UTF_8);

        for (String model : CANDIDATE_MODELS) {
            HttpURLConnection conn = null;
            try {
                URL url = new URL("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":streamGenerateContent?alt=sse");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Accept", "text/event-stream");
                conn.setRequestProperty("x-goog-api-key", key);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(60000);
                conn.setDoOutput(true);
                try (OutputStream os = conn.getOutputStream()) { os.write(postBytes); }
                int statusCode = conn.getResponseCode();
                if (statusCode == 404) continue;
                if (statusCode == 429) throw new Exception("Gemini is at its usage limit. Please try again later.");
                if (statusCode == 400 || statusCode == 401 || statusCode == 403)
                    throw new Exception("Gemini could not use this key. Check it in Settings.");
                if (statusCode != 200) throw new Exception("Gemini is temporarily unavailable. Please try again.");
                StringBuilder raw = new StringBuilder();
                StringBuilder event = new StringBuilder();
                String finish = "";
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (line.isEmpty() && event.length() > 0) {
                            String reason = consumeEvent(event.toString(), raw, listener);
                            if (!reason.isEmpty()) finish = reason;
                            event.setLength(0);
                        } else if (line.startsWith("data:")) {
                            if (event.length() > 0) event.append('\n');
                            event.append(line.substring(5).trim());
                        }
                    }
                    if (event.length() > 0) {
                        String reason = consumeEvent(event.toString(), raw, listener);
                        if (!reason.isEmpty()) finish = reason;
                    }
                }
                if (!"STOP".equals(finish)) throw new Exception("The reply was interrupted. Please try again.");
                return new JSONObject(raw.toString());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
        throw new Exception("The Gemini model is unavailable. Please try again later.");
    }

    private String consumeEvent(String event, StringBuilder raw, ChunkListener listener) throws Exception {
        JSONObject packet = new JSONObject(event);
        JSONObject feedback = packet.optJSONObject("promptFeedback");
        if (packet.has("error") || (feedback != null && feedback.has("blockReason")))
            throw new Exception("Gemini could not complete the reply. Try rephrasing your message.");
        JSONArray candidates = packet.optJSONArray("candidates");
        if (candidates == null || candidates.length() == 0) return "";
        JSONObject candidate = candidates.getJSONObject(0);
        JSONObject content = candidate.optJSONObject("content");
        JSONArray parts = content == null ? null : content.optJSONArray("parts");
        if (parts != null) for (int i = 0; i < parts.length(); i++) {
            JSONObject part = parts.getJSONObject(i);
            if (part.optBoolean("thought", false)) continue;
            String text = part.optString("text", "");
            if (!text.isEmpty()) {
                raw.append(text);
                if (raw.length() > 100000) throw new Exception("The reply was too long. Try a smaller request.");
                listener.accept(text);
            }
        }
        return candidate.optString("finishReason", "");
    }
}
