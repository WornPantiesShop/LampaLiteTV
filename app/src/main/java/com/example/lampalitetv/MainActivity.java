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
import org.json.JSONArray;
import org.json.JSONTokener;
import java.nio.charset.StandardCharsets;

/** Minimal Android TV WebView host; no forced frame loop, layer type or Chromium flags. */
public final class MainActivity extends Activity {
    private static final String TAG = "LampaLiteTV";
    private static final String START_URL = "http://lampa.mx";
    private String pageEnhancementsScript;
    private boolean pageEnhancementsApplied;
    private final ExecutorService rezkaWorker = new java.util.concurrent.ThreadPoolExecutor(
            1, 1, 0, java.util.concurrent.TimeUnit.MILLISECONDS,
            new java.util.concurrent.ArrayBlockingQueue<>(16));
    private FrameLayout root;
    private WebView webView;
    private View videoView;
    private WebChromeClient.CustomViewCallback videoCallback;
    private boolean hideOverscroll = true;
    private static final int EXTERNAL_PLAYER_REQUEST = 4101;
    private boolean progressDeliveryRunning;
    private int progressDeliveryAttempts;
    private final Runnable progressDelivery = this::deliverExternalProgress;

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
        StringBuilder enhancements = new StringBuilder();
        for (String asset : new String[] {"logo-compositor.js", "default-extensions.js",
                "catalog-customization.js", "rezka-transport.js", "player-selection.js",
                "torrent-preflight.js", "menu-submenus.js", "search-keyboard.js"}) {
            String script = readPageScript(asset);
            if (script != null) {
                // Isolate optional enhancements so one failure cannot skip the others.
                enhancements.append("try {\n").append(script)
                        .append("\n} catch (e) { console.warn('Lampa Lite enhancement unavailable'); }\n");
            }
        }
        pageEnhancementsScript = enhancements.toString();
        createWebView(state);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView(Bundle state) {
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)
            WebView.setWebContentsDebuggingEnabled(true);
        pageEnhancementsApplied = false;
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
        // This host uses Lampa's web player plus our scoped native chooser, not AndroidJS.
        // Identify the host so the torrent file picker does not redirect it to another APK.
        settings.setUserAgentString(settings.getUserAgentString().replace("Android", "LampaLiteTV"));
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportZoom(false);
        // Keep the platform's default GPU layer, cache policy and renderer scheduling.
        webView.setWebViewClient(new WebViewClient() {
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                // Lampa autoloads Shots independently of the visible menu/settings.
                // Stop this module before it adds card, player and catalog hooks.
                // Match its exact module path, including on CUB mirror hosts.
                String path = request.getUrl().getPath();
                if ("/plugin/shots".equals(path) || "/plugin/shots.js".equals(path)
                        || "/plugin/shorts".equals(path) || "/plugin/shorts.js".equals(path)) {
                    return new android.webkit.WebResourceResponse("application/javascript", "UTF-8",
                            new java.io.ByteArrayInputStream(new byte[0]));
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pageEnhancementsApplied = false;
            }

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
                if ("lampalite".equals(scheme) && "player-request".equals(uri.getHost())) {
                    Uri page = Uri.parse(view.getUrl() == null ? "" : view.getUrl());
                    String id = uri.getQueryParameter("id");
                    if (request.isForMainFrame() && "lampa.mx".equals(page.getHost())
                            && id != null && id.matches("[a-f0-9]{32}")) openExternalPlayer(id);
                    return true;
                }
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
        if (pageEnhancementsApplied || pageEnhancementsScript == null
                || !"lampa.mx".equals(Uri.parse(view.getUrl() == null ? "" : view.getUrl()).getHost())) return;
        pageEnhancementsApplied = true;
        // One native-to-renderer call per document; scripts retain their own ready hooks.
        view.evaluateJavascript(pageEnhancementsScript, ignored -> deliverExternalProgress());
    }

    private void openExternalPlayer(String id) {
        webView.evaluateJavascript("JSON.stringify(window.__lampaLitePlayer?.take('" + id + "'))", value -> {
            boolean fallback = false;
            try {
                Object encoded = new JSONTokener(value).nextValue();
                if (!(encoded instanceof String)) return;
                JSONObject media = new JSONObject((String) encoded);
                String url = media.getString("url");
                Uri uri = Uri.parse(url);
                if (url.length() > 32768 || uri.getHost() == null || uri.getUserInfo() != null
                        || !("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))) return;
                Intent video = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "video/*");
                String title = media.optString("title", "Видео");
                String safeTitle = title.substring(0, Math.min(title.length(), 512));
                video.putExtra("title", safeTitle);
                video.putExtra("forcename", safeTitle);
                video.putExtra("forceresume", false);
                video.putExtra("startfrom", (int)Math.max(0, Math.min(Integer.MAX_VALUE, media.optLong("startMs", 0))));
                if (getPackageManager().queryIntentActivities(video, 0).isEmpty()) {
                    Toast.makeText(this, "Внешний видеоплеер не установлен. Открываю встроенный.", Toast.LENGTH_LONG).show();
                    fallback = true;
                } else {
                    JSONObject meta = media.optJSONObject("timeline");
                    if (meta != null && meta.optString("hash").matches("[-\\w:.]{1,128}")) {
                        JSONObject session = new JSONObject().put("id", id).put("meta", meta);
                        // No stream URLs or credentials are persisted. Survives host process recreation.
                        getPreferences(MODE_PRIVATE).edit().putString("external_player_session", session.toString()).commit();
                    } else getPreferences(MODE_PRIVATE).edit().remove("external_player_session").commit();
                    startActivityForResult(Intent.createChooser(video, "Выберите видеоплеер"), EXTERNAL_PLAYER_REQUEST);
                }
            } catch (Exception error) {
                // Do not log stream URLs or exceptions containing credentials.
                Toast.makeText(this, "Не удалось открыть внешний плеер", Toast.LENGTH_SHORT).show();
                fallback = true;
            } finally {
                if (webView != null && "lampa.mx".equals(Uri.parse(webView.getUrl() == null ? "" : webView.getUrl()).getHost()))
                    webView.evaluateJavascript("window.__lampaLitePlayer?.finish('" + id + "'," + fallback + ")", null);
            }
        });
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != EXTERNAL_PLAYER_REQUEST) return;
        String raw = getPreferences(MODE_PRIVATE).getString("external_player_session", null);
        getPreferences(MODE_PRIVATE).edit().remove("external_player_session").commit();
        if (raw == null) return;
        try {
            boolean vimu = data != null && "net.gtvbox.videoplayer.result".equals(data.getAction());
            Bundle extras = data == null ? null : data.getExtras();
            Object positionValue = extras == null ? null : extras.get("position");
            Object durationValue = extras == null ? null : extras.get("duration");
            boolean timed = positionValue instanceof Number && durationValue instanceof Number;
            // Other players and an abandoned Android chooser must never reset progress.
            if (resultCode == 4 || (resultCode != 0 && resultCode != 1) || (!vimu && !timed)) return;
            long position = positionValue instanceof Number ? ((Number)positionValue).longValue() : 0;
            long duration = durationValue instanceof Number ? ((Number)durationValue).longValue() : 0;
            boolean completed = resultCode == 1;
            if (position < 0 || duration < 0 || position > Integer.MAX_VALUE || duration > Integer.MAX_VALUE
                    || (!completed && (duration <= 0 || position > duration + 60000))) return;
            JSONObject result = new JSONObject(raw).put("positionMs", position).put("durationMs", duration).put("completed", completed);
            JSONArray queue = new JSONArray(getPreferences(MODE_PRIVATE).getString("external_player_results", "[]"));
            if (queue.length() >= 20) queue.remove(0);
            queue.put(result);
            getPreferences(MODE_PRIVATE).edit().putString("external_player_results", queue.toString()).commit();
            Log.i(TAG, "External progress received; completed=" + completed + "; positionMs=" + position + "; durationMs=" + duration);
            progressDeliveryAttempts = 0;
            deliverExternalProgress();
        } catch (Exception error) {
            Log.w(TAG, "External progress result unavailable");
        }
    }

    private void deliverExternalProgress() {
        if (webView == null || isFinishing() || progressDeliveryRunning) return;
        String queued = getPreferences(MODE_PRIVATE).getString("external_player_results", "[]");
        if ("[]".equals(queued) || !"lampa.mx".equals(Uri.parse(webView.getUrl() == null ? "" : webView.getUrl()).getHost())) return;
        progressDeliveryRunning = true;
        webView.evaluateJavascript("window.__lampaLitePlayer?.applyResults(" + queued + ") || []", value -> {
            progressDeliveryRunning = false;
            try {
                JSONArray acknowledged = new JSONArray(value);
                JSONArray current = new JSONArray(getPreferences(MODE_PRIVATE).getString("external_player_results", "[]"));
                JSONArray remaining = new JSONArray();
                for (int i=0; i<current.length(); i++) {
                    JSONObject result = current.getJSONObject(i);
                    boolean done = false;
                    for (int j=0; j<acknowledged.length(); j++) if (result.optString("id").equals(acknowledged.optString(j))) done = true;
                    if (!done) remaining.put(result);
                }
                getPreferences(MODE_PRIVATE).edit().putString("external_player_results", remaining.toString()).apply();
                if (acknowledged.length() > 0) Log.i(TAG, "External progress saved in Lampa");
                if (remaining.length() > 0 && webView != null && ++progressDeliveryAttempts < 40) {
                    webView.removeCallbacks(progressDelivery);
                    webView.postDelayed(progressDelivery, 250);
                }
            } catch (Exception error) { Log.w(TAG, "External progress delivery deferred"); }
        });
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
                            && ("/ajax/login/".equals(uri.getPath()) || "/ajax/get_cdn_series/".equals(uri.getPath()) || "/engine/ajax/search.php".equals(uri.getPath()))))) {
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
        else if (webView != null) {
            // Let active app overlays handle BACK before navigating WebView history.
            webView.evaluateJavascript("Boolean(window.__lampaLitePreflight?.cancel() || window.__lampaLiteMenu?.back() || window.__lampaLiteSearchKeyboard?.back())", handled -> {
                if (!"true".equals(handled)) navigateBack();
            });
        } else super.onBackPressed();
    }

    private void navigateBack() {
        if (webView != null && webView.canGoBack()) webView.goBack();
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
            progressDeliveryAttempts = 0;
            deliverExternalProgress();
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
            webView.removeCallbacks(progressDelivery);
            root.removeView(webView);
            // Do not leave the process-wide timer state paused for the next Activity.
            webView.resumeTimers();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
