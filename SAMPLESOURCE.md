# SampleSource - Audio File Support

## What Was Added

**spatial_audio.js v4.1** now supports playing audio files (MP3, WAV, M4A) at GPS positions.

---

## New Class: SampleSource

```javascript
const source = await engine.createSampleSource('fountain', {
    url: 'sounds/fountain.mp3',    // Path to audio file
    lat: 51.5074,                   // GPS latitude
    lon: -0.1278,                   // GPS longitude
    loop: true,                     // Loop continuously
    gain: 0.5,                      // Volume (0-1)
    activationRadius: 20            // Fade radius in meters
});

if (source) {
    source.start();
}
```

---

## Supported Formats

| Format | iOS | Android | Notes |
|--------|-----|---------|-------|
| **MP3** | ✅ | ✅ | Recommended |
| **M4A (AAC)** | ✅ | ✅ | Best for iOS |
| **WAV** | ✅ | ✅ | Large files |
| **OGG** | ❌ | ✅ | Don't use for iOS |

---

## How to Use

### 1. Add Audio Files

Place files in `/sounds/` folder:
```
wifi_midi_player/
├── sounds/
│   ├── ocean.mp3
│   ├── birds.mp3
│   └── fountain.mp3
```

### 2. Update audio_ar_app.html

Set `USE_SAMPLES = true`:
```javascript
let USE_SAMPLES = true;

const SAMPLE_CONFIG = [
    { id: 'loc1', url: 'sounds/ocean.mp3', name: 'Ocean', loop: true },
    { id: 'loc2', url: 'sounds/birds.mp3', name: 'Birds', loop: true },
    { id: 'loc3', url: 'sounds/fountain.mp3', name: 'Fountain', loop: true }
];
```

### 3. Deploy

```powershell
.\deploy.ps1
```

**Important:** Upload both the HTML and the sound files:
```powershell
.\deploy.ps1
scp sounds/*.mp3 ssykes@macminiwebsever:/var/www/html/sounds/
```

---

## Features

### Automatic Loading
- Audio files load asynchronously
- Console logs show load progress
- Graceful failure if file not found

### Loop Support
- Seamless looping for ambient sounds
- Auto-restart on loop end

### Distance-Based Gain
- Fades as listener moves away
- Configurable activation radius

### GPS Positioning
- HRTF spatial positioning
- Updates as listener moves
- Compass-aware orientation

---

## Example: Sound Map Config

```json
[
    {
        "id": "fountain",
        "file": "fountain.mp3",
        "lat": 51.5074,
        "lon": -0.1278,
        "loop": true,
        "gain": 0.5,
        "radius": 20,
        "name": "Fountain"
    },
    {
        "id": "cafe",
        "file": "cafe-ambience.mp3",
        "lat": 51.5075,
        "lon": -0.1279,
        "loop": true,
        "gain": 0.4,
        "radius": 15,
        "name": "Cafe"
    }
]
```

---

## iOS Considerations

### User Gesture Required
Audio only starts after user interaction:
```javascript
// ✅ Works - triggered by button click
startBtn.addEventListener('click', async () => {
    await engine.init();
});

// ❌ Won't work - auto-play blocked
window.addEventListener('load', () => {
    engine.init();
});
```

### Background Audio
iOS limits background playback. Keep app in foreground for best results.

---

## File Size Guidelines

| Duration | MP3 Size | WAV Size | Recommendation |
|----------|----------|----------|----------------|
| 10 sec | 160 KB | 1.7 MB | ✅ Good for loops |
| 30 sec | 480 KB | 5.2 MB | ⚠️ Use sparingly |
| 60 sec | 960 KB | 10 MB | ❌ Too large |

**Tips:**
- Keep loops short (10-30 sec)
- Use mono for ambient sounds
- Normalize volume levels
- Test on iOS before deploying

---

## Next Steps: Sound Map

The foundation is ready for a visual map interface:

```javascript
// Future map.html
- Click map → drop pin
- Upload MP3 file
- Configure: loop, radius, volume
- Save config → JSON
- Load config → place sounds
```

The map will use the same `SampleSource` class!

---

## Testing

1. **Add test sound:**
   - Place `test.mp3` in `/sounds/`

2. **Enable samples:**
   - Set `USE_SAMPLES = true` in audio_ar_app.html

3. **Deploy:**
   ```powershell
   .\deploy.ps1
   scp sounds/test.mp3 ssykes@macminiwebsever:/var/www/html/sounds/
   ```

4. **Test on iPhone:**
   - Visit http://ssykes.net/audio_ar_app.html
   - Tap Start
   - Walk toward sound location

---

## Troubleshooting

### Sound Doesn't Play
- Check browser console for errors
- Verify file path is correct
- Ensure file uploaded to server
- Check iOS volume settings

### Loading Takes Forever
- File too large - compress to MP3
- Slow network - use smaller files
- Check server bandwidth

### Loop Has Click/Pop
- Edit audio to have smooth loop points
- Add fade-in/fade-out
- Use audio editor to fix loop

---

## API Reference

### createSampleSource(id, options)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| url | string | required | Path to audio file |
| lat | number | required | GPS latitude |
| lon | number | required | GPS longitude |
| loop | boolean | false | Loop continuously |
| gain | number | 0.5 | Volume (0-1) |
| activationRadius | number | 20 | Fade radius (meters) |

### Methods

```javascript
source.start()        // Start playback
source.stop()         // Stop playback
source.setLoop(true)  // Enable/disable loop
source.dispose()      // Cleanup resources
```

---

## Credits

Added in spatial_audio.js v4.1
Ready for GPS sound map development
