package com.refine.writing

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.inputmethodservice.InputMethodService
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import android.widget.PopupMenu
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.io.IOException
import java.util.concurrent.Executors

class RefineImeService : InputMethodService() {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var status: TextView? = null
    private var upper = false
    private var numbers = false
    private var busy = false
    private var pendingSource: String? = null
    private var pendingRewrite: String? = null
    private var statusText = "Select a work message"
    private var writingGoal = "work_message"
    private var goalLabel = "Work chat"

    private val writingGoals = linkedMapOf(
        "work_message" to ("Work chat" to "Rewrite this as a clear, tactful workplace message."),
        "follow_up" to ("Follow-up" to "Write a courteous, confident follow-up that makes the next step clear."),
        "clear_ask" to ("Clear ask" to "Make the request specific, easy to understand, and respectful."),
        "boundary" to ("Kind boundary" to "Set a kind, firm boundary without sounding cold or apologetic."),
        "feedback" to ("Feedback" to "Make the feedback constructive, specific, and considerate."),
    )

    override fun onCreateInputView(): View = keyboard()

    private fun keyboard(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(5), dp(6), dp(5), dp(8))
            setBackgroundColor(RefinePalette.canvas)
        }
        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(5), 0, dp(5), 0)
            background = round(Color.WHITE, dp(12), RefinePalette.line)
        }
        val goal = Button(this).apply {
            text = "$goalLabel ▾"
            isAllCaps = false
            setTextColor(RefinePalette.accent)
            setBackground(round(RefinePalette.lavender, dp(10)))
            textSize = 12f
            typeface = Typeface.create("sans-serif", Typeface.BOLD)
            setOnClickListener { showGoalMenu(this) }
        }
        toolbar.addView(goal, LinearLayout.LayoutParams(dp(104), dp(36)))
        val refine = Button(this).apply {
            text = when {
                busy -> "Working…"
                pendingRewrite != null -> "Insert"
                else -> "✦ Refine"
            }
            isAllCaps = false
            setTextColor(Color.WHITE)
            setBackground(round(RefinePalette.accent, dp(12)))
            textSize = 14f
            typeface = Typeface.create("sans-serif", Typeface.BOLD)
            setOnClickListener {
                if (pendingRewrite != null) applySuggestion() else paraphraseSelection()
            }
        }
        toolbar.addView(refine, LinearLayout.LayoutParams(dp(96), dp(38)).apply { leftMargin = dp(5) })
        status = TextView(this).apply {
            text = statusText
            textSize = 12f
            setTextColor(RefinePalette.muted)
            maxLines = 1
            setPadding(dp(10), 0, dp(4), 0)
        }
        toolbar.addView(status, LinearLayout.LayoutParams(0, dp(38), 1f))
        root.addView(toolbar, rowParams(40))

        pendingRewrite?.let { suggestion ->
            val review = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(10), dp(4), dp(6), dp(4))
                background = round(Color.WHITE, dp(10), RefinePalette.line)
            }
            review.addView(TextView(this).apply {
                text = suggestion
                textSize = 12f
                setTextColor(0xFF4D3A82.toInt())
                maxLines = 2
                ellipsize = android.text.TextUtils.TruncateAt.END
                gravity = Gravity.CENTER_VERTICAL
            }, LinearLayout.LayoutParams(0, -1, 1f))
            review.addView(Button(this).apply {
                text = "Try again"
                isAllCaps = false
                textSize = 11f
                setTextColor(RefinePalette.accent)
                setBackground(round(RefinePalette.lavender, dp(9)))
                setOnClickListener { retrySuggestion() }
            }, LinearLayout.LayoutParams(dp(82), dp(36)).apply { leftMargin = dp(5) })
            root.addView(review, rowParams(52))
        }

        val first = if (numbers) "1234567890" else "qwertyuiop"
        val second = if (numbers) "@#$&*()-+" else "asdfghjkl"
        root.addView(keyRow(first.map { it.toString() }, 43))
        root.addView(keyRow(second.map { it.toString() }, 43, inset = !numbers))

        val third = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        if (numbers) {
            third.addView(key("ABC", 44) { numbers = false; refreshKeyboard() }, weighted(1.4f))
            listOf(".", ",", "?", "!").forEach { symbol -> third.addView(key(symbol, 40) { type(symbol) }, weighted()) }
            third.addView(key("⌫", 44) { delete() }, weighted(1.4f))
        } else {
            third.addView(key("⇧", 44) { upper = !upper; refreshKeyboard() }, weighted(1.5f))
            "zxcvbnm".forEach { letter -> third.addView(key(if (upper) letter.uppercase() else letter.toString(), 40) { type(if (upper) letter.uppercase() else letter.toString()); if (upper) { upper = false; refreshKeyboard() } }, weighted()) }
            third.addView(key("⌫", 44) { delete() }, weighted(1.5f))
        }
        root.addView(third, rowParams(44))

        val bottom = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        bottom.addView(key(if (numbers) "ABC" else "123", 44) { numbers = !numbers; refreshKeyboard() }, weighted(1.2f))
        bottom.addView(key("🌐", 44) { (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker() }, weighted())
        bottom.addView(key("space", 40) { type(" ") }, weighted(4f))
        bottom.addView(key("return", 44) { sendEnter() }, weighted(1.6f))
        root.addView(bottom, rowParams(44))
        return root
    }

    private fun keyRow(labels: List<String>, height: Int, inset: Boolean = false): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER
        if (inset) setPadding(dp(14), 0, dp(14), 0)
        labels.forEach { label -> addView(key(label, height) { type(if (upper) label.uppercase() else label) }, weighted()) }
    }

    private fun key(label: String, height: Int, action: () -> Unit) = TextView(this).apply {
        text = label
        textSize = if (label.length > 1) 13f else 20f
        gravity = Gravity.CENTER
        setTextColor(RefinePalette.text)
        typeface = Typeface.create("sans-serif", Typeface.NORMAL)
        val special = label in setOf("123", "ABC", "🌐", "return", "⇧", "⌫")
        background = if (label == "space") round(RefinePalette.surface, dp(6))
            else if (special) round(0xFFEAE6F0.toInt(), dp(7))
            else round(Color.WHITE, dp(7), RefinePalette.line)
        setOnClickListener { action() }
        layoutParams = LinearLayout.LayoutParams(0, dp(height), 1f).apply {
            setMargins(dp(2), dp(2), dp(2), dp(2))
        }
    }

    private fun paraphraseSelection() {
        if (busy) return
        val selected = currentInputConnection?.getSelectedText(0)?.toString()
        if (selected.isNullOrBlank()) {
            setStatus("Select text in the field first")
            return
        }
        requestRewrite(selected)
    }

    private fun requestRewrite(selected: String) {
        val prefs = getSharedPreferences("refine", Context.MODE_PRIVATE)
        val base = prefs.getString("api_url", "").orEmpty().trimEnd('/')
        val token = TokenVault.read(this)
        if (PrivateApiEndpoint.normalize(base) == null || token.isBlank()) {
            setStatus("Set a private API URL and token in Refine")
            return
        }

        busy = true
        refreshKeyboard()
        setStatus("Paraphrasing locally…")
        worker.execute {
            val outcome = runCatching { requestRewrite(base, token, selected) }
            main.post {
                busy = false
                val rewritten = outcome.getOrNull()
                if (rewritten.isNullOrBlank()) {
                    statusText = outcome.exceptionOrNull()?.message ?: "No rewrite returned"
                } else {
                    pendingSource = selected
                    pendingRewrite = rewritten
                    statusText = "Suggestion ready"
                }
                refreshKeyboard()
            }
        }
    }

    private fun applySuggestion() {
        val expected = pendingSource ?: return
        val suggestion = pendingRewrite ?: return
        val selectedNow = currentInputConnection?.getSelectedText(0)?.toString()
        if (selectedNow != expected) {
            setStatus("Re-select the original text to use this version")
            return
        }
        currentInputConnection?.commitText(suggestion, 1)
        pendingSource = null
        pendingRewrite = null
        statusText = "Draft updated"
        refreshKeyboard()
    }

    private fun retrySuggestion() {
        val source = pendingSource ?: return
        requestRewrite(source)
    }

    private fun requestRewrite(base: String, token: String, text: String): String {
        val connection = (URL("$base/rewrite").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            instanceFollowRedirects = false
            connectTimeout = 8_000
            readTimeout = 120_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Refine-Token", token)
        }
        try {
            val goal = writingGoals[writingGoal]?.second ?: writingGoals.getValue("work_message").second
            val answers = JSONObject()
                .put("audience", "a colleague or work contact")
                .put("goal", goal)
            val payload = JSONObject().put("text", text).put("tone", "kind")
                .put("answers", answers).put("seed", (0..99_999).random()).toString()
            connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) {
                val detail = runCatching { JSONObject(body).optString("detail") }.getOrDefault("Refine API error ($code)")
                throw IllegalStateException(detail)
            }
            return body.lineSequence().filter { it.startsWith("data: ") }
                .map { it.removePrefix("data: ") }
                .filter { it != "[DONE]" }
                .joinToString("") { it.replace("\\n", "\n") }
        } catch (error: IOException) {
            throw IllegalStateException("Can't reach Refine. Check the Mac API and Wi-Fi.", error)
        } finally {
            connection.disconnect()
        }
    }

    private fun showGoalMenu(anchor: View) {
        val menu = PopupMenu(this, anchor)
        writingGoals.forEach { (id, option) ->
            menu.menu.add(option.first).setOnMenuItemClickListener {
                writingGoal = id
                goalLabel = option.first
                refreshKeyboard()
                true
            }
        }
        menu.show()
    }

    private fun type(text: String) { currentInputConnection?.commitText(text, 1) }
    private fun setStatus(message: String) {
        statusText = message
        status?.text = message
    }
    private fun delete() { currentInputConnection?.deleteSurroundingText(1, 0) }
    private fun sendEnter() {
        currentInputConnection?.sendKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_ENTER))
        currentInputConnection?.sendKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, android.view.KeyEvent.KEYCODE_ENTER))
    }
    private fun refreshKeyboard() { setInputView(keyboard()) }
    private fun round(color: Int, radius: Int, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius.toFloat()
        stroke?.let { setStroke(dp(1), it) }
    }
    private fun weighted(weight: Float = 1f) = LinearLayout.LayoutParams(0, dp(40), weight)
    private fun rowParams(height: Int) = LinearLayout.LayoutParams(-1, dp(height)).apply { bottomMargin = dp(3) }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
