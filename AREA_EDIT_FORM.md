# Area Edit Form Specification

**Location:** `map_editor_mockup.html` - Slideout Panel  
**Version:** 1.0  
**Created:** 2026-03-25  

---

## 📋 Overview

Areas use the **same dynamic sound form** as waypoints, with minor differences:

- ✅ **Same sound type selector** (File, Oscillator, Streaming)
- ✅ **Same type-specific fields** (URL, waveform, stream settings)
- ✅ **Same common fields** (Name, Volume, Loop, Sort Order)
- ❌ **No Activation Radius** (areas use fade zone width instead)
- ℹ️ **Coordinates show vertex count** instead of GPS position

---

## 🎛️ Form Layout

```
┌─────────────────────────────────┐
│ Edit Area                   ×  │
├─────────────────────────────────┤
│ Sound Type: [Audio File ▼]      │
├─────────────────────────────────┤
│ COMMON SETTINGS                 │
│ - Name: [Forest Zone________]   │
│ - Volume: [━━━━●━━━━]      80%  │
│ - Loop: ☑ Loop Sound            │
│ - Sort Order: [0____]           │
│ - Vertices: 5 vertices          │ ← Shows vertex count
├─────────────────────────────────┤
│ FILE SETTINGS                   │
│ - Sound URL: [https://___]      │
├─────────────────────────────────┤
│                         ✖ 💾 🗑️│
└─────────────────────────────────┘
```

---

## 📊 Field Comparison: Area vs Waypoint

| Field | Waypoint | Area | Notes |
|-------|----------|------|-------|
| **Name** | ✅ | ✅ | Same |
| **Sound Type** | ✅ | ✅ | Same (File/Osc/Stream) |
| **Volume** | ✅ | ✅ | Same |
| **Activation Radius** | ✅ | ❌ | Hidden for areas |
| **Loop** | ✅ | ✅ | Same |
| **Sort Order** | ✅ | ✅ | Same |
| **Coordinates** | GPS (lat, lon) | Vertex count | Different display |
| **Type-Specific** | ✅ | ✅ | Same fields |

---

## 🎛️ Sound Type Fields (Same as Waypoint)

### File Type

| Field | Element | Range/Format | Default |
|-------|---------|--------------|---------|
| **Sound URL** | URL input | Valid URL, max 512 | '' |

### Oscillator Type

| Field | Element | Range/Format | Default |
|-------|---------|--------------|---------|
| **Waveform** | Select | sine/square/sawtooth/triangle | sine |
| **Frequency** | Number input | 20 - 20000 Hz | 440 |
| **Detune** | Number input | -1200 to +1200 cents | 0 |
| **Gain** | Range slider | 0.0 - 1.0 (step 0.01) | 0.5 |

### Streaming Type

| Field | Element | Range/Format | Default |
|-------|---------|--------------|---------|
| **Stream URL** | URL input | Valid URL | '' |
| **Stream Type** | Select | mp3/hls/icecast/dash | mp3 |
| **Buffer Time** | Range slider | 1 - 30 seconds | 5 |
| **Auto-Reconnect** | Checkbox | Boolean | true |

---

## 💾 Data Structure

### Area with File Sound

```json
{
    "id": "area_001",
    "type": "area",
    "name": "Forest Zone",
    "soundType": "file",
    "soundUrl": "https://cdn.example.com/sounds/forest.mp3",
    "volume": 0.8,
    "loop": true,
    "sortOrder": 0,
    "polygon": [
        {"lat": 47.6062, "lon": -122.3321},
        {"lat": 47.6065, "lon": -122.3318},
        {"lat": 47.6063, "lon": -122.3315}
    ],
    "fadeZoneWidth": 5.0,
    "overlapMode": "mix",
    "color": "#ff6b6b"
}
```

### Area with Oscillator Sound

```json
{
    "id": "area_002",
    "type": "area",
    "name": "Drone Zone",
    "soundType": "oscillator",
    "waveform": "sine",
    "frequency": 220,
    "detune": 0,
    "gain": 0.3,
    "volume": 0.8,
    "loop": true,
    "sortOrder": 1,
    "polygon": [...],
    "fadeZoneWidth": 10.0,
    "overlapMode": "mix"
}
```

### Area with Streaming Sound

