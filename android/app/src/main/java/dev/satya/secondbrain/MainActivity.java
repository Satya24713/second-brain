package dev.satya.secondbrain;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.content.Intent;
import android.widget.Toast;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private DatabaseHelper dbHelper;
    private AndroidBridge bridge;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingExport;
    private static final int PICK_MEMORY = 501;
    private static final int EXPORT_MEMORY = 502;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Light status bar
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
            window.setStatusBarColor(Color.parseColor("#FCFCFD"));
        }

        dbHelper = new DatabaseHelper(this);

        FrameLayout root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        root.setBackgroundColor(Color.parseColor("#FCFCFD"));

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/res/", new WebViewAssetLoader.ResourcesPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && uri.getHost() != null && uri.getHost().contains("appassets.androidplatform.net")) {
                    return false;
                }
                // External links (e.g. AI studio key)
                try {
                    android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW, uri);
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("*/*");
                try { startActivityForResult(picker, PICK_MEMORY); }
                catch (Exception e) { fileCallback.onReceiveValue(null); fileCallback = null; }
                return true;
            }
        });

        bridge = new AndroidBridge(this, dbHelper, webView);
        webView.addJavascriptInterface(bridge, "AndroidBridge");

        // Back button support
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });

        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }

    public void exportMemoryFile(String filename, String content) {
        if (filename == null || !filename.matches("[a-zA-Z0-9][a-zA-Z0-9._-]*\\.md") || content == null || content.length() > 20000) return;
        runOnUiThread(() -> {
            pendingExport = content;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("text/markdown");
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            try { startActivityForResult(intent, EXPORT_MEMORY); }
            catch (Exception e) { pendingExport = null; Toast.makeText(this, "Could not open file picker", Toast.LENGTH_SHORT).show(); }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_MEMORY && fileCallback != null) {
            Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
            fileCallback.onReceiveValue(uri == null ? null : new Uri[]{uri});
            fileCallback = null;
        }
        if (requestCode == EXPORT_MEMORY) {
            String content = pendingExport; pendingExport = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || content == null) return;
            try (java.io.OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                if (output == null) throw new java.io.IOException("No output");
                output.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                Toast.makeText(this, "Memory file saved", Toast.LENGTH_SHORT).show();
            } catch (Exception e) { Toast.makeText(this, "Could not save memory file", Toast.LENGTH_SHORT).show(); }
        }
    }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.close();
        super.onDestroy();
    }
}
