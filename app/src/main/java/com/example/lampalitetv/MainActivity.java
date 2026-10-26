package com.example.lampalitetv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.RenderProcessGoneDetail;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import android.webkit.CookieManager;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.nio.charset.StandardCharsets;

/** Minimal Android TV WebView host; no forced frame loop, layer type or Chromium flags. */
public final class MainActivity extends Activity {
    private static final String TAG = "LampaLiteTV";
    private static final String START_URL = "http://lampa.mx";
    private String logoCompositorScript;
    private String defaultExtensionsScript;
    private String catalogCustomizationScript;
    private String rezkaTransportScript;
    private final ExecutorService rezkaWorker = new java.util.concurrent.ThreadPoolExecutor(
            1, 1, 0, java.util.concurrent.TimeUnit.MILLISECONDS,
            new java.util.concurrent.ArrayBlockingQueue<>(16));
    private FrameLayout root;
    private WebView webView;
    private View videoView;
    private WebChromeClient.CustomViewCallback videoCallback;
    private boolean hideOverscroll = true;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setBackgroundDrawableResource(android.R.color.black);
        setFullscreen();
        // Remove the global CSS override from 1.3/1.4: it hid catalog rows.
        getPreferences(MODE_PRIVATE).edit().remove("reducedMotion").apply();
        hideOverscroll = getPreferences(MODE_PRIVATE).getBoolean("hideOverscroll", true);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        logoCompositorScript = readPageScript("logo-compositor.js");
        defaultExtensionsScript = readPageScript("default-extensions.js");
        catalogCustomizationScript = readPageScript("catalog-customization.js");
        rezkaTransportScript = readPageScript("rezka-transport.js");
        createWebView(state);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView(Bundle state) {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setVerticalScrollBarEnabled(false);
        // TCL C645 (Android 11): avoid Android overscroll glow and fading edges on D-pad scroll.
        // These effects do not belong to Lampa content and add extra view invalidations.
        webView.setOverScrollMode(hideOverscroll ? View.OVER_SCROLL_NEVER : View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        webView.setVerticalFadingEdgeEnabled(false);
        webView.setHorizontalFadingEdgeEnabled(false);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportZoom(false);
        // Keep the platform's default GPU layer, cache policy and renderer scheduling.
        webView.setWebViewClient(new WebViewClient() {

            @Override public void onPageCommitVisible(WebView view, String url) {
                applyPageEnhancements(view);
            }

            @Override public void onPageFinished(WebView view, String url) {
                applyPageEnhancements(view);
            }

            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    Toast.makeText(MainActivity.this, "Не удалось загрузить Lampa. Проверьте сеть.", Toast.LENGTH_LONG).show();
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("lampalite".equals(scheme) && "rezka-request".equals(uri.getHost())) {
                    Uri page = Uri.parse(view.getUrl() == null ? "" : view.getUrl());
                    String id = uri.getQueryParameter("id");
                    if (request.isForMainFrame() && "lampa.mx".equals(page.getHost())
                            && id != null && id.matches("[a-f0-9]{32}")) startRezkaRequest(id);
                    return true;
                }
                // Keep all HTTP(S) navigation inside the same WebView.
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) return false;
                // Only delegate recognised media-app deep link protocols. No intent:// arbitrary fallback.
                if ("magnet".equalsIgnoreCase(scheme) || "acestream".equalsIgnoreCase(scheme)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
                    } catch (ActivityNotFoundException ex) {
                        Toast.makeText(MainActivity.this, "Нет приложения для этой ссылки", Toast.LENGTH_SHORT).show();
                    }
                }
                return true;
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                Log.e(TAG, "WebView renderer exited; didCrash=" + detail.didCrash());
                if (videoView != null) exitVideo();
                root.removeView(view);
                view.destroy();
                webView = null;
                new AlertDialog.Builder(MainActivity.this)
                    .setTitle("WebView остановился")
                    .setMessage("Можно перезапустить страницу Lampa без переустановки приложения.")
                    .setPositiveButton("Перезапустить", (dialog, which) -> createWebView(null))
                    .setNegativeButton("Закрыть", (dialog, which) -> finish())
                    .setCancelable(false)
                    .show();
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (videoView != null) { callback.onCustomViewHidden(); return; }
                videoView = view;
                videoCallback = callback;
                webView.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                setFullscreen();
            }
            @Override public void onHideCustomView() { exitVideo(); }
        });
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        webView.requestFocus();
        if (state == null || webView.restoreState(state) == null) {
            webView.loadUrl(START_URL);
        }
    }

    private String readPageScript(String assetName) {
        try (InputStream input = getAssets().open(assetName);
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[2048];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException error) {
            Log.w(TAG, "Page enhancement unavailable: " + assetName, error);
            return null;
        }
    }

    private void applyPageEnhancements(WebView view) {
        if (logoCompositorScript != null) view.evaluateJavascript(logoCompositorScript, null);
        if (defaultExtensionsScript != null) view.evaluateJavascript(defaultExtensionsScript, null);
        if (catalogCustomizationScript != null) view.evaluateJavascript(catalogCustomizationScript, null);
        if (rezkaTransportScript != null) view.evaluateJavascript(rezkaTransportScript, null);
    }

    private static boolean allowedRezkaUrl(Uri uri) {
        return "https".equals(uri.getScheme()) && uri.getUserInfo() == null && uri.getPort() == -1
                && ("kvk.zone".equals(uri.getHost()) || "rezka.ag".equals(uri.getHost()));
    }

    private void startRezkaRequest(String id) {
        if (webView == null || isFinishing() || rezkaWorker.isShutdown()) return;
        webView.evaluateJavascript("JSON.stringify(window.__lampaLiteRezkaTransport?.take('" + id + "'))", value -> {
            if (isFinishing() || rezkaWorker.isShutdown()) return;
            try {
                Object encoded = new JSONTokener(value).nextValue();
                if (!(encoded instanceof String)) return;
                JSONObject request = new JSONObject((String) encoded);
                Uri uri = Uri.parse(request.getString("url"));
                String method = request.optString("method", "GET");
                String body = request.optString("body", "");
                if (!allowedRezkaUrl(uri) || uri.toString().length() > 8192 || body.length() > 65536
                        || !("GET".equals(method) || ("POST".equals(method)
                            && ("/ajax/login/".equals(uri.getPath()) || "/ajax/get_cdn_series/".equals(uri.getPath()))))) {
                    finishRezkaRequest(id, new JSONObject().put("status", 403).put("body", ""));
                    return;
                }
                rezkaWorker.execute(() -> {
                    JSONObject response = new JSONObject();
                    try {
                        String currentUrl = uri.toString();
                        String currentMethod = method;
                        String currentBody = body;
                        JSONObject headers = request.optJSONObject("headers");
                        for (int redirect = 0; redirect < 5; redirect++) {
                            Uri current = Uri.parse(currentUrl);
                            if (!allowedRezkaUrl(current)) throw new java.io.IOException("Rejected destination");
                            HttpURLConnection connection = (HttpURLConnection) new URL(currentUrl).openConnection();
                            try {
                                connection.setInstanceFollowRedirects(false);
                                connection.setConnectTimeout(8000);
                                connection.setReadTimeout(8000);
                                connection.setRequestMethod(currentMethod);
                                connection.setRequestProperty("Origin", "https://" + current.getHost());
                                connection.setRequestProperty("Referer", "https://" + current.getHost() + "/");
                                String cookies = CookieManager.getInstance().getCookie(currentUrl);
                                String explicitCookies = headers == null ? "" : headers.optString("Cookie");
                                if (!explicitCookies.isEmpty()) {
                                    if (explicitCookies.length() > 16384 || explicitCookies.indexOf('\r') >= 0 || explicitCookies.indexOf('\n') >= 0)
                                        throw new java.io.IOException("Invalid cookie header");
                                    cookies = explicitCookies;
                                }
                                if (cookies != null && !("POST".equals(currentMethod) && "/ajax/login/".equals(current.getPath())))
                                    connection.setRequestProperty("Cookie", cookies);
                                if (headers != null) {
                                    for (String key : new String[]{"User-Agent", "Content-Type", "X-Requested-With"}) {
                                        String header = headers.optString(key);
                                        if (!header.isEmpty() && header.indexOf('\r') < 0 && header.indexOf('\n') < 0)
                                            connection.setRequestProperty(key, header);
                                    }
                                }
                                if ("POST".equals(currentMethod)) {
                                    connection.setRequestProperty("X-Requested-With", "XMLHttpRequest");
                                    if (connection.getRequestProperty("Content-Type") == null)
                                        connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
                                    byte[] data = currentBody.getBytes(StandardCharsets.UTF_8);
                                    connection.setDoOutput(true);
                                    connection.setFixedLengthStreamingMode(data.length);
                                    try (java.io.OutputStream output = connection.getOutputStream()) { output.write(data); }
                                }
                                int status = connection.getResponseCode();
                                for (java.util.Map.Entry<String, java.util.List<String>> header : connection.getHeaderFields().entrySet()) {
                                    if ("set-cookie".equalsIgnoreCase(header.getKey())) {
                                        for (String cookie : header.getValue()) CookieManager.getInstance().setCookie(currentUrl, cookie);
                                    }
                                }
                                String location = connection.getHeaderField("Location");
                                if (status >= 300 && status < 400 && location != null) {
                                    currentUrl = new URL(new URL(currentUrl), location).toString();
                                    if (status == 303 || ((status == 301 || status == 302) && "POST".equals(currentMethod))) {
                                        currentMethod = "GET";
                                        currentBody = "";
                                    }
                                    continue;
                                }
                                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                                if (stream != null) {
                                    java.io.PushbackInputStream sniff = new java.io.PushbackInputStream(stream, 2);
                                    int first = sniff.read();
                                    int second = sniff.read();
                                    if (second != -1) sniff.unread(second);
                                    if (first != -1) sniff.unread(first);
                                    try (InputStream input = first == 0x1f && second == 0x8b
                                            ? new java.util.zip.GZIPInputStream(sniff) : sniff) {
                                    byte[] buffer = new byte[8192]; int count;
                                    while ((count = input.read(buffer)) != -1) {
                                        if (bytes.size() + count > 4 * 1024 * 1024) throw new java.io.IOException("Response too large");
                                        bytes.write(buffer, 0, count);
                                    }
                                    }
                                }
                                response.put("status", status);
                                response.put("body", new String(bytes.toByteArray(), StandardCharsets.UTF_8));
                                response.put("cookies", CookieManager.getInstance().getCookie(currentUrl));
                                break;
                            } finally { connection.disconnect(); }
                        }
                        CookieManager.getInstance().flush();
                        if (!response.has("status")) response.put("status", 502).put("body", "");
                    } catch (Exception ignored) {
                        // Do not log account data, request bodies, cookies or responses.
                        try { response.put("status", 502).put("body", ""); } catch (Exception unused) { }
                    }
                    JSONObject result = response;
                    runOnUiThread(() -> finishRezkaRequest(id, result));
                });
            } catch (Exception ignored) {
                try { finishRezkaRequest(id, new JSONObject().put("status", 400).put("body", "")); } catch (Exception unused) { }
            }
        });
    }

    private void finishRezkaRequest(String id, JSONObject response) {
        if (webView != null && !isFinishing()) {
            Uri page = Uri.parse(webView.getUrl() == null ? "" : webView.getUrl());
            if ("lampa.mx".equals(page.getHost()))
                webView.evaluateJavascript("window.__lampaLiteRezkaTransport?.finish('" + id + "'," + response + ")", null);
        }
    }

    private void setFullscreen() {
        int desired = View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
        View decor = getWindow().getDecorView();
        // Do not request a redundant system UI change when returning focus.
        if (decor.getSystemUiVisibility() != desired) {
            decor.setSystemUiVisibility(desired);
        }
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) setFullscreen();
    }

    private void exitVideo() {
        if (videoView == null) return;
        root.removeView(videoView);
        videoView = null;
        webView.setVisibility(View.VISIBLE);
        if (videoCallback != null) videoCallback.onCustomViewHidden();
        videoCallback = null;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setFullscreen();
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        // Keep a single native BACK action; do not dispatch it to WebView twice.
        // Long BACK no longer opens a settings dialog.
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) onBackPressed();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override public void onBackPressed() {
        if (videoView != null) exitVideo();
        else if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onPause() {
        if (webView != null) {
            webView.onPause();
            // onPause() alone leaves JavaScript timers running in the hidden catalog.
            // This process owns one WebView. Do not pause timers for fullscreen video.
            if (videoView == null) webView.pauseTimers();
        }
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (webView != null) {
            // Timers are process-wide: always resume before restoring page/focus.
            webView.resumeTimers();
            webView.onResume();
            // Recover D-pad focus after returning from an external video player.
            if (videoView == null && !webView.hasFocus()) webView.requestFocus();
        }
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        if (webView != null) webView.saveState(out);
        super.onSaveInstanceState(out);
    }
    @Override protected void onDestroy() {
        rezkaWorker.shutdownNow();
        if (videoView != null) exitVideo();
        if (webView != null) {
            root.removeView(webView);
            // Do not leave the process-wide timer state paused for the next Activity.
            webView.resumeTimers();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
