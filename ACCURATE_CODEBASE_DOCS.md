# Audio AR Project - Accurate Codebase Documentation

## Overview

This document provides accurate documentation reflecting the actual implementation in the Audio AR codebase. The codebase is the source of truth, and this documentation has been verified against the actual code.

## Core Architecture

### Class Hierarchy

```
SoundSource (Base)
├── OscillatorSource
│   └── GpsSoundSource
│       ├── MultiOscillatorSource
│       └── SampleSource
│           ├── CachedSampleSource
│           └── AreaSoundSource
```

### Key Classes & Their Relationships

1. **SoundSource** - Base class for all sound emitters
   - Location: `spatial_audio.js` line 609
   - Purpose: Base class for all sound emitters

2. **OscillatorSource** - Simple tone generator
   - Location: `spatial_audio.js` line 692
   - Extends: SoundSource
   - Purpose: Simple single oscillator tone generator

3. **GpsSoundSource** - Fixed at GPS coordinates
   - Location: `spatial_audio.js` line 860
   - Extends: OscillatorSource
   - Purpose: Sound source fixed at GPS coordinates with distance-based attenuation

4. **MultiOscillatorSource** - Multiple oscillators
   - Location: `spatial_audio.js` line 1013
   - Extends: GpsSoundSource
   - Purpose: Sound source with multiple oscillators (chords, layers)

5. **SampleSource** - Audio file playback
   - Location: `spatial_audio.js` line 1079
   - Extends: GpsSoundSource
   - Purpose: Plays audio files (MP3, WAV, M4A) at GPS positions

6. **CachedSampleSource** - SampleSource with offline support
   - Location: `spatial_audio.js` line 1304
   - Extends: SampleSource
   - Purpose: SampleSource with offline cache support

7. **AreaSoundSource** - Polygonal sound zones
   - Location: `spatial_audio.js` line 1456
   - Extends: SampleSource
   - Purpose: Sound source for polygon areas (no spatial panning)

8. **SpatialAudioEngine** - Core audio management
   - Location: `spatial_audio.js` line 1951
   - Purpose: Core audio engine with Web Audio API management

### Application Architecture

1. **MapAppShared** - Base application class
   - Location: `map_shared.js` line 60
   - Purpose: Abstract base class for map-based apps

2. **MapEditorApp** - Editor mode
   - Location: `map_editor.js` line 27
   - Extends: MapAppShared
   - Purpose: Full creation and editing capabilities

3. **MapPlayerApp** - Player mode
   - Location: `map_player.js` line 19
   - Extends: MapAppShared
   - Purpose: Read-only GPS-based audio experience

### Utility Classes

1. **SpatialAudioApp** - High-level orchestration
   - Location: `spatial_audio_app.js` line 361
   - Purpose: Main application class that orchestrates audio experience

2. **GPSUtils** - GPS utility functions
   - Location: `spatial_audio.js` line 19
   - Purpose: GPS utility functions for distance, bearing, and coordinate calculations

3. **GPSTracker** - GPS smoothing
   - Location: `spatial_audio.js` line 2285
   - Purpose: Smooths GPS coordinates and auto-locks when stationary

4. **HeadingManager** - GPS and compass fusion
   - Location: `spatial_audio.js` line 2635
   - Purpose: Combines GPS heading and device compass

5. **DeviceOrientationHelper** - Compass handling
   - Location: `spatial_audio.js` line 2523
   - Purpose: iOS webkitCompassHeading for true magnetic compass

6. **AreaManager** - Area sound management
   - Location: `spatial_audio_app.js` line 2049
   - Purpose: Manages AreaSoundSource objects

## API Endpoints

### Authentication Endpoints
- `POST /auth/register` - Create new user
- `POST /auth/login` - Authenticate user
- `GET /auth/verify` - Verify token validity

### Soundscape Endpoints
- `GET /soundscapes` - Get all soundscapes for current user
- `GET /soundscapes/:id` - Get single soundscape with waypoints and behaviors
- `POST /soundscapes` - Create new soundscape
- `PUT /soundscapes/:id` - Update soundscape metadata
- `DELETE /soundscapes/:id` - Delete soundscape
- `POST /soundscapes/:id/save` - Save waypoints, behaviors, and areas
- `GET /soundscapes/:id/modified` - Get last modified timestamp

## Service Worker Implementation

### Audio File Handling
The service worker in `sw.js` handles audio files differently than documented:
- Audio files are NOT skipped but are handled with a cache-first strategy
- Audio file extensions: mp3, wav, ogg, m4a, aac, flac
- Audio files are checked against soundscape caches first, then main cache
- Falls back to network when online, returns 404 when offline and not cached

### Map Tile Handling
- Uses `cacheFirstStrategy` with `OFFLINE_TILE_PLACEHOLDER`
- The placeholder is a detailed SVG with offline text, not just `<svg>Offline</svg>`
- Actual placeholder: `'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect fill="#e0e0e0" width="256" height="256"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="14" fill="#999">Offline</text></svg>'`

### Cache Names
- Uses `audio-ar-v1` format (where v1 is CACHE_VERSION), not timestamp format
- Soundscape caches use `soundscape-{id}` format

## Key Features Implemented

### 1. Spatial Audio Capabilities
- HRTF-based 3D positioning with distance-based attenuation
- Air absorption filtering based on distance
- Reverb zones with environment-based acoustic simulation
- GPS drift compensation with EMA smoothing

### 2. Offline Capabilities
- Service Worker with Cache API for offline assets
- Offline soundscape download with progress tracking
- CachedSampleSource for offline audio playback
- Fallback mechanisms for offline operation

### 3. Area Support
- Polygon-based audio zones with overlap handling
- Martinez intersection algorithm for overlap handling
- Distance-to-edge calculations for fade zones
- Depth-weighted crossfading for overlapping areas

### 4. Lazy Loading
- Three-zone system: Active (0-50m), Preload (50-100m), Hysteresis (>100m)
- Memory optimization reducing usage from 250MB to 15MB
- Type-aware loading strategies for different audio types

## File Structure

### Core Files
- `spatial_audio.js` - Audio engine with all sound source classes
- `spatial_audio_app.js` - High-level app orchestration
- `map_shared.js` - Shared application logic and base class
- `map_editor.js` - Editor application implementation
- `map_player.js` - Player application implementation
- `api-client.js` - Backend API communication
- `sw.js` - Service worker for offline capabilities

### Documentation Files
- `FEATURES.md` - Complete feature catalog
- `QWEN.md` - Project context and memories
- `README.md` - Project overview
- `CONSOLIDATED_DOCUMENTATION.md` - Comprehensive technical overview

## Audio Upload Feature Implementation Plan

### Backend Implementation
1. Extend API endpoints in `api-client.js`:
   - `POST /audio/upload` - Upload audio files
   - `GET /audio/:id` - Serve audio files
   - `DELETE /audio/:id` - Delete audio files
   - Update user-specific storage isolation

2. Implement file validation in backend:
   - Audio format validation (MP3, WAV, etc.)
   - File size restrictions
   - Content-type validation

### Frontend Integration
1. Modify editor interface in `map_editor.js`:
   - Add audio upload UI component
   - Update waypoint editor to allow selecting uploaded files
   - Add audio management section (list, rename, delete)

2. Update SampleSource handling:
   - Modify to handle user-specific URLs
   - Update offline caching for user content
   - Add progress indicators for uploads

3. Implement privacy controls:
   - User-specific audio asset lists
   - Access control to prevent unauthorized access
   - Option to set audio as public or private