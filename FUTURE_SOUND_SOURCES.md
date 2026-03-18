# Future Sound Sources Specification

**Version:** 1.0  
**Date:** 2026-03-18  
**Status:** Planning Reference  
**Priority:** Phase 2+ (implement as needed)

---

## Overview

This document describes **advanced sound source types** beyond the core three (buffers, oscillators, streams) implemented in Session 13.

### Core Sound Sources (Session 13) ✅

| Type | Status | Implementation |
|------|--------|----------------|
| **Buffers (MP3/WAV)** | ✅ Session 13 | Standard lazy loading (3-zone) |
| **Oscillators** | ✅ Session 13 | Instant create/dispose |
| **Streams (HLS)** | ✅ Session 13 | Pause-only strategy (50-200m) |

---

## Phase 2 Candidates (High-Medium Priority)

### 1. Multi-Sample Instruments 🎹

**Priority:** HIGH  
**Effort:** ~100 lines  
**Best For:** Melodic soundscapes, playable waypoints, musical installations

#### What It Is

Multi-sampled instruments use **different audio files for different pitches** (like a piano or marimba). Each key has its own recording, ensuring realistic timbre across the range.

#### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Multi-Sample Instrument                                │
│                                                         │
│  C4 → piano-C4.mp3 ──┐                                 │
│  D4 → piano-D4.mp3 ──┤                                 │
│  E4 → piano-E4.mp3 ──┼──→ Router (select by note) ──→ Gain ──→ Panner │
│  F4 → piano-F4.mp3 ──┤                                 │
│  ...                │                                 │
└─────────────────────────────────────────────────────────┘
```

#### Data Structure

```javascript
{
    id: 'melodic_wp_1',
    type: 'multi-sample',
    
    // Sample mapping (note → URL)
    samples: {
        'C4': 'marimba-C4.mp3',
        'D4': 'marimba-D4.mp3',
        'E4': 'marimba-E4.mp3',
        'F4': 'marimba-F4.mp3',
        'G4': 'marimba-G4.mp3',
        'A4': 'marimba-A4.mp3',
        'B4': 'marimba-B4.mp3',
        'C5': 'marimba-C5.mp3'
    },
    
    // Velocity layers (optional - dynamic expression)
    velocityLayers: 3,  // soft/medium/hard
    samples_vel1: { /* ... */ },  // piano
    samples_vel2: { /* ... */ },  // mezzo
    samples_vel3: { /* ... */ },  // forte
    
    // Playback behavior
    loopMode: 'sustain',  // 'none' | 'sustain' | 'full'
    releaseTime: 0.5,  // seconds (fade out after trigger)
    
    // Triggering
    triggerMode: 'proximity',  // 'proximity' | 'tap' | 'sequence'
    triggerRadius: 10,  // meters (for proximity trigger)
    
    // Spatial
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 15,
    volume: 0.7
}
```

#### Lazy Loading Strategy

**Progressive Loading:**
```
User approaches multi-sample instrument:
  
  >100m: Nothing loaded
  
  50-100m: Load "home" note samples (C major pentatonic)
           Load adjacent notes (partial coverage)
  
  20-50m:  Load all samples in range
           Preload velocity layers
  
  0-20m:   All samples ready
           Instant playback on trigger
```

**Implementation:**
```javascript
async _loadMultiSample(sound) {
    // Determine which notes to preload based on distance
    const distance = this.getSoundDistance(sound.id);
    const priorityNotes = this._getPriorityNotes(distance);
    
    // Load priority notes first
    for (const note of priorityNotes) {
        const url = sound.samples[note];
        if (url) {
            await this._loadSampleBuffer(sound, note, url);
        }
    }
    
    sound.isLoaded = true;
}

