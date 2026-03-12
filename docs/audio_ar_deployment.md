# Audio AR - Deployment Guide

## Walkable Spatial Audio Experience

A web-based audio augmented reality app that lets you walk between 4 spatially-positioned test tones.

---

## What It Does

| Feature | Description |
|---------|-------------|
| **4 Test Tones** | Sine (440Hz), Triangle (660Hz), Square (523Hz), Sawtooth (784Hz) |
| **Spatial Audio** | Each tone stays fixed at its GPS coordinate as you walk |
| **Preload System** | Load all audio near van, then walk away (WiFi not needed after) |
| **Visual Feedback** | See which tones are active + real-time distance to each |
| **Compass Display** | Shows which direction you're facing |
| **Offline Ready** | No internet required after initial page load |
| **iPhone Compatible** | Works in Safari on iOS 14+ |

---

## Sound Layout (Top-Down View)

```
        North
          ↑
          
    🔔            🔺
  Sine         Triangle
   (NW)          (NE)
   440Hz         660Hz
   
   
    🔲            🔶
  Square      Sawtooth
   (SW)          (SE)
   523Hz         784Hz
   
          ↓
        South

Each tone positioned ~20m from center
Activation radius: 25m (hear when within this distance)
```

---

## Hardware Requirements

| Component | What You Need | Cost |
|-----------|---------------|------|
| **Server** | Your Mac Mini (Ubuntu Server) | ✅ Already have |
| **Network** | WiFi router + Ethernet cable | ~$25 |
| **Power** | 300W power inverter | ~$60 |
| **Battery** | Deep cycle or portable power station | ~$100-200 |
| **Client** | iPhone (iOS 14+) | ✅ Already have |
| **Audio** | Any headphones | ✅ Already have |

**Total: ~$185-285** (one-time cost)

---

## Software Requirements

| Component | Version | Install Command |
|-----------|---------|-----------------|
| **Ubuntu Server** | 20.04 or 22.04 | ✅ Already installed |
| **Python 3** | 3.8+ | `sudo apt install python3` |
| **Flask** (optional) | Any | `sudo apt install python3-flask` |
| **Safari** | iOS 14+ | ✅ Built into iPhone |

---

## Deployment Steps

### Step 1: Copy Files to Server

```bash
# SSH into your Mac Mini server
ssh username@server-ip

# Create project directory
mkdir -p ~/audio_ar
cd ~/audio_ar
```

Upload `audio_ar_app.html` from your Windows machine to `~/audio_ar/`

**Option A: Using SCP from Windows (PowerShell)**
```powershell
scp audio_ar_app.html username@server-ip:~/audio_ar/
```

**Option B: Using VS Code Remote-SSH**
1. Connect to server via Remote-SSH
2. Drag file to server folder

**Option C: Using Python HTTP server (no Flask needed)**
```bash
# Just serve the HTML file directly
cd ~/audio_ar
python3 -m http.server 5000
```

---

### Step 2: Configure GPS Coordinates

**IMPORTANT:** Update the GPS coordinates for your actual location!

1. Open `audio_ar_app.html` in a text editor
2. Find this section (around line 230):

```javascript
// Set your GPS coordinates here (center point)
const CENTER_LAT = 37.7749;
const CENTER_LON = -122.4194;

// Spacing between tones (in meters)
const SPACING = 20;
```

3. **Get your actual coordinates:**
   - Go to your park/field location
   - Use a GPS app (Google Maps, What3Words, etc.)
   - Note the latitude and longitude

4. **Replace the values:**
```javascript
const CENTER_LAT = 51.5074;  // Your latitude
const CENTER_LON = -0.1278;  // Your longitude
const SPACING = 20;          // Keep 20m, or adjust (10-30m recommended)
```

5. Save the file

---

### Step 3: Start the Server

**Option A: Simple Python HTTP Server (Easiest)**

```bash
cd ~/audio_ar
python3 -m http.server 5000
```

Access at: `http://YOUR_SERVER_IP:5000/audio_ar_app.html`

**Option B: Flask Server (Better for production)**

Create `app.py`:
```python
from flask import Flask, send_from_directory

app = Flask(__name__)

@app.route('/')
def index():
    return send_from_directory('.', 'audio_ar_app.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
```

Run:
```bash
python3 app.py
```

Access at: `http://YOUR_SERVER_IP:5000/`

---

### Step 4: Configure Firewall (If Enabled)

```bash
# Check firewall status
sudo ufw status

# Allow port 5000 if firewall is active
sudo ufw allow 5000/tcp

# Verify
sudo ufw status
```

---

### Step 5: Access from iPhone

1. **Connect iPhone to your WiFi network**
   - The WiFi network created by your router (connected to Mac Mini)

2. **Open Safari**

3. **Navigate to:**
   ```
   http://YOUR_SERVER_IP:5000
   ```
   or
   ```
   http://YOUR_SERVER_IP:5000/audio_ar_app.html
   ```

