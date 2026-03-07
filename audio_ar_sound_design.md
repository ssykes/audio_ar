# Audio AR: Sound Design & iPhone-WebServer Implementation

## Part 1: Sound Design for Position Accuracy

### Yes! Sound Design Can Mask GPS Inaccuracy

Clever audio techniques can make positioning **feel** more accurate than it actually is.

---

### Psychoacoustic Tricks for Better Perceived Accuracy

#### 1. **High-Frequency Content = Better Localization**

| Frequency | Directional Cue | Best For |
|-----------|-----------------|----------|
| **2-8 kHz** | ✅ Sharp localization | Position-critical sounds |
| **500Hz-2kHz** | ⚠️ Moderate | Voice, melody |
| **<500 Hz** | ❌ Omnidirectional | Ambience, bass |

**Why:** Human ears localize high frequencies better due to head shadowing and ear shape.

**Use sounds with:**
- ✅ Crisp transients (bells, chimes, clicks)
- ✅ Bright timbre (violins, flutes, high piano)
- ❌ Avoid pure bass or low rumbles for position cues

---

#### 2. **Add Reverb Based on Distance**

```javascript
// More reverb = sounds farther away
function updateReverb(distance) {
  const wetValue = Math.min(distance / 50, 0.8); // 0-80% wet
  reverbNode.wet.value = wetValue;
}
```

| Distance | Reverb | Effect |
|----------|--------|--------|
| **0-5m** | Dry (10% wet) | Intimate, close |
| **5-20m** | Medium (40% wet) | Some space |
| **20m+** | Wet (80% wet) | Distant, ambient |

**Why:** Reverb masks GPS jitter — small position changes feel natural, not glitchy.

---

#### 3. **Use Steep Volume Falloff**

```javascript
// Exponential falloff = more dramatic position changes
panner.distanceModel = 'exponential';
panner.rolloffFactor = 2.0; // Higher = steeper drop
```

| Rolloff | Effect |
|---------|--------|
| **0.5** | Gradual (hard to tell distance) |
| **1.0** | Natural (inverse square law) |
| **2.0+** | Dramatic (easy to tell when close) |

**Why:** Steeper curves make "you're getting warmer" more obvious.

---

#### 4. **Layer Multiple Sounds**

```
🎯 Sound Source (GPS location)
│
├─ 🔔 Trigger sound (high-freq, precise localization)
├─ 🎵 Main audio (voice, music)
└─ 🌊 Ambient bed (low-freq, non-directional)
```

| Layer | Purpose | Frequency |
|-------|---------|-----------|
| **Trigger** | "Something is here!" | High (5-10kHz) |
| **Main** | Content (voice, music) | Mid (500Hz-4kHz) |
| **Ambient** | Atmosphere | Low (<500Hz) |

**Why:** The trigger sound gives precise location cues; the main audio provides content.

---

#### 5. **Add Positional "Hint" Sounds**

When user is searching:

```javascript
// Pulsing sound that speeds up as you get closer
function updatePulseRate(distance) {
  const rate = map(distance, 0, 50, 0.5, 0.05); // 0.5s → 0.05s between pulses
  playClickSound(rate);
}
```

| Distance | Pulse Rate | Effect |
|----------|------------|--------|
| **Far (50m)** | Slow (every 2s) | "Something out there..." |
| **Medium (20m)** | Medium (every 0.5s) | "Getting warmer..." |
| **Close (5m)** | Fast (every 0.1s) | "Right here!" |

**Why:** Like a Geiger counter — gives clear feedback even with GPS drift.

---

#### 6. **Use Directional "Sweep" Sounds**

```javascript
// When user turns toward the sound, play a subtle upward sweep
// When turning away, play downward sweep
function updateDirectionalHint(angle) {
  if (angleChanging && gettingCloser) {
    playSweep('up');
  } else if (angleChanging && gettingFarther) {
    playSweep('down');
  }
}
```

**Why:** Auditory feedback for "you're facing the right way."

---

### Best Sound Types for Position Accuracy

| Sound Type | Localization | Best Use |
|------------|--------------|----------|
| **🔔 Bells/Chimes** | ✅ Excellent | Trigger/marker sounds |
| **🎻 Strings (high)** | ✅ Good | Sustained position cues |
| **🎹 Piano (high notes)** | ✅ Good | Melodic position cues |
| **🎤 Voice** | ⚠️ Moderate | Main content (add hints) |
| **🥁 Percussion** | ✅ Excellent | Transient location markers |
| **🌊 Pads/Ambient** | ❌ Poor | Background atmosphere |
| **🔊 Pure sine waves** | ⚠️ Moderate | Testing, not engaging |

