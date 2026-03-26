# Dynamic Sound Edit Form Specification

**Location:** `map_editor_mockup.html` - Slideout Panel  
**Version:** 2.1 (Area Support)  
**Created:** 2026-03-25  
**Updated:** 2026-03-25  

---

## 📋 Overview

Dynamic form that adapts based on **item type** (Waypoint or Area) and **sound type** (File, Oscillator, Streaming).

### Supported Item Types

| Item Type | Description | Sound Sources |
|-----------|-------------|---------------|
| **Waypoint** | Point source at GPS coordinates | File, Oscillator, Streaming |
| **Area** | Polygon zone with uniform audio | File, Oscillator, Streaming |

### Supported Sound Types

| Sound Type | Description | Use Case |
|------------|-------------|----------|
| **File** | Audio file playback (MP3, WAV, OGG) | Pre-recorded sounds |
| **Oscillator** | Generated waveforms | Tones, alerts, ambient drones |
| **Streaming** | Network streams | Live radio, internet streams |

---

## 🏗️ Architecture

### Form Structure

```
┌─────────────────────────────────┐
│ Type Selector                   │ ← Always visible
├─────────────────────────────────┤
│ Common Fields                   │ ← All types
│ - Name                          │
│ - Volume                        │
│ - Activation Radius             │
│ - Loop                          │
├─────────────────────────────────┤
│ Type-Specific Fields            │ ← Dynamic content
│ (changes based on selector)     │
├─────────────────────────────────┤
│ Advanced Settings (collapsible) │ ← Hidden by default
│ - Sort Order                    │
│ - Coordinates                   │
└─────────────────────────────────┘
```

### Configuration System

Types are defined in `TYPE_CONFIGS` object:

```javascript
const TYPE_CONFIGS = {
    'file': {
        title: 'File Settings',
        fields: `...HTML template...`,
        onRender: () => { /* event listeners */ }
    },
    'oscillator': { ... },
    'streaming': { ... }
};
```

---

## 🎛️ Form Fields by Item Type

### Waypoint Form

Shows all common fields plus type-specific fields.

**Differences from Area:**
- Shows **Activation Radius** slider
- Coordinates shown as GPS position
- Title: "Edit Waypoint"

---

### Area Form

Shows common fields (no activation radius) plus type-specific fields.

**Differences from Waypoint:**
- Hides **Activation Radius** (areas use fade zone width instead)
- Coordinates shown as vertex count (e.g., "5 vertices")
- Title: "Edit Area"

---

## 🎛️ Form Fields by Sound Type

### Common Fields (All Types)

| Field | Element | Range/Format | Default |
|-------|---------|--------------|---------|
| **Name** | Text input | 1-255 chars | '' |
| **Volume** | Range slider | 0.0 - 1.0 (step 0.1) | 0.8 |
| **Activation Radius** | Range slider | 5 - 100m (step 1) | 20 |
| **Loop** | Checkbox | Boolean | true |

---

### File Type Fields

| Field | Element | Range/Format | Default | Help |
|-------|---------|--------------|---------|------|
| **Sound URL** | URL input | Valid URL, max 512 | '' | MP3, WAV, or OGG file URL |

**Example Data:**
```json
{
    "type": "file",
    "soundUrl": "https://cdn.example.com/sounds/forest.mp3"
}
```

---

### Oscillator Type Fields

| Field | Element | Range/Format | Default | Help |
|-------|---------|--------------|---------|------|
| **Waveform** | Select | sine/square/sawtooth/triangle | sine | Waveform shape |
| **Frequency** | Number input | 20 - 20000 Hz | 440 | Pitch (A4 = 440Hz) |
| **Detune** | Number input | -1200 to +1200 cents | 0 | Fine-tuning |
| **Gain** | Range slider | 0.0 - 1.0 (step 0.01) | 0.5 | Output level |

**Example Data:**
```json
{
    "type": "oscillator",
    "waveform": "sine",
    "frequency": 440,
    "detune": 0,
    "gain": 0.5
}
```

**Web Audio API Mapping:**
```javascript
const oscillator = audioCtx.createOscillator();
oscillator.type = waveform;      // 'sine', 'square', etc.
oscillator.frequency.value = frequency;
oscillator.detune.value = detune;

const gainNode = audioCtx.createGain();
gainNode.gain.value = gain;
```

---

### Streaming Type Fields

| Field | Element | Range/Format | Default | Help |
|-------|---------|--------------|---------|------|
| **Stream URL** | URL input | Valid URL | '' | Stream endpoint |
| **Stream Type** | Select | mp3/hls/icecast/dash | mp3 | Protocol/format |
| **Buffer Time** | Range slider | 1 - 30 seconds | 5 | Pre-buffer duration |
| **Auto-Reconnect** | Checkbox | Boolean | true | Reconnect on disconnect |

**Example Data:**
```json
{
    "type": "streaming",
    "streamUrl": "https://stream.example.com/live",
    "streamType": "hls",
    "bufferTime": 5,
    "autoReconnect": true
}
```

