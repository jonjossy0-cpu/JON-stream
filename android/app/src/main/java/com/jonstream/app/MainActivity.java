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
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.requestFocus(View.FOCUS_DOWN);
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

            // Numeric remote keys: 1-3 digit direct channel selection.
            if(k>=KeyEvent.KEYCODE_0 && k<=KeyEvent.KEYCODE_9) {
                addDigit(k-KeyEvent.KEYCODE_0);
                return true;
            }

            // TV channel rocker.
            if(k==KeyEvent.KEYCODE_CHANNEL_UP) { channelStep(1); return true; }
            if(k==KeyEvent.KEYCODE_CHANNEL_DOWN) { channelStep(-1); return true; }

            // OK/Enter: activate the currently focused TV control.
            if(k==KeyEvent.KEYCODE_ENTER || k==KeyEvent.KEYCODE_DPAD_CENTER) {
                if(numberBuffer.length()>0) {
                    commitNumber();
                } else {
                    runOnUiThread(()->webView.evaluateJavascript(
                        "(function(){var e=document.activeElement;if(e&&e!==document.body){e.click();}else{var x=document.querySelector('[data-tv-focus],button,a,[role=button]');if(x){x.focus();x.click();}}})()",
                        null));
                }
                return true;
            }

            // D-pad navigation is handled explicitly so Android TV remotes can
            // move between buttons, channel cards, filters and player controls.
            if(k==KeyEvent.KEYCODE_DPAD_UP) { moveFocus("up"); return true; }
            if(k==KeyEvent.KEYCODE_DPAD_DOWN) { moveFocus("down"); return true; }
            if(k==KeyEvent.KEYCODE_DPAD_LEFT) { moveFocus("left"); return true; }
            if(k==KeyEvent.KEYCODE_DPAD_RIGHT) { moveFocus("right"); return true; }

            // Common TV remote playback keys.
            if(k==KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) { mediaKey("playpause"); return true; }
            if(k==KeyEvent.KEYCODE_MEDIA_PLAY) { mediaKey("play"); return true; }
            if(k==KeyEvent.KEYCODE_MEDIA_PAUSE) { mediaKey("pause"); return true; }
            if(k==KeyEvent.KEYCODE_MEDIA_STOP) { mediaKey("stop"); return true; }
        }
        return super.dispatchKeyEvent(event);
    }

    private void moveFocus(String direction) {
        final String d=direction;
        runOnUiThread(()->webView.evaluateJavascript(
            "(function(){try{" +
            "var d='"+d+"';" +
            "var all=[...document.querySelectorAll('button,a,input,select,[tabindex]:not([tabindex=\"-1\"])')].filter(function(e){" +
            " if(e.disabled||e.hidden)return false; var s=getComputedStyle(e),r=e.getBoundingClientRect();" +
            " return s.display!=='none'&&s.visibility!=='hidden'&&r.width>1&&r.height>1;" +
            "});" +
            "if(!all.length)return;" +
            "var cur=document.activeElement;" +
            "if(!cur||all.indexOf(cur)<0){cur=document.querySelector('[data-tv-focus]')||all[0];cur.focus();cur.scrollIntoView({block:'nearest',inline:'nearest'});return;}" +
            "var cr=cur.getBoundingClientRect(),cx=cr.left+cr.width/2,cy=cr.top+cr.height/2,best=null,bestScore=1e18;" +
            "all.forEach(function(e){if(e===cur)return;var r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,dx=x-cx,dy=y-cy;" +
            "var ok=(d==='up'&&dy<-4)||(d==='down'&&dy>4)||(d==='left'&&dx<-4)||(d==='right'&&dx>4);if(!ok)return;" +
            "var primary=(d==='up'||d==='down')?Math.abs(dy):Math.abs(dx),cross=(d==='up'||d==='down')?Math.abs(dx):Math.abs(dy);" +
            "var score=primary+cross*1.8;if(score<bestScore){bestScore=score;best=e;}});" +
            "if(best){best.focus();best.scrollIntoView({block:'nearest',inline:'nearest'});}"+
            "}catch(e){}})()",
            null));
    }

    private void mediaKey(String action) {
        final String a=action;
        runOnUiThread(()->webView.evaluateJavascript(
            "(function(){var v=document.querySelector('video,audio');if(!v)return;" +
            "if('"+a+"'==='playpause'){v.paused?v.play():v.pause();}" +
            "else if('"+a+"'==='play'){v.play();}" +
            "else if('"+a+"'==='pause'){v.pause();}" +
            "else if('"+a+"'==='stop'){v.pause();v.currentTime=0;}" +
            "})()",
            null));
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
