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
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public class MainActivity extends Activity {
    private WebView webView;
    private FrameLayout root;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private static final String HOME = "https://jonjossy0-cpu.github.io/JON-stream/";
    private final StringBuilder numberBuffer = new StringBuilder();
    private final Handler handler = new Handler();
    private Runnable commitTask;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);

        root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));

        WebView.setWebContentsDebuggingEnabled(false);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setSupportZoom(false);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                root.addView(customView, new FrameLayout.LayoutParams(-1, -1));
                webView.setVisibility(View.GONE);
                enterImmersive();
            }

            @Override public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                webView.setVisibility(View.VISIBLE);
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
                exitImmersive();
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl();
                String url=uri.toString();
                if(url.startsWith(HOME)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW,uri)); return true; }
                catch(Exception ignored) { return false; }
            }
        });

        setContentView(root);
        loadHome();
    }

    private void enterImmersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private void exitImmersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    private void loadHome() {
        if(isOnline()) webView.loadUrl(HOME);
        else webView.loadData("<html><body style='text-align:center;padding-top:30%;font-family:sans-serif'><h2>JON Stream</h2><p>No Internet Connection</p><p>Connect to the Internet and try again.</p></body></html>","text/html","UTF-8");
    }

    private boolean isOnline() {
        ConnectivityManager cm=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
        if(cm==null)return false;
        Network n=cm.getActiveNetwork();
        if(n==null)return false;
        NetworkCapabilities c=cm.getNetworkCapabilities(n);
        return c!=null && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if(event.getAction()==KeyEvent.ACTION_DOWN && event.getRepeatCount()==0) {
            int k=event.getKeyCode();
            if(k>=KeyEvent.KEYCODE_0 && k<=KeyEvent.KEYCODE_9) {
                addDigit(k-KeyEvent.KEYCODE_0);
                return true;
            }
            if(k==KeyEvent.KEYCODE_CHANNEL_UP) { channelStep(1); return true; }
            if(k==KeyEvent.KEYCODE_CHANNEL_DOWN) { channelStep(-1); return true; }
            if(k==KeyEvent.KEYCODE_ENTER || k==KeyEvent.KEYCODE_DPAD_CENTER) {
                commitNumber();
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void addDigit(int digit) {
        if(numberBuffer.length()>=3) numberBuffer.setLength(0);
        numberBuffer.append(digit);
        if(commitTask!=null) handler.removeCallbacks(commitTask);
        commitTask=this::commitNumber;
        handler.postDelayed(commitTask,1500);
    }

    private void commitNumber() {
        if(commitTask!=null) handler.removeCallbacks(commitTask);
        if(numberBuffer.length()==0)return;
        final String s=numberBuffer.toString();
        numberBuffer.setLength(0);
        runOnUiThread(()->webView.evaluateJavascript(
            "(function(){try{var n="+s+";var a=(typeof tvChannels!=='undefined'&&Array.isArray(tvChannels))?tvChannels:[];if(n<1||n>a.length)return;var ch=a[n-1];if(ch&&typeof playTVStream==='function')playTVStream(ch.url,ch.name,n-1);}catch(e){}})();",null));
    }

    private void channelStep(int direction) {
        runOnUiThread(()->webView.evaluateJavascript(
            "(function(){try{var a=(typeof tvChannels!=='undefined'&&Array.isArray(tvChannels))?tvChannels:[];if(!a.length)return;var cur=(typeof currentTV!=='undefined')?currentTV:null;var i=cur?a.indexOf(cur):-1;if(i<0)i="+direction+"<0?0:-1;var n=(i+"+direction+"+a.length)%a.length;var ch=a[n];if(ch&&typeof playTVStream==='function')playTVStream(ch.url,ch.name,n);}catch(e){}})();",null));
    }

    @Override public void onBackPressed() {
        if(customView != null) {
            if(webView.getWebChromeClient() != null) {
                ((WebChromeClient) webView.getWebChromeClient()).onHideCustomView();
            }
            return;
        }
        if(webView!=null&&webView.canGoBack())webView.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if(webView!=null){webView.stopLoading();webView.destroy();}
        super.onDestroy();
    }
}
