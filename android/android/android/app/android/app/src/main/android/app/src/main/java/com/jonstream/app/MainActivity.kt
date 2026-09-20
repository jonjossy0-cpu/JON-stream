package com.jonstream.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    private val jonStreamUrl =
        "https://jonjossy0-cpu.github.io/JON-stream/"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
        }

        webView.webViewClient = object : WebViewClient() {

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false

                // JON Stream pages stay inside the app.
                if (url.startsWith("https://jonjossy0-cpu.github.io/JON-stream/")) {
                    return false
                }

                // Social-media and other external links open with
                // the appropriate installed app/browser.
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    true
                } catch (_: Exception) {
                    false
                }
            }
        }

        if (isOnline()) {
            webView.loadUrl(jonStreamUrl)
        } else {
            webView.loadData(
                """
                <html>
                <body style="text-align:center;padding-top:30%;">
                    <h2>No Internet Connection</h2>
                    <p>Please connect to the Internet and try again.</p>
                </body>
                </html>
                """.trimIndent(),
                "text/html",
                "UTF-8"
            )
        }

        setContentView(webView)
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(CONNECTIVITY_SERVICE)
                as ConnectivityManager

        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false

        return capabilities.hasCapability(
            NetworkCapabilities.NET_CAPABILITY_INTERNET
        )
    }

    @Deprecated("Deprecated in Android API")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
