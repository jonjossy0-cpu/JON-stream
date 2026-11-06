package com.jonstream.app;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.List;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

/**
 * Android-TV-only native HLS player. Launched from the TV Trusted Web Activity
 * after the web app has completed its existing parental and Premium checks.
 */
public final class NativePlayerActivity extends Activity {
    private static final int MAX_SOURCES = 4;
    private final Handler handler = new Handler();
    private final List<String> sources = new ArrayList<>();

    private ExoPlayer player;
    private PlayerView playerView;
    private TextView statusView;
    private String channelName = "JON Stream";
    private int sourceIndex = 0;
    private int retryCount = 0;
    private Runnable recoveryTask;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterImmersive();

        if (!readLaunchRequest(getIntent() == null ? null : getIntent().getData())) {
            finish();
            return;
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        root.setKeepScreenOn(true);

        playerView = new PlayerView(this);
        playerView.setUseController(true);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        playerView.setKeepScreenOn(true);
        root.addView(playerView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        TextView titleView = new TextView(this);
        titleView.setText(channelName);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(18);
        titleView.setGravity(Gravity.CENTER_VERTICAL);
        titleView.setPadding(dp(20), dp(12), dp(20), dp(12));
        titleView.setBackgroundColor(0x9907111F);
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.START);
        titleParams.setMargins(dp(24), dp(18), dp(24), 0);
        root.addView(titleView, titleParams);

        statusView = new TextView(this);
        statusView.setText("Connecting to live stream…");
        statusView.setTextColor(Color.WHITE);
        statusView.setTextSize(13);
        statusView.setPadding(dp(14), dp(8), dp(14), dp(8));
        statusView.setBackgroundColor(0x9907111F);
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.START);
        statusParams.setMargins(dp(24), 0, dp(24), dp(22));
        root.addView(statusView, statusParams);

        setContentView(root);
        initializePlayer();
        prepareCurrentSource();
    }

    private boolean readLaunchRequest(Uri data) {
        if (data == null || !"jonstream".equalsIgnoreCase(data.getScheme())
                || !"play".equalsIgnoreCase(data.getHost())) {
            return false;
        }

        String requestedName = data.getQueryParameter("name");
        if (requestedName != null && !requestedName.trim().isEmpty()) {
            channelName = requestedName.trim();
        }

        String rawSources = data.getQueryParameter("sources");
        if (rawSources == null || rawSources.length() > 24000) return false;

        try {
            JSONArray array = new JSONArray(rawSources);
            for (int i = 0; i < array.length() && sources.size() < MAX_SOURCES; i++) {
                String candidate = array.optString(i, "").trim();
                if (candidate.isEmpty()) continue;
                Uri uri = Uri.parse(candidate);
                // Only secure HLS endpoints are accepted from the external deep link.
                if ("https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
                        && !sources.contains(candidate)) {
                    sources.add(candidate);
                }
            }
        } catch (Exception ignored) {
            return false;
        }
        return !sources.isEmpty();
    }

    private void initializePlayer() {
        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                // Modest live buffer for weak networks without allowing a large RAM build-up.
                .setBufferDurationsMs(12000, 45000, 3000, 6000)
                .setTargetBufferBytes(32 * 1024 * 1024)
                .setPrioritizeTimeOverSizeThresholds(true)
                .build();

        DefaultHttpDataSource.Factory httpFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent("JON Stream Android TV")
                .setConnectTimeoutMs(12000)
                .setReadTimeoutMs(20000)
                .setAllowCrossProtocolRedirects(true);

        player = new ExoPlayer.Builder(this)
                .setLoadControl(loadControl)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(httpFactory))
                .build();
        playerView.setPlayer(player);

        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_BUFFERING) {
                    setStatus("Buffering live stream…");
                } else if (playbackState == Player.STATE_READY) {
                    retryCount = 0;
                    setStatus("Connected • " + channelName);
                } else if (playbackState == Player.STATE_ENDED) {
                    setStatus("Stream ended • reconnecting…");
                    scheduleRecovery();
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                setStatus("Stream interrupted • recovering…");
                scheduleRecovery();
            }
        });
    }

    private void prepareCurrentSource() {
        if (player == null || sources.isEmpty()) return;
        cancelRecovery();
        String url = sources.get(Math.max(0, Math.min(sourceIndex, sources.size() - 1)));
        MediaMetadata metadata = new MediaMetadata.Builder().setTitle(channelName).build();
        MediaItem item = new MediaItem.Builder()
                .setUri(Uri.parse(url))
                .setMimeType(MimeTypes.APPLICATION_M3U8)
                .setMediaMetadata(metadata)
                .build();
        player.stop();
        player.clearMediaItems();
        player.setMediaItem(item);
        player.prepare();
        player.play();
        setStatus("Connecting • " + channelName);
    }

    private void scheduleRecovery() {
        if (player == null || recoveryTask != null) return;
        final long delay;
        if (retryCount < 2) {
            retryCount++;
            delay = retryCount == 1 ? 1500L : 4000L;
            setStatus("Reconnecting (" + retryCount + "/2)…");
        } else {
            retryCount = 0;
            sourceIndex = (sourceIndex + 1) % sources.size();
            delay = sourceIndex == 0 ? 15000L : 700L;
            setStatus(sourceIndex == 0 ? "Sources unavailable • retrying…" : "Switching to backup source…");
        }
        recoveryTask = () -> {
            recoveryTask = null;
            if (!isFinishing() && player != null) prepareCurrentSource();
        };
        handler.postDelayed(recoveryTask, delay);
    }

    private void cancelRecovery() {
        if (recoveryTask != null) {
            handler.removeCallbacks(recoveryTask);
            recoveryTask = null;
        }
    }

    private void setStatus(String message) {
        if (statusView != null) statusView.setText(message);
    }

    private void enterImmersive() {
        getWindow().getDecorView().setSystemUiVisibility(
                android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                        | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        cancelRecovery();
        finish();
    }

    @Override
    protected void onStop() {
        if (player != null) player.pause();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        cancelRecovery();
        if (playerView != null) playerView.setPlayer(null);
        if (player != null) {
            player.release();
            player = null;
        }
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
