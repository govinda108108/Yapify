package com.jgil303.yapify

import android.app.*
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.*
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class OverlayService : Service() {

    private enum class State { IDLE, RECORDING, PROCESSING, EDIT_RECORDING, EDIT_PROCESSING }

    private data class ModeData(val id: String, val emoji: String, val name: String, val prompt: String)

    private val modes = listOf(
        ModeData("default", "", "Default", PROMPT_DEFAULT),
        ModeData("email", "\u2709", "Email", PROMPT_EMAIL),
        ModeData("quick", "Q", "Quick", PROMPT_QUICK),
        ModeData("ai", "AI", "Prompt", PROMPT_AI)
    )
    private var currentMode = modes[0]
    private var pendingMode = modes[0]

    // Views
    private lateinit var wm: WindowManager
    private lateinit var dotContainer: FrameLayout
    private lateinit var dotShape: View
    private lateinit var dotParams: WindowManager.LayoutParams
    private var modeTray: View? = null
    private var modeChipViews = mutableListOf<TextView>()
    private var resultCard: View? = null
    private var resultTextView: TextView? = null
    private var editBtn: Button? = null

    // State
    private var state = State.IDLE
    private var recorder: MediaRecorder? = null
    private var audioFile: File? = null
    private var currentOutput = ""

    // Touch / long-press
    private var initX = 0; private var initY = 0
    private var initTx = 0f; private var initTy = 0f
    private var dragging = false
    private var longPressed = false
    private val main = Handler(Looper.getMainLooper())
    private val longPressRunnable = Runnable {
        longPressed = true
        showModeTray()
    }

    override fun onBind(intent: Intent?) = null

    override fun onCreate() {
        super.onCreate()
        startFg()
        createDot()
    }

    override fun onDestroy() {
        recorder?.release()
        main.removeCallbacks(longPressRunnable)
        if (::dotContainer.isInitialized) runCatching { wm.removeView(dotContainer) }
        modeTray?.let { runCatching { wm.removeView(it) } }
        resultCard?.let { runCatching { wm.removeView(it) } }
        super.onDestroy()
    }

    // ── Foreground notification ───────────────────────────────────────────────

    private fun startFg() {
        val ch = "yapify_overlay"
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(ch, "Yapify", NotificationManager.IMPORTANCE_MIN)
                .apply { setShowBadge(false) }
        )
        startForeground(1, Notification.Builder(this, ch)
            .setContentTitle("Yapify")
            .setContentText("Tap to record  |  Hold to change mode")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .build())
    }

    // ── Dot ───────────────────────────────────────────────────────────────────

    private fun createDot() {
        wm = getSystemService(WINDOW_SERVICE) as WindowManager

        dotShape = View(this).apply { background = ovalDrawable(COLOR_IDLE) }
        dotContainer = FrameLayout(this).apply {
            addView(dotShape, FrameLayout.LayoutParams(20.dp, 20.dp).apply { gravity = Gravity.CENTER })
        }

        dotParams = WindowManager.LayoutParams(
            36.dp, 36.dp,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.END; x = 24.dp; y = 200.dp }

        dotContainer.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    initX = dotParams.x; initY = dotParams.y
                    initTx = e.rawX; initTy = e.rawY
                    dragging = false; longPressed = false
                    main.postDelayed(longPressRunnable, 500L)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (initTx - e.rawX).toInt()
                    val dy = (e.rawY - initTy).toInt()
                    if (!dragging && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
                        dragging = true
                        main.removeCallbacks(longPressRunnable)
                    }
                    when {
                        longPressed -> updateModeTraySelection(e.rawY)
                        dragging -> {
                            dotParams.x = initX + dx; dotParams.y = initY + dy
                            wm.updateViewLayout(dotContainer, dotParams)
                        }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    main.removeCallbacks(longPressRunnable)
                    when {
                        longPressed -> { confirmModeSelection(); dismissModeTray() }
                        !dragging -> handleTap()
                    }
                    longPressed = false; dragging = false
                    true
                }
                else -> false
            }
        }

        wm.addView(dotContainer, dotParams)
    }

    private fun setDotColor(hex: String) {
        (dotShape.background as? GradientDrawable)?.setColor(Color.parseColor(hex))
    }

    // ── Mode tray ─────────────────────────────────────────────────────────────

    private fun showModeTray() {
        dismissModeTray()
        modeChipViews.clear()
        pendingMode = currentMode

        val d = resources.displayMetrics.density
        val tray = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = (8 * d).toInt(); setPadding(p, p, p, p)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#1a1d1f"))
                cornerRadius = 14 * d
            }
            elevation = 20 * d
        }

        // Show AI at top, Default at bottom (reversed for thumb reach from right)
        modes.reversed().forEach { mode ->
            val isSelected = mode == currentMode
            val label = if (mode.emoji.isEmpty()) mode.name else "${mode.emoji} ${mode.name}"
            val chip = TextView(this).apply {
                setText(label)
                textSize = 13f
                setTextColor(Color.parseColor(if (isSelected) "#0e1012" else "#eceef0"))
                background = GradientDrawable().apply {
                    setColor(Color.parseColor(if (isSelected) "#2ec4b6" else "#22262a"))
                    cornerRadius = 10 * d
                }
                val hp = (12 * d).toInt(); val vp = (8 * d).toInt()
                setPadding(hp, vp, hp, vp)
            }
            tray.addView(chip, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = (4 * d).toInt() })
            modeChipViews.add(chip)
        }

        modeTray = tray
        wm.addView(tray, WindowManager.LayoutParams(
            (160 * d).toInt(),
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dotParams.x + 44.dp   // to the left of the dot
            y = maxOf(8.dp, dotParams.y - (80 * d).toInt())
        })
    }

    private fun updateModeTraySelection(rawY: Float) {
        val tray = modeTray ?: return
        if (modeChipViews.isEmpty()) return
        val loc = IntArray(2); tray.getLocationOnScreen(loc)
        val relY = rawY - loc[1]
        val chipH = tray.height.toFloat() / modeChipViews.size
        val idx = (relY / chipH).toInt().coerceIn(0, modeChipViews.size - 1)
        val selected = modes.reversed()[idx]
        if (selected == pendingMode) return
        pendingMode = selected
        modeChipViews.forEachIndexed { i, chip ->
            val isNow = modes.reversed()[i] == pendingMode
            chip.setTextColor(Color.parseColor(if (isNow) "#0e1012" else "#eceef0"))
            (chip.background as? GradientDrawable)?.setColor(Color.parseColor(if (isNow) "#2ec4b6" else "#22262a"))
        }
    }

    private fun confirmModeSelection() {
        currentMode = pendingMode
        Log.d(TAG, "Mode: ${currentMode.name}")
    }

    private fun dismissModeTray() {
        modeTray?.let { runCatching { wm.removeView(it) } }
        modeTray = null; modeChipViews.clear()
    }

    // ── State machine ─────────────────────────────────────────────────────────

    private fun handleTap() {
        when (state) {
            State.IDLE -> startRec()
            State.RECORDING -> stopRec()
            State.EDIT_RECORDING -> stopEditRec()
            State.PROCESSING, State.EDIT_PROCESSING -> { /* wait */ }
        }
    }

    private fun startRec() {
        val f = File(cacheDir, "yapify_rec.m4a").also { audioFile = it }
        try {
            @Suppress("DEPRECATION")
            recorder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else MediaRecorder()).apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(44100)
                setAudioEncodingBitRate(128000)
                setOutputFile(f.absolutePath)
                prepare(); start()
            }
            state = State.RECORDING
            setDotColor(COLOR_REC)
            Log.d(TAG, "Recording (${currentMode.name})")
        } catch (e: Exception) {
            Log.e(TAG, "Start recording failed", e)
            recorder?.release(); recorder = null
            showError("Mic error: ${e.message}")
        }
    }

    private fun stopRec() {
        runCatching { recorder?.stop() }
        recorder?.release(); recorder = null
        state = State.PROCESSING
        setDotColor(COLOR_PROC)
        val f = audioFile ?: run { showError("No audio captured"); resetIdle(); return }
        Log.d(TAG, "Stopped, size=${f.length()}b")
        Thread { pipeline(f) }.start()
    }

    private fun startEditRec() {
        val f = File(cacheDir, "yapify_edit.m4a").also { audioFile = it }
        try {
            @Suppress("DEPRECATION")
            recorder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else MediaRecorder()).apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(44100)
                setAudioEncodingBitRate(128000)
                setOutputFile(f.absolutePath)
                prepare(); start()
            }
            state = State.EDIT_RECORDING
            setDotColor(COLOR_REC)
            main.post { editBtn?.setText("Stop") }
            Log.d(TAG, "Edit recording started")
        } catch (e: Exception) {
            Log.e(TAG, "Start edit recording failed", e)
            recorder?.release(); recorder = null
            showError("Mic error: ${e.message}")
            main.post { editBtn?.setText("Edit") }
        }
    }

    private fun stopEditRec() {
        runCatching { recorder?.stop() }
        recorder?.release(); recorder = null
        state = State.EDIT_PROCESSING
        setDotColor(COLOR_PROC)
        main.post { editBtn?.setText("...") }
        val f = audioFile ?: run { showError("No audio"); resetToResult(); return }
        Thread { editPipeline(f) }.start()
    }

    private fun resetIdle() {
        state = State.IDLE
        main.post { setDotColor(COLOR_IDLE) }
    }

    private fun resetToResult() {
        state = State.IDLE
        main.post { setDotColor(COLOR_IDLE); editBtn?.setText("Edit") }
    }

    private fun showError(msg: String) {
        Log.e(TAG, msg)
        main.post { Toast.makeText(this, "Yapify: $msg", Toast.LENGTH_LONG).show() }
    }

    // ── API pipeline ──────────────────────────────────────────────────────────

    private fun pipeline(file: File) {
        val key = ApiKeyStore.getKey(this) ?: run {
            showError("No API key -- open Yapify settings first"); resetIdle(); return
        }
        try {
            val transcript = transcribe(file, key)
            Log.d(TAG, "Transcript: $transcript")
            val output = chat(currentMode.prompt, transcript, key)
            Log.d(TAG, "Output length: ${output.length}")
            currentOutput = output
            main.post { showResultCard(output) }
        } catch (e: Exception) {
            showError(e.message ?: "Pipeline failed"); resetIdle()
        }
    }

    private fun editPipeline(file: File) {
        val key = ApiKeyStore.getKey(this) ?: run {
            showError("No API key"); resetToResult(); return
        }
        try {
            val instruction = transcribe(file, key)
            Log.d(TAG, "Edit instruction: $instruction")
            val editPrompt = "You are an editor. The user will give you a piece of text and a spoken instruction for how to change it. Apply the instruction and return only the updated text -- no commentary, no explanation, no preamble."
            val updated = chat(editPrompt, "Text:\n$currentOutput\n\nEdit instruction: $instruction", key)
            currentOutput = updated
            main.post { resultTextView?.text = updated; resetToResult() }
        } catch (e: Exception) {
            showError(e.message ?: "Edit failed"); resetToResult()
        }
    }

    private fun transcribe(file: File, key: String): String {
        val boundary = "yapify_b_${System.currentTimeMillis()}"
        val base = if (key.startsWith("sk-")) OPENAI_BASE else GROQ_BASE
        val model = if (key.startsWith("sk-")) "whisper-1" else "whisper-large-v3-turbo"
        val conn = (URL("$base/audio/transcriptions").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Authorization", "Bearer $key")
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            doOutput = true; connectTimeout = 30_000; readTimeout = 60_000
        }
        conn.outputStream.use { out ->
            out.write("--$boundary\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n$model\r\n".toByteArray())
            out.write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"audio.m4a\"\r\nContent-Type: audio/m4a\r\n\r\n".toByteArray())
            out.write(file.readBytes())
            out.write("\r\n--$boundary--\r\n".toByteArray())
        }
        val code = conn.responseCode
        val body = (if (code < 400) conn.inputStream else conn.errorStream).bufferedReader().readText()
        Log.d(TAG, "Whisper HTTP $code")
        val json = JSONObject(body)
        if (json.has("error")) throw Exception("Whisper: ${json.getJSONObject("error").optString("message")}")
        return json.getString("text")
    }

    private fun chat(system: String, user: String, key: String): String {
        val base = if (key.startsWith("sk-")) OPENAI_BASE else GROQ_BASE
        val model = if (key.startsWith("sk-")) "gpt-4o-mini" else "llama-3.3-70b-versatile"
        val reqBody = JSONObject().apply {
            put("model", model)
            put("messages", JSONArray()
                .put(JSONObject().put("role", "system").put("content", system))
                .put(JSONObject().put("role", "user").put("content", user)))
            put("max_tokens", 1024); put("temperature", 0.4)
        }
        val conn = (URL("$base/chat/completions").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Authorization", "Bearer $key")
            setRequestProperty("Content-Type", "application/json")
            doOutput = true; connectTimeout = 30_000; readTimeout = 60_000
        }
        conn.outputStream.use { it.write(reqBody.toString().toByteArray()) }
        val code = conn.responseCode
        val body = (if (code < 400) conn.inputStream else conn.errorStream).bufferedReader().readText()
        Log.d(TAG, "LLM HTTP $code")
        val json = JSONObject(body)
        if (json.has("error")) throw Exception("LLM: ${json.getJSONObject("error").optString("message")}")
        return json.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content")
    }

    // ── Result card ───────────────────────────────────────────────────────────

    private fun showResultCard(output: String) {
        dismissResultCard()
        state = State.IDLE
        setDotColor(COLOR_IDLE)

        val d = resources.displayMetrics.density

        val wrapper = FrameLayout(this).apply {
            val hp = (16 * d).toInt(); setPadding(hp, 0, hp, 0)
        }

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = (16 * d).toInt(); setPadding(p, p, p, p)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#1a1d1f")); cornerRadius = 18 * d
            }
            elevation = 16 * d
        }

        // Mode label
        val modeLabel = currentMode.emoji.let { e ->
            val label = if (e.isEmpty()) currentMode.name else "$e ${currentMode.name}"
            TextView(this).apply {
                setText(label)
                textSize = 10f
                setTextColor(Color.parseColor("#2ec4b6"))
                setPadding(0, 0, 0, (4 * d).toInt())
            }
        }
        card.addView(modeLabel, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // Output text (scrollable)
        val tv = TextView(this).apply {
            setText(output)
            textSize = 14f
            setTextColor(Color.parseColor("#eceef0"))
            setLineSpacing(4 * d, 1f)
        }
        resultTextView = tv
        val scroll = ScrollView(this).apply {
            addView(tv, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        card.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (160 * d).toInt()))
        card.addView(View(this), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (10 * d).toInt()))

        // Buttons
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }

        val btnDismiss = Button(this).apply {
            setText("X")
            textSize = 13f; isAllCaps = false
            setTextColor(Color.parseColor("#8a9199"))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#22262a")); cornerRadius = 10 * d
            }
            val p = (8 * d).toInt(); setPadding(p, p, p, p)
            setOnClickListener {
                if (state == State.EDIT_RECORDING) {
                    runCatching { recorder?.stop() }; recorder?.release(); recorder = null
                }
                dismissResultCard(); resetIdle()
            }
        }

        val btnEdit = Button(this).apply {
            setText("Edit")
            textSize = 13f; isAllCaps = false
            setTextColor(Color.parseColor("#eceef0"))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#22262a")); cornerRadius = 10 * d
            }
            val p = (8 * d).toInt(); setPadding(p, p, p, p)
            setOnClickListener {
                when (state) {
                    State.IDLE -> startEditRec()
                    State.EDIT_RECORDING -> stopEditRec()
                    else -> { /* wait */ }
                }
            }
        }
        editBtn = btnEdit

        val btnInject = Button(this).apply {
            setText("Inject")
            textSize = 13f; isAllCaps = false
            setTextColor(Color.parseColor("#0e1012"))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#2ec4b6")); cornerRadius = 10 * d
            }
            val p = (8 * d).toInt(); setPadding(p, p, p, p)
            setOnClickListener {
                val ok = YapifyAccessibilityService.injectText(currentOutput)
                if (ok) { dismissResultCard(); resetIdle() }
                else showError("Enable Yapify in Accessibility Settings to inject text")
            }
        }

        row.addView(btnDismiss, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 0.8f)
            .apply { marginEnd = (6 * d).toInt() })
        row.addView(btnEdit, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            .apply { marginEnd = (6 * d).toInt() })
        row.addView(btnInject, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.2f))
        card.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        wrapper.addView(card, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))

        resultCard = wrapper
        wm.addView(wrapper, WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.BOTTOM; y = (40 * d).toInt() })
    }

    private fun dismissResultCard() {
        resultCard?.let { runCatching { wm.removeView(it) } }
        resultCard = null; resultTextView = null; editBtn = null; currentOutput = ""
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun ovalDrawable(hex: String) = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor(hex))
    }

    private val Int.dp: Int get() = (this * resources.displayMetrics.density).toInt()

    companion object {
        private const val TAG = "YapifyOverlay"
        private const val GROQ_BASE = "https://api.groq.com/openai/v1"
        private const val OPENAI_BASE = "https://api.openai.com/v1"
        private const val COLOR_IDLE = "#2ec4b6"
        private const val COLOR_REC  = "#ff5a5a"
        private const val COLOR_PROC = "#8a9199"

        private const val PROMPT_DEFAULT = "You are a transcription cleaner. Clean up this raw voice transcript into natural, flowing sentences. Fix grammar and punctuation. Join short fragmented sentences together where it sounds natural. Do NOT change the tone, word choices, or meaning. Do NOT add formatting, bullet points, or structure. Just return clean, readable prose that sounds exactly like the speaker."
        private const val PROMPT_EMAIL = "You are an email formatter. Take this raw voice transcript and format it as a proper email with paragraphs. Add a greeting and sign-off. You may make very minor tonal adjustments only where needed for the email to read naturally -- but preserve the speaker's voice and meaning as closely as possible. Do not add information that wasn't in the transcript."
        private const val PROMPT_QUICK = "You are a text message formatter. Take this raw voice transcript and rewrite it as a short, casual text message. Keep it brief and conversational. Preserve the speaker's tone and meaning exactly. No formatting, no bullet points, just a natural short message."
        private const val PROMPT_AI = "The user is giving you a direct instruction. Execute it exactly as requested. Write the output in the user's tone of voice based on how they speak in the transcript. Return only the final output -- no commentary, no explanation."
    }
}
