package com.irfan.fakegps

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.preference.PreferenceManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.OnlineTileSourceBase
import org.osmdroid.util.GeoPoint
import org.osmdroid.util.MapTileIndex
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker

class MapActivity : AppCompatActivity() {

    private lateinit var map: MapView
    private lateinit var coordsTv: TextView
    private var marker: Marker? = null
    private var selected: GeoPoint? = null

    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }

    // Esri World Street Map -> English (Latin) labels worldwide.
    private val englishTiles = object : OnlineTileSourceBase(
        "EsriWorldStreetMap", 0, 19, 256, "",
        arrayOf("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/")
    ) {
        override fun getTileURLString(pMapTileIndex: Long): String {
            return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/" +
                MapTileIndex.getZoom(pMapTileIndex) + "/" +
                MapTileIndex.getY(pMapTileIndex) + "/" +
                MapTileIndex.getX(pMapTileIndex)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        Configuration.getInstance()
            .load(this, PreferenceManager.getDefaultSharedPreferences(this))
        Configuration.getInstance().userAgentValue = packageName

        setContentView(R.layout.activity_map)

        coordsTv = findViewById(R.id.coords)
        map = findViewById(R.id.map)
        map.setTileSource(englishTiles)
        map.setMultiTouchControls(true)
        map.controller.setZoom(5.0)
        map.controller.setCenter(GeoPoint(25.2048, 55.2708)) // Dubai default

        val receiver = object : MapEventsReceiver {
            override fun singleTapConfirmedHelper(p: GeoPoint): Boolean {
                setSelected(p)
                return true
            }
            override fun longPressHelper(p: GeoPoint): Boolean = false
        }
        map.overlays.add(MapEventsOverlay(receiver))

        findViewById<Button>(R.id.myLocBtn).setOnClickListener { goToMyLocation() }
        findViewById<Button>(R.id.startBtn).setOnClickListener { start() }
        findViewById<Button>(R.id.stopBtn).setOnClickListener { stop() }
        findViewById<Button>(R.id.logoutBtn).setOnClickListener {
            Prefs.clear(this)
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }

        requestPerms()
    }

    private fun setSelected(p: GeoPoint) {
        selected = p
        val m = marker ?: Marker(map).also {
            map.overlays.add(it)
            marker = it
        }
        m.position = p
        m.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
        map.invalidate()
        coordsTv.text = "Selected: %.5f, %.5f".format(p.latitude, p.longitude)
    }

    // "My Location" button: jump map to where the phone really is.
    @SuppressLint("MissingPermission")
    private fun goToMyLocation() {
        if (!hasLocationPerm()) {
            requestPerms()
            return
        }
        Toast.makeText(this, "Location dhoond rahe hain…", Toast.LENGTH_SHORT).show()
        fused.lastLocation
            .addOnSuccessListener { loc ->
                if (loc != null) {
                    val p = GeoPoint(loc.latitude, loc.longitude)
                    map.controller.setZoom(16.0)
                    map.controller.animateTo(p)
                    setSelected(p)
                } else {
                    Toast.makeText(
                        this,
                        "Location nahi mili. GPS on karke, bahar/khidki ke paas ja ke phir try karein.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
            .addOnFailureListener {
                Toast.makeText(this, "Location error", Toast.LENGTH_SHORT).show()
            }
    }

    private fun start() {
        val p = selected
        if (p == null) {
            Toast.makeText(this, "Pehle map pe location choose karein (ya My Location dabayein)", Toast.LENGTH_SHORT).show()
            return
        }
        val token = Prefs.token(this) ?: run { goLogin(); return }

        // Subscription dobara verify karo, phir hi start
        ApiClient.status(token) { r ->
            runOnUiThread {
                when {
                    r.ok && r.body?.optBoolean("active") == true -> {
                        val i = Intent(this, MockLocationService::class.java).apply {
                            putExtra("lat", p.latitude)
                            putExtra("lng", p.longitude)
                        }
                        ContextCompat.startForegroundService(this, i)
                        Toast.makeText(this, "Fake location started", Toast.LENGTH_SHORT).show()
                    }
                    r.ok -> {
                        Toast.makeText(this, "Subscription expire ho gayi.", Toast.LENGTH_LONG).show()
                        Prefs.clear(this)
                        goLogin()
                    }
                    else -> {
                        Toast.makeText(this, "Network error: ${r.error}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private fun stop() {
        stopService(Intent(this, MockLocationService::class.java))
        Toast.makeText(this, "Stopped", Toast.LENGTH_SHORT).show()
    }

    private fun goLogin() {
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }

    private fun hasLocationPerm(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    private fun requestPerms() {
        val perms = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val missing = perms.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1)
        }
    }

    override fun onResume() {
        super.onResume()
        map.onResume()
    }

    override fun onPause() {
        super.onPause()
        map.onPause()
    }
}
