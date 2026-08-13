package com.telecaption.app

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {

    private val handler = Handler(Looper.getMainLooper())
    private val client = OkHttpClient.Builder()
        .pingInterval(15, TimeUnit.SECONDS)
        .build()

    private var ws: WebSocket? = null
    private var recognizer: SpeechRecognizer? = null
    private var running = false
    private var seq = 0

    private lateinit var serverInput: EditText
    private lateinit var roomInput: EditText
    private lateinit var toggle: Button
    private lateinit var status: TextView
    private lateinit var transcript: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val prefs = getSharedPreferences("telecaption", Context.MODE_PRIVATE)
        val pad = (16 * resources.displayMetrics.density).toInt()

        serverInput = EditText(this).apply {
            hint = "Relay URL e.g. wss://my-relay.onrender.com"
            setText(prefs.getString("server", ""))
            setTextColor(Color.WHITE); setHintTextColor(Color.GRAY)
        }
        roomInput = EditText(this).apply {
            hint = "Room code (same on laptop)"
            setText(prefs.getString("room", ""))
            setTextColor(Color.WHITE); setHintTextColor(Color.GRAY)
        }
        toggle = Button(this).apply {
            text = "START"
            textSize = 20f
            setOnClickListener { if (running) stopAll("Stopped") else requestStart() }
        }
        status = TextView(this).apply {
            text = "Idle"
            textSize = 14f
            setTextColor(Color.parseColor("#8BC34A"))
            setPadding(0, pad / 2, 0, pad / 2)
        }
        transcript = TextView(this).apply {
            textSize = 20f
            setTextColor(Color.WHITE)
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#101418"))
            setPadding(pad, pad * 2, pad, pad)
            addView(serverInput)
            addView(roomInput)
            addView(toggle)
            addView(status)
            addView(ScrollView(this@MainActivity).apply { addView(transcript) })
        }
        setContentView(root)
    }

    private fun requestStart() {
        var server = serverInput.text.toString().trim()
        val room = roomInput.text.toString().trim().lowercase()
        if (server.isEmpty() || room.isEmpty()) {
            status.text = "Enter relay URL and room code"
            return
        }
        if (!server.contains("://")) {
            server = "wss://$server"
            serverInput.setText(server)
        }
        getSharedPreferences("telecaption", Context.MODE_PRIVATE).edit()
            .putString("server", server).putString("room", room).apply()

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        } else {
            startAll()
        }
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, results: IntArray) {
        if (code == 1 && results.firstOrNull() == PackageManager.PERMISSION_GRANTED) startAll()
        else status.text = "Microphone permission denied"
    }

    private fun startAll() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            status.text = "No speech recognition service on this device (enable the Google app)"
            return
        }
        running = true
        seq = 0
        toggle.text = "STOP"
        status.text = "Connecting…"
        connectWs()
        recognizer = SpeechRecognizer.createSpeechRecognizer(this).also {
            it.setRecognitionListener(listener)
        }
        startListening()
    }

    private fun stopAll(msg: String) {
        running = false
        handler.removeCallbacksAndMessages(null)
        recognizer?.destroy(); recognizer = null
        ws?.close(1000, null); ws = null
        toggle.text = "START"
        status.text = msg
    }

    private fun connectWs() {
        val req = Request.Builder().url(serverInput.text.toString().trim()).build()
        ws = client.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(
                    JSONObject()
                        .put("type", "join")
                        .put("room", roomInput.text.toString().trim().lowercase())
                        .put("role", "speaker")
                        .toString()
                )
                runOnUiThread { if (running) status.text = "Connected — speak" }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                runOnUiThread { if (running) status.text = "Relay retry: ${t.message}" }
                scheduleReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        if (!running) return
        handler.postDelayed({ if (running) connectWs() }, 1500)
    }

    private fun startListening() {
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        }
        recognizer?.startListening(i)
    }

    private fun restartListening(delayMs: Long) {
        if (!running) return
        recognizer?.cancel()
        handler.postDelayed({ if (running) startListening() }, delayMs)
    }

    private fun sendCaption(text: String, final: Boolean) {
        transcript.text = text
        ws?.send(
            JSONObject()
                .put("type", "caption")
                .put("text", text)
                .put("final", final)
                .put("seq", seq++)
                .toString()
        )
    }

    private val listener = object : RecognitionListener {
        override fun onPartialResults(partialResults: Bundle?) {
            val text = partialResults
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()?.trim()
            if (!text.isNullOrEmpty()) sendCaption(text, false)
        }

        override fun onResults(results: Bundle?) {
            val text = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()?.trim()
            if (!text.isNullOrEmpty()) sendCaption(text, true)
            restartListening(100)
        }

        override fun onError(error: Int) {
            if (!running) return
            when (error) {
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> stopAll("Microphone permission missing")
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> restartListening(400)
                else -> restartListening(150) // NO_MATCH / SPEECH_TIMEOUT etc: keep listening
            }
        }

        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    override fun onDestroy() {
        stopAll("Idle")
        super.onDestroy()
    }
}
