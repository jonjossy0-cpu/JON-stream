package com.jonstream.app;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsService;
import androidx.browser.customtabs.CustomTabsServiceConnection;
import androidx.browser.customtabs.CustomTabsSession;
import androidx.browser.trusted.TrustedWebActivityIntent;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;

public class TvTwaGateActivity extends Activity {
    private static final String CHROME_PACKAGE = "com.android.chrome";
    private static final Uri START_URI = Uri.parse("https://jon-stream.vercel.app/?jonNativeTv=1");
    private static final Uri TRUSTED_ORIGIN = Uri.parse("https://jon-stream.vercel.app/");

    private final Handler handler = new Handler();
    private CustomTabsClient tabsClient;
    private CustomTabsSession tabsSession;
    private boolean serviceBound = false;
    private boolean launchStarted = false;
    private TextView statusText;
    private Button retryButton;

    private final Runnable validationTimeout = () -> showFailure(
        "የWebsite ማረጋገጫው ጊዜ ወስዷል። RETRY ይጫኑ።"
    );

    private final Runnable startupCheck = () -> {
        if (isFinishing() || launchStarted) return;
        if (!hasInternetConnection()) {
            showFailure("NO INTERNET");
            return;
        }
        beginTrustValidation();
    };

    private final CustomTabsCallback tabsCallback = new CustomTabsCallback() {
        @Override
        public void onRelationshipValidationResult(
                int relation, Uri requestedOrigin, boolean result, Bundle extras) {
            if (relation != CustomTabsService.RELATION_HANDLE_ALL_URLS
                    || requestedOrigin == null
                    || !TRUSTED_ORIGIN.equals(requestedOrigin)) {
                return;
            }
            handler.removeCallbacks(validationTimeout);
            if (result) {
                launchTrustedWebsite();
            } else {
                showFailure("Website ገና አልተረጋገጠም። ስለዚህ Website-ን አልከፍትም። Retry ይጫኑ።");
            }
        }
    };

    private final CustomTabsServiceConnection tabsConnection = new CustomTabsServiceConnection() {
        @Override
        public void onCustomTabsServiceConnected(android.content.ComponentName name,
                                                  CustomTabsClient client) {
            tabsClient = client;
            client.warmup(0L);
            tabsSession = client.newSession(tabsCallback);
            if (tabsSession == null) {
                showFailure("Chrome የደህንነት ማረጋገጫ ክፍለ-ጊዜ መፍጠር አልቻለም። Retry ይጫኑ።");
                return;
            }
            boolean accepted = tabsSession.validateRelationship(
                CustomTabsService.RELATION_HANDLE_ALL_URLS, TRUSTED_ORIGIN, null);
            if (!accepted) {
                handler.removeCallbacks(validationTimeout);
                showFailure("Chrome የWebsite ማረጋገጫ ጥያቄውን አልተቀበለም። Retry ይጫኑ።");
                return;
            }
            statusText.setText("JON Stream Loading…");
            handler.removeCallbacks(validationTimeout);
            handler.postDelayed(validationTimeout, 15000L);
        }

        @Override
        public void onServiceDisconnected(android.content.ComponentName name) {
            tabsClient = null;
            tabsSession = null;
            if (!launchStarted) showFailure("Chrome ግንኙነት ተቋርጧል። Retry ይጫኑ።");
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);

        buildGateScreen();
        beginTrustValidation();
    }

    private void buildGateScreen() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(48, 36, 48, 36);
        layout.setBackgroundColor(Color.rgb(7, 17, 31));

        ImageView logo = new ImageView(this);
        logo.setImageResource(com.jonstream.app.R.drawable.jon_logo);
        logo.setAdjustViewBounds(true);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(220, 150);
        logoParams.bottomMargin = 18;
        layout.addView(logo, logoParams);

        TextView title = new TextView(this);
        title.setText("JON Stream");
        title.setTextColor(Color.WHITE);
        title.setTextSize(28);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        layout.addView(title);

        statusText = new TextView(this);
        statusText.setText("Website ደህንነቱ እስኪረጋገጥ ድረስ እባክዎ ይጠብቁ…");
        statusText.setTextColor(Color.LTGRAY);
        statusText.setTextSize(17);
        statusText.setGravity(Gravity.CENTER);
        statusText.setPadding(0, 20, 0, 18);
        layout.addView(statusText);

        retryButton = new Button(this);
        retryButton.setText("RETRY");
        retryButton.setVisibility(View.GONE);
        retryButton.setOnClickListener(v -> {\n            retryButton.setVisibility(View.GONE);\n            statusText.setText("JON Stream Loading…");\n            handler.removeCallbacks(startupCheck);\n            handler.postDelayed(startupCheck, 10000L);\n        });
        layout.addView(retryButton);

        setContentView(layout);
    }

    private void beginTrustValidation() {
        if (launchStarted) return;
        handler.removeCallbacks(validationTimeout);
        retryButton.setVisibility(View.GONE);
        statusText.setText("JON Stream Website ደህንነቱ እየተረጋገጠ ነው…");

        if (serviceBound) {
            try { unbindService(tabsConnection); } catch (Exception ignored) {}
            serviceBound = false;
        }
        tabsClient = null;
        tabsSession = null;

        boolean bound = CustomTabsClient.bindCustomTabsService(
                this, CHROME_PACKAGE, tabsConnection);
        if (!bound) {
            showFailure("Chrome Custom Tabs አልተገኘም። Chrome-ን ያዘምኑ ወይም Retry ይጫኑ።");
            return;
        }
        serviceBound = true;
        handler.postDelayed(validationTimeout, 15000L);
    }

    private void launchTrustedWebsite() {
        if (launchStarted || isFinishing()) return;
        if (tabsSession == null) {
            showFailure("የWebsite ማረጋገጫ ተሳክቷል ግን Chrome Session የለም። Retry ይጫኑ።");
            return;
        }
        launchStarted = true;
        handler.removeCallbacks(validationTimeout);
        try {
            TrustedWebActivityIntent twa = new TrustedWebActivityIntentBuilder(START_URI)
                    .build(tabsSession);
            startActivity(twa.getIntent());
            finish();
        } catch (Exception error) {
            launchStarted = false;
            showFailure("TWA መክፈት አልተቻለም። Retry ይጫኑ።");
        }
    }

    private void showFailure(String message) {
        if (isFinishing() || launchStarted) return;
        handler.removeCallbacks(validationTimeout);
        statusText.setText(message);
        retryButton.setVisibility(View.VISIBLE);
        retryButton.requestFocus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (serviceBound) {
            try { unbindService(tabsConnection); } catch (Exception ignored) {}
            serviceBound = false;
        }
        super.onDestroy();
    }
}