_getPriorityNotes(distance) {
    // Close: load all notes
    // Medium: load scale notes
    // Far: load tonic + fifth only
    
    if (distance < 20) {
        return ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
    } else if (distance < 50) {
        return ['C4', 'E4', 'G4', 'C5'];  // C major arpeggio
    } else {
        return ['C4', 'G4'];  // Tonic + fifth
    }
}
```

#### Use Cases

| Scenario | Description |
|----------|-------------|
| **Melodic Waypoints** | Tap waypoints to play notes (like outdoor piano) |
| **Generative Music** | Sequence plays as you walk (arpeggios, melodies) |
| **Interactive Installations** | Multiple users trigger different notes |
| **Musical Landmarks** | Each location has unique instrument timbre |

#### Benefits

- ✅ Realistic instrument timbre (vs. oscillator approximation)
- ✅ Expressive playback (velocity layers)
- ✅ Familiar musical sounds
- ⚠️ More samples = more network loading

---

### 2. Procedural Generation 🎲

**Priority:** MEDIUM  
**Effort:** ~80 lines  
**Best For:** Infinite ambient, location-specific generation, zero network usage

#### What It Is

Generate audio **algorithmically** using mathematical rules, randomness, and seeds. No audio files needed - everything is synthesized in real-time.

#### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Procedural Sound Generator                             │
│                                                         │
│  Seed (lat/lon) → Random Generator → Algorithm ──┐     │
│                                                   │     │
│  Parameters (scale, tempo, density) ─────────────┼──→ Audio │
│                                                   │     │
│  Time (for evolution) ───────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

#### Data Structure

```javascript
{
    id: 'procedural_ambient_1',
    type: 'procedural',
    
    // Algorithm selection
    algorithm: 'markov-ambient',  // 'markov' | 'drone' | 'particles' | 'sequences'
    
    // Deterministic seed (same location = same sound)
    proceduralSeed: 42.1713,  // Use latitude as seed
    
    // Musical parameters
    parameters: {
        scale: 'pentatonic',  // 'major' | 'minor' | 'pentatonic' | 'chromatic'
        root: 'C',
        tempo: 60,  // BPM
        density: 0.3,  // Note density (0.1-1.0)
        instruments: ['sine', 'triangle', 'noise'],
        evolution: 0.1,  // How much it changes over time (0-1)
        maxPolyphony: 5  // Max simultaneous notes
    },
    
    // Spatial
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 30,
    volume: 0.5
}
```

#### Algorithm Examples

**Markov Chain Ambient:**
```javascript
class MarkovAmbient {
    constructor(seed, scale) {
        this.rng = seededRandom(seed);
        this.scale = scale;
        this.transitionMatrix = this._buildTransitionMatrix();
    }
    
    generate() {
        // Choose next note based on previous note + transition probabilities
        const currentNote = this.state.currentNote;
        const nextNote = this._chooseNextNote(currentNote);
        const duration = this._chooseDuration();
        const velocity = this._chooseVelocity();
        
        return { note: nextNote, duration, velocity };
    }
}
```

**Drone Generator:**
```javascript
class DroneGenerator {
    generate() {
        // Generate layered drones with slow LFO modulation
        return {
            oscillators: [
                { freq: 110, detune: 0, lfo: 0.1 },
                { freq: 165, detune: 5, lfo: 0.15 },
                { freq: 220, detune: -3, lfo: 0.05 }
            ]
        };
    }
}
```

#### Lazy Loading Strategy

**Instant Creation (like oscillators):**
```javascript
async _loadProcedural(sound) {
    // No network needed - generate algorithmically
    this.debugLog(`🎲 Creating procedural ${sound.algorithm} (seed: ${sound.proceduralSeed})...`);
    
    const generator = this._createGenerator(sound.algorithm, sound.parameters);
    const source = await this.engine.createProceduralSource(sound.id, {
        generator: generator,
        lat: sound.lat,
        lon: sound.lon,
        gain: sound.volume,
        activationRadius: sound.activationRadius
    });
    
    sound.sourceNode = source;
    sound.generator = generator;
    sound.isLoaded = true;
    sound.isPlaying = true;
    
    this.debugLog(`✅ Procedural ${sound.id} created (infinite generation)`);
}
```

#### Use Cases

| Scenario | Description |
|----------|-------------|
| **Infinite Ambient** | Never repeats, always evolving |
| **Location-Specific** | Same GPS = same seed = same soundscape (deterministic) |
| **Zero Network** | All generated locally (no files to download) |
| **Generative Music** | Different every time you visit |

#### Benefits

- ✅ Zero network usage (all local generation)
- ✅ Infinite variation (never repeats exactly)
- ✅ Location-locked (deterministic from GPS seed)
- ✅ Small data footprint (~200 bytes per sound)
- ⚠️ CPU usage (real-time generation)

---

### 3. Granular Synthesis 🔬

**Priority:** MEDIUM  
**Effort:** ~120 lines  
**Best For:** Textural drones, time-stretched ambients, evolving soundscapes

#### What It Is

Break audio into tiny **"grains"** (10-100ms snippets) and reassemble them with variations in pitch, timing, and order. Creates evolving textures from static samples.

#### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Granular Synthesizer                                   │
│                                                         │
│  Source Sample (e.g., "rain.mp3")                      │
│       ↓                                                 │
│  Grain Extractor (50ms grains, 25ms overlap)           │
│       ↓                                                 │
│  Grain Cloud (random selection, pitch shift, timing)   │
│       ↓                                                 │
│  Output: Evolving texture (never sounds the same twice)│
└─────────────────────────────────────────────────────────┘
```

