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
    private WebChromeClient chromeClient;
    private static final String HOME = "file:///android_asset/index.html";
    private final StringBuilder numberBuffer = new StringBuilder();
    private final Handler handler = new Handler();
    private Runnable commitTask;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        // Keep the screen awake while watching TV in the JON Stream app.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Re-apply periodically so TV playback never loses the screen-awake flag.
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                if (!isFinishing()) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    handler.postDelayed(this, 15000);
                }
            }
        }, 15000);

        // Keep the Android process alive while the WebView radio is playing in background.
        try {
            Intent serviceIntent = new Intent(this, BackgroundPlaybackService.class);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception ignored) {
        }

        root = new FrameLayout(this);
        root.setKeepScreenOn(true);
        webView = new WebView(this);
        webView.setKeepScreenOn(true);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));

        WebView.setWebContentsDebuggingEnabled(false);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setSupportZoom(false);

        chromeClient = new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                root.addView(customView, new FrameLayout.LayoutParams(-1, -1));
                customView.setKeepScreenOn(true);
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
        };
        webView.setWebChromeClient(chromeClient);

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
        if (savedInstanceState != null && savedInstanceState.getBundle("webview_state") != null) {
            webView.restoreState(savedInstanceState.getBundle("webview_state"));
        } else {
            loadHome();
        }
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
        webView.loadUrl(HOME);
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

    @Override
    protected void onResume() {
        super.onResume();
        keepScreenAwake();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) keepScreenAwake();
    }

    private void keepScreenAwake() {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (root != null) root.setKeepScreenOn(true);
        if (webView != null) webView.setKeepScreenOn(true);
        if (customView != null) customView.setKeepScreenOn(true);
    }

    @Override public void onBackPressed() {
        if(customView != null) {
            if(chromeClient != null) chromeClient.onHideCustomView();
            return;
        }
        if(webView!=null&&webView.canGoBack())webView.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        Bundle webState = new Bundle();
        if (webView != null) webView.saveState(webState);
        outState.putBundle("webview_state", webState);
        super.onSaveInstanceState(outState);
    }

    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if(webView!=null){webView.stopLoading();webView.destroy();}
        super.onDestroy();
    }
}
