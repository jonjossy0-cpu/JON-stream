#!/usr/bin/env python3
"""Customize a pinned TV Bro checkout for the isolated JON Stream Android TV APK."""
from pathlib import Path
import sys
from PIL import Image

if len(sys.argv) != 3:
    raise SystemExit("Usage: patch_tvbro.py <tv-bro-checkout> <jon-stream-logo.png>")
root = Path(sys.argv[1])
logo_path = Path(sys.argv[2])

def replace_once(relative_path: str, old: str, new: str, label: str) -> None:
    path = root / relative_path
    content = path.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one {label} match in {relative_path}; found {count}.")
    path.write_text(content.replace(old, new, 1), encoding="utf-8")

# Use the existing JON Stream PNG from the repository for every launcher density.
# Keep the whole logo visible on a transparent square canvas rather than cropping it.
try:
    with Image.open(logo_path) as source:
        logo = source.convert("RGBA")
        if logo.width < 1 or logo.height < 1:
            raise SystemExit("JON Stream logo PNG is empty.")
        for density, size in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
            canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            fitted = logo.copy()
            fitted.thumbnail((round(size * 0.86), round(size * 0.86)), Image.Resampling.LANCZOS)
            canvas.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
            output = root / f"app/src/main/res/drawable-{density}/ic_launcher.png"
            output.parent.mkdir(parents=True, exist_ok=True)
            canvas.save(output, format="PNG", optimize=True)
except Exception as exc:
    raise SystemExit(f"Failed to create JON Stream launcher icons from {logo_path}: {exc}") from exc

# A distinct package prevents the earlier WebView-shell APK from being mistaken
# for or silently reused as the real TV Bro browser app.
replace_once("app/build.gradle.kts", 'applicationId = "com.phlox.tvwebbrowser"', 'applicationId = "com.jonstream.tvbro"', "isolated TV Bro application id")
replace_once("app/build.gradle.kts", "versionCode = 69", "versionCode = 10", "version code")
replace_once("app/build.gradle.kts", 'versionName = "2.1.6"', 'versionName = "10.0"', "version name")
replace_once("app/src/main/res/values/strings.xml", '<string name="app_name">TV Bro: TV Web Browser</string>', '<string name="app_name">JON Stream TV</string>', "app label")
replace_once("app/src/main/res/values/strings.xml", '<string name="app_name_short" translatable="false">TV Bro</string>', '<string name="app_name_short" translatable="false">JON Stream TV</string>', "short app label")
replace_once("app/src/main/res/layout/activity_main.xml", 'android:fitsSystemWindows="true"', 'android:fitsSystemWindows="false" android:padding="0dp"', "edge-to-edge root layout")
activity = "app/src/main/java/com/phlox/tvwebbrowser/activity/main/MainActivity.kt"
replace_once(activity, '    companion object {\n        private val TAG = MainActivity::class.java.simpleName', '    companion object {\n        private const val JON_STREAM_URL = "https://jonjossy0-cpu.github.io/JON-stream/"\n        private val TAG = MainActivity::class.java.simpleName', "JON Stream URL")
replace_once(activity, '        setContentView(vb.root)\n', '        setContentView(vb.root)\n        vb.root.fitsSystemWindows = false\n        vb.root.setPadding(0, 0, 0, 0)\n        vb.root.clipToPadding = false\n        vb.flWebViewContainer.setPadding(0, 0, 0, 0)\n        vb.flWebViewContainer.clipToPadding = false\n        vb.vActionBar.visibility = View.GONE\n        vb.vTabs.visibility = View.GONE\n        vb.rlActionBar.visibility = View.GONE\n        vb.progressBar.visibility = View.GONE\n        applyJonFullscreen()\n', "hide address bar and fullscreen activation")
replace_once(activity, '                    vb.vActionBar.catchFocus()', '                    tabsModel.currentTab.value?.webEngine?.getView()?.requestFocus()', "preserve remote focus without address bar")
replace_once(activity, '            vb.progressBar.visibility = View.VISIBLE', '            vb.progressBar.visibility = View.GONE', "hide loading progress bar")
replace_once(activity, '        vb.rlActionBar.visibility = View.VISIBLE', '        vb.rlActionBar.visibility = View.GONE', "hide top action bar overlay")
replace_once(activity, '    private var progressBarHideRunnable: Runnable = Runnable {', '''    @Suppress("DEPRECATION")
    private fun applyJonFullscreen() {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (::vb.isInitialized) {
            vb.vActionBar.visibility = View.GONE
            vb.vTabs.visibility = View.GONE
            vb.rlActionBar.visibility = View.GONE
            vb.progressBar.visibility = View.GONE
        }
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyJonFullscreen()
    }

    private var progressBarHideRunnable: Runnable = Runnable {''', "fullscreen helper")
replace_once(activity, '''        val currentTab = tabsModel.currentTab.value
        if (currentTab == null || currentTab.url == settingsModel.homePage) {''', '''        if (intent.data == null) {
            // Always open JON Stream on a normal launcher start, even if TV Bro
            // restored a previous tab or its saved homepage setting is different.
            navigate(JON_STREAM_URL)
        }

        val currentTab = tabsModel.currentTab.value
        if (currentTab == null || currentTab.url == settingsModel.homePage) {''', "startup URL")
print("TV Bro customized: JON Stream app icon from repository Logo.png, isolated package, JON Stream startup, hidden browser bars, zero root/WebView insets, edge-to-edge fullscreen, preserved remote controls, and keep-screen-on.")
