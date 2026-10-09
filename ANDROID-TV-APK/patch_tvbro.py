#!/usr/bin/env python3
"""Apply the JON Stream TV-only customization to a pinned TV Bro checkout.

This intentionally modifies only the temporary TV Bro source checkout used by
ANDROID-TV-APK's build workflow. It never edits the Mobile APK source.
"""
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: patch_tvbro.py <tv-bro-checkout>")

root = Path(sys.argv[1])
gradle = root / "app/build.gradle.kts"
strings = root / "app/src/main/res/values/strings.xml"
activity = root / "app/src/main/java/com/phlox/tvwebbrowser/activity/main/MainActivity.kt"

def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one {label} match in {path}, found {count}; refusing an unsafe patch.")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")

replace_once(
    gradle,
    'applicationId = "com.phlox.tvwebbrowser"',
    'applicationId = "com.jonstream.tv"',
    "TV-only application id",
)
replace_once(
    gradle,
    'versionCode = 69',
    'versionCode = 10',
    "TV app version code",
)
replace_once(
    gradle,
    'versionName = "2.1.6"',
    'versionName = "10.0"',
    "TV app version name",
)
replace_once(
    strings,
    '<string name="app_name">TV Bro: TV Web Browser</string>',
    '<string name="app_name">JON Stream TV</string>',
    "TV launcher label",
)
replace_once(
    strings,
    '<string name="app_name_short" translatable="false">TV Bro</string>',
    '<string name="app_name_short" translatable="false">JON Stream TV</string>',
    "short TV launcher label",
)

# Keep TV Bro's complete browser features, but force JON Stream to be the
# initial page on ordinary app launches. External VIEW intents still work.
replace_once(
    activity,
    '    companion object {\n        private val TAG = MainActivity::class.java.simpleName',
    '    companion object {\n        private const val JON_STREAM_URL = "https://jonjossy0-cpu.github.io/JON-stream/"\n        private val TAG = MainActivity::class.java.simpleName',
    "JON Stream URL constant",
)
replace_once(
    activity,
    '        setContentView(vb.root)\n',
    '        setContentView(vb.root)\n        applyJonFullscreen()\n',
    "initial fullscreen setup",
)
replace_once(
    activity,
    '    private var progressBarHideRunnable: Runnable = Runnable {',
    '''    @Suppress("DEPRECATION")
    private fun applyJonFullscreen() {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
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

    private var progressBarHideRunnable: Runnable = Runnable {''',
    "fullscreen helper insertion",
)
replace_once(
    activity,
    '''        val currentTab = tabsModel.currentTab.value
        if (currentTab == null || currentTab.url == settingsModel.homePage) {''',
    '''        if (intent.data == null) {
            val tab = tabsModel.currentTab.value
            if (tab == null) {
                openInNewTab(JON_STREAM_URL, 0, needToHideMenuOverlay = true, navigateImmediately = true)
            } else {
                navigate(JON_STREAM_URL)
            }
        }

        val currentTab = tabsModel.currentTab.value
        if (currentTab == null || currentTab.url == settingsModel.homePage) {''',
    "JON Stream startup navigation",
)

print("TV Bro source patched for JON Stream TV.")
print("Application ID: com.jonstream.tv")
print("Startup URL: https://jonjossy0-cpu.github.io/JON-stream/")
print("Fullscreen + keep-screen-on enabled.")