4. **You should see the Audio AR app interface**

---

### Step 6: Test the Experience

1. **Stay near the van** (within WiFi range for now)

2. **Tap "Start Experience"**

3. **Wait for preload** (10-15 seconds)
   - Progress bar will show generation status
   - All 4 tones are generated and loaded into memory

4. **When you see "✅ Ready!"** you can walk away from the van

5. **Walk into the experience area:**
   - Each tone activates when you're within ~25m
   - Visual indicators show which tones are active
   - Distance to each tone updates in real-time

6. **Walk to the center** to hear all 4 tones together

7. **Walk between locations** to hear individual tones

---

## Mobile/Van Setup

### Power Wiring Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Inside Your Van                          │
│                                                             │
│   🔋 Battery (12V) ────🔌 Inverter (12V→120V AC)           │
│                              │                              │
│                              ├──── Mac Mini (Server)        │
│                              │                              │
│                              └──── WiFi Router              │
│                                                             │
│   📡 WiFi Signal ─────────────────────────────────────►     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Outside van (walking area)
                            ▼
                    
                    🚶 You with iPhone
                    🎧 Headphones
                    📍 GPS works anywhere
```

### Component Connections

1. **Battery → Inverter**
   - Use appropriate gauge wire (10-12 AWG)
   - Include inline fuse (10-15A) near battery

2. **Inverter → Power Strip**
   - Plug power strip into inverter

3. **Power Strip → Devices**
   - Mac Mini power cable
   - WiFi router power adapter

4. **Mac Mini → WiFi Router**
   - Ethernet cable from Mac Mini to router LAN port
   - **Do NOT use WAN port** (no internet needed)

---

## Usage Instructions

### Before You Go

```
□ Charge battery fully
□ Test server at home first
□ Bring headphones
□ Bring phone charger (for iPhone)
□ Print GPS coordinates for your location
□ Check weather forecast
```

### At the Location

1. **Park van at edge of experience area**

2. **Set up power:**
   - Connect battery to inverter
   - Turn on inverter
   - Verify Mac Mini boots

3. **Start the server:**
   ```bash
   cd ~/audio_ar
   python3 -m http.server 5000
   # or: python3 app.py
   ```

4. **Note the server IP:**
   ```bash
   ip addr show enp2s0f0
   # Look for: inet 192.168.x.x
   ```

5. **On iPhone:**
   - Connect to WiFi network
   - Open Safari
   - Go to `http://SERVER_IP:5000`

6. **Tap "Start Experience"**

7. **Wait for preload** (stay near van)

8. **When ready, walk into the area**

9. **Explore and listen!**

---

## Troubleshooting

### Can't Connect from iPhone

| Problem | Solution |
|---------|----------|
| **Page won't load** | Check server is running (`python3 app.py`) |
| **Connection refused** | Check firewall: `sudo ufw allow 5000/tcp` |
| **Can't find server IP** | Run `ip addr` on server |
| **WiFi won't connect** | Restart router, check power |

### GPS Issues

| Problem | Solution |
|---------|----------|
| **No GPS signal** | Enable Location Services: Settings → Privacy → Location → Safari |
| **GPS inaccurate** | Wait 30-60 seconds for GPS lock, ensure open sky view |
| **Slow GPS updates** | Walk around a bit, GPS needs movement to calibrate |

### Audio Issues

| Problem | Solution |
|---------|----------|
| **No sound** | iOS requires user gesture — must tap Start button |
| **Sound cuts out** | WiFi dropped after preload — should still work (audio is in memory) |
| **Can't hear spatial effect** | Use headphones (required for spatial audio) |

### Preload Issues

| Problem | Solution |
|---------|----------|
| **Preload fails** | Check WiFi connection, reload page |
| **Takes too long** | Normal — generating 4 sounds takes 10-15 seconds |
| **Stuck on progress** | Refresh page, tap Start again |

---

## Configuration Options

### Adjust Sound Spacing

In `audio_ar_app.html`, find:

```javascript
const SPACING = 20;  // meters between tones
```

| Value | Experience |
|-------|------------|
| **10m** | Tight cluster, small area |
| **20m** | Recommended for first test |
| **30m** | Larger area, more walking |
| **50m+** | Very spread out, need good GPS |

### Adjust Activation Radius

In `audio_ar_app.html`, find:

```javascript
const ACTIVATION_RADIUS = 25;  // meters
```

| Value | Experience |
|-------|------------|
| **15m** | Must be very close |
| **25m** | Recommended (default) |
| **40m** | Hear from farther away |
| **60m+** | Very large detection zone |

### Change Tone Frequencies

In `audio_ar_app.html`, find the `locations` array:

```javascript
const locations = [
    {
        id: 1,
        name: 'Sine Wave',
        freq: 440,  // Change this value
        wave: 'sine',
        // ...
    },
    // ...
];
```

