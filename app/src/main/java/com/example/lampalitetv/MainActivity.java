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

/** Minimal Android TV WebView host; no forced frame loop, layer type or Chromium flags. */
public final class MainActivity extends Activity {
    private static final String TAG = "LampaLiteTV";
    private static final String START_URL = "http://lampa.mx";
    private FrameLayout root;
    private WebView webView;
    private View videoView;
    private WebChromeClient.CustomViewCallback videoCallback;
    private boolean hideOverscroll = true;
    private boolean backHeld = false;
    private boolean settingsOpenedForBack = false;

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

            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    Toast.makeText(MainActivity.this, "Не удалось загрузить Lampa. Проверьте сеть.", Toast.LENGTH_LONG).show();
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
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

    private void showSettings() {
        if (isFinishing()) return;
        String[] options = {
                "Системный эффект прокрутки: " + (hideOverscroll ? "выключен" : "включён"),
                "Перезагрузить страницу Lampa",
                "Закрыть"
        };
        new AlertDialog.Builder(this)
                // Android AlertDialog cannot show setMessage and setItems together reliably.
                .setTitle("Lampa Lite TV — настройки")
                .setItems(options, (dialog, which) -> {
                    if (which == 0) {
                        hideOverscroll = !hideOverscroll;
                        getPreferences(MODE_PRIVATE).edit()
                                .putBoolean("hideOverscroll", hideOverscroll).apply();
                        if (webView != null) {
                            webView.setOverScrollMode(hideOverscroll
                                    ? View.OVER_SCROLL_NEVER : View.OVER_SCROLL_IF_CONTENT_SCROLLS);
                        }
                        Toast.makeText(this, "Настройка прокрутки обновлена", Toast.LENGTH_SHORT).show();
                    } else if (which == 1 && webView != null) {
                        webView.reload();
                    }
                })
                .show();
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
        // The TCL remote has BACK even when it has no MENU key.
        // A short BACK retains the existing WebView back behavior.
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                backHeld = true;
                if (event.isLongPress() && !settingsOpenedForBack) {
                    settingsOpenedForBack = true;
                    showSettings();
                }
                return true;
            }
            if (event.getAction() == KeyEvent.ACTION_UP) {
                boolean alreadyOpened = settingsOpenedForBack;
                boolean openSettings = alreadyOpened
                        || (backHeld && event.getEventTime() - event.getDownTime() >= 850);
                backHeld = false;
                settingsOpenedForBack = false;
                if (openSettings) {
                    if (!alreadyOpened && !event.isCanceled() && !isFinishing()) {
                        showSettings();
                    }
                } else if (!event.isCanceled()) {
                    onBackPressed();
                }
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override public void onBackPressed() {
        if (videoView != null) exitVideo();
        else if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (webView != null) {
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
        if (videoView != null) exitVideo();
        if (webView != null) {
            root.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
