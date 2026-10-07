package com.jonstream.app;

import android.app.Activity;
import android.app.AlertDialog;
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
import android.webkit.WebSettings;
import android.widget.FrameLayout;
import android.os.AsyncTask;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private WebView webView;
    private FrameLayout root;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private WebChromeClient chromeClient;
    private static final String HOME = "https://jonjossy0-cpu.github.io/JON-stream/";
    private static final int CURRENT_VERSION_CODE = 7;
    private static final String UPDATE_URL = "https://raw.githubusercontent.com/jonjossy0-cpu/JON-stream/mainv/android/update.json";
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
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

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
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(
                    "(function(){try{var embedded=(typeof EMBEDDED_LOGO!=='undefined')?EMBEDDED_LOGO:'';" +
                    "if(embedded){document.querySelectorAll('img[data-logo]').forEach(function(i){i.src=embedded;});}" +
                    "}catch(e){}})();", null);
                view.evaluateJavascript(
                    "(function(){try{function c(){var n=new Date();" +
                    "function f(tz){try{return n.toLocaleTimeString('en-US',{timeZone:tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});}" +
                    "catch(e){return n.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});}}" +
                    "var et=f('Africa/Addis_Ababa'),ut=f('UTC');" +
                    "var a=document.getElementById('ethiopiaTime'),b=document.getElementById('utcTime'),d=document.getElementById('clock');" +
                    "if(a)a.textContent=et;if(b)b.textContent=ut;if(d)d.textContent=et;}" +
                    "c();if(!window.__jonNativeClock)window.__jonNativeClock=setInterval(c,1000);" +
                    "}catch(e){}})();", null);
            }

            @Override public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame() && isOnline()) {
                    handler.postDelayed(() -> view.reload(), 1200);
                }
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl();
                String url=uri.toString();
                if(url.startsWith(HOME)) return false;
                if(url.contains("github.com") || url.contains("raw.githubusercontent.com") || url.contains("githubusercontent.com")) return true;
                try { startActivity(new Intent(Intent.ACTION_VIEW,uri)); return true; }
                catch(Exception ignored) { return true; }
            }
        });

        setContentView(root);
        if (savedInstanceState != null && savedInstanceState.getBundle("webview_state") != null) {
            webView.restoreState(savedInstanceState.getBundle("webview_state"));
        } else {
            loadHome();
        }
        checkForUpdate();
    }

    private void checkForUpdate() {
        AsyncTask.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(UPDATE_URL);
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(5000);
                connection.setRequestMethod("GET");
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return;
                BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                StringBuilder body = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
                reader.close();
                JSONObject update = new JSONObject(body.toString());
                int latestCode = update.optInt("latestVersionCode", CURRENT_VERSION_CODE);
                String latestName = update.optString("latestVersionName", "");
                String downloadUrl = update.optString("downloadUrl", "https://github.com/jonjossy0-cpu/JON-stream/releases/latest");
                if (latestCode <= CURRENT_VERSION_CODE || isFinishing()) return;
                runOnUiThread(() -> showUpdateDialog(latestName, downloadUrl));
            } catch (Exception ignored) {
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void showUpdateDialog(String versionName, String downloadUrl) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
            .setTitle("JON Stream Update Available")
            .setMessage("A new version of JON Stream is available: " + versionName + "\\n\\nUpdate now to get the latest improvements.")
            .setNegativeButton("LATER", null)
            .setPositiveButton("UPDATE NOW", (dialog, which) -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl)));
                } catch (Exception ignored) {
                }
            })
            .setCancelable(true)
            .show();
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
            if(k==KeyEvent.KEYCODE_CHANNEL_UP || k==KeyEvent.KEYCODE_PAGE_UP) { channelStep(1); return true; }
            if(k==KeyEvent.KEYCODE_CHANNEL_DOWN || k==KeyEvent.KEYCODE_PAGE_DOWN) { channelStep(-1); return true; }

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