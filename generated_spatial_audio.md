# Generated Spatial Audio for AR

## Yes! Synthesized Spatial Audio

Instead of recording sounds, you can **generate them programmatically** and position them in 3D space. This is actually **easier and more flexible** than recording.

---

## Advantages of Generated Audio

| Advantage | Explanation |
|-----------|-------------|
| **No recording needed** | Generate sounds on-the-fly |
| **Infinite variations** | Change pitch, timbre, rhythm dynamically |
| **Small file size** | Code is smaller than audio files |
| **Dynamic response** | Sounds can react to user behavior |
| **Perfect for testing** | Pure tones for calibration/testing |
| **Procedural content** | Generate unique soundscapes per location |

---

## Web Audio API: Oscillators & Sound Generation

### Basic Test Tone Generator

```javascript
// Create a simple sine wave test tone
function createTestTone(audioContext, frequency = 440) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.type = 'sine';  // sine, square, triangle, sawtooth
  oscillator.frequency.value = frequency;  // Hz (440 = A4 note)
  
  gainNode.gain.value = 0.3;  // Volume (0-1)
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.start();
  
  return { oscillator, gainNode };
}

// Usage
const audioContext = new AudioContext();
const tone = createTestTone(audioContext, 440);  // A4 tone

// Stop it
tone.oscillator.stop();
```

---

## Four Test Tones Positioned in 3D Space

```javascript
class TestToneGrid {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.tones = [];
    
    // Create 4 tones in a square pattern
    this.createTone(440, -2, 0, 'sine');      // Front-left: A4
    this.createTone(660, 2, 0, 'triangle');   // Front-right: E5
    this.createTone(523, 0, -2, 'square');    // Back-left: C5
    this.createTone(784, 0, 2, 'sawtooth');   // Back-right: G5
  }
  
  createTone(frequency, x, z, waveType) {
    const oscillator = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    const panner = this.ctx.createPanner();
    
    // Configure panner for spatial audio
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'exponential';
    panner.rolloffFactor = 1.5;
    panner.positionX.value = x;
    panner.positionY.value = 0;
    panner.positionZ.value = z;
    
    // Configure oscillator
    oscillator.type = waveType;
    oscillator.frequency.value = frequency;
    
    // Set volume
    gainNode.gain.value = 0.2;
    
    // Connect: Oscillator → Gain → Panner → Output
    oscillator.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.ctx.destination);
    
    oscillator.start();
    
    this.tones.push({
      oscillator,
      gainNode,
      panner,
      baseX: x,
      baseZ: z,
      frequency
    });
  }
  
  // Update positions based on user location
  updateListenerPosition(userX, userZ) {
    this.tones.forEach(tone => {
      // Relative position: tone position minus user position
      tone.panner.positionX.value = tone.baseX - userX;
      tone.panner.positionZ.value = tone.baseZ - userZ;
    });
  }
  
  // Mute/unmute individual tones
  setToneVolume(index, volume) {
    if (this.tones[index]) {
      this.tones[index].gainNode.gain.value = volume;
    }
  }
  
  // Stop all tones
  stopAll() {
    this.tones.forEach(tone => tone.oscillator.stop());
  }
}

// Usage
const audioContext = new AudioContext();
const toneGrid = new TestToneGrid(audioContext);

// Update as user moves
toneGrid.updateListenerPosition(0.5, -1.0);  // User moved 0.5m right, 1m back
```

---

## Visual Layout of 4-Tone Grid

```
        Z+ (North)
          │
          │  🎵 G5 (sawtooth)
          │  (0, 2)
          │
          │
🎵 C5 ────┼────────
(-2,0)    │    (2,0)  🎵 E5
square    │    triangle
          │
          │  🎵 A4 (sine)
          │  (-2, -2)
          │
          └─────────────── X+ (East)
```

**User walks through:** As you move, each tone stays fixed in its position. Walk toward the sine wave (A4) and it gets louder; walk away and it fades.

---

## Waveform Types & Their Characteristics

| Waveform | Sound | Harmonics | Best For |
|----------|-------|-----------|----------|
| **Sine** | Pure, smooth tone | Fundamental only | Clean test tones, subtle cues |
| **Triangle** | Soft, flute-like | Odd harmonics (quiet) | Pleasant markers |
| **Square** | Hollow, nasal | Odd harmonics (loud) | Retro/game feel, attention-grabbing |
| **Sawtooth** | Bright, buzzy | All harmonics | Rich, prominent sounds |

---

## Procedural Sound Effects

### Pulsing Beacon (Like a GPS Marker)