---

## 🔄 Dynamic Rendering

### Render Function

```javascript
function renderTypeFields(type) {
    const config = TYPE_CONFIGS[type] || TYPE_CONFIGS['file'];
    
    typeSectionTitle.textContent = config.title;
    typeFieldsContainer.innerHTML = config.fields;
    
    // Call onRender callback if defined
    if (config.onRender) {
        config.onRender();
    }
    
    addDebugLog(`Rendered form for type: ${type}`);
}
```

### Type Change Handler

```javascript
slideoutType.addEventListener('change', (e) => {
    renderTypeFields(e.target.value);
});
```

---

## 💾 Data Collection

### getFormData() Function

```javascript
function getFormData() {
    const type = slideoutType.value;
    const data = {
        type: type,
        name: slideoutName.value,
        volume: parseFloat(slideoutVolume.value),
        loop: slideoutLoop.checked,
        activationRadius: parseInt(slideoutActivationRadius.value),
        sortOrder: parseInt(slideoutSortOrder.value),
        lat: slideoutLat.textContent,
        lon: slideoutLon.textContent
    };
    
    // Add type-specific fields
    if (type === 'file') {
        data.soundUrl = slideoutSoundUrl.value;
    } else if (type === 'oscillator') {
        data.waveform = slideoutWaveform.value;
        data.frequency = parseFloat(slideoutFrequency.value);
        data.detune = parseFloat(slideoutDetune.value);
        data.gain = parseFloat(slideoutGain.value);
    } else if (type === 'streaming') {
        data.streamUrl = slideoutStreamUrl.value;
        data.streamType = slideoutStreamType.value;
        data.bufferTime = parseInt(slideoutBufferTime.value);
        data.autoReconnect = slideoutAutoReconnect.checked;
    }
    
    return data;
}
```

---

## 🎨 UI Behavior

### Collapsible Advanced Section

```javascript
function toggleAdvancedSection() {
    slideoutAdvanced.classList.toggle('active');
}
```

**CSS:**
```css
.slideout-collapsible-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease;
}

.slideout-collapsible.active .slideout-collapsible-content {
    max-height: 500px;
}
```

---

## ➕ Adding New Types

### Step 1: Add Configuration

```javascript
const TYPE_CONFIGS = {
    // ... existing types ...
    
    'generator': {
        title: 'Generator Settings',
        fields: `
            <div class="slideout-field">
                <label>Algorithm</label>
                <select id="slideoutAlgorithm">
                    <option value="white">White Noise</option>
                    <option value="pink">Pink Noise</option>
                    <option value="brown">Brown Noise</option>
                </select>
            </div>
        `,
        onRender: () => {
            // Add event listeners
        }
    }
};
```

### Step 2: Update getFormData()

```javascript
function getFormData() {
    // ... existing code ...
    
    if (type === 'generator') {
        data.algorithm = slideoutAlgorithm.value;
    }
    
    return data;
}
```

### Step 3: Add to HTML Selector

```html
<select id="slideoutType">
    <option value="file">Audio File</option>
    <option value="oscillator">Oscillator</option>
    <option value="streaming">Streaming</option>
    <option value="generator">Generator</option> <!-- New -->
</select>
```

---

## ♿ Accessibility

- All inputs have associated `<label>` elements
- Range sliders have visible value displays
- Select dropdowns have descriptive options
- Keyboard navigation supported (Tab, Enter, Escape)
- Collapsible sections use ARIA attributes (future enhancement)

---

## 🧪 Testing Checklist

### Common Fields
- [ ] Name accepts text (1-255 chars)
- [ ] Volume slider updates display (0-100%)
- [ ] Radius slider updates display (5-100m)
- [ ] Loop checkbox toggles

### File Type
- [ ] URL validation
- [ ] Help text visible
- [ ] Saves correctly

### Oscillator Type
- [ ] Waveform selector works
- [ ] Frequency accepts 20-20000
- [ ] Detune accepts -1200 to 1200
- [ ] Gain slider updates display (0-100%)

### Streaming Type
- [ ] Stream URL validation
- [ ] Stream type selector works
- [ ] Buffer slider updates display (1-30s)
- [ ] Auto-reconnect checkbox toggles

### Dynamic Behavior
- [ ] Type change updates form instantly
- [ ] Type-specific fields render correctly
- [ ] onRender callbacks execute
- [ ] getFormData() returns correct structure

### Advanced Section
- [ ] Click header toggles visibility
- [ ] Smooth animation
- [ ] Sort order accepts integers ≥ 0
- [ ] Coordinates display correctly

---

## 📚 Related Files

- `map_editor_mockup.html` - Form HTML structure
- `map_editor_mockup.js` - Form logic (TYPE_CONFIGS, renderTypeFields, getFormData)
- `spatial_audio.js` - Audio source classes (SampleSource, OscillatorSource)
- `WAYPOINT_EDIT_FORM.md` - Previous version (file-only)

---

**Last Updated:** 2026-03-25  
**Next Review:** After implementing real audio source classes
