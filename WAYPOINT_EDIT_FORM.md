# Waypoint Edit Form Specification

**Location:** `map_editor_mockup.html` - Slideout Panel  
**Created:** 2026-03-25  
**Version:** 1.0  

---

## 📋 Form Fields

Based on `waypoints` table schema:

```sql
CREATE TABLE waypoints (
    id UUID PRIMARY KEY,
    soundscape_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL DEFAULT 'Sound',
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    sound_url VARCHAR(512) NOT NULL,
    volume DOUBLE PRECISION DEFAULT 0.8,
    loop BOOLEAN DEFAULT true,
    activation_radius DOUBLE PRECISION DEFAULT 20.0,
    icon VARCHAR(50) DEFAULT '🎵',
    color VARCHAR(50) DEFAULT '#00d9ff',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

## 🎛️ Form Elements

### Core Fields (Always Shown)

| Field | Element | ID | Range/Format | Default | Help |
|-------|---------|----|--------------|---------|------|
| **Name** | Text input | `slideoutName` | 1-255 chars | 'Sound' | Waypoint name |
| **Sound URL** | URL input | `slideoutSoundUrl` | Valid URL, max 512 | '' | Audio file location |
| **Volume** | Range slider | `slideoutVolume` | 0.0 - 1.0 (step 0.1) | 0.8 | Live % display |
| **Activation Radius** | Range slider | `slideoutActivationRadius` | 5 - 100m (step 1) | 20 | Live m display |
| **Loop** | Checkbox | `slideoutLoop` | Boolean | true | Loop sound on/off |
| **Sort Order** | Number input | `slideoutSortOrder` | Integer ≥ 0 | 0 | Processing order (0 = first) |

### Read-Only Fields

| Field | Element | ID | Format | Description |
|-------|---------|----|--------|-------------|
| **Latitude** | Text span | `slideoutLat` | Decimal degrees | GPS latitude (not editable) |
| **Longitude** | Text span | `slideoutLon` | Decimal degrees | GPS longitude (not editable) |

### Future Extension

| Field | Element | ID | Purpose |
|-------|---------|----|---------|
| **Type-Specific** | Dynamic container | `slideoutTypeSpecific` | Streaming, behaviors, etc. |

---

## 🎨 UI Behavior

### Waypoint Mode
All fields visible and editable.

### Area Mode
Hide waypoint-specific fields:
- Sound URL (hidden)
- Volume (hidden)
- Activation Radius (hidden)
- Icon (hidden)
- Loop checkbox (hidden)
- Sort Order (hidden)
- Coordinates (hidden)

Show only:
- Name
- Color
- Delete button

---

## 🔄 Live Updates

### Volume Slider
```javascript
slideoutVolume.addEventListener('input', (e) => {
    slideoutVolumeValue.textContent = `${Math.round(e.target.value * 100)}%`;
});
```

### Activation Radius Slider
```javascript
slideoutActivationRadius.addEventListener('input', (e) => {
    slideoutActivationRadiusValue.textContent = `${e.target.value}m`;
});
```

---

## 💾 Save Behavior

On save, collects all form values into `selectedItemData`:

```javascript
const updated = {
    id: selectedItemData.id,
    name: slideoutName.value,
    soundUrl: slideoutSoundUrl.value,
    volume: parseFloat(slideoutVolume.value),
    loop: slideoutLoop.checked,
    activationRadius: parseInt(slideoutActivationRadius.value),
    icon: slideoutIcon.value,
    color: slideoutColor.value,
    sortOrder: parseInt(slideoutSortOrder.value),
    lat: selectedItemData.lat,
    lon: selectedItemData.lon
};
```

---

## 🔮 Future Extensions

### Streaming Audio Support
Add fields for streaming sources:
```html
<div class="slideout-field" id="slideoutStreamType">
    <label>Stream Type</label>
    <select>
        <option value="mp3">MP3 Stream</option>
        <option value="hls">HLS Stream</option>
        <option value="icecast">Icecast/Shoutcast</option>
    </select>
</div>

<div class="slideout-field" id="slideoutBufferTime">
    <label>Buffer Time (seconds)</label>
    <input type="number" min="1" max="30" value="5">
</div>
```

### Behavior Support
Add fields for waypoint behaviors:
```html
<div class="slideout-field" id="slideoutBehavior">
    <label>Behavior</label>
    <select>
        <option value="none">None</option>
        <option value="tempo_sync">Tempo Sync</option>
        <option value="time_sync">Time Sync</option>
        <option value="proximity">Proximity Trigger</option>
    </select>
</div>
```

### Advanced Audio Settings
```html
<div class="slideout-field">
    <label>Reverb Mix</label>
    <input type="range" min="0" max="100" value="0">
</div>

<div class="slideout-field">
    <label>EQ Preset</label>
    <select>
        <option value="flat">Flat</option>
        <option value="bright">Bright</option>
        <option value="warm">Warm</option>
    </select>
</div>
```

---

## 📱 Responsive Design

Form uses flexbox for responsive layout:

- **Desktop:** Full form with all fields
- **Tablet:** Condensed layout, stacked fields
- **Mobile:** Slideout becomes full-screen modal

---

## ♿ Accessibility

- All inputs have associated `<label>` elements
- Range sliders have visible value displays
- Color picker has text fallback (not implemented yet)
- Keyboard navigation supported (Tab, Enter, Escape)

---

## 🧪 Testing Checklist

- [ ] Name validation (required, max 255 chars)
- [ ] URL validation (valid format)
- [ ] Volume slider updates display
- [ ] Radius slider updates display
- [ ] Loop checkbox toggles
- [ ] Icon accepts emoji
- [ ] Color picker works
- [ ] Sort order accepts only integers
- [ ] Coordinates display correctly
- [ ] Save collects all fields
- [ ] Cancel discards changes
- [ ] Delete confirms before removing

---

**Last Updated:** 2026-03-25