---

### Sound Layer Stack Example

```
┌─────────────────────────────────────────────────┐
│  Sound Layer Stack                              │
├─────────────────────────────────────────────────┤
│  🔔 Marker: High chime (8kHz)                   │
│     - Precise localization                      │
│     - Plays every 1-2 seconds when far          │
│     - Continuous when close (<5m)               │
├─────────────────────────────────────────────────┤
│  🎵 Content: Voice/Music                        │
│     - Main experience                           │
│     - Spatial audio positioned at GPS coord     │
│     - Add reverb based on distance              │
├─────────────────────────────────────────────────┤
│  🌊 Ambient: Low pad (<500Hz)                   │
│     - Non-directional atmosphere                │
│     - Masks GPS jitter                          │
│     - Creates "presence"                        │
└─────────────────────────────────────────────────┘
```

---

### Example: Approaching a Sound

```
Distance    What You Hear
─────────────────────────────────────────────────
50m+        Faint ambient bed, occasional chime (every 3s)
20-50m      Chime every 1s, voice barely audible
10-20m      Voice clearer, chime continuous, reverb decreases
5-10m       Voice full, chime stops, spatial audio precise
0-5m        Voice intimate (dry), full frequency, centered
```

---

### Summary: Best Practices

| Technique | Effect | Effort |
|-----------|--------|--------|
| **High-frequency sounds** | Better localization | Low |
| **Reverb based on distance** | Masks GPS drift | Medium |
| **Steep volume falloff** | Clearer distance cues | Low |
| **Layered sounds** | Precise + content | Medium |
| **Pulse/marker sounds** | "Hot/cold" feedback | Medium |
| **Directional sweeps** | Facing feedback | High |

---

## Part 2: iPhone + Ubuntu Web Server Stack

### Architecture Overview

```
┌─────────────────┐         HTTP/WebSocket         ┌──────────────────┐
│   iPhone        │◄──────────────────────────────►│   Ubuntu Server  │
│   (Safari)      │                                │   (Your Mac Mini)│
│                 │                                │                  │
│  - GPS          │                                │  - Flask/Node.js │
│  - Compass      │                                │  - SQLite/Postgres│
│  - Web Audio    │                                │  - Audio Files   │
│  - Web App      │                                │  - Location DB   │
└─────────────────┘                                └──────────────────┘
        │                                                   │
        │ WiFi Network (Router/Switch)                      │
        └───────────────────────────────────────────────────┘
```

---

### Hardware Requirements

| Component | What You Need | Cost |
|-----------|---------------|------|
| **iPhone** | iPhone 6s or newer (iOS 14+) | Already have |
| **Ubuntu Server** | Your Mac Mini (250GB SSD) | Already have |
| **Network** | Router + Ethernet switch (TP-Link TL-SG105) | ~$20 |
| **Headphones** | Any headphones (for spatial audio) | Already have |

---

### Software Stack

#### Server Side (Ubuntu on Mac Mini)

| Component | Purpose | Install Command |
|-----------|---------|-----------------|
| **Python Flask** | Web server framework | `sudo apt install python3-flask` |
| **SQLite** | Location database (built-in) | Included with Python |
| **Nginx** (optional) | Production web server | `sudo apt install nginx` |
| **Gunicorn** (optional) | WSGI server | `sudo apt install gunicorn` |

#### Client Side (iPhone Safari)

| API | Purpose | Support |
|-----|---------|---------|
| **Geolocation API** | GPS coordinates | ✅ iOS 5+ |
| **DeviceOrientation** | Compass heading | ✅ iOS 13+ (requires permission) |
| **Web Audio API** | Spatial audio | ✅ iOS 14+ |
| **Fetch API** | Get audio/data from server | ✅ iOS 10+ |

---

### Basic Flask Server Setup

#### 1. Install dependencies

```bash
sudo apt update
sudo apt install python3-flask python3-pip -y
pip3 install flask flask-cors
```

#### 2. Create project structure

```bash
mkdir -p ~/audio_ar/{static,templates,audio}
cd ~/audio_ar
```