| Frequency | Note | Character |
|-----------|------|-----------|
| 261 Hz | C4 | Lower, warmer |
| 440 Hz | A4 | Standard tuning |
| 523 Hz | C5 | Bright, clear |
| 660 Hz | E5 | Higher, sweeter |
| 784 Hz | G5 | Very high, piercing |

---

## Experience Area Recommendations

### Ideal Locations

| Location Type | GPS Quality | Recommended |
|---------------|-------------|-------------|
| **Open park/field** | ✅ Excellent | Perfect |
| **Beach** | ✅ Excellent | Perfect |
| **Soccer/baseball field** | ✅ Excellent | Perfect |
| **Large parking lot** | ✅ Excellent | Good for testing |
| **Light tree cover** | ⚠️ Good | Works well |
| **Urban street** | ⚠️ Fair | Use wider spacing |
| **Dense forest** | ❌ Poor | Avoid |
| **Between tall buildings** | ❌ Poor | Avoid |

### Minimum Area Size

| Spacing | Minimum Area |
|---------|--------------|
| **10m** | 30×30m |
| **20m** | 50×50m |
| **30m** | 80×80m |
| **50m** | 120×120m |

---

## Battery Runtime Estimates

| Power Source | Capacity | Estimated Runtime |
|--------------|----------|-------------------|
| **Car battery** | 100Ah | 8-12 hours |
| **Jackery 240** | 240Wh | 3-4 hours |
| **Jackery 500** | 500Wh | 6-8 hours |
| **Goal Zero Yeti 400** | 400Wh | 5-6 hours |

**Power consumption:**
- Mac Mini (2011): ~75W
- WiFi router: ~10W
- **Total:** ~85W

---

## Quick Reference Commands

### On Ubuntu Server

```bash
# Check server IP address
ip addr show enp2s0f0

# Start simple HTTP server
cd ~/audio_ar
python3 -m http.server 5000

# Start Flask server
cd ~/audio_ar
python3 app.py

# Check if server is running
ps aux | grep python

# Check firewall status
sudo ufw status

# Allow port 5000
sudo ufw allow 5000/tcp

# View system resources
htop
```

### On iPhone

```
Settings → Privacy → Location Services → Safari
  Set to "While Using the App"

Settings → Safari
  Clear History and Website Data (if issues)
```

---

## File Structure

```
~/audio_ar/
├── audio_ar_app.html    # Main application (this file)
├── app.py               # Flask server (optional)
└── README.md            # This deployment guide
```

---

## Next Steps / Enhancements

### Easy Improvements

| Enhancement | How |
|-------------|-----|
| **Change sounds** | Edit frequencies in `locations` array |
| **Add more tones** | Copy location objects in array |
| **Adjust spacing** | Change `SPACING` constant |
| **Different waveforms** | Change `wave` property ('sine', 'square', 'triangle', 'sawtooth') |

### Advanced Improvements

| Enhancement | How |
|-------------|-----|
| **Use recorded audio** | Add audio file loading instead of oscillators |
| **Multiple zones** | Create multiple `locations` arrays |
| **Visual map** | Add Leaflet.js with offline map tiles |
| **Recording** | Log user path to file |
| **Multi-user** | Run multiple instances on different ports |

---

## Support & Resources

### Related Documentation

| File | Description |
|------|-------------|
| `audio_ar_sound_design.md` | Sound design techniques + iPhone/Ubuntu stack |
| `binaural_navigation.md` | Binaural audio navigation software |
| `generated_spatial_audio.md` | Synthesized spatial audio guide |

### Useful Links

- **Web Audio API Docs:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **iOS Geolocation:** https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
- **Flask Documentation:** https://flask.palletsprojects.com/

---

## Quick Start Checklist

```
□ Update GPS coordinates in audio_ar_app.html
□ Copy file to Ubuntu server (~/audio_ar/)
□ Start server (python3 -m http.server 5000)
□ Configure firewall (sudo ufw allow 5000/tcp)
□ Connect iPhone to WiFi
□ Open Safari → http://SERVER_IP:5000
□ Tap "Start Experience"
□ Wait for preload (10-15 seconds)
□ Walk into experience area
□ Enjoy spatial audio!
```

---

## Bottom Line

| Component | Status |
|-----------|--------|
| **GPS range** | Unlimited (satellites) |
| **WiFi range** | 30-50m (only needed for preload) |
| **After preload** | Walk anywhere (audio in memory) |
| **Minimum spacing** | 10-15m between tones |
| **Recommended spacing** | 20m between tones |
| **Activation radius** | 25m (configurable) |
| **Total cost** | ~$185-285 (router + inverter + battery) |
| **Runtime** | 8+ hours (with car battery) |

**You're ready to go!** Update the GPS coordinates, start the server, and test it in a park near you.