#### Data Structure

```javascript
{
    id: 'granular_drone_1',
    type: 'granular',
    
    // Source material
    sourceUrl: 'ocean-waves.mp3',  // Sample to granulate
    
    // Grain parameters
    grainSize: 50,  // ms (10-100 typical)
    grainOverlap: 25,  // ms (for smooth crossfade)
    
    // Density and randomness
    density: 10,  // grains per second (1-50)
    randomization: {
        pitch: 0.3,  // ±30% pitch variation
        timing: 0.2,  // ±20% timing jitter
        position: 0.5  // Random position in source (0-1)
    },
    
    // Evolution
    evolution: {
        rate: 0.05,  // How fast parameters drift
        cycle: 60  // Seconds for full cycle
    },
    
    // Spatial
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 40,
    volume: 0.6
}
```

#### Lazy Loading Strategy

**Hybrid (preload minimal grain set):**
```javascript
async _loadGranular(sound) {
    // Load source sample
    sound.isLoading = true;
    const buffer = await this._loadAudioBuffer(sound.sourceUrl);
    
    // Extract grains (can start with minimal set)
    const grains = this._extractGrains(buffer, {
        size: sound.grainSize,
        overlap: sound.grainOverlap
    });
    
    // Create granular engine
    const source = await this.engine.createGranularSource(sound.id, {
        grains: grains,
        density: sound.density,
        randomization: sound.randomization,
        lat: sound.lat,
        lon: sound.lon,
        gain: sound.volume
    });
    
    sound.sourceNode = source;
    sound.grains = grains;
    sound.isLoaded = true;
    sound.isPlaying = true;
    sound.isLoading = false;
    
    this.debugLog(`🔬 Granular ${sound.id} loaded (${grains.length} grains)`);
}
```

#### Use Cases

| Scenario | Description |
|----------|-------------|
| **Textural Drones** | Evolving pads from short samples |
| **Time-Stretched Ambient** | 30s sample → 10 minute soundscape |
| **Sound Clouds** | Swarms of grains moving in space |
| **Morphing Textures** | Crossfade between different source samples |

#### Benefits

- ✅ Rich, evolving textures from small samples
- ✅ Never sounds exactly the same twice
- ✅ Extreme time-stretching without pitch shift
- ⚠️ CPU-intensive (many simultaneous grain players)

---

## Phase 3+ (Future Exploration)

### 4. Physical Modeling 🔔

**Priority:** LOW  
**Effort:** ~150 lines  
**Best For:** Virtual wind chimes, resonant spaces, interactive installations

#### What It Is

Simulate **real-world acoustic physics** using mathematical models (Karplus-Strong for strings, waveguide for tubes, modal synthesis for plates).

#### Data Structure

```javascript
{
    id: 'physical_chime_1',
    type: 'physical',
    
    // Model type
    model: 'karplus-strong',  // 'karplus-strong' | 'waveguide' | 'modal'
    
    // Physical parameters
    parameters: {
        frequency: 440,  // Fundamental frequency
        decay: 0.9,  // Energy loss per cycle
        stiffness: 0.5,  // String stiffness (inharmonicity)
        excitation: 'user_proximity',  // What triggers it
        excitationForce: 0.8  // How hard it's "struck"
    },
    
    // Environmental interaction
    environment: {
        windSpeed: 'gps_speed',  // Use GPS speed as "wind"
        windThreshold: 2  // m/s to start sounding
    },
    
    // Spatial
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 15,
    volume: 0.5
}
```

#### Lazy Loading Strategy