#### 3. Basic Flask app (`app.py`)

```python
from flask import Flask, render_template, jsonify, send_from_directory
import sqlite3
import math

app = Flask(__name__)

# Database of sound locations
SOUNDS = [
    {'id': 1, 'name': 'Voice at Park', 'lat': 37.7749, 'lon': -122.4194, 'audio': 'voice1.mp3'},
    {'id': 2, 'name': 'Chime at Cafe', 'lat': 37.7751, 'lon': -122.4180, 'audio': 'chime1.mp3'},
]

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/sounds')
def get_sounds():
    return jsonify(SOUNDS)

@app.route('/audio/<filename>')
def serve_audio(filename):
    return send_from_directory('audio', filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
```

#### 4. Run the server

```bash
python3 app.py
```

Access from iPhone: `http://YOUR_SERVER_IP:5000`

---

### iPhone Web App (Frontend)

#### `templates/index.html`

```html
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Audio AR</title>
    <style>
        body { font-family: -apple-system, sans-serif; padding: 20px; }
        #status { margin: 20px 0; padding: 10px; background: #f0f0f0; }
        button { padding: 15px 30px; font-size: 18px; margin: 10px; }
    </style>
</head>
<body>
    <h1>🎧 Audio AR Experience</h1>
    <div id="status">Tap "Start" to begin</div>
    <button id="startBtn">Start</button>
    
    <script>
        let audioContext, sounds = [];
        let userLat, userLon, userHeading;
        
        document.getElementById('startBtn').addEventListener('click', async () => {
            // Request permissions
            await requestPermissions();
            
            // Initialize audio
            audioContext = new AudioContext();
            
            // Load nearby sounds
            await loadSounds();
            
            // Start tracking
            startTracking();
        });
        
        async function requestPermissions() {
            // GPS permission
            if (!navigator.geolocation) {
                alert('Geolocation not supported');
                return;
            }
            
            // Compass permission (iOS 13+)
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission !== 'granted') {
                    alert('Compass permission denied');
                    return;
                }
            }
            
            document.getElementById('status').textContent = 'Permissions granted!';
        }
        
        async function loadSounds() {
            const response = await fetch('/api/sounds');
            sounds = await response.json();
            
            // Create audio sources for each sound
            sounds.forEach(sound => {
                sound.panner = audioContext.createPanner();
                sound.panner.panningModel = 'HRTF';
                sound.panner.distanceModel = 'exponential';
                sound.panner.rolloffFactor = 2.0;
                sound.panner.connect(audioContext.destination);
                
                // Load audio file
                fetch(`/audio/${sound.audio}`)
                    .then(r => r.arrayBuffer())
                    .then(buffer => audioContext.decodeAudioData(buffer))
                    .then(decoded => {
                        sound.source = audioContext.createBufferSource();
                        sound.source.buffer = decoded;
                        sound.source.loop = true;
                        sound.source.connect(sound.panner);
                        sound.source.start();
                    });
            });
        }
        
        function startTracking() {
            // GPS tracking
            navigator.geolocation.watchPosition(
                (pos) => {
                    userLat = pos.coords.latitude;
                    userLon = pos.coords.longitude;
                    updateSoundPositions();
                },
                (err) => console.error(err),
                { enableHighAccuracy: true, maximumAge: 1000 }
            );
            
            // Compass tracking
            window.addEventListener('deviceorientation', (e) => {
                userHeading = e.webkitCompassHeading || e.alpha;
                updateListenerOrientation();
            });
            
            document.getElementById('status').textContent = 'Tracking started!';
        }
        
        function updateSoundPositions() {
            sounds.forEach(sound => {
                const distance = calculateDistance(
                    userLat, userLon, sound.lat, sound.lon
                );
                const bearing = calculateBearing(
                    userLat, userLon, sound.lat, sound.lon
                );
                
                // Convert to 3D coordinates
                const x = Math.sin(bearing) * distance;
                const z = Math.cos(bearing) * distance;
                
                sound.panner.positionX.value = x;
                sound.panner.positionZ.value = z;
                
                // Update volume based on distance
                const gain = Math.max(0, 1 - distance / 50);
                sound.panner.gain = gain;
            });
        }
        
        function updateListenerOrientation() {
            if (!audioContext || !audioContext.listener) return;
            
            const radians = (userHeading || 0) * Math.PI / 180;
            audioContext.listener.forwardX.value = Math.sin(radians);
            audioContext.listener.forwardZ.value = Math.cos(radians);
        }
        
        // Haversine formula for distance
        function calculateDistance(lat1, lon1, lat2, lon2) {
            const R = 6371000; // Earth radius in meters
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2) ** 2 + 
                      Math.cos(lat1 * Math.PI / 180) * 
                      Math.cos(lat2 * Math.PI / 180) * 
                      Math.sin(dLon/2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }
        
        function calculateBearing(lat1, lon1, lat2, lon2) {
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
            const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                      Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
            return Math.atan2(y, x);
        }
    </script>
</body>
</html>
```

