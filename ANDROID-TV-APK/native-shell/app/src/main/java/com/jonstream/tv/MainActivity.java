package com.jonstream.tv;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private static final String START_URL = "https://jonjossy0-cpu.github.io/JON-stream/";
    private FrameLayout root;
    private WebView webView;
    private View customFullscreenView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        applyImmersive();
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        try {
            webView = new WebView(this);
            webView.setBackgroundColor(Color.BLACK);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            WebSettings s = webView.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setDatabaseEnabled(true);
            s.setMediaPlaybackRequiresUserGesture(false);
            s.setSupportZoom(false);
            s.setBuiltInZoomControls(false);
            s.setDisplayZoomControls(false);
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) s.setSafeBrowsingEnabled(true);
            webView.setWebViewClient(new WebViewClient());
            webView.setWebChromeClient(new WebChromeClient() {
                @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                    if (customFullscreenView != null) {
                        callback.onCustomViewHidden();
                        return;
                    }
                    customFullscreenView = view;
                    customViewCallback = callback;
                    webView.setVisibility(View.GONE);
                    root.addView(customFullscreenView, new FrameLayout.LayoutParams(-1, -1));
                    applyImmersive();
                }

                @Override public void onHideCustomView() {
                    if (customFullscreenView == null) return;
                    root.removeView(customFullscreenView);
                    customFullscreenView = null;
                    if (customViewCallback != null) {
                        customViewCallback.onCustomViewHidden();
                        customViewCallback = null;
                    }
                    if (webView != null) webView.setVisibility(View.VISIBLE);
                    applyImmersive();
                }
            });
            root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
            webView.loadUrl(START_URL);
            webView.requestFocus();
        } catch (Throwable error) {
            TextView notice = new TextView(this);
            notice.setText("Android WebView could not start. Update or enable Android System WebView / Chrome, then reopen JON Stream TV Test.");
            notice.setTextColor(Color.WHITE);
            notice.setTextSize(20);
            notice.setPadding(32, 32, 32, 32);
            root.addView(notice, new FrameLayout.LayoutParams(-1, -1));
        }
    }

    @SuppressWarnings("deprecation")
    private void applyImmersive() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) applyImmersive();
    }

    @Override protected void onResume() {
        super.onResume();
        applyImmersive();
        if (webView != null) webView.onResume();
    }

    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (customFullscreenView != null && root != null) root.removeView(customFullscreenView);
        customFullscreenView = null;
        customViewCallback = null;
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
            if (customFullscreenView != null && webView != null) {
                webView.getWebChromeClient().onHideCustomView();
                return true;
            }
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
                applyImmersive();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }
}
