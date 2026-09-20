package com.jonstream.app;

import android.app.Activity;
import android.app.AppOpsManager;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Rect;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.util.Rational;

public class MainActivity extends Activity {
    private WebView webView;
    private static final String HOME = "https://jonjossy0-cpu.github.io/JON-stream/";
    private boolean pipSettingsOpened = false;

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

        // Required for JavaScript alert/prompt/confirm dialogs used by TV Move and Parental Lock.
        webView.setWebChromeClient(new WebChromeClient());

        // APK-only bridge: does not modify index.html.
        webView.addJavascriptInterface(new JONNativeBridge(), "JONNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String url = uri.toString();

                if (url.startsWith(HOME)) {
                    return false;
                }

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
        loadHome();
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
            "if(id==='jonpip'||id.indexOf('pip')>=0||cls.indexOf('pip')>=0||oc.indexOf('pictureinpiptv')>=0||" +
            "oc.indexOf('pictureinpicture')>=0||txt==='pip'||txt==='picture in picture'||txt.indexOf('pip')>=0){" +
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
                mode = appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_PICTURE_IN_PICTURE,
                    android.os.Process.myUid(),
                    getPackageName()
                );
            } else {
                mode = appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_PICTURE_IN_PICTURE,
                    android.os.Process.myUid(),
                    getPackageName()
                );
            }
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception ignored) {
            return true;
        }
    }

    private void requestPipPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        try {
            Intent intent = new Intent(
                Settings.ACTION_PICTURE_IN_PICTURE_SETTINGS,
                Uri.parse("package:" + getPackageName())
            );
            pipSettingsOpened = true;
            startActivity(intent);
        } catch (Exception ignored) {
            try {
                startActivity(new Intent(Settings.ACTION_SETTINGS));
            } catch (Exception ignoredAgain) {
            }
        }
    }

    private void startPipFromButton() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        if (!isPipAllowed()) {
            requestPipPermission();
            return;
        }

        try {
            Rational ratio = new Rational(16, 9);
            PictureInPictureParams params =
                new PictureInPictureParams.Builder()
                    .setAspectRatio(ratio)
                    .build();

            enterPictureInPictureMode(params);
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pipSettingsOpened && isPipAllowed()) {
            pipSettingsOpened = false;
        }
        if (webView != null) {
            webView.postDelayed(this::installPipButtonHook, 300);
        }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();

        // Home button: keep the existing automatic PiP behavior.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isPipAllowed()) {
            startPipFromButton();
        }
    }

    private void loadHome() {
        if (isOnline()) {
            webView.loadUrl(HOME);
        } else {
            webView.loadData(
                "<html><body style='text-align:center;padding-top:30%;font-family:sans-serif'>" +
                "<h2>JON Stream</h2><p>No Internet Connection</p>" +
                "<p>Connect to the Internet and try again.</p></body></html>",
                "text/html", "UTF-8"
            );
        }
    }

    private boolean isOnline() {
        ConnectivityManager cm =
            (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return false;

        Network network = cm.getActiveNetwork();
        if (network == null) return false;

        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
        return caps != null &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    @Override
    public void onBackPressed() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isInPictureInPictureMode()) {
            return;
        }

        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
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