---

### Network Setup

#### 1. Find your server IP

On Ubuntu server:
```bash
ip addr show enp2s0f0
```

Look for `inet 192.168.x.x`

#### 2. Configure firewall (if enabled)

```bash
sudo ufw allow 5000/tcp
sudo ufw status
```

#### 3. Access from iPhone

1. Connect iPhone to same WiFi network
2. Open Safari
3. Navigate to `http://192.168.x.x:5000`
4. Tap "Start" and grant permissions

---

### iOS Permission Notes

#### Geolocation (GPS)

```javascript
navigator.geolocation.watchPosition(
    successCallback,
    errorCallback,
    {
        enableHighAccuracy: true,  // Use GPS, not just WiFi
        maximumAge: 1000,          // Cache for 1 second
        timeout: 10000             // Timeout after 10 seconds
    }
);
```

#### Device Orientation (Compass)

iOS 13+ requires explicit permission:

```javascript
if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    const permission = await DeviceOrientationEvent.requestPermission();
    // Must be triggered by user gesture (button click)
}
```

#### Audio Playback

iOS requires user gesture to start audio:

```javascript
// Must be inside a click/touch event handler
document.getElementById('startBtn').addEventListener('click', () => {
    audioContext = new AudioContext();  // ✅ Works
});
```

---

### Accuracy Expectations

| Component | Expected Accuracy |
|-----------|-------------------|
| **iPhone GPS** | 5-10 meters (outdoors) |
| **iPhone Compass** | 5-15 degrees |
| **Audio Latency** | 50-100ms |
| **Position Update Rate** | 1-10 Hz (depending on GPS signal) |

---

### Troubleshooting

| Issue | Solution |
|-------|----------|
| **Can't connect from iPhone** | Check firewall, ensure same network, use HTTP not HTTPS |
| **GPS not working** | Enable location services in Settings → Privacy → Location → Safari |
| **Compass not working** | Grant permission when prompted, calibrate by waving phone in figure-8 |
| **No sound** | iOS requires user gesture to start audio, tap "Start" button |
| **Audio stops** | Keep app in foreground, iOS suspends background audio |

---

### Next Steps / Enhancements

| Feature | How to Add |
|---------|------------|
| **User-generated content** | Add upload form to record/place sounds |
| **Persistent database** | Replace hardcoded SOUNDS list with SQLite |
| **Better sound design** | Add reverb, distance-based filtering, pulse sounds |
| **Visual feedback** | Add compass arrow pointing to sounds |
| **Multiple users** | Add user accounts, shared sound maps |
| **Production deployment** | Use Nginx + Gunicorn instead of Flask dev server |

---

## Quick Start Checklist

```bash
# On Ubuntu Server (Mac Mini)
sudo apt update
sudo apt install python3-flask -y
mkdir -p ~/audio_ar/{static,templates,audio}
cd ~/audio_ar

# Create app.py and templates/index.html (see above)

# Add audio files to ~/audio_ar/audio/

# Run server
python3 app.py

# Note the IP address shown, then on iPhone:
# Open Safari → http://YOUR_SERVER_IP:5000
```

---

## Bottom Line

| Component | Recommendation |
|-----------|----------------|
| **GPS Accuracy** | 5-10m (iPhone built-in) — good enough for testing |
| **Sound Design** | Use high-freq markers + reverb to mask GPS drift |
| **Server** | Flask on Ubuntu (your Mac Mini) |
| **Client** | Safari on iPhone (Web Audio API + Geolocation) |
| **Network** | Ethernet + WiFi (TP-Link switch if needed) |
| **Cost** | ~$20 for switch (everything else you have) |

**Start simple:** Get basic GPS + spatial audio working, then add sound design techniques to improve perceived accuracy.
