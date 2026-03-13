# Spatial Audio GPS System - Architecture Plan

## Overview

A web-based spatial audio system that places virtual sound sources at GPS coordinates. As the listener walks through the environment, sounds appear in their correct spatial positions relative to the listener's location and orientation.

---

## Core Concepts

### SoundSource
An independent sound emitter placed in the world.
- **GPS Position** - Latitude and longitude
- **Movement** - Can be stationary or moving along a path/vector
- **Emission** - Omnidirectional (same volume in all directions)
- **Sound Type** - One of: WAV file, MIDI sequence, generated tone, algorithmic music

### Listener
The person experiencing the audio.
- **GPS Position** - Latitude and longitude
- **Bearing/Orientation** - Which direction they're facing (from compass/GPS heading)
- **Spatial Hearing** - Left, right, front, back relative to facing direction

### SpatialAudioEngine
Manages all audio rendering and spatial calculations.
- Calculates where each sound should appear based on Listener + SoundSource relative positions
- Handles multiple concurrent sounds (polyphonic)
- Updates smoothly as either party moves (60fps audio, ~1fps GPS)

---

## Incremental Development Plan

### Phase 1: Basic Audio Engine ✅ (Current - index.html v1.11)
**Goal:** Get smooth panning working with multiple concurrent sounds

**Features:**
- Single oscillator sounds that pan around a stationary listener
- Pre-defined movement patterns (circle, N↔S, E↔W)
- Multiple sounds running independently at the same time
- Compass visualization showing where sound is

**Status:** Complete - `index.html` demonstrates smooth spatial audio with 3 concurrent sounds

---

### Phase 2: Refactor into Reusable Classes (Current Phase)
**Goal:** Extract the working audio logic into reusable, modular components

**Classes to Create:**
- `SpatialAudioEngine` - Manages audio context, listener, all sources
- `SoundSource` - Base class for any sound emitter
- `Listener` - Tracks position and orientation

**Requirements:**
- Each SoundSource has its own panner node for independent positioning
- Same `index.html` behavior, but code is modular and reusable
- Clean interface for adding new sound source types later

**Deliverable:** Refactored `index.html` + `spatial_audio.js` library

---

### Phase 3: Add Sound Source Types
**Goal:** Support different kinds of sounds

**Source Types:**
| Type | Class | Description | Example |
|------|-------|-------------|---------|
| Oscillator | `OscillatorSource` | Simple tones | 440Hz square wave panning |
| Sample | `SampleSource` | WAV/MP3 files | Forest ambience, voice |
| MIDI | `MidiSource` | Polyphonic synth | Play chords, melodies |
| Sequencer | `SequencerSource` | Algorithmic patterns | Arpeggios, rhythmic loops |

**Interface (all types):**
- `start()` - Begin playback
- `stop()` - End playback
- `setPosition(x, z)` - Update spatial position

**Deliverable:** `index.html` demo with 4 different sound types panning concurrently

---

### Phase 4: Add GPS Integration
**Goal:** Connect audio to real-world positions

**Features:**
- Listener gets GPS position from browser Geolocation API
- SoundSources placed at GPS coordinates relative to listener's starting position
- Calculate relative position: `sourceX = (sourceLon - listenerLon) * metersPerDegree`
- Update panner positions when GPS changes

**GPS Considerations:**
- GPS updates ~1Hz (once per second)
- Audio needs 60fps updates for smoothness
- Solution: Interpolate positions between GPS updates

**Deliverable:** `audio_ar_app.html` with 2-3 fixed GPS sound sources you can walk toward/away from

---

### Phase 5: Add Movement & Bearing
**Goal:** Support moving sources and listener orientation

**Features:**
- SoundSources can follow a path (array of GPS waypoints or vector + speed)
- Listener bearing from GPS heading or device compass
- Rotate the entire sound field based on which way listener faces
- Interpolate between GPS updates for smooth audio

**Deliverable:** Walking demo where:
- Sound stays fixed as you walk past it
- Sound rotates as you turn your body
- Moving sound sources sweep past you

