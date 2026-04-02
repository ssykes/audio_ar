# Sound Files Directory

Place your audio files here (MP3, M4A, or WAV).

## Recommended Format

**For iOS compatibility:**
- **MP3** - Best compatibility, good compression
- **M4A (AAC)** - Best for iOS, excellent quality
- **WAV** - Uncompressed, large files (use sparingly)

## Example Usage

```javascript
// In audio_ar_app.html or your app
const source = await engine.createSampleSource('fountain', {
    url: 'sounds/fountain.mp3',
    lat: 51.5074,
    lon: -0.1278,
    loop: true,
    gain: 0.5,
    activationRadius: 20
});

if (source) {
    source.start();
}
```

## Sound Configuration Template

```json
{
    "id": "fountain",
    "file": "fountain.mp3",
    "lat": 51.5074,
    "lon": -0.1278,
    "loop": true,
    "gain": 0.5,
    "activationRadius": 20,
    "name": "Fountain",
    "description": "Water fountain ambient sound"
}
```

## Tips

1. **Keep files short** - 10-30 seconds for loops
2. **Use mono for ambient** - Smaller file size
3. **Normalize volume** - Consistent levels across sounds
4. **Fade in/out** - Smooth loop points
5. **Test on iOS** - Verify playback before deploying

## Suggested Sounds

- Nature: ocean, birds, wind, rain
- Urban: traffic, fountain, cafe ambience
- Alerts: bell, chime, announcement
- Music: ambient pad, drone, melody loop