**Instant Creation (like oscillators):**
```javascript
async _loadPhysical(sound) {
    // No network - pure DSP
    this.debugLog(`🔔 Creating physical model ${sound.model}...`);
    
    const source = await this.engine.createPhysicalSource(sound.id, {
        model: sound.model,
        parameters: sound.parameters,
        lat: sound.lat,
        lon: sound.lon,
        gain: sound.volume
    });
    
    sound.sourceNode = source;
    sound.isLoaded = true;
    sound.isPlaying = true;
    
    this.debugLog(`✅ Physical model ${sound.id} created`);
}
```

#### Use Cases

- Virtual wind chimes (sway based on GPS "wind")
- Resonant tunnels/caves (ring when you clap)
- Singing bowls, bells, gongs
- Interactive string installations

---

### 5. Binaural Recordings 🎧

**Priority:** LOW  
**Effort:** ~50 lines (extends buffers + HRTF processing)  
**Best For:** Field recordings, ASMR experiences, 360° audio

#### What It Is

Pre-recorded **binaural audio** (recorded with dummy head microphones) that preserves authentic 3D spatial cues. Rotates with user's heading.

#### Data Structure

```javascript
{
    id: 'binaural_forest_1',
    type: 'binaural',
    
    // Binaural recording
    url: 'forest-binaural.mp3',
    
    // HRTF metadata
    hrtf: 'KEMAR',  // Dataset used for recording
    rotationMode: 'compass-locked',  // Rotates with device heading
    
    // Optional: enhance with real-time HRTF
    enhanceWithHRTF: true,
    
    // Spatial
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 25,
    volume: 0.7
}
```

#### Lazy Loading Strategy

**Standard 3-zone (like buffers):**
```javascript
// Same as buffer loading, but add HRTF processing
async _loadBinaural(sound) {
    const buffer = await this._loadAudioBuffer(sound.url);
    
    const source = await this.engine.createBinauralSource(sound.id, {
        buffer: buffer,
        hrtf: sound.hrtf,
        rotationMode: sound.rotationMode,
        lat: sound.lat,
        lon: sound.lon,
        gain: sound.volume
    });
    
    sound.sourceNode = source;
    sound.isLoaded = true;
    sound.isPlaying = true;
}
```

#### Use Cases

- Authentic field recordings (birds, water, wind)
- ASMR experiences (whispers, touches)
- Historical recreations (360° audio from specific location)
- Virtual choir/orchestra

---

### 6. Convolution Reverb ⛪

**Priority:** LOW  
**Effort:** ~100 lines  
**Best For:** Acoustic archaeology, space simulation, ghost sounds

#### What It Is

Use **impulse responses** (recordings of real acoustic spaces) to recreate the reverb characteristics of cathedrals, caves, tunnels, etc.

#### Data Structure

```javascript
{
    id: 'convolution_cathedral_1',
    type: 'convolution',
    
    // Impulse response (the "fingerprint" of a space)
    impulseUrl: 'cathedral-ir.wav',
    
    // Excitation source
    sourceType: 'user-triggered',  // 'user-triggered' | 'continuous' | 'ambient'
    sourceUrl: 'hand-clap.mp3',  // What excites the IR
    
    // Reverb parameters
    wetMix: 0.8,  // Reverb level
    dryMix: 0.2,  // Original sound level
    decay: 3.5,  // Seconds
    
    // Spatial
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 30,
    volume: 0.6
}
```

#### Lazy Loading Strategy

**Standard 3-zone (like buffers):**
```javascript
async _loadConvolution(sound) {
    // Load impulse response
    const irBuffer = await this._loadAudioBuffer(sound.impulseUrl);
    
    // Load excitation source (if any)
    let sourceBuffer = null;
    if (sound.sourceUrl) {
        sourceBuffer = await this._loadAudioBuffer(sound.sourceUrl);
    }
    
    const source = await this.engine.createConvolutionSource(sound.id, {
        impulse: irBuffer,
        source: sourceBuffer,
        wetMix: sound.wetMix,
        lat: sound.lat,
        lon: sound.lon,
        gain: sound.volume
    });
    
    sound.sourceNode = source;
    sound.isLoaded = true;
    sound.isPlaying = true;
}
```

#### Use Cases

