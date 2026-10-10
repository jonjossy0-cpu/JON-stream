package com.jonstream.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

/**
 * Isolated Android TV launcher that opens the existing JON Stream website
 * in the installed Chrome browser. It intentionally does not render the site
 * in Android WebView because the target box is known to work in Chrome.
 */
public final class MainActivity extends Activity {
    private static final String START_URL = "https://jonjossy0-cpu.github.io/JON-stream/";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        Uri site = Uri.parse(START_URL);
        Intent chromeIntent = new Intent(Intent.ACTION_VIEW, site);
        chromeIntent.setPackage("com.android.chrome");
        chromeIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            startActivity(chromeIntent);
        } catch (ActivityNotFoundException noChrome) {
            // Do not silently fall back to WebView: browser compatibility is the
            // explicit requirement for this box. Let Android offer installed browsers.
            Intent browserIntent = new Intent(Intent.ACTION_VIEW, site);
            browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                startActivity(browserIntent);
            } catch (ActivityNotFoundException noBrowser) {
                Toast.makeText(this,
                        "Google Chrome or another browser is required to open JON Stream.",
                        Toast.LENGTH_LONG).show();
            }
        }
        finish();
    }
}