```javascript
class PulsingBeacon {
  constructor(audioContext, x, z, frequency = 880) {
    this.ctx = audioContext;
    this.panner = audioContext.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.positionX.value = x;
    this.panner.positionZ.value = z;
    
    this.oscillator = audioContext.createOscillator();
    this.oscillator.type = 'sine';
    this.oscillator.frequency.value = frequency;
    
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 0;
    
    this.oscillator.connect(this.gainNode);
    this.gainNode.connect(this.panner);
    this.panner.connect(audioContext.destination);
    
    this.oscillator.start();
    
    this.pulseSpeed = 1000;  // ms between pulses
    this.startPulsing();
  }
  
  startPulsing() {
    const pulse = () => {
      const now = this.ctx.currentTime;
      const gain = this.gainNode.gain;
      
      // ADSR envelope for pulse
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(0, now);
      gain.linearRampToValueAtTime(0.3, now + 0.1);  // Attack
      gain.linearRampToValueAtTime(0, now + 0.3);    // Decay
      
      // Speed up as user gets closer (optional)
      setTimeout(pulse, this.pulseSpeed);
    };
    
    pulse();
  }
  
  setPulseSpeed(distance) {
    // Closer = faster pulses
    this.pulseSpeed = Math.max(200, distance * 50);
  }
}
```

---

### Geiger Counter Style (Distance Feedback)

```javascript
class GeigerCounter {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.clickGain = audioContext.createGain();
    this.clickGain.connect(audioContext.destination);
    this.clickGain.gain.value = 0;
    
    this.lastClickTime = 0;
    this.minInterval = 100;  // Minimum ms between clicks
  }
  
  update(distance) {
    const now = Date.now();
    const interval = Math.max(this.minInterval, distance * 100);
    
    if (now - this.lastClickTime > interval) {
      this.playClick();
      this.lastClickTime = now;
    }
  }
  
  playClick() {
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    oscillator.frequency.value = 1200;
    oscillator.type = 'square';
    
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    
    oscillator.connect(gain);
    gain.connect(this.clickGain);
    
    oscillator.start(now);
    oscillator.stop(now + 0.05);
  }
}

// Usage
const geiger = new GeigerCounter(audioContext);

// In your position update loop
function onPositionUpdate(distance) {
  geiger.update(distance);  // Clicks faster as you get closer
}
```

---

### Shepard Tone (Illusion of Continuously Rising)

```javascript
// Creates an auditory illusion of infinitely rising pitch
// Great for "approaching" feedback

class ShepardTone {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.oscillators = [];
    this.baseFreq = 200;
    
    // Create multiple octaves
    for (let i = 0; i < 6; i++) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = this.baseFreq * Math.pow(2, i);
      
      // Each octave has different volume envelope
      gain.gain.value = this.calculateGain(i);
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      
      this.oscillators.push({ osc, gain, octave: i });
    }
    
    this.startRising();
  }
  
  calculateGain(octave) {
    // Bell curve: middle octaves louder
    const center = 2.5;
    return Math.exp(-Math.pow(octave - center, 2) / 2);
  }
  
  startRising() {
    let phase = 0;
    
    const update = () => {
      phase += 0.01;
      if (phase > 1) phase = 0;
      
      this.oscillators.forEach((o, i) => {
        // Crossfade between octaves
        const gain = this.calculateGain(i + phase);
        o.gain.gain.value = gain;
        
        // Shift frequencies
        o.oscillator.frequency.value = 
          this.baseFreq * Math.pow(2, i + phase);
      });
      
      requestAnimationFrame(update);
    };
    
    update();
  }
}
```

---

## Procedural Ambient Soundscapes

### Wind/Drone Background

```javascript
class AmbientDrone {
  constructor(audioContext) {
    this.ctx = audioContext;
    
    // Multiple detuned oscillators for rich texture
    this.droneOscillators = [
      { freq: 110, detune: -10 },
      { freq: 110, detune: 0 },
      { freq: 110, detune: 10 },
      { freq: 164.8, detune: -5 },  // E3
      { freq: 196, detune: 5 },     // G3
    ];
    
    this.nodes = [];
    
    this.droneOscillators.forEach(params => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      
      osc.type = 'sawtooth';
      osc.frequency.value = params.freq;
      osc.detune.value = params.detune;
      
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      
      gain.gain.value = 0.05;
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      
      this.nodes.push({ osc, gain, filter });
    });
  }
  
  // Modulate based on user movement
  setIntensity(speed) {
    // Moving faster = brighter sound
    const cutoff = 400 + speed * 200;
    this.nodes.forEach(n => {
      n.filter.frequency.value = Math.min(cutoff, 2000);
    });
  }
}
```

---

## Complete Example: GPS Location with Generated Sounds

