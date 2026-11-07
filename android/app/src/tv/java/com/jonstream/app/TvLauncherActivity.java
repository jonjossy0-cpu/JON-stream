package com.jonstream.app;

import android.app.Activity;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.graphics.Color;
import android.graphics.Typeface;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * Keeps Chrome Trusted Web Activity as the online player, but prevents Chrome's
 * offline error page from replacing the JON Stream startup screen.
 */
public class TvLauncherActivity extends LauncherActivity {
    private final Handler handler = new Handler();
    private boolean twaStarted = false;
    private Runnable networkRetry;

    @Override
    protected boolean shouldLaunchImmediately() {
        // Let this activity check internet access before Chrome is opened.
        return false;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enterImmersive();
        if (hasValidatedInternet()) {
            launchWebsiteInChrome();
        } else {
            showNoInternetScreen();
            scheduleNetworkRetry();
        }
    }

    private boolean hasValidatedInternet() {
        try {
            ConnectivityManager manager =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager == null) return false;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network active = manager.getActiveNetwork();
                if (active == null) return false;
                NetworkCapabilities caps = manager.getNetworkCapabilities(active);
                return caps != null
                    && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
            }

            NetworkInfo info = manager.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (Exception ignored) {
            return false;
        }
    }

    private void launchWebsiteInChrome() {
        if (twaStarted || isFinishing()) return;
        twaStarted = true;
        if (networkRetry != null) handler.removeCallbacks(networkRetry);
        // The website is opened by Chrome TWA, not by an embedded WebView.
        launchTwa();
    }

    private void showNoInternetScreen() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(7, 17, 31));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        float density = getResources().getDisplayMetrics().density;
        content.setPadding((int)(32*density), (int)(24*density),
            (int)(32*density), (int)(24*density));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.jon_logo);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setAdjustViewBounds(true);
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(
            (int)(getResources().getDisplayMetrics().widthPixels * 0.48f),
            (int)(getResources().getDisplayMetrics().heightPixels * 0.40f));
        logoParams.bottomMargin = (int)(22*density);
        content.addView(logo, logoParams);

        TextView title = new TextView(this);
        title.setText("NO INTERNET CONNECTION");
        title.setTextColor(Color.WHITE);
        title.setTextSize(27);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        content.addView(title);

        TextView detail = new TextView(this);
        detail.setText("Please connect your TV to the internet.");
        detail.setTextColor(Color.LTGRAY);
        detail.setTextSize(18);
        detail.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams detailParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        detailParams.topMargin = (int)(12*density);
        content.addView(detail, detailParams);

        Button retry = new Button(this);
        retry.setText("RETRY");
        retry.setTextSize(18);
        retry.setFocusable(true);
        retry.setOnClickListener(v -> {
            if (hasValidatedInternet()) launchWebsiteInChrome();
            else detail.setText("Still offline. Check your TV's internet connection.");
        });
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(
            (int)(190*density), LinearLayout.LayoutParams.WRAP_CONTENT);
        retryParams.topMargin = (int)(24*density);
        content.addView(retry, retryParams);

        root.addView(content, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        setContentView(root);
        retry.requestFocus();
        enterImmersive();
    }

    private void scheduleNetworkRetry() {
        networkRetry = new Runnable() {
            @Override public void run() {
                if (isFinishing() || twaStarted) return;
                if (hasValidatedInternet()) {
                    launchWebsiteInChrome();
                } else {
                    handler.postDelayed(this, 4000L);
                }
            }
        };
        handler.postDelayed(networkRetry, 4000L);
    }

    private void enterImmersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersive();
    }

    @Override
    protected void onDestroy() {
        if (networkRetry != null) handler.removeCallbacks(networkRetry);
        super.onDestroy();
    }
}
