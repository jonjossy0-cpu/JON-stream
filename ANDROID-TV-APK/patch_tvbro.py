#!/usr/bin/env python3
"""Customize a pinned TV Bro checkout for the isolated JON Stream Android TV APK."""
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
            val tab = tabsModel.currentTab.value
            if (tab == null) {
                openInNewTab(JON_STREAM_URL, 0, needToHideMenuOverlay = true, navigateImmediately = true)
            } else if (tab.url != JON_STREAM_URL) {
                navigate(JON_STREAM_URL)
            }
        }

        val currentTab = tabsModel.currentTab.value
        if (currentTab == null || currentTab.url == settingsModel.homePage) {''', "startup URL")
print("TV Bro customized: isolated package com.jonstream.tvbro, JON Stream startup, hidden browser bars, zero root/WebView insets, edge-to-edge fullscreen, preserved remote controls, and keep-screen-on.")
