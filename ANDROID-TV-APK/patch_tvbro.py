#!/usr/bin/env python3
"""Customize a pinned TV Bro checkout for the JON Stream Android TV APK."""
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: patch_tvbro.py <tv-bro-checkout>")
root = Path(sys.argv[1])

def replace_once(relative_path: str, old: str, new: str, label: str) -> None:
    path = root / relative_path
    content = path.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one {label} match in {relative_path}; found {count}.")
    path.write_text(content.replace(old, new, 1), encoding="utf-8")

replace_once("app/build.gradle.kts", 'applicationId = "com.phlox.tvwebbrowser"', 'applicationId = "com.jonstream.tv"', "application id")
replace_once("app/build.gradle.kts", "versionCode = 69", "versionCode = 10", "version code")
replace_once("app/build.gradle.kts", 'versionName = "2.1.6"', 'versionName = "10.0"', "version name")
replace_once("app/src/main/res/values/strings.xml", '<string name="app_name">TV Bro: TV Web Browser</string>', '<string name="app_name">JON Stream TV</string>', "app label")
replace_once("app/src/main/res/values/strings.xml", '<string name="app_name_short" translatable="false">TV Bro</string>', '<string name="app_name_short" translatable="false">JON Stream TV</string>', "short app label")
activity = "app/src/main/java/com/phlox/tvwebbrowser/activity/main/MainActivity.kt"
replace_once(activity, '    companion object {\n        private val TAG = MainActivity::class.java.simpleName', '    companion object {\n        private const val JON_STREAM_URL = "https://jonjossy0-cpu.github.io/JON-stream/"\n        private val TAG = MainActivity::class.java.simpleName', "JON Stream URL")
replace_once(activity, '        setContentView(vb.root)\n', '        setContentView(vb.root)\n        applyJonFullscreen()\n', "fullscreen activation")
replace_once(activity, '    private var progressBarHideRunnable: Runnable = Runnable {', '''    @Suppress("DEPRECATION")
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

    private var progressBarHideRunnable: Runnable = Runnable {''', "fullscreen helper")
replace_once(activity, '''        val currentTab = tabsModel.currentTab.value
        if (currentTab == null || currentTab.url == settingsModel.homePage) {''', '''        if (intent.data == null) {
            val tab = tabsModel.currentTab.value
            if (tab == null) {
                openInNewTab(JON_STREAM_URL, 0, needToHideMenuOverlay = true, navigateImmediately = true)
            } else {
                navigate(JON_STREAM_URL)
            }
        }

        val currentTab = tabsModel.currentTab.value
        if (currentTab == null || currentTab.url == settingsModel.homePage) {''', "startup URL")
print("TV Bro customized for JON Stream TV: app ID, label, startup URL, fullscreen and keep-screen-on.")
