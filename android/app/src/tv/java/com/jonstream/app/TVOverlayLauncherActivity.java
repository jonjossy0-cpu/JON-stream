package com.jonstream.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.TextView;

public class TVOverlayLauncherActivity extends Activity {
    private static final int REQUEST_OVERLAY = 7107;
    private boolean settingsOpened = false;
    private boolean twaLaunched = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setGravity(Gravity.CENTER);
        getWindow().setDimAmount(0f);

        TextView fallback = new TextView(this);
        fallback.setText("JON Stream\n\nPreparing TV mode…");
        fallback.setGravity(Gravity.CENTER);
        fallback.setTextSize(22f);
        setContentView(fallback);

        ensureOverlayAndLaunch();
    }

    private void ensureOverlayAndLaunch() {
        if (android.os.Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(this)) {
            settingsOpened = true;
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivityForResult(intent, REQUEST_OVERLAY);
            } catch (Exception ignored) {
                startActivityForResult(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION), REQUEST_OVERLAY);
            }
            return;
        }
        launchTwa();
    }

    private void launchTwa() {
        if (twaLaunched) return;
        twaLaunched = true;

        Intent overlay = new Intent(this, TVChromeOverlayService.class);
        startService(overlay);

        Intent twa = new Intent(this, com.google.androidbrowserhelper.trusted.LauncherActivity.class);
        twa.setAction(Intent.ACTION_MAIN);
        twa.addCategory(Intent.CATEGORY_LAUNCHER);
        startActivity(twa);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_OVERLAY) {
            if (android.os.Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this)) {
                launchTwa();
            } else {
                finish();
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (settingsOpened && !twaLaunched) {
            settingsOpened = false;
            if (android.os.Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this)) {
                launchTwa();
            } else {
                finish();
            }
        }
    }

    @Override
    protected void onDestroy() {
        if (twaLaunched) {
            try {
                stopService(new Intent(this, TVChromeOverlayService.class));
            } catch (Exception ignored) {}
        }
        super.onDestroy();
    }
}