- Hear what ruins sounded like originally (acoustic archaeology)
- "Ghost" sounds (impulse response excited by user clap)
- Transform any space into cathedral/cave/tunnel
- Historical audio recreations

---

### 7. Behavioral AI 🧠

**Priority:** LOW  
**Effort:** ~150 lines  
**Best For:** Virtual creatures, reactive environments, dynamic ecosystems

#### What It Is

Sounds with **AI behavior trees** that react to user proximity, other sounds, time of day, etc. Creates "living" soundscapes.

#### Data Structure

```javascript
{
    id: 'behavioral_bird_1',
    type: 'behavioral',
    
    // Sound to play
    soundUrl: 'bird-chirp.mp3',
    
    // Behavior tree
    behavior: {
        type: 'shy-observer',
        
        // States
        states: ['idle', 'alert', 'flee', 'return'],
        initialState: 'idle',
        
        // State transitions
        transitions: {
            idle: {
                'user_within_10m': 'alert',
                'time_of_day_morning': 'sing'
            },
            alert: {
                'user_within_3m': 'flee',
                'user_gone_10s': 'idle'
            },
            flee: {
                'relocated': 'return'
            },
            return: {
                'user_gone_30s': 'idle'
            }
        },
        
        // Actions per state
        actions: {
            idle: 'play_chirp, interval=5s, gain=0.5',
            alert: 'play_chirp, gain=1.5, pitch=+2semitones',
            flee: 'stop, relocate_5m_random',
            return: 'play_chirp, gain=0.3'
        }
    },
    
    // Spatial
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 15,
    volume: 0.5
}
```

#### Lazy Loading Strategy

**State-Aware (keep alive if active behavior):**
```javascript
async _loadBehavioral(sound) {
    // Load sound buffer
    const buffer = await this._loadAudioBuffer(sound.soundUrl);
    
    // Create behavior state machine
    const behavior = new BehaviorTree(sound.behavior);
    
    const source = await this.engine.createBehavioralSource(sound.id, {
        buffer: buffer,
        behavior: behavior,
        lat: sound.lat,
        lon: sound.lon,
        gain: sound.volume
    });
    
    sound.sourceNode = source;
    sound.behavior = behavior;
    sound.behaviorState = 'idle';
    sound.isLoaded = true;
    sound.isPlaying = true;
    
    // Start behavior update loop
    this._startBehaviorUpdate(sound);
}

_startBehaviorUpdate(sound) {
    setInterval(() => {
        const distance = this.getSoundDistance(sound.id);
        const userSpeed = this.getUserSpeed();
        
        // Update behavior state based on triggers
        sound.behavior.update({
            userDistance: distance,
            userSpeed: userSpeed,
            timeOfDay: this._getTimeOfDay()
        });
        
        // Execute actions for current state
        this._executeBehaviorActions(sound);
    }, 1000);
}
```

#### Use Cases

- Virtual birds (sing when you approach, flee if too close)
- Predator/prey ecosystems (sounds interact)
- Reactive environments (sounds "notice" you)
- Time-based behaviors (different sounds at dawn/dusk)

---

### 8. Spectral/FFT Playback 🌈

**Priority:** LOW  
**Effort:** ~120 lines  
**Best For:** Morphing soundscapes, harmonic resonance, extreme time-stretching

#### What It Is

Store sounds as **frequency spectra** (FFT data) and reconstruct using additive synthesis. Enables morphing between sounds and extreme time-stretching.

#### Data Structure

```javascript
{
    id: 'spectral_morph_1',
    type: 'spectral',
    
    // Spectrum data (pre-computed FFT)
    spectrumUrl: 'forest-spectrum.json',
    
    // Reconstruction parameters
    reconstruction: {
        partials: 64,  // Number of sine wave components
        morphRate: 0.1,  // How fast spectrum evolves
        scaleLock: 'C-major',  // Quantize frequencies to scale
        stretch: 10.0  // Time stretch factor
    },
    
    // Morph targets (optional)
    morphTargets: [
        { spectrum: 'bird-spectrum.json', weight: 0.5 },
        { spectrum: 'wind-spectrum.json', weight: 0.5 }
    ],
    
    // Spatial
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 35,
    volume: 0.6
}
```

#### Lazy Loading Strategy

