package com.refine.writing

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.view.Gravity
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

class DemoActivity : Activity() {
    private lateinit var draft: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(30), dp(22), dp(20))
            setBackgroundColor(0xFFF7F9F8.toInt())
        }
        root.addView(TextView(this).apply {
            text = "Try Refine"
            textSize = 27f
            setTextColor(0xFF12382D.toInt())
        })
        root.addView(TextView(this).apply {
            text = "Choose a goal like Follow-up or Kind boundary, select the draft, then tap ✦ Refine."
            textSize = 15f
            setTextColor(0xFF52625B.toInt())
            setPadding(0, dp(8), 0, dp(18))
        })
        draft = EditText(this).apply {
            setText("hey just checking if you saw this? no worries if not but would be great to know soon")
            textSize = 17f
            gravity = Gravity.TOP or Gravity.START
            minLines = 4
            setPadding(dp(14), dp(14), dp(14), dp(14))
            setBackgroundColor(0xFFFFFFFF.toInt())
            inputType = 0x00020001
        }
        root.addView(draft, LinearLayout.LayoutParams(-1, dp(170)))
        root.addView(Button(this).apply {
            text = "Select sample text"
            setOnClickListener {
                draft.requestFocus()
                draft.setSelection(0, draft.text.length)
                (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
                    .showSoftInput(draft, InputMethodManager.SHOW_IMPLICIT)
            }
        }, LinearLayout.LayoutParams(-1, dp(52)).apply { topMargin = dp(14) })
        setContentView(root)
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
