package com.jonstream.app;

import android.app.Activity;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.view.KeyEvent;
import android.webkit.WebResourceRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;
    private static final String HOME = "https://jonjossy0-cpu.github.io/JON-stream/";
    private final StringBuilder remoteNumberBuffer = new StringBuilder();
    private final Handler remoteHandler = new Handler();
    private Runnable remoteCommit;

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

        // Enable JavaScript alert/prompt/confirm dialogs used by TV channel Move and Parental Lock.
        webView.setWebChromeClient(new WebChromeClient());

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
        });

        setContentView(webView);
        loadHome();
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

    /*
     * APK-only TV remote controls.
     * This does not modify index.html. Numeric keys are buffered briefly so
     * multi-digit channel numbers such as 146 can be entered.
     */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (isRemoteNumberKey(keyCode)) {
            int digit = keyCode - KeyEvent.KEYCODE_0;
            addRemoteDigit(digit);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_CHANNEL_UP) {
            changeRemoteChannel(1);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_CHANNEL_DOWN) {
            changeRemoteChannel(-1);
            return true;
        }

        if (keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_DPAD_CENTER) {
            commitRemoteNumber();
            return true;
        }

        return super.onKeyDown(keyCode, event);
    }

    private boolean isRemoteNumberKey(int keyCode) {
        return keyCode >= KeyEvent.KEYCODE_0 && keyCode <= KeyEvent.KEYCODE_9;
    }

    private void addRemoteDigit(int digit) {
        if (remoteNumberBuffer.length() >= 3) {
            remoteNumberBuffer.setLength(0);
        }
        remoteNumberBuffer.append(digit);

        remoteHandler.removeCallbacks(remoteCommit);
        remoteCommit = this::commitRemoteNumber;
        remoteHandler.postDelayed(remoteCommit, 1400);
    }

    private void commitRemoteNumber() {
        remoteHandler.removeCallbacks(remoteCommit);
        if (remoteNumberBuffer.length() == 0) return;

        final String number = remoteNumberBuffer.toString();
        remoteNumberBuffer.setLength(0);

        runOnUiThread(() -> {
            if (webView == null) return;
            String js =
                "(function(){" +
                "try{" +
                "var n=parseInt('" + number + "',10);" +
                "var list=(typeof filteredTV!=='undefined'&&Array.isArray(filteredTV)&&filteredTV.length)?filteredTV:" +
                "(typeof tvChannels!=='undefined'&&Array.isArray(tvChannels)?tvChannels:[]);" +
                "if(!list.length||!n||n<1||n>list.length)return;" +
                "var ch=list[n-1];" +
                "if(typeof playTVStream==='function'&&ch){" +
                "var idx=(typeof tvChannels!=='undefined'&&Array.isArray(tvChannels))?tvChannels.indexOf(ch):(n-1);" +
                "playTVStream(ch.url,ch.name,idx);" +
                "}" +
                "}catch(e){}" +
                "})()";
            webView.evaluateJavascript(js, null);
        });
    }

    private void changeRemoteChannel(int direction) {
        runOnUiThread(() -> {
            if (webView == null) return;
            String js =
                "(function(){" +
                "try{" +
                "var list=(typeof filteredTV!=='undefined'&&Array.isArray(filteredTV)&&filteredTV.length)?filteredTV:" +
                "(typeof tvChannels!=='undefined'&&Array.isArray(tvChannels)?tvChannels:[]);" +
                "if(!list.length)return;" +
                "var cur=(typeof currentTV!=='undefined'&&currentTV)?currentTV:null;" +
                "var pos=cur?list.indexOf(cur):-1;" +
                "if(pos<0)pos=direction<0?0:-1;" +
                "var next=(pos+" + direction + "+list.length)%list.length;" +
                "var ch=list[next];" +
                "if(ch&&typeof playTVStream==='function'){" +
                "var idx=(typeof tvChannels!=='undefined'&&Array.isArray(tvChannels))?tvChannels.indexOf(ch):next;" +
                "playTVStream(ch.url,ch.name,idx);" +
                "}" +
                "}catch(e){}" +
                "})()".replace("direction", String(direction));
            webView.evaluateJavascript(js, null);
        });
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        remoteHandler.removeCallbacksAndMessages(null);
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
