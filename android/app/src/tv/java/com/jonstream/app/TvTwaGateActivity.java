package com.jonstream.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.os.Handler;
import android.os.SystemClock;
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

    private static final long MIN_LOADING_MS = 10000L;
    private final Handler handler = new Handler();
    private long loadingStartedAt;
    private boolean relationshipValidated = false;
    private CustomTabsClient tabsClient;
    private CustomTabsSession tabsSession;
    private boolean serviceBound = false;
    private boolean launchStarted = false;
    private TextView statusText;
    private Button retryButton;

    private final Runnable validationTimeout = () -> continueWithTwaFallback();
    private final Runnable networkPoll = () -> {
        if (isFinishing() || launchStarted) return;
        if (hasInternetConnection()) beginTrustValidation();
        else {
            statusText.setText("NO INTERNET");
            handler.postDelayed(networkPoll, 2500L);
        }
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
                relationshipValidated = true;
                launchWhenReady();
            } else {
                // Let Chrome make the final TWA/Digital Asset Links decision. If it
                // cannot establish trust, Chrome retains its normal browser UI rather
                // than leaving the TV app stuck on a RETRY screen.
                continueWithTwaFallback();
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
                launchChromeBrowserFallback();
                return;
            }
            // Preload the page in Chrome while this native loading screen stays visible.
            // The configured TWA splash continues the branded hand-off until navigation completes.
            tabsSession.mayLaunchUrl(START_URI, null, null);
            boolean accepted = tabsSession.validateRelationship(
                CustomTabsService.RELATION_HANDLE_ALL_URLS, TRUSTED_ORIGIN, null);
            if (!accepted) {
                handler.removeCallbacks(validationTimeout);
                continueWithTwaFallback();
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
            if (!launchStarted) launchChromeBrowserFallback();
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
        loadingStartedAt = SystemClock.elapsedRealtime();
        if (!hasInternetConnection()) {
            statusText.setText("NO INTERNET");
            retryButton.setVisibility(View.GONE);
            handler.postDelayed(networkPoll, 2500L);
        } else {
            beginTrustValidation();
        }
    }

    /**
     * Android TV devices can have working internet while Google's connectivity
     * validation probe is blocked. INTERNET is the first-stage signal; Chrome/TWA
     * performs the actual HTTPS navigation.
     */
    private boolean hasInternetConnection() {
        try {
            ConnectivityManager manager =
                    (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (manager == null) return false;
            Network active = manager.getActiveNetwork();
            if (active == null) return false;
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(active);
            return capabilities != null
                    && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception ignored) {
            return false;
        }
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
        retryButton.setOnClickListener(v -> {
            retryButton.setVisibility(View.GONE);
            statusText.setText("JON Stream Loading…");
            loadingStartedAt = SystemClock.elapsedRealtime();
            relationshipValidated = false;
            if (!hasInternetConnection()) {
                showFailure("NO INTERNET");
            } else {
                beginTrustValidation();
            }
        });
        layout.addView(retryButton);

        setContentView(layout);
    }

    private void beginTrustValidation() {
        if (launchStarted) return;
        handler.removeCallbacks(validationTimeout);
        relationshipValidated = false;
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
            launchChromeBrowserFallback();
            return;
        }
        serviceBound = true;
        handler.postDelayed(validationTimeout, 15000L);
    }

    /**
     * Avoid trapping the TV on a native RETRY screen when Chrome's asynchronous
     * trust probe is unavailable or times out. The TWA intent still targets Chrome;
     * Chrome decides whether the origin qualifies for fullscreen TWA mode.
     */
    private void continueWithTwaFallback() {
        if (launchStarted || isFinishing()) return;
        handler.removeCallbacks(validationTimeout);
        if (tabsSession == null) {
            launchChromeBrowserFallback();
            return;
        }
        relationshipValidated = true;
        statusText.setText("JON Stream Loading…");
        launchWhenReady();
    }

    /** Last-resort Chrome-only handoff; never substitutes an embedded WebView. */
    private void launchChromeBrowserFallback() {
        if (launchStarted || isFinishing()) return;
        if (!hasInternetConnection()) {
            statusText.setText("NO INTERNET");
            retryButton.setVisibility(View.GONE);
            handler.postDelayed(networkPoll, 2500L);
            return;
        }
        try {
            launchStarted = true;
            Intent intent = new Intent(Intent.ACTION_VIEW, START_URI);
            intent.setPackage(CHROME_PACKAGE);
            startActivity(intent);
            finish();
        } catch (Exception error) {
            launchStarted = false;
            showFailure("Chrome አልተገኘም። እባክዎ Chrome-ን ያንቁ ወይም ይጫኑ።");
        }
    }

    private void launchWhenReady() {
        if (!relationshipValidated || launchStarted || isFinishing()) return;
        long elapsed = SystemClock.elapsedRealtime() - loadingStartedAt;
        long remaining = MIN_LOADING_MS - elapsed;
        if (remaining > 0L) {
            handler.removeCallbacks(launchAfterMinimumLoading);
            handler.postDelayed(launchAfterMinimumLoading, remaining);
        } else {
            launchTrustedWebsite();
        }
    }

    private final Runnable launchAfterMinimumLoading = this::launchTrustedWebsite;

    private void launchTrustedWebsite() {
        if (!relationshipValidated || launchStarted || isFinishing()) return;
        // Re-check immediately before handing off to Chrome: never reveal the website
        // when the device has lost validated internet during the boot sequence.
        if (!hasInternetConnection()) {
            showFailure("NO INTERNET");
            return;
        }
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
        handler.removeCallbacks(launchAfterMinimumLoading);
        statusText.setText(message);
        retryButton.setVisibility(View.GONE);
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