---

### Phase 6: Map Configuration
**Goal:** Place sounds visually on a map

**Features:**
- Load a map (Leaflet, Google Maps, or simple canvas)
- Click to place SoundSources at GPS coordinates
- Configure each source: type, sound file, movement path, volume
- Export/import configurations as JSON
- Show listener position and bearing on map in real-time

**Deliverable:** Web app where you configure a soundscape on a map, then walk through it

---

## File Structure

```
wifi_midi_player/
├── index.html              # Phase 1-3: Audio panning test bench
├── audio_ar_app.html       # Phase 4-6: GPS audio AR experience
├── architecture.md         # This document
├── spatial_audio.js        # Phase 2+: Reusable engine classes
│   ├── SpatialAudioEngine  # Core audio management
│   ├── Listener            # GPS position + orientation
│   └── SoundSource         # Base class
│       ├── OscillatorSource
│       ├── SampleSource
│       ├── MidiSource
│       └── SequencerSource
└── sounds/                 # Phase 3+: Audio files
    ├── ambience.wav
    └── instruments.json    # MIDI instrument presets
```

---

## Technical Architecture

### Audio Graph

```
┌─────────────────────────────────────────────────────────────┐
│                    SpatialAudioEngine                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Listener                                             │   │
│  │  - position (lat, lon)                                │   │
│  │  - heading (degrees)                                  │   │
│  │  - AudioListener (Web Audio API)                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│                    ┌─────────▼─────────┐                     │
│                    │   masterGain      │                     │
│                    │   (0.5 gain)      │                     │
│                    └─────────┬─────────┘                     │
│                              │                               │
│         ┌────────────────────┼────────────────────┐          │
│         │                    │                    │          │
│  ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐   │
│  │ SoundSource │     │ SoundSource │     │ SoundSource │   │
│  │   (osc)     │     │  (sample)   │     │   (MIDI)    │   │
│  │             │     │             │     │             │   │
│  │ - osc       │     │ - source    │     │ - voices[]  │   │
│  │ - gain      │     │ - gain      │     │ - gain      │   │
│  │ - panner    │     │ - panner    │     │ - panner    │   │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘   │
│         │                   │                   │          │
│         └───────────────────┴───────────────────┘          │
│                              │                              │
│                    ┌─────────▼─────────┐                    │
│                    │  AudioContext     │                    │
│                    │  destination      │                    │
│                    └───────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Headphones    │
                    │   (HRTF output) │
                    └─────────────────┘
```

### Position Calculation

**World Space → Listener Space**

1. SoundSource at GPS: `(sourceLat, sourceLon)`
2. Listener at GPS: `(listenerLat, listenerLon, heading)`
3. Calculate relative position:
   ```
   dx = (sourceLon - listenerLon) * 111000 * cos(listenerLat)
   dz = (sourceLat - listenerLat) * 111000
   ```
4. Rotate by listener heading:
   ```
   x = dx * cos(heading) - dz * sin(heading)
   z = dx * sin(heading) + dz * cos(heading)
   ```
5. Set panner position: `panner.positionX.value = x`, `panner.positionZ.value = z`

### Update Loop