**Progressive (low-res first, then high-res):**
```javascript
async _loadSpectral(sound) {
    // Load spectrum data (JSON, not audio)
    sound.isLoading = true;
    const spectrumData = await this._loadJSON(sound.spectrumUrl);
    
    // Start with low-resolution reconstruction (fewer partials)
    const source = await this.engine.createSpectralSource(sound.id, {
        spectrum: spectrumData,
        partials: Math.min(16, sound.reconstruction.partials),  // Start low-res
        lat: sound.lat,
        lon: sound.lon,
        gain: sound.volume
    });
    
    sound.sourceNode = source;
    sound.spectrum = spectrumData;
    sound.isLoaded = true;
    sound.isPlaying = true;
    sound.isLoading = false;
    
    // Upgrade to full resolution in background
    this._upgradeSpectralResolution(sound);
}
```

#### Use Cases

- Morph between different soundscapes (bird → wind → water)
- Harmonic resonance (sounds that match ambient key/scale)
- Extreme time-stretching (30s sample → 10 minute drone)
- Spectral freezing (capture moment, sustain indefinitely)

---

### 9. MIDI/Sequencer Patterns 🎼

**Priority:** LOW  
**Effort:** ~100 lines  
**Best For:** Generative music, location-triggered sequences, collaborative music

#### What It Is

Stored **MIDI patterns** + sound fonts (like a synthesizer or drum machine). Plays sequenced patterns when triggered.

#### Data Structure

```javascript
{
    id: 'sequencer_1',
    type: 'sequencer',
    
    // MIDI pattern
    pattern: [
        { note: 'C3', time: 0, duration: 0.5, velocity: 0.8 },
        { note: 'E3', time: 0.5, duration: 0.5, velocity: 0.6 },
        { note: 'G3', time: 1.0, duration: 1.0, velocity: 0.7 },
        { note: 'B3', time: 1.5, duration: 0.5, velocity: 0.5 }
    ],
    
    // Sound font
    soundFont: 'marimba',  // 'marimba' | 'piano' | 'strings' | 'synth'
    
    // Playback parameters
    tempo: 120,  // BPM
    loop: true,
    swing: 0.5,  // Groove amount (0.5 = straight)
    
    // Triggering
    triggerMode: 'proximity',  // Start when user enters radius
    stopMode: 'finish',  // 'finish' | 'immediate' | 'fade'
    
    // Spatial
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 20,
    volume: 0.7
}
```

#### Lazy Loading Strategy

**Instant Creation (like oscillators):**
```javascript
async _loadSequencer(sound) {
    // No network - pure MIDI + synth
    this.debugLog(`🎼 Creating sequencer ${sound.id} (${sound.tempo} BPM)...`);
    
    const source = await this.engine.createSequencerSource(sound.id, {
        pattern: sound.pattern,
        soundFont: sound.soundFont,
        tempo: sound.tempo,
        lat: sound.lat,
        lon: sound.lon,
        gain: sound.volume
    });
    
    sound.sourceNode = source;
    sound.isLoaded = true;
    sound.isPlaying = true;
    
    this.debugLog(`✅ Sequencer ${sound.id} created`);
}
```

#### Use Cases

- Generative music (sequenced patterns that loop/evolve)
- Location-triggered sequences (walk up to "play" the sequence)
- Collaborative music (multiple users trigger different tracks)
- Rhythmic installations (polyrhythmic waypoints)

---

### 10. Effects Chains 🎛️

**Priority:** LOW  
**Effort:** ~80 lines  
**Best For:** Live processing, ambient processors, interactive installations

#### What It Is

Pure **effects units** with no source sound - user provides input (microphone, system audio) or environmental mics.

#### Data Structure

```javascript
{
    id: 'effects_echo_1',
    type: 'effects-chain',
    
    // Audio input
    input: 'microphone',  // 'microphone' | 'system-audio' | 'media-stream'
    
    // Effects chain (ordered)
    chain: [
        { type: 'delay', time: 0.5, feedback: 0.7, wet: 0.5 },
        { type: 'reverb', wet: 0.6, decay: 3.0, room: 'large' },
        { type: 'filter', type: 'lowpass', freq: 2000, q: 1 },
        { type: 'pitch-shift', semitones: 0, window: 0.1 }
    ],
    
    // Modulation (optional)
    modulation: {
        lfoRate: 0.5,  // Hz
        lfoDepth: 0.3,
        modulateParam: 'filter.freq'
    },
    
    // Spatial
    spatialize: true,  // Apply spatial audio to output
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 10,
    volume: 0.8
}
```

