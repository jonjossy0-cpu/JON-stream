package com.jonstream.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
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

        openBrowser();
    }

    private void openBrowser() {
        Uri uri = Uri.parse(HOME);
        try {
            CustomTabsIntent intent = new CustomTabsIntent.Builder()
                    .setShowTitle(false)
                    .build();
            intent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
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
        } catch (Exception ignored) {
            // If no browser is installed, fall back to the existing native WebView activity.
            try {
                startActivity(new Intent(this, MainActivity.class));
            } catch (Exception ignoredAgain) {
            }
            finish();
        }
    }
}