```
┌─────────────────────────────────────────────────────────┐
│                    Main Thread                           │
│                                                          │
│  GPS Update (~1Hz)                                       │
│  ┌────────────────────────────────────────────────────┐ │
│  │ navigator.geolocation.watchPosition((pos) => {     │ │
│  │   listener.update(pos.coords.latitude,             │ │
│  │                 pos.coords.longitude,              │ │
│  │                 pos.coords.heading)                │ │
│  │   engine.updateListenerPosition()                  │ │
│  │ })                                                 │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Audio Render (60Hz)                                     │
│  ┌────────────────────────────────────────────────────┐ │
│  │ requestAnimationFrame(() => {                      │ │
│  │   engine.interpolatePositions()  // Smooth         │ │
│  │   engine.updateCompassVisual()    // Visual        │ │
│  │ })                                                 │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                Audio Thread (Web Audio API)              │
│                                                          │
│  Scheduled Positions                                     │
│  ┌────────────────────────────────────────────────────┐ │
│  │ panner.positionX.setValueAtTime(x, scheduledTime)  │ │
│  │ panner.positionZ.setValueAtTime(z, scheduledTime)  │ │
│  │                                                    │ │
│  │ // Pre-schedule 2 seconds ahead for smoothness     │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Technical Decisions

### Why Web Audio API?
- **HRTF Spatialization** - Built-in 3D audio via `PannerNode` with `panningModel: 'HRTF'`
- **Precise Timing** - Schedule audio events with sample-accurate timing
- **Multiple Sources** - Each source has independent gain + panner nodes
- **Real-time Processing** - Audio runs on separate thread from JavaScript

### Why Pre-schedule Positions?
- GPS updates are slow (~1Hz) and can be jerky
- Audio needs smooth updates (60fps+)
- Solution: Pre-schedule 100+ positions over 2 seconds
- Web Audio API executes scheduled events with perfect timing

### Why HRTF?
- **Head-Related Transfer Function** simulates how sound arrives at your ears
- Creates realistic 3D positioning through headphones
- Far superior to simple stereo panning
- Built into Chrome, Safari, Firefox

---

## Platform Limitations

### iOS Safari
| Feature | Status | Notes |
|---------|--------|-------|
| Audio Context | ✅ | Must start from user gesture |
| HRTF Panning | ✅ | Supported |
| Geolocation | ✅ | Works |
| GPS Heading | ⚠️ | Only when moving |
| Background Audio | ⚠️ | Limited when screen sleeps |
| Compass | ⚠️ | Requires deviceorientation permission |

### Android Chrome
| Feature | Status | Notes |
|---------|--------|-------|
| Audio Context | ✅ | Must start from user gesture |
| HRTF Panning | ✅ | Supported |
| Geolocation | ✅ | Works |
| GPS Heading | ✅ | Available via `coords.heading` |
| Background Audio | ✅ | Better than iOS |

### GPS Accuracy
- **Outdoors, clear sky:** ~5-10 meters
- **Urban canyon (buildings):** ~10-30 meters
- **Indoors:** ~50+ meters (often unusable)

---

## Future Considerations

### If JavaScript Hits Limitations
1. **React Native + react-native-audio** - Native audio modules
2. **Flutter + audioplayers** - Cross-platform with native backend
3. **Native iOS/Android** - Best performance, most work

### If Scaling Up
1. **Occlusion** - Buildings blocking sound (raycasting)
2. **Reverb zones** - Indoor vs outdoor acoustics
3. **Distance attenuation** - Custom curves per source type
4. **Priority system** - Limit active sources for performance

---

## Known Issues & Fixes

### v5.1 (2026-03-12) - Z-Axis Coordinate Fix

**Bug:** Sounds appeared 180° flipped from their GPS position (North sounded like South)

**Root Cause:** GPS coordinate system (+Z=North) was not converted to Web Audio coordinate system (+Z=Behind). The Z-axis needs to be flipped when converting GPS positions to Web Audio panner positions.

**Fix:** Flip Z-axis when converting GPS to Web Audio positions:
```javascript
// In GpsSoundSource.updatePosition()
const { x, z } = GPSUtils.toMeters(this.gpsLat, this.gpsLon, listenerLat, listenerLon);
this.setPosition(x, -z);  // ← Flip Z: North (+Z GPS) → Front (-Z Web Audio)
```

**Files Changed:**
- `spatial_audio.js` v5.1 - Added Z-axis flip in `GpsSoundSource.updatePosition()`
- `spatial_audio_app.js` - Updated debug logging to verify fix

**Testing:** Walk in an arc around a sound waypoint. Sound should stay fixed at GPS position and sweep correctly as you turn.

---

### Debug Logging (v2.5+)

Map Placer includes auto-capture debug logging for field testing:
- Captures `[Audio]`, `[GPS]`, `[Compass]`, `[MapPlacer]` messages
- Auto-copies to clipboard after 3 seconds of stillness (hands-free operation)
- 1000-line buffer captures ~50-100 seconds of testing
- To disable: set `this.autoCopyLogs = false` in `MapPlacerApp` constructor

---

## Success Criteria

### Phase 2 ✅
- [x] Code is modular and reusable
- [x] Same functionality as v1.11
- [x] Easy to add new sound source types

**Deliverables:**
- `spatial_audio.js` v5.0 - Reusable classes (`SpatialAudioEngine`, `SoundSource`, `OscillatorSource`, `GpsSoundSource`, `SampleSource`, `MultiOscillatorSource`)
- `spatial_audio_app.js` - High-level app orchestration (`SpatialAudioApp`, `Listener`, `Sound`)
- Helper classes: `GPSUtils`, `GPSTracker`, `HeadingManager`, `DeviceOrientationHelper`

### Phase 3
- [ ] 4 sound types working concurrently
- [ ] Each type can be positioned independently
- [ ] Clean API for creating/configuring sources

### Phase 4 ✅
- [x] GPS positions audio correctly
- [x] Can walk toward a sound and hear it get louder/closer
- [x] Works on both iOS and Android

**Deliverables:**
- `single_sound_v2.html` - Single GPS sound source test
- `spatial_audio_app.js` - GPS tracking with auto-lock when stationary

### Phase 5 ✅
- [x] Sound stays fixed as you walk past
- [x] Sound rotates as you turn
- [x] Moving sources sweep smoothly

**Deliverables:**
- `auto_rotate.html` - Rotating sound field with compass integration
- `HeadingManager` - Hybrid GPS + compass heading fusion
- `GPSTracker` - Auto-lock when stationary, smooth when moving

**GPS Tuning (Current - Walking Optimized):**
- `historySize: 3` (~1.5s smoothing)
- `minMovement: 0.3m` (30cm threshold)
- `stationaryTime: 1500ms` (locks in 1.5s)
- `unlockThreshold: 2x` (0.6m to unlock)

**TODO: Future Enhancement - Dynamic Profiles**
- Support cycling (6-15 m/s) and driving (15-35 m/s)
- Auto-detect speed from GPS and switch profiles
- Profiles: standing, walking, running, cycling, driving

### Phase 6 ✅ (Partial - Editor Complete, Player Mode Complete)
- [x] Visual map interface
- [x] Click to place sounds
- [x] Save/load configurations (Export implemented, Import TODO)
- [x] Player mode - hear placed sounds at GPS positions

**Deliverables:**
- `map_placer.html` v2.0 - Visual waypoint editor with Player Mode
- `map_placer.js` - Map-based sound placement with audio playback

**TODO:**
- [ ] JSON import (load configs)
- [ ] Per-waypoint sound editing UI
- [ ] Sound preview in editor mode

---

## Getting Started

```bash
# Current state - All phases implemented!

# Phase 1-2: Audio panning test bench
index.html          # v3.66 - Multiple concurrent sounds with smooth panning
spatial_audio.js    # v5.0 - Reusable engine classes

# Phase 3-5: GPS audio AR experience
single_sound_v2.html    # v2.71 - Single GPS sound with full player mode
auto_rotate.html        # v3.0 - Multiple sounds with compass rotation

# Phase 6: Map-based waypoint editor + player
map_placer.html         # v2.0 - Visual map editor with Player Mode
map_placer.js           # v2.0 - Player mode implementation

# Future: Multi-sound GPS experience
audio_ar_app.html   # v10.17 - Multi-source GPS audio (backup - needs update)
```

---

## Notes

- **HRTF** = Head-Related Transfer Function (3D audio simulation)
- **PannerNode** = Web Audio API node for spatial positioning
- **AudioContext** = Web Audio API context (must be created after user gesture)
- **requestAnimationFrame** = Browser API for smooth 60fps animation
- **Geolocation API** = Browser API for GPS position