#### Lazy Loading Strategy

**Instant Creation (like oscillators):**
```javascript
async _loadEffectsChain(sound) {
    // No network - pure DSP
    this.debugLog(`🎛️ Creating effects chain ${sound.id}...`);
    
    // Get user media (microphone)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const source = await this.engine.createEffectsChainSource(sound.id, {
        input: stream,
        chain: sound.chain,
        modulation: sound.modulation,
        lat: sound.lat,
        lon: sound.lon,
        gain: sound.volume
    });
    
    sound.sourceNode = source;
    sound.isLoaded = true;
    sound.isPlaying = true;
    
    this.debugLog(`✅ Effects chain ${sound.id} created`);
}
```

#### Use Cases

- Live processing (user's voice → delay/reverb → spatialized)
- Ambient processors (environmental mics → effects → speakers)
- Interactive installations (user movement modulates effects)
- Echo caves, reverb chambers, harmonic processors

---

## Summary Comparison Table

| Type | Network | CPU | Memory | Lazy Load Strategy | Priority | Phase |
|------|---------|-----|--------|-------------------|----------|-------|
| **Buffer (MP3)** | ✅ Yes | Low | High | Standard 3-zone | ✅ Now | Session 13 |
| **Oscillator** | ❌ No | Low | None | Instant create | ✅ Now | Session 13 |
| **Stream (HLS)** | ✅ Yes | Medium | Low | Pause-only (50-200m) | ✅ Now | Session 13 |
| **Multi-Sample** | ✅ Yes | Low | High | Progressive load | HIGH | Phase 2 |
| **Procedural** | ❌ No | Medium | None | Instant create | MEDIUM | Phase 2 |
| **Granular** | ✅ Yes | High | Medium | Hybrid (preload minimal) | MEDIUM | Phase 2 |
| **Physical** | ❌ No | Medium | None | Instant create | LOW | Phase 3 |
| **Binaural** | ✅ Yes | Medium | High | Standard 3-zone | LOW | Phase 3 |
| **Convolution** | ✅ Yes | High | High | Standard 3-zone | LOW | Phase 3 |
| **Behavioral** | ✅ Yes | Medium | Medium | State-aware | LOW | Phase 3 |
| **Spectral** | ✅ Yes | High | Medium | Progressive (low-res first) | LOW | Phase 3 |
| **Sequencer** | ❌ No | Low | Low | Instant create | LOW | Phase 3 |
| **Effects** | ❌ No | Medium | None | Instant create | LOW | Phase 3 |

---

## Implementation Roadmap

### Session 13 (Current) ✅
- [x] Buffers (MP3/WAV)
- [x] Oscillators
- [x] Streams (HLS)

### Phase 2 (Next Priority)
- [ ] Multi-sample instruments (melodic soundscapes)
- [ ] Procedural generation (infinite ambient)
- [ ] Granular synthesis (textural drones)

### Phase 3 (Future Exploration)
- [ ] Physical modeling (wind chimes, resonant spaces)
- [ ] Binaural recordings (field recordings)
- [ ] Convolution reverb (acoustic archaeology)
- [ ] Behavioral AI (virtual creatures)
- [ ] Spectral/FFT (morphing soundscapes)
- [ ] MIDI/Sequencer (generative music)
- [ ] Effects chains (live processing)

---

## Integration with Lazy Loading

See **`LAZY_LOADING_SPECIFICATION.md`** for:
- Core lazy loading architecture
- Zone detection logic
- Type-aware loading/disposal
- Data structures for all sound types

---

## References

- **Session 13:** Lazy Loading for Sound Walks (`LAZY_LOADING_SPECIFICATION.md`)
- **Session 12:** Listener Drift Compensation (EMA smoothing)
- **Session 10:** Icon Bar UI Redesign (debug modal)
- **`spatial_audio.js`:** Audio engine implementation

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-18 | Initial specification (10 future sound sources) |

---

**Status:** 📋 **Planning Reference** (not yet implemented)

**Next:** Implement Session 13 (core three types), then prioritize Phase 2 based on project needs.
