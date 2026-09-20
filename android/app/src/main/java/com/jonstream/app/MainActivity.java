package com.jonstream.app;

import android.app.Activity;
import android.app.AppOpsManager;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.util.Rational;

public class MainActivity extends Activity {
    private WebView webView;
    private static final String HOME = "https://jonjossy0-cpu.github.io/JON-stream/";
    private boolean pipSettingsOpened = false;
    private String numberBuffer = "";
    private long lastNumberTime = 0L;
    private WebChromeClient chromeClient;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        WebView.setWebContentsDebuggingEnabled(false);

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setSupportZoom(false);

        chromeClient = new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                webView.setVisibility(View.GONE);
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN |
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                );
                addContentView(customView, new android.view.ViewGroup.LayoutParams(
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT
                ));
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                ((android.view.ViewGroup) customView.getParent()).removeView(customView);
                customView = null;
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
                webView.setVisibility(View.VISIBLE);
                getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }
        };
        webView.setWebChromeClient(chromeClient);

        // APK-only bridge; index.html is not modified.
        webView.addJavascriptInterface(new JONNativeBridge(), "JONNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String url = uri.toString();
                if (url.startsWith(HOME)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                } catch (Exception ignored) {
                    return false;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                installPipButtonHook();
            }
        });

        setContentView(webView);
        if (savedInstanceState != null && savedInstanceState.getBundle("webview_state") != null) {
            webView.restoreState(savedInstanceState.getBundle("webview_state"));
        } else {
            loadHome();
        }
    }

    private void installPipButtonHook() {
        if (webView == null) return;
        String js =
            "(function(){" +
            "if(window.__jonNativePipHook)return;" +
            "window.__jonNativePipHook=true;" +
            "document.addEventListener('click',function(e){" +
            "var el=e.target;" +
            "while(el&&el!==document.body){" +
            "var id=(el.id||'').toLowerCase();" +
            "var cls=(typeof el.className==='string'?el.className:'').toLowerCase();" +
            "var txt=(el.innerText||el.textContent||'').trim().toLowerCase();" +
            "var oc=(el.getAttribute&&el.getAttribute('onclick')||'').toLowerCase();" +
            "if(id==='jonpip'||id.indexOf('pip')>=0||cls.indexOf('pip')>=0||oc.indexOf('pictureinpiptv')>=0||oc.indexOf('pictureinpicture')>=0||txt==='pip'||txt==='picture in picture'||txt.indexOf('pip')>=0){" +
            "e.preventDefault();e.stopImmediatePropagation();" +
            "if(window.JONNative&&window.JONNative.enterPip)window.JONNative.enterPip();" +
            "return;" +
            "}" +
            "el=el.parentElement;" +
            "}" +
            "},true);" +
            "})();";
        webView.evaluateJavascript(js, null);
    }

    private class JONNativeBridge {
        @JavascriptInterface
        public void enterPip() {
            runOnUiThread(() -> startPipFromButton());
        }
    }

    private boolean isPipAllowed() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        try {
            AppOpsManager appOps = (AppOpsManager) getSystemService(Context.APP_OPS_SERVICE);
            if (appOps == null) return true;
            int mode;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                mode = appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_PICTURE_IN_PICTURE,
                    android.os.Process.myUid(), getPackageName());
            } else {
                mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_PICTURE_IN_PICTURE,
                    android.os.Process.myUid(), getPackageName());
            }
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception ignored) {
            return true;
        }
    }

    private void requestPipPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            pipSettingsOpened = true;
            startActivity(new Intent("android.settings.PICTURE_IN_PICTURE_SETTINGS",
                Uri.parse("package:" + getPackageName())));
        } catch (Exception ignored) {
            try { startActivity(new Intent(Settings.ACTION_SETTINGS)); } catch (Exception ignoredAgain) {}
        }
    }

    private void startPipFromButton() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (!isPipAllowed()) {
            requestPipPermission();
            return;
        }

        // Keep the TV player as the PiP content. Android controls the actual
        // PiP position; the app cannot force the window to a specific corner.
        try {
            PictureInPictureParams.Builder builder =
                new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(16, 9));
            enterPictureInPictureMode(builder.build());
        } catch (Exception ignored) {}
    }

    private boolean isNumberKey(int keyCode) {
        return keyCode >= android.view.KeyEvent.KEYCODE_0 &&
               keyCode <= android.view.KeyEvent.KEYCODE_9;
    }

    private void commitChannelNumber() {
        if (webView == null || numberBuffer.length() == 0) return;
        final String value = numberBuffer;
        numberBuffer = "";
        webView.post(() -> webView.evaluateJavascript(
            "(function(){var n=" + Integer.parseInt(value) + ";" +
            "if(typeof tvChannels!=='undefined'&&Array.isArray(tvChannels)&&n>=1&&n<=tvChannels.length){" +
            "var c=tvChannels[n-1];if(c&&typeof playTVStream==='function'){playTVStream(c.url,c.name);}}" +
            "})()", null));
    }

    private void changeChannel(int delta) {
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
            "(function(){if(typeof tvChannels==='undefined'||!Array.isArray(tvChannels)||!tvChannels.length)return;" +
            "var i=(typeof currentTVIndex==='number')?currentTVIndex:-1;" +
            "if(i<0){var p=document.querySelector('video');}" +
            "i=(i+delta+tvChannels.length)%tvChannels.length;" +
            "var c=tvChannels[i];if(c&&typeof playTVStream==='function'){playTVStream(c.url,c.name);" +
            "if(typeof currentTVIndex!=='undefined')currentTVIndex=i;}" +
            "})()".replace("delta", Integer.toString(delta)), null));
    }

    @Override
    public boolean dispatchKeyEvent(android.view.KeyEvent event) {
        if (event.getAction() == android.view.KeyEvent.ACTION_DOWN) {
            int key = event.getKeyCode();

            if (isNumberKey(key)) {
                long now = System.currentTimeMillis();
                if (now - lastNumberTime > 1500) numberBuffer = "";
                if (numberBuffer.length() < 3) {
                    numberBuffer += String.valueOf(key - android.view.KeyEvent.KEYCODE_0);
                }
                lastNumberTime = now;
                return true;
            }

            if (key == android.view.KeyEvent.KEYCODE_ENTER ||
                key == android.view.KeyEvent.KEYCODE_DPAD_CENTER) {
                if (!numberBuffer.isEmpty()) {
                    commitChannelNumber();
                    return true;
                }
            }

            if (key == android.view.KeyEvent.KEYCODE_CHANNEL_UP ||
                key == android.view.KeyEvent.KEYCODE_PAGE_UP) {
                numberBuffer = "";
                changeChannel(1);
                return true;
            }

            if (key == android.view.KeyEvent.KEYCODE_CHANNEL_DOWN ||
                key == android.view.KeyEvent.KEYCODE_PAGE_DOWN) {
                numberBuffer = "";
                changeChannel(-1);
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Intentionally do not call WebView.onPause(): radio audio must continue
        // while the Activity is in the background.
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pipSettingsOpened && isPipAllowed()) pipSettingsOpened = false;
        if (webView != null) webView.postDelayed(this::installPipButtonHook, 300);
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Do not enter PiP automatically when Home is pressed.
        // PiP is available only through the in-app PiP button.
    }

    @Override
    public void onBackPressed() {
        if (customView != null && chromeClient != null) {
            chromeClient.onHideCustomView();
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isInPictureInPictureMode()) return;
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    private void loadHome() {
        if (isOnline()) webView.loadUrl(HOME);
        else webView.loadData(
            "<html><body style='text-align:center;padding-top:30%;font-family:sans-serif'>" +
            "<h2>JON Stream</h2><p>No Internet Connection</p>" +
            "<p>Connect to the Internet and try again.</p></body></html>",
            "text/html", "UTF-8");
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network network = cm.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
        return caps != null &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        Bundle webState = new Bundle();
        if (webView != null) webView.saveState(webState);
        outState.putBundle("webview_state", webState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode);
        if (webView != null) {
            webView.postDelayed(this::installPipButtonHook, 250);
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