```json
{
    "id": "area_003",
    "type": "area",
    "name": "Radio Zone",
    "soundType": "streaming",
    "streamUrl": "https://stream.example.com/live",
    "streamType": "hls",
    "bufferTime": 5,
    "autoReconnect": true,
    "volume": 0.8,
    "loop": true,
    "sortOrder": 2,
    "polygon": [...],
    "fadeZoneWidth": 5.0,
    "overlapMode": "opaque"
}
```

---

## 🔄 Form Behavior

### Opening Area Form

```javascript
function openSlideout(type, id, name, meta, color) {
    if (type === 'Area') {
        // Show area form
        slideoutTitle.textContent = 'Edit Area';
        
        // Populate common fields
        slideoutName.value = name;
        slideoutVolume.value = 0.8;
        slideoutLoop.checked = true;
        slideoutSortOrder.value = 0;
        slideoutLat.textContent = meta || '--';  // Shows vertex count
        slideoutLon.textContent = '--';
        
        // Hide activation radius (not used for areas)
        slideoutActivationRadius.parentElement.parentElement.style.display = 'none';
        
        // Show type selector and render fields
        slideoutType.value = 'file';
        renderTypeFields('file');
    }
}
```

### Saving Area Form

```javascript
function saveSlideout() {
    const updated = getFormData();
    
    // Area-specific data
    updated.polygon = selectedItemData.polygon;  // Preserve polygon
    updated.fadeZoneWidth = selectedItemData.fadeZoneWidth;
    updated.overlapMode = selectedItemData.overlapMode;
    updated.color = selectedItemData.color;
    
    // Sound-specific data (file/oscillator/streaming)
    // ... collected by getFormData()
    
    addDebugLog(`Saved Area: ${updated.name} (${updated.soundType})`);
}
```

---

## 🎨 Visual Differences from Waypoint

### Waypoint Form

```
┌─────────────────────────────────┐
│ Edit Waypoint               ×  │
├─────────────────────────────────┤
│ Sound Type: [Audio File ▼]      │
│ Name: [Bird Song 1__________]   │
│ Volume: [━━━━●━━━━]        80%  │
│ Activation Radius: [━●━━]  20m  │ ← Visible
│ Loop: ☑ Loop Sound              │
│ Sort Order: [0____]             │
│ Coordinates: 47.6062, -122.3321 │ ← GPS coordinates
└─────────────────────────────────┘
```

### Area Form

```
┌─────────────────────────────────┐
│ Edit Area                   ×  │
├─────────────────────────────────┤
│ Sound Type: [Audio File ▼]      │
│ Name: [Forest Zone__________]   │
│ Volume: [━━━━●━━━━]        80%  │
│ Loop: ☑ Loop Sound              │
│ Sort Order: [0____]             │
│ Vertices: 5 vertices            │ ← Vertex count
└─────────────────────────────────┘
```

---

## 🧪 Testing Checklist

### Area Form Display
- [ ] Title shows "Edit Area"
- [ ] Activation Radius slider hidden
- [ ] Coordinates show vertex count (e.g., "5 vertices")
- [ ] Sound type selector visible
- [ ] Type-specific fields render correctly

### Area Form Functionality
- [ ] Name can be edited
- [ ] Volume slider updates display
- [ ] Loop checkbox toggles
- [ ] Sort order accepts integers ≥ 0
- [ ] Type selector changes form fields
- [ ] File type shows URL field
- [ ] Oscillator type shows waveform/frequency/detune/gain
- [ ] Streaming type shows stream URL/type/buffer/reconnect

### Area Save
- [ ] Collects all form data
- [ ] Preserves polygon data
- [ ] Preserves fade zone width
- [ ] Preserves overlap mode
- [ ] Preserves color
- [ ] Sound-specific data included
- [ ] Debug log shows area name and sound type

### Area Delete
- [ ] Confirmation dialog appears
- [ ] Area removed from list
- [ ] Slideout closes
- [ ] Debug log shows deletion

---

## 📚 Related Documents

- `DYNAMIC_SOUND_EDIT_FORM.md` - Main form specification
- `FEATURE_17_MAP_EDITOR_UI_REFACTOR.md` - UI refactor feature spec
- `SOUND_AREA.md` - Sound Areas feature specification
- `spatial_audio.js` - AreaSoundSource implementation

---

**Last Updated:** 2026-03-25  
**Next Review:** After implementing real area sound playback
