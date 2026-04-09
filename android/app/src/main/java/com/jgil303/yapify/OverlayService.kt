package com.jgil303.yapify

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
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
import android.view.animation.LinearInterpolator
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class OverlayService : Service() {

    private enum class State {
        IDLE, EXPANDED, SELECTING, RECORDING, PROCESSING, EDIT_RECORDING, EDIT_PROCESSING
    }

    private data class ModeData(val id: String, val emoji: String, val name: String, val prompt: String)

    private val modes = listOf(
        ModeData("default", "",   "Default",      PROMPT_DEFAULT),
        ModeData("email",   "✉️", "Email",         PROMPT_EMAIL),
        ModeData("quick",   "💬", "Quick Message", PROMPT_QUICK),
        ModeData("ai",      "🤖", "AI Prompt",     PROMPT_AI)
    )
    private var currentMode = modes[0]
    private var pendingMode = modes[0]

    // WindowManager
    private lateinit var wm: WindowManager

    // FAB container (resized between small/big states)
    private lateinit var fabContainer: FrameLayout
    private lateinit var fabParams: WindowManager.LayoutParams

    // Dot / FAB views (rebuilt on state change)
    private var smallDotView: View? = null
    private var bigDotView: FrameLayout? = null
    private var timerView: TextView? = null
    private val rippleViews = mutableListOf<View>()
    private val rippleAnimators = mutableListOf<ValueAnimator>()
    private var fabSpinner: View? = null
    private var fabSpinnerAnim: ObjectAnimator? = null

    // Mode tray
    private var modeTrayWindow: LinearLayout? = null
    private val chipViews = mutableListOf<View>()
    private var minimiseChipView: View? = null
    private var pendingMinimise = false
    private var minimised = false

    // Result card
    private var cardWindow: View? = null
    private var cardWindowParams: WindowManager.LayoutParams? = null
    private var outputTextView: TextView? = null
    private var actionButtonsRow: LinearLayout? = null
    private var editBarContainer: LinearLayout? = null
    private var pulseAnimator: ValueAnimator? = null
    private var editSpinnerAnim: ObjectAnimator? = null

    // State
    private var state = State.IDLE
    private var recorder: MediaRecorder? = null
    private var audioFile: File? = null
    private var currentOutput = ""
    private var recSeconds = 0
    private var recTimerRunnable: Runnable? = null

    // FAB drag
    private var fabInitX = 0; private var fabInitY = 0
    private var fabTouchX = 0f; private var fabTouchY = 0f
    private var fabDragging = false

    private val main = Handler(Looper.getMainLooper())

    private val longPressRunnable = Runnable {
        if (!fabDragging) {
            state = State.SELECTING
            showModeTray()
        }
    }

    override fun onBind(intent: Intent?) = null

    override fun onCreate() {
        super.onCreate()
        startFg()
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        buildFabContainer()
        buildSmallDot()
        checkApiKey()
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        stopRipple()
        fabSpinnerAnim?.cancel()
        pulseAnimator?.cancel()
        editSpinnerAnim?.cancel()
        recorder?.release()
        runCatching { wm.removeView(fabContainer) }
        modeTrayWindow?.let { runCatching { wm.removeView(it) } }
        cardWindow?.let { runCatching { wm.removeView(it) } }
        super.onDestroy()
    }

    // ─── Foreground notification ──────────────────────────────────────────────

    private fun startFg() {
        val ch = "yapify_overlay"
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(ch, "Yapify", NotificationManager.IMPORTANCE_MIN)
                .apply { setShowBadge(false) }
        )
        startForeground(1, Notification.Builder(this, ch)
            .setContentTitle("Yapify")
            .setContentText("Tap dot to expand  •  Hold to change mode")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .build())
    }

    private fun checkApiKey() {
        main.postDelayed({
            if (ApiKeyStore.getKey(this) == null) {
                Toast.makeText(this,
                    "Yapify: No API key set — open Yapify to configure",
                    Toast.LENGTH_LONG).show()
            }
        }, 500L)
    }

    // ─── FAB container ────────────────────────────────────────────────────────

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_RESTORE) restore()
        return START_STICKY
    }

    private fun buildFabContainer() {
        fabContainer = FrameLayout(this).apply { clipChildren = false; clipToPadding = false }
        fabParams = WindowManager.LayoutParams(
            FAB_CONTAINER_DP.dp, FAB_CONTAINER_DP.dp,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 16.dp
            y = 200.dp
        }
        wm.addView(fabContainer, fabParams)
    }

    // ─── Small dot (IDLE) ─────────────────────────────────────────────────────

    private fun buildSmallDot() {
        clearFabViews()
        resizeFabContainer(DOT_SIZE_DP + 16, DOT_SIZE_DP + 16)

        val dot = View(this).apply {
            background = ovalDrawable(C_TEAL)
        }
        smallDotView = dot
        fabContainer.addView(dot,
            FrameLayout.LayoutParams(DOT_SIZE_DP.dp, DOT_SIZE_DP.dp, Gravity.CENTER))

        var startX = 0f; var startY = 0f; var moved = false
        dot.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = e.rawX; startY = e.rawY
                    fabInitX = fabParams.x; fabInitY = fabParams.y
                    moved = false; true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - startX; val dy = e.rawY - startY
                    if (!moved && (kotlin.math.abs(dx) > 5.dp || kotlin.math.abs(dy) > 5.dp)) moved = true
                    if (moved) {
                        fabParams.x = (fabInitX - dx).toInt().coerceAtLeast(0) // Gravity.END: right→decrease x
                        fabParams.y = (fabInitY + dy).toInt().coerceAtLeast(0)
                        runCatching { wm.updateViewLayout(fabContainer, fabParams) }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) transitionTo(State.EXPANDED)
                    true
                }
                else -> false
            }
        }
    }

    // ─── Big FAB (EXPANDED / RECORDING / PROCESSING) ─────────────────────────

    private fun buildBigDot(forState: State) {
        clearFabViews()
        resizeFabContainer(FAB_CONTAINER_DP, FAB_CONTAINER_DP + 36) // +36 for timer

        val d = resources.displayMetrics.density
        val fabSizePx = FAB_SIZE_DP.dp

        // Timer (above FAB)
        val timer = TextView(this).apply {
            text = "0:00"; textSize = 13f
            setTextColor(Color.parseColor(C_RED))
            gravity = Gravity.CENTER
            visibility = if (forState == State.RECORDING) View.VISIBLE else View.GONE
        }
        timerView = timer
        fabContainer.addView(timer, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, 36.dp
        ).apply { gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL })

        // Ripple rings (shown during RECORDING)
        repeat(3) {
            val ring = View(this).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.TRANSPARENT)
                    setStroke((1.5f * d).toInt(), Color.parseColor("#4dff5a5a"))
                }
                alpha = 0f
            }
            fabContainer.addView(ring, FrameLayout.LayoutParams(fabSizePx, fabSizePx).apply {
                gravity = Gravity.CENTER
                topMargin = 36.dp
            })
            rippleViews.add(ring)
        }

        // Big dot background
        val dotBg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            when (forState) {
                State.RECORDING   -> setColor(Color.parseColor(C_RED))
                State.PROCESSING  -> {
                    setColor(Color.parseColor(C_SURFACE2))
                    setStroke(2.dp, Color.parseColor(C_TEAL))
                }
                else -> setColor(Color.parseColor(C_TEAL))
            }
        }

        val dot = FrameLayout(this).apply { background = dotBg }
        bigDotView = dot
        fabContainer.addView(dot, FrameLayout.LayoutParams(fabSizePx, fabSizePx).apply {
            gravity = Gravity.CENTER
            topMargin = 36.dp
        })

        // Content inside dot
        when (forState) {
            State.PROCESSING -> {
                val spinner = View(this).apply {
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(Color.TRANSPARENT)
                        setStroke((2.5f * d).toInt(), Color.parseColor(C_TEAL))
                    }
                }
                fabSpinner = spinner
                dot.addView(spinner, FrameLayout.LayoutParams(24.dp, 24.dp, Gravity.CENTER))
                fabSpinnerAnim = ObjectAnimator.ofFloat(spinner, View.ROTATION, 0f, 360f).apply {
                    duration = 700; repeatCount = ObjectAnimator.INFINITE
                    interpolator = LinearInterpolator(); start()
                }
            }
            else -> {
                if (currentMode.id == "default") {
                    val iv = ImageView(this).apply {
                        setImageResource(R.mipmap.ic_launcher_foreground)
                        scaleType = ImageView.ScaleType.CENTER_INSIDE
                    }
                    dot.addView(iv, FrameLayout.LayoutParams(34.dp, 34.dp, Gravity.CENTER))
                } else {
                    val tv = TextView(this).apply {
                        text = currentMode.emoji; textSize = 22f; gravity = Gravity.CENTER
                    }
                    dot.addView(tv, FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
                }
            }
        }

        setupBigDotTouch(dot)

        if (forState == State.RECORDING) startRipple()
    }

    private fun setupBigDotTouch(dot: FrameLayout) {
        fabDragging = false
        dot.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    fabInitX = fabParams.x; fabInitY = fabParams.y
                    fabTouchX = e.rawX; fabTouchY = e.rawY
                    fabDragging = false
                    if (state == State.EXPANDED) main.postDelayed(longPressRunnable, 400L)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - fabTouchX; val dy = e.rawY - fabTouchY
                    when (state) {
                        State.SELECTING -> updateChipHighlight(e.rawX, e.rawY)
                        else -> {
                            if (!fabDragging && (kotlin.math.abs(dx) > 8.dp || kotlin.math.abs(dy) > 8.dp)) {
                                fabDragging = true
                                main.removeCallbacks(longPressRunnable)
                            }
                            if (fabDragging) {
                                fabParams.x = (fabInitX - dx).toInt().coerceAtLeast(0)
                                fabParams.y = (fabInitY + dy).toInt().coerceAtLeast(0)
                                runCatching { wm.updateViewLayout(fabContainer, fabParams) }
                            }
                        }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    main.removeCallbacks(longPressRunnable)
                    when (state) {
                        State.SELECTING -> {
                            dismissModeTray()
                            if (pendingMinimise) {
                                minimise()
                            } else {
                                currentMode = pendingMode
                                transitionTo(State.EXPANDED)
                            }
                        }
                        State.EXPANDED  -> if (!fabDragging) startRecording()
                        State.RECORDING -> if (!fabDragging) stopRecording()
                        else -> {}
                    }
                    fabDragging = false
                    true
                }
                else -> false
            }
        }
    }

    // ─── State transitions ────────────────────────────────────────────────────

    private fun transitionTo(newState: State) {
        state = newState
        main.post {
            when (newState) {
                State.IDLE       -> { stopRipple(); fabSpinnerAnim?.cancel(); buildSmallDot() }
                State.EXPANDED   -> { stopRipple(); fabSpinnerAnim?.cancel(); buildBigDot(State.EXPANDED) }
                State.RECORDING  -> buildBigDot(State.RECORDING)
                State.PROCESSING -> { stopRipple(); buildBigDot(State.PROCESSING) }
                else -> {}
            }
        }
    }

    // ─── Mode tray ────────────────────────────────────────────────────────────

    private fun showModeTray() {
        dismissModeTray()
        chipViews.clear()
        pendingMode = currentMode

        val d = resources.displayMetrics.density
        val tray = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = 8.dp; setPadding(p, p, p, p)
        }

        modes.forEach { mode ->
            val chip = buildChip(mode, mode == currentMode)
            tray.addView(chip, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 8.dp })
            chipViews.add(chip)
        }

        // Minimise chip at bottom
        val minimiseChip = buildSpecialChip("⊙ Minimise")
        tray.addView(minimiseChip, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))
        minimiseChipView = minimiseChip
        pendingMinimise = false

        modeTrayWindow = tray
        val trayW = TRAY_WIDTH_DP.dp + 16.dp
        val totalItems = modes.size + 1 // +1 for minimise
        val trayY = (fabParams.y - totalItems * 52.dp - 8.dp).coerceAtLeast(8.dp)

        wm.addView(tray, WindowManager.LayoutParams(
            trayW, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = fabParams.x
            y = trayY
        })
    }

    private fun buildChip(mode: ModeData, selected: Boolean): LinearLayout {
        val d = resources.displayMetrics.density
        val chip = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val hp = 14.dp; val vp = 8.dp
            setPadding(hp, vp, hp, vp)
            elevation = 4 * d
            background = GradientDrawable().apply {
                setColor(Color.parseColor(if (selected) "#262ec4b6" else C_SURFACE))
                cornerRadius = 20 * d
                setStroke(1.dp, Color.parseColor(if (selected) C_TEAL else C_BORDER))
            }
        }
        // Icon area
        if (mode.id == "default") {
            val iv = ImageView(this).apply {
                setImageResource(R.mipmap.ic_launcher_foreground)
                scaleType = ImageView.ScaleType.CENTER_INSIDE
            }
            chip.addView(iv, LinearLayout.LayoutParams(22.dp, 22.dp))
        } else {
            val ev = TextView(this).apply {
                text = mode.emoji; textSize = 17f; gravity = Gravity.CENTER
                width = 26.dp
            }
            chip.addView(ev, LinearLayout.LayoutParams(26.dp, LinearLayout.LayoutParams.WRAP_CONTENT))
        }
        // Gap
        chip.addView(View(this), LinearLayout.LayoutParams(8.dp, 1))
        // Name
        chip.addView(TextView(this).apply {
            text = mode.name; textSize = 14f; maxLines = 1
            setTextColor(Color.parseColor(C_TEXT))
        }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT))
        return chip
    }

    private fun buildSpecialChip(label: String): LinearLayout {
        val d = resources.displayMetrics.density
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val hp = 14.dp; val vp = 8.dp; setPadding(hp, vp, hp, vp)
            elevation = 4 * d
            background = GradientDrawable().apply {
                setColor(Color.parseColor(C_SURFACE))
                cornerRadius = 20 * d
                setStroke(1.dp, Color.parseColor(C_BORDER))
            }
            addView(TextView(this@OverlayService).apply {
                text = label; textSize = 14f; maxLines = 1
                setTextColor(Color.parseColor(C_MUTED))
            }, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT))
        }
    }

    private fun updateChipHighlight(rawX: Float, rawY: Float) {
        val d = resources.displayMetrics.density
        var hitMode: ModeData? = null
        var hitMinimise = false

        // Check mode chips
        chipViews.forEachIndexed { i, chip ->
            val loc = IntArray(2); chip.getLocationOnScreen(loc)
            val hit = rawX >= loc[0] - 30.dp && rawX <= loc[0] + chip.width + 30.dp &&
                      rawY >= loc[1] - 16.dp && rawY <= loc[1] + chip.height + 16.dp
            if (hit) hitMode = modes[i]
        }
        // Check minimise chip
        minimiseChipView?.let { chip ->
            val loc = IntArray(2); chip.getLocationOnScreen(loc)
            val hit = rawX >= loc[0] - 30.dp && rawX <= loc[0] + chip.width + 30.dp &&
                      rawY >= loc[1] - 16.dp && rawY <= loc[1] + chip.height + 16.dp
            if (hit) hitMinimise = true
        }

        if (hitMinimise) { pendingMinimise = true }
        else if (hitMode != null) { pendingMinimise = false; pendingMode = hitMode!! }

        chipViews.forEachIndexed { i, chip ->
            val lit = !pendingMinimise && modes[i] == pendingMode
            (chip.background as? GradientDrawable)?.apply {
                setColor(Color.parseColor(if (lit) "#262ec4b6" else C_SURFACE))
                setStroke(1.dp, Color.parseColor(if (lit) C_TEAL else C_BORDER))
            }
            chip.animate().scaleX(if (lit) 1.04f else 1f).scaleY(if (lit) 1.04f else 1f)
                .setDuration(100).start()
        }
        minimiseChipView?.let { chip ->
            val lit = pendingMinimise
            (chip.background as? GradientDrawable)?.apply {
                setColor(Color.parseColor(if (lit) "#22262a" else C_SURFACE))
                setStroke(1.dp, Color.parseColor(if (lit) C_MUTED else C_BORDER))
            }
            chip.animate().scaleX(if (lit) 1.04f else 1f).scaleY(if (lit) 1.04f else 1f)
                .setDuration(100).start()
        }
    }

    private fun dismissModeTray() {
        modeTrayWindow?.let { runCatching { wm.removeView(it) } }
        modeTrayWindow = null; chipViews.clear()
        minimiseChipView = null; pendingMinimise = false
    }

    private fun minimise() {
        minimised = true
        state = State.IDLE
        runCatching { wm.removeView(fabContainer) }
        // Update notification with restore action
        val restoreIntent = Intent(this, OverlayService::class.java).apply { action = ACTION_RESTORE }
        val pi = PendingIntent.getService(this, 0, restoreIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val ch = "yapify_overlay"
        getSystemService(NotificationManager::class.java).notify(1,
            Notification.Builder(this, ch)
                .setContentTitle("Yapify (hidden)")
                .setContentText("Tap to restore dot")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentIntent(pi)
                .build())
    }

    private fun restore() {
        if (!minimised) return
        minimised = false
        runCatching { wm.addView(fabContainer, fabParams) }
        buildSmallDot()
        // Restore notification
        val ch = "yapify_overlay"
        getSystemService(NotificationManager::class.java).notify(1,
            Notification.Builder(this, ch)
                .setContentTitle("Yapify")
                .setContentText("Tap dot to expand  •  Hold to change mode")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .build())
    }

    // ─── Recording ────────────────────────────────────────────────────────────

    private fun startRecording() {
        val f = File(cacheDir, "yapify_rec.m4a").also { audioFile = it }
        try {
            @Suppress("DEPRECATION")
            recorder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                MediaRecorder(this) else MediaRecorder()).apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(44100); setAudioEncodingBitRate(128000)
                setOutputFile(f.absolutePath); prepare(); start()
            }
            transitionTo(State.RECORDING)
            recSeconds = 0; startTimer()
            Log.d(TAG, "Recording (${currentMode.name})")
        } catch (e: Exception) {
            Log.e(TAG, "Rec start failed", e)
            recorder?.release(); recorder = null
            showErr("Mic error: ${e.message}")
            transitionTo(State.EXPANDED)
        }
    }

    private fun stopRecording() {
        runCatching { recorder?.stop() }
        recorder?.release(); recorder = null; stopTimer()
        transitionTo(State.PROCESSING)
        val f = audioFile ?: run { showErr("No audio"); transitionTo(State.EXPANDED); return }
        Thread { pipeline(f) }.start()
    }

    private fun startEditRecording() {
        val f = File(cacheDir, "yapify_edit.m4a").also { audioFile = it }
        try {
            @Suppress("DEPRECATION")
            recorder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                MediaRecorder(this) else MediaRecorder()).apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(44100); setAudioEncodingBitRate(128000)
                setOutputFile(f.absolutePath); prepare(); start()
            }
            state = State.EDIT_RECORDING
            main.post { showEditBar(processing = false) }
        } catch (e: Exception) {
            recorder?.release(); recorder = null
            showErr("Mic error: ${e.message}")
        }
    }

    private fun stopEditRecording() {
        runCatching { recorder?.stop() }
        recorder?.release(); recorder = null
        state = State.EDIT_PROCESSING
        main.post { showEditBar(processing = true) }
        val f = audioFile ?: run { showErr("No audio"); resetToResult(); return }
        Thread { editPipeline(f) }.start()
    }

    private fun startTimer() {
        recTimerRunnable = object : Runnable {
            override fun run() {
                recSeconds++
                timerView?.text = "${recSeconds / 60}:${(recSeconds % 60).toString().padStart(2, '0')}"
                main.postDelayed(this, 1000L)
            }
        }.also { main.postDelayed(it, 1000L) }
    }

    private fun stopTimer() {
        recTimerRunnable?.let { main.removeCallbacks(it) }
        recTimerRunnable = null; recSeconds = 0
    }

    // ─── Ripple ───────────────────────────────────────────────────────────────

    private fun startRipple() {
        stopRipple()
        rippleViews.forEachIndexed { i, ring ->
            val anim = ValueAnimator.ofFloat(0f, 1f).apply {
                duration = 1600; startDelay = i * 550L
                repeatCount = ValueAnimator.INFINITE
                interpolator = LinearInterpolator()
                addUpdateListener {
                    val p = it.animatedValue as Float
                    ring.alpha = 0.6f * (1f - p)
                    ring.scaleX = 1f + 1.5f * p; ring.scaleY = 1f + 1.5f * p
                }
            }
            rippleAnimators.add(anim); anim.start()
        }
    }

    private fun stopRipple() {
        rippleAnimators.forEach { it.cancel() }; rippleAnimators.clear()
        rippleViews.forEach { it.alpha = 0f; it.scaleX = 1f; it.scaleY = 1f }
    }

    // ─── API pipeline ─────────────────────────────────────────────────────────

    private fun pipeline(file: File) {
        val key = ApiKeyStore.getKey(this) ?: run {
            showErr("No API key — open Yapify settings first")
            main.post { transitionTo(State.EXPANDED) }; return
        }
        try {
            val transcript = transcribe(file, key)
            val output = chat(currentMode.prompt, transcript, key)
            currentOutput = output
            main.post { transitionTo(State.IDLE); showResultCard(output) }
        } catch (e: Exception) {
            showErr(e.message ?: "Pipeline failed")
            main.post { transitionTo(State.EXPANDED) }
        }
    }

    private fun editPipeline(file: File) {
        val key = ApiKeyStore.getKey(this) ?: run { showErr("No API key"); resetToResult(); return }
        try {
            val instruction = transcribe(file, key)
            val editPrompt = "You are an editor. The user will give you a piece of text and a spoken instruction for how to change it. Apply the instruction and return only the updated text -- no commentary, no explanation, no preamble."
            val updated = chat(editPrompt, "Text:\n$currentOutput\n\nEdit instruction: $instruction", key)
            currentOutput = updated
            main.post { outputTextView?.text = updated; resetToResult() }
        } catch (e: Exception) {
            showErr(e.message ?: "Edit failed"); main.post { resetToResult() }
        }
    }

    private fun resetToResult() {
        state = State.IDLE
        main.post { showEditBar(null) }
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
        Log.d(TAG, "Whisper $code")
        val json = JSONObject(body)
        if (json.has("error")) throw Exception("Whisper: ${json.getJSONObject("error").optString("message")}")
        return json.getString("text")
    }

    private fun chat(system: String, user: String, key: String): String {
        val base = if (key.startsWith("sk-")) OPENAI_BASE else GROQ_BASE
        val model = if (key.startsWith("sk-")) "gpt-4o-mini" else "llama-3.3-70b-versatile"
        val body = JSONObject().apply {
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
        conn.outputStream.use { it.write(body.toString().toByteArray()) }
        val code = conn.responseCode
        val resp = (if (code < 400) conn.inputStream else conn.errorStream).bufferedReader().readText()
        Log.d(TAG, "LLM $code")
        val json = JSONObject(resp)
        if (json.has("error")) throw Exception("LLM: ${json.getJSONObject("error").optString("message")}")
        return json.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content")
    }

    // ─── Result card ──────────────────────────────────────────────────────────

    private fun showResultCard(output: String) {
        dismissResultCard()
        val d = resources.displayMetrics.density

        // Outer wrapper (provides horizontal padding)
        val wrapper = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val hp = 16.dp; setPadding(hp, 0, hp, 0)
        }

        // Card
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val hp = 16.dp; val vp = 14.dp; setPadding(hp, vp, hp, vp)
            background = GradientDrawable().apply {
                setColor(Color.parseColor(C_SURFACE))
                cornerRadius = 16 * d
                setStroke(1.dp, Color.parseColor("#402ec4b6"))
            }
            elevation = 16 * d
        }

        // ── Drag handle ──
        val dragHit = FrameLayout(this).apply {
            val vp = 8.dp; setPadding(0, vp, 0, vp)
        }
        dragHit.addView(View(this).apply {
            background = GradientDrawable().apply {
                setColor(Color.parseColor(C_BORDER)); cornerRadius = 2 * d
            }
        }, FrameLayout.LayoutParams(32.dp, 3.dp, Gravity.CENTER))
        card.addView(dragHit, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = 2.dp })

        // ── Label row: OUTPUT | mode badge ──
        val labelRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val mb = 8.dp; setPadding(0, 0, 0, mb)
        }
        labelRow.addView(TextView(this).apply {
            text = "OUTPUT"; textSize = 10f
            setTextColor(Color.parseColor(C_TEAL))
            letterSpacing = 0.05f
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

        val modeLabel = if (currentMode.emoji.isEmpty()) currentMode.name
                        else "${currentMode.emoji} ${currentMode.name}"
        labelRow.addView(TextView(this).apply {
            text = modeLabel; textSize = 10f
            setTextColor(Color.parseColor(C_TEAL))
            val hp = 8.dp; val vp = 2.dp; setPadding(hp, vp, hp, vp)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#1a2ec4b6"))
                cornerRadius = 10 * d
                setStroke(1.dp, Color.parseColor("#332ec4b6"))
            }
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT))
        card.addView(labelRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // ── Output text (scrollable, max 120dp) ──
        val tv = TextView(this).apply {
            text = output; textSize = 14f
            setTextColor(Color.parseColor(C_TEXT))
            setLineSpacing(4 * d, 1f)
        }
        outputTextView = tv
        val scroll = ScrollView(this).apply {
            addView(tv, ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        card.addView(scroll, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 120.dp
        ).apply { bottomMargin = 10.dp })

        // ── Edit bar (hidden initially) ──
        val editBarHolder = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; visibility = View.GONE
        }
        editBarContainer = editBarHolder
        card.addView(editBarHolder, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // ── Action buttons ──
        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            val mt = 2.dp; setPadding(0, mt, 0, 0)
        }
        val gap = 8.dp

        val btnInsert = cardBtn("Insert ↓", primary = true) {
            val ok = YapifyAccessibilityService.injectText(currentOutput)
            if (ok) dismissResultCard()
            else showErr("Enable Yapify in Accessibility Settings to inject text")
        }
        val btnEdit = cardBtn("✏ Edit", primary = false) {
            when (state) {
                State.IDLE -> startEditRecording()
                State.EDIT_RECORDING -> stopEditRecording()
                else -> {}
            }
        }
        val btnDismiss = cardBtn("Dismiss", primary = false) {
            if (state == State.EDIT_RECORDING) {
                runCatching { recorder?.stop() }; recorder?.release(); recorder = null
            }
            dismissResultCard(); state = State.IDLE
        }

        btnRow.addView(btnInsert, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            .apply { marginEnd = gap })
        btnRow.addView(btnEdit, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            .apply { marginEnd = gap })
        btnRow.addView(btnDismiss, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        actionButtonsRow = btnRow
        card.addView(btnRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        wrapper.addView(card, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        cardWindow = wrapper
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.BOTTOM; y = 280.dp }
        cardWindowParams = params
        wm.addView(wrapper, params)

        setupCardDrag(dragHit, params, wrapper)
    }

    private fun cardBtn(label: String, primary: Boolean, onClick: () -> Unit): Button {
        val d = resources.displayMetrics.density
        return Button(this).apply {
            text = label; textSize = 12f; isAllCaps = false
            val vp = 8.dp; setPadding(4.dp, vp, 4.dp, vp)
            setTextColor(Color.parseColor(if (primary) C_TEAL else C_MUTED))
            background = GradientDrawable().apply {
                setColor(Color.parseColor(if (primary) "#1a2ec4b6" else C_SURFACE2))
                cornerRadius = 8 * d
                if (primary) setStroke(1.dp, Color.parseColor("#4d2ec4b6"))
            }
            setOnClickListener { onClick() }
        }
    }

    private fun setupCardDrag(handle: View, params: WindowManager.LayoutParams, card: View) {
        var dragActive = false; var startY = 0f; var initY = 0
        val longPress = Runnable { dragActive = true }
        handle.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    startY = e.rawY; initY = params.y; dragActive = false
                    main.postDelayed(longPress, 300L); true
                }
                MotionEvent.ACTION_MOVE -> {
                    if (dragActive) {
                        // card gravity is BOTTOM, y is offset from bottom — invert dy
                        params.y = (initY - (e.rawY - startY)).toInt().coerceAtLeast(0)
                        runCatching { wm.updateViewLayout(card, params) }
                    } else if (kotlin.math.abs(e.rawY - startY) > 8.dp) {
                        main.removeCallbacks(longPress)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> { main.removeCallbacks(longPress); dragActive = false; true }
                else -> false
            }
        }
    }

    private fun dismissResultCard() {
        pulseAnimator?.cancel(); pulseAnimator = null
        editSpinnerAnim?.cancel(); editSpinnerAnim = null
        cardWindow?.let { runCatching { wm.removeView(it) } }
        cardWindow = null; outputTextView = null
        editBarContainer = null; actionButtonsRow = null
        currentOutput = ""
    }

    // ─── Edit bar (ToastEditBar) ──────────────────────────────────────────────

    private fun showEditBar(processing: Boolean?) {
        val holder = editBarContainer ?: return
        val btns = actionButtonsRow ?: return

        if (processing == null) {
            pulseAnimator?.cancel(); pulseAnimator = null
            editSpinnerAnim?.cancel(); editSpinnerAnim = null
            holder.visibility = View.GONE
            btns.visibility = View.VISIBLE
            return
        }

        btns.visibility = View.GONE
        holder.removeAllViews()
        holder.visibility = View.VISIBLE

        val d = resources.displayMetrics.density
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val hp = 12.dp; val vp = 10.dp; setPadding(hp, vp, hp, vp)
            background = GradientDrawable().apply {
                setColor(Color.parseColor(C_SURFACE2))
                cornerRadius = 10 * d
                setStroke(1.dp, Color.parseColor(
                    if (processing) "#332ec4b6" else "#4dff5a5a"))
            }
        }

        if (processing) {
            // Teal ring spinner
            val spinner = View(this).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.TRANSPARENT)
                    setStroke((2.5f * d).toInt(), Color.parseColor(C_TEAL))
                }
            }
            bar.addView(spinner, LinearLayout.LayoutParams(14.dp, 14.dp))
            editSpinnerAnim = ObjectAnimator.ofFloat(spinner, View.ROTATION, 0f, 360f).apply {
                duration = 700; repeatCount = ObjectAnimator.INFINITE
                interpolator = LinearInterpolator(); start()
            }
            bar.addView(View(this), LinearLayout.LayoutParams(10.dp, 1))
            bar.addView(TextView(this).apply {
                text = "Updating..."; textSize = 11f
                setTextColor(Color.parseColor(C_MUTED))
            }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

        } else {
            // Pulsing red dot
            val dot = View(this).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL; setColor(Color.parseColor(C_RED))
                }
            }
            bar.addView(dot, LinearLayout.LayoutParams(10.dp, 10.dp))
            pulseAnimator = ValueAnimator.ofFloat(1f, 0.3f).apply {
                duration = 600; repeatCount = ValueAnimator.INFINITE
                repeatMode = ValueAnimator.REVERSE
                addUpdateListener { dot.alpha = it.animatedValue as Float }
                start()
            }
            bar.addView(View(this), LinearLayout.LayoutParams(10.dp, 1))
            bar.addView(TextView(this).apply {
                text = "Speak your edit..."; textSize = 11f
                setTextColor(Color.parseColor(C_MUTED))
            }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            bar.addView(View(this), LinearLayout.LayoutParams(10.dp, 1))
            bar.addView(TextView(this).apply {
                text = "Stop"; textSize = 11f
                setTextColor(Color.parseColor(C_MUTED))
                val hp = 8.dp; val vp2 = 3.dp; setPadding(hp, vp2, hp, vp2)
                background = GradientDrawable().apply {
                    setColor(Color.TRANSPARENT)
                    cornerRadius = 6 * d
                    setStroke(1.dp, Color.parseColor(C_BORDER))
                }
                setOnClickListener { stopEditRecording() }
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT))
        }

        holder.addView(bar, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = 8.dp })
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private fun clearFabViews() {
        stopRipple(); fabSpinnerAnim?.cancel(); fabSpinnerAnim = null
        fabContainer.removeAllViews()
        smallDotView = null; bigDotView = null; timerView = null
        rippleViews.clear(); fabSpinner = null
    }

    private fun resizeFabContainer(wDp: Int, hDp: Int) {
        fabParams.width = wDp.dp; fabParams.height = hDp.dp
        runCatching { wm.updateViewLayout(fabContainer, fabParams) }
    }

    private fun ovalDrawable(hex: String) = GradientDrawable().apply {
        shape = GradientDrawable.OVAL; setColor(Color.parseColor(hex))
    }

    private fun showErr(msg: String) {
        Log.e(TAG, msg)
        main.post { Toast.makeText(this, "Yapify: $msg", Toast.LENGTH_LONG).show() }
    }

    private val Int.dp: Int get() = (this * resources.displayMetrics.density).toInt()

    companion object {
        const val ACTION_RESTORE = "com.jgil303.yapify.RESTORE_OVERLAY"
        private const val TAG = "YapifyOverlay"
        private const val GROQ_BASE   = "https://api.groq.com/openai/v1"
        private const val OPENAI_BASE = "https://api.openai.com/v1"
        private const val C_TEAL     = "#2ec4b6"
        private const val C_RED      = "#ff5a5a"
        private const val C_SURFACE  = "#1a1d1f"
        private const val C_SURFACE2 = "#22262a"
        private const val C_BORDER   = "#2c3035"
        private const val C_TEXT     = "#eceef0"
        private const val C_MUTED    = "#8a9199"
        private const val FAB_SIZE_DP       = 56
        private const val FAB_CONTAINER_DP  = 72   // FAB + ripple overflow space
        private const val DOT_SIZE_DP       = 20
        private const val TRAY_WIDTH_DP     = 164

        private const val PROMPT_DEFAULT = "You are a transcription cleaner. Clean up this raw voice transcript into natural, flowing sentences. Fix grammar and punctuation. Join short fragmented sentences together where it sounds natural. Do NOT change the tone, word choices, or meaning. Do NOT add formatting, bullet points, or structure. Just return clean, readable prose that sounds exactly like the speaker."
        private const val PROMPT_EMAIL   = "You are an email formatter. Take this raw voice transcript and format it as a proper email with paragraphs. Add a greeting and sign-off. You may make very minor tonal adjustments only where needed for the email to read naturally -- but preserve the speaker's voice and meaning as closely as possible. Do not add information that wasn't in the transcript."
        private const val PROMPT_QUICK   = "You are a text message formatter. Take this raw voice transcript and rewrite it as a short, casual text message. Keep it brief and conversational. Preserve the speaker's tone and meaning exactly. No formatting, no bullet points, just a natural short message."
        private const val PROMPT_AI      = "The user is giving you a direct instruction. Execute it exactly as requested. Write the output in the user's tone of voice based on how they speak in the transcript. Return only the final output -- no commentary, no explanation."
    }
}
