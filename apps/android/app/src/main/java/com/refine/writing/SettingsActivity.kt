package com.refine.writing

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class SettingsActivity : Activity() {
    private val prefs by lazy { getSharedPreferences("refine", Context.MODE_PRIVATE) }
    private var message: TextView? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(247, 249, 246)
        window.navigationBarColor = Color.rgb(247, 249, 246)
        window.decorView.systemUiVisibility = 0x00002000 or 0x00000010

        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(18), dp(20), dp(26))
            setBackgroundColor(0xFFF7F9F6.toInt())
        }

        val hero = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(19), dp(20), dp(20))
            background = rounded(0xFF173F34.toInt(), dp(18))
        }
        val brandLine = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        brandLine.addView(TextView(this).apply {
            text = "✦"
            textSize = 19f
            gravity = Gravity.CENTER
            setTextColor(0xFF183D31.toInt())
            background = rounded(0xFFD7ED7D.toInt(), dp(10))
        }, LinearLayout.LayoutParams(dp(36), dp(36)))
        brandLine.addView(TextView(this).apply {
            text = "refine."
            textSize = 20f
            typeface = Typeface.create("sans-serif", Typeface.BOLD)
            setTextColor(Color.WHITE)
            setPadding(dp(10), 0, 0, 0)
        })
        hero.addView(brandLine)
        hero.addView(TextView(this).apply {
            text = "Work messages,\nmade easier."
            textSize = 27f
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            setTextColor(Color.WHITE)
            setPadding(0, dp(22), 0, dp(7))
        })
        hero.addView(TextView(this).apply {
            text = "Thoughtful follow-ups, clear asks, and kind boundaries—right in your keyboard."
            textSize = 14f
            setTextColor(0xFFD1DFD7.toInt())
            setPadding(0, 0, 0, dp(12))
        })
        hero.addView(TextView(this).apply {
            text = "●  PRIVATE BY DESIGN     ·     NO ACCOUNT NEEDED"
            textSize = 9f
            typeface = Typeface.create("sans-serif", Typeface.BOLD)
            letterSpacing = .07f
            setTextColor(0xFFD7ED7D.toInt())
        })
        page.addView(hero, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(22) })

        title(page, "Connect your computer", "Your draft is rewritten by the model on your computer over an encrypted HTTPS connection.")

        val storedAddress = prefs.getString("api_url", "").orEmpty()
        val emulatorAddress = if (storedAddress == "http://10.0.2.2:8001") {
            "https://localhost:8001".also { prefs.edit().putString("api_url", it).commit() }
        } else storedAddress
        val apiUrl = field("https://localhost:8001", emulatorAddress)
        val token = field("Paste the token from your computer", TokenVault.read(this), secret = true)
        val connectionCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(13), dp(14), dp(4))
            background = rounded(Color.WHITE, dp(13), 0xFFE6EBE5.toInt())
        }
        connectionCard.addView(label("API ADDRESS"))
        connectionCard.addView(apiUrl)
        connectionCard.addView(label("DEVICE TOKEN"))
        connectionCard.addView(token)
        page.addView(connectionCard)
        page.addView(TextView(this).apply {
            text = "Find the address and token in the Refine setup guide on your computer. Drafts stay on your local network."
            textSize = 12f
            setTextColor(0xFF748078.toInt())
            setPadding(dp(3), dp(9), dp(3), dp(4))
        })
        var saveConnectionButton: Button? = null
        val saveConnection = action("Save private connection", primary = true) {
            val normalizedUrl = PrivateApiEndpoint.normalize(apiUrl.text.toString())
            val deviceToken = token.text.toString().trim()
            if (normalizedUrl == null) {
                showStatus("Use a private HTTPS address, such as https://your-mac.local:8001.")
                return@action
            }
            if (deviceToken.length < 32) {
                showStatus("Enter the full device token from Refine on your computer.")
                return@action
            }

            val saved = runCatching {
                TokenVault.write(this, deviceToken) &&
                    prefs.edit().putString("api_url", normalizedUrl).commit()
            }.getOrDefault(false)
            if (!saved) {
                showStatus("Could not save the connection. Check device storage and try again.")
                return@action
            }

            showStatus("Connection saved. Checking the local model…")
            saveConnectionButton?.isEnabled = false
            Thread {
                val result = checkConnection(normalizedUrl, deviceToken)
                mainHandler.post {
                    saveConnectionButton?.isEnabled = true
                    showStatus(result)
                }
            }.start()
        }
        saveConnectionButton = saveConnection
        page.addView(saveConnection, LinearLayout.LayoutParams(-1, dp(50)).apply { topMargin = dp(12); bottomMargin = dp(22) })

        title(page, "Turn on the Refine keyboard", "Android will ask you to enable it, then choose it whenever you want to write.")
        val enableRow = stepCard("1", "Enable Refine", "Allow the keyboard in Android settings")
        enableRow.addView(action("Open keyboard settings", outlined = true) {
            startActivity(Intent("android.settings.INPUT_METHOD_SETTINGS"))
        }, LinearLayout.LayoutParams(-1, dp(45)).apply { topMargin = dp(10) })
        page.addView(enableRow, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(10) })

        val switchRow = stepCard("2", "Choose Refine when you type", "Use the keyboard switcher in any text field")
        switchRow.addView(action("Choose keyboard", outlined = true) {
            (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker()
        }, LinearLayout.LayoutParams(-1, dp(45)).apply { topMargin = dp(10) })
        page.addView(switchRow, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(10) })

        page.addView(action("Try a sample message", primary = false) {
            startActivity(Intent(this, DemoActivity::class.java))
        }, LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(5); bottomMargin = dp(10) })
        message = TextView(this).apply {
            textSize = 12f
            setTextColor(0xFF287453.toInt())
            gravity = Gravity.CENTER
            setPadding(0, dp(6), 0, dp(6))
        }
        page.addView(message)
        page.addView(TextView(this).apply {
            text = "Refine appears in your keyboard toolbar. It does not float over other apps. Background App Refresh is an iPhone setting and is not used on Android."
            textSize = 11f
            gravity = Gravity.CENTER
            setTextColor(0xFF89948D.toInt())
            setPadding(dp(5), dp(10), dp(5), 0)
        })

        setContentView(ScrollView(this).apply { isFillViewport = true; addView(page) })
        val savedAddress = prefs.getString("api_url", "").orEmpty()
        when {
            savedAddress.isNotBlank() && PrivateApiEndpoint.normalize(savedAddress) == null ->
                showStatus("Your saved address is not private HTTPS. Update it and save again.")
            TokenVault.read(this).isBlank() ->
                showStatus("Add the device token from Refine on your computer, then save.")
        }
    }

    private fun title(parent: LinearLayout, heading: String, subtitle: String) {
        parent.addView(TextView(this).apply {
            text = heading
            textSize = 18f
            typeface = Typeface.create("sans-serif", Typeface.BOLD)
            setTextColor(0xFF253B30.toInt())
        })
        parent.addView(TextView(this).apply {
            text = subtitle
            textSize = 12f
            setTextColor(0xFF78847C.toInt())
            setPadding(0, dp(5), 0, dp(12))
        })
    }

    private fun label(value: String) = TextView(this).apply {
        text = value
        textSize = 9f
        letterSpacing = .06f
        typeface = Typeface.create("sans-serif", Typeface.BOLD)
        setTextColor(0xFF748177.toInt())
        setPadding(dp(1), dp(7), 0, dp(5))
    }

    private fun field(hint: String, value: String, secret: Boolean = false) = EditText(this).apply {
        this.hint = hint
        setText(value)
        textSize = 14f
        setSingleLine(true)
        inputType = if (secret) 0x00000081 else 0x00000011
        setTextColor(0xFF263A30.toInt())
        setHintTextColor(0xFFA0AAA3.toInt())
        setPadding(dp(1), dp(7), dp(1), dp(11))
        background = null
        layoutParams = LinearLayout.LayoutParams(-1, dp(45))
    }

    private fun stepCard(number: String, heading: String, detail: String) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(14), dp(13), dp(14), dp(14))
        background = rounded(Color.WHITE, dp(13), 0xFFE6EBE5.toInt())
        val row = LinearLayout(this@SettingsActivity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        row.addView(TextView(this@SettingsActivity).apply {
            text = number
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setTextColor(0xFF447253.toInt())
            background = rounded(0xFFEDF4E8.toInt(), dp(8))
        }, LinearLayout.LayoutParams(dp(28), dp(28)))
        val labels = LinearLayout(this@SettingsActivity).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(10), 0, 0, 0) }
        labels.addView(TextView(this@SettingsActivity).apply { text = heading; textSize = 12f; typeface = Typeface.DEFAULT_BOLD; setTextColor(0xFF35473C.toInt()) })
        labels.addView(TextView(this@SettingsActivity).apply { text = detail; textSize = 10f; setTextColor(0xFF89938C.toInt()); setPadding(0, dp(3), 0, 0) })
        row.addView(labels)
        addView(row)
    }

    private fun action(label: String, primary: Boolean = false, outlined: Boolean = false, callback: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 13f
        typeface = Typeface.create("sans-serif", Typeface.BOLD)
        setTextColor(when { primary -> Color.WHITE; outlined -> 0xFF356448.toInt(); else -> 0xFF4B6254.toInt() })
        background = when { primary -> rounded(0xFF1B5844.toInt(), dp(10)); outlined -> rounded(Color.WHITE, dp(10), 0xFFDCE7DC.toInt()); else -> rounded(0xFFEDF3E9.toInt(), dp(10)) }
        stateListAnimator = null
        setOnClickListener { callback() }
    }

    private fun showStatus(text: String) { message?.text = text }

    private fun checkConnection(base: String, token: String): String {
        val connection = runCatching {
            (URL("$base/health").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                instanceFollowRedirects = false
                connectTimeout = 5_000
                readTimeout = 5_000
                setRequestProperty("X-Refine-Token", token)
            }
        }.getOrNull() ?: return "Saved, but the private API address is invalid."
        return try {
            val code = connection.responseCode
            val body = (if (code in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            when {
                code == 401 -> "Saved, but the device token was rejected. Check it on your computer."
                code in 200..299 && JSONObject(body).optString("status") == "ok" ->
                    "Saved and connected to the local model."
                code == 503 -> "Saved, but the local model server is offline. Start it on your computer."
                else -> "Saved, but Refine could not connect. Check the HTTPS address and computer API."
            }
        } catch (_: Exception) {
            "Saved, but Refine could not reach the computer. Check HTTPS, Wi-Fi, and the API server."
        } finally {
            connection.disconnect()
        }
    }

    private fun rounded(color: Int, radius: Int, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius.toFloat()
        stroke?.let { setStroke(dp(1), it) }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