```javascript
class GeneratedAudioAR {
  constructor() {
    this.ctx = null;
    this.sounds = {};
    this.userPos = { x: 0, z: 0 };
  }
  
  async start() {
    this.ctx = new AudioContext();
    
    // Create a "location" with 4 generated test tones
    this.createLocation('test-spot', 37.7749, -122.4194, {
      tone1: { freq: 440, wave: 'sine', x: -2, z: -2 },
      tone2: { freq: 660, wave: 'triangle', x: 2, z: -2 },
      tone3: { freq: 523, wave: 'square', x: -2, z: 2 },
      tone4: { freq: 784, wave: 'sawtooth', x: 2, z: 2 },
    });
    
    // Add ambient background
    this.sounds.ambient = new AmbientDrone(this.ctx);
    
    // Add geiger counter for distance feedback
    this.sounds.geiger = new GeigerCounter(this.ctx);
    
    // Start GPS tracking
    this.startTracking();
  }
  
  createLocation(name, lat, lon, tones) {
    this.sounds[name] = { lat, lon, tones: [] };
    
    Object.entries(tones).forEach(([id, params]) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const panner = this.ctx.createPanner();
      
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'exponential';
      panner.rolloffFactor = 2.0;
      panner.positionX.value = params.x;
      panner.positionZ.value = params.z;
      
      osc.type = params.wave;
      osc.frequency.value = params.freq;
      gain.gain.value = 0.15;
      
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.ctx.destination);
      osc.start();
      
      this.sounds[name].tones.push({
        id,
        oscillator: osc,
        gain: gain,
        panner: panner,
        baseX: params.x,
        baseZ: params.z,
      });
    });
  }
  
  startTracking() {
    navigator.geolocation.watchPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLon = pos.coords.longitude;
        
        // Convert GPS movement to meters
        const dx = (newLon - this.userPos.lon) * 111000 * Math.cos(this.userPos.lat);
        const dz = (newLat - this.userPos.lat) * 111000;
        
        this.userPos.x += dx;
        this.userPos.z += dz;
        this.userPos.lat = newLat;
        this.userPos.lon = newLon;
        
        this.updateSoundPositions();
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );
  }
  
  updateSoundPositions() {
    // Update test tones
    const testSpot = this.sounds['test-spot'];
    if (testSpot) {
      testSpot.tones.forEach(tone => {
        tone.panner.positionX.value = tone.baseX - this.userPos.x;
        tone.panner.positionZ.value = tone.baseZ - this.userPos.z;
      });
      
      // Update geiger counter based on distance to center
      const distance = Math.sqrt(
        Math.pow(this.userPos.x, 2) + 
        Math.pow(this.userPos.z, 2)
      );
      this.sounds.geiger.update(distance);
    }
    
    // Update ambient based on movement speed
    this.sounds.ambient.setIntensity(1);  // Could calculate from GPS
  }
}

// Usage
const ar = new GeneratedAudioAR();
document.getElementById('startBtn').addEventListener('click', () => {
  ar.start();  // Must be in user gesture handler
});
```

---

## Sound Generation for Different GPS Scenarios

| Scenario | Generated Sound | Purpose |
|----------|-----------------|---------|
| **Far from location** | Slow pulsing sine wave | "Something is out there" |
| **Approaching** | Faster pulses + geiger clicks | "Getting warmer" |
| **At location** | Full chord (4 tones) | "You found it!" |
| **Walking past** | Doppler shift effect | Realistic pass-by |
| **Multiple locations** | Different frequencies per location | Distinguish nearby sounds |

---

## Frequency Mapping for Multiple Locations

```javascript
// Assign different frequency ranges to different location types

const LOCATION_FREQUENCIES = {
  'art-installation': [440, 554, 659],    // A major chord
  'historical-marker': [261, 329, 392],   // C major chord
  'restaurant': [523, 659, 784],          // C major (higher octave)
  'hidden-secret': [349, 440, 523],       // F major chord
  'event': [293, 369, 440],               // D major chord
};

// Each location plays its unique chord
// Users learn to identify location types by sound
```

---

## Advantages Over Recording

| Feature | Generated | Recorded |
|---------|-----------|----------|
| **File size** | ~1 KB (code) | ~1-10 MB (audio) |
| **Bandwidth** | None (generated client-side) | Must download each file |
| **Variety** | Infinite variations | Fixed recordings |
| **Dynamic response** | Reacts to user in real-time | Static playback |
| **Testing** | Easy to adjust frequencies | Must re-record |
| **Personalization** | Can use user's name/data | Generic content |
| **Realism** | Synthetic, game-like | Natural, authentic |

---

## When to Use Generated vs. Recorded

| Use Generated | Use Recorded |
|---------------|--------------|
| Testing/prototyping | Final production content |
| Abstract/experimental art | Real-world soundscapes |
| Game-like experiences | Documentary/historical |
| Procedural content | Specific voices/music |
| Dynamic feedback | Ambient environmental sound |
| Low bandwidth situations | High-fidelity experiences |

---

## Bottom Line

| Question | Answer |
|----------|--------|
| **Can you generate spatial audio?** | ✅ Yes, with Web Audio API oscillators |
| **Best for testing?** | Sine/triangle waves at different frequencies |
| **Best for final experience?** | Mix: generated ambience + recorded content |
| **Does it work on iPhone?** | ✅ Yes, Safari supports Web Audio API |
| **Can your Ubuntu server host this?** | ✅ Yes, serves the JavaScript code |
| **File size?** | ~1-5 KB of code vs. MBs of audio |

**For your project:** Start with generated test tones to prototype the GPS + spatial audio system. Once it works, you can:
1. Keep generated sounds (abstract/game-like aesthetic)
2. Replace with recorded audio (more realistic)
3. Mix both (generated ambience + recorded content)

Want me to create a complete working web app that generates 4 test tones you can walk around in?
