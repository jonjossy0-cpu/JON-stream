package com.jonstream.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;
import androidx.browser.customtabs.CustomTabsIntent;

public class LauncherActivity extends Activity {
    private static final String HOME = "https://jonjossy0-cpu.github.io/JON-stream/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        openTwa();
    }

    private void openTwa() {
        Uri uri = Uri.parse(HOME);
        try {
            new TrustedWebActivityIntentBuilder(uri)
                    .build()
                    .launchTrustedWebActivity(this);
            finish();
            return;
        } catch (Exception ignored) {
        }

        try {
            CustomTabsIntent intent = new CustomTabsIntent.Builder()
                    .setShowTitle(false)
                    .build();
            intent.launchUrl(this, uri);
            finish();
            return;
        } catch (Exception ignored) {
        }

        try {
            Intent browser = new Intent(Intent.ACTION_VIEW, uri);
            browser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(browser);
            finish();
            return;
        } catch (Exception ignored) {
        }

        try {
            startActivity(new Intent(this, MainActivity.class));
        } catch (Exception ignored) {
        }
        finish();
    }
}
