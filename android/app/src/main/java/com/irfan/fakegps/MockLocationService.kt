package com.irfan.fakegps

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat

class MockLocationService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var lm: LocationManager
    private var lat = 0.0
    private var lng = 0.0
    private var running = false

    private val providers = listOf(
        LocationManager.GPS_PROVIDER,
        LocationManager.NETWORK_PROVIDER
    )

    private val pusher = object : Runnable {
        override fun run() {
            pushOnce()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        startForeground(1, buildNotification("Fake location running"))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        lat = intent?.getDoubleExtra("lat", lat) ?: lat
        lng = intent?.getDoubleExtra("lng", lng) ?: lng
        if (!running) {
            running = true
            setupProviders()
            handler.post(pusher)
        }
        return START_STICKY
    }

    private fun setupProviders() {
        for (p in providers) {
            try {
                lm.addTestProvider(
                    p,
                    false, false, false, false,
                    true, true, true,
                    0, 5
                )
                lm.setTestProviderEnabled(p, true)
            } catch (e: SecurityException) {
                // "mock location app" developer options me select nahi kiya
                notifyError()
            } catch (e: IllegalArgumentException) {
                // provider is device pe mojood nahi — ignore
            }
        }
    }

    private fun pushOnce() {
        for (p in providers) {
            try {
                val loc = Location(p).apply {
                    latitude = lat
                    longitude = lng
                    accuracy = 1f
                    time = System.currentTimeMillis()
                    elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
                    altitude = 0.0
                    bearing = 0f
                    speed = 0f
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        bearingAccuracyDegrees = 0.1f
                        verticalAccuracyMeters = 0.1f
                        speedAccuracyMetersPerSecond = 0.01f
                    }
                }
                lm.setTestProviderLocation(p, loc)
            } catch (e: SecurityException) {
                notifyError()
            } catch (e: IllegalArgumentException) {
                // ignore
            }
        }
    }

    private fun notifyError() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(2, buildNotification("Developer Options me 'Select mock location app' = Fake GPS karein"))
    }

    private fun buildNotification(text: String): Notification {
        val channelId = "fakegps"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(channelId) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(channelId, "Fake GPS", NotificationManager.IMPORTANCE_LOW)
                )
            }
        }
        val pi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MapActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("Fake GPS")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pi)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        running = false
        handler.removeCallbacks(pusher)
        for (p in providers) {
            try {
                lm.setTestProviderEnabled(p, false)
                lm.removeTestProvider(p)
            } catch (e: Exception) {
                // ignore
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
