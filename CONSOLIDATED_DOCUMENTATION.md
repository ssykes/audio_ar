# Audio AR Project - Consolidated Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Key Features](#key-features)
5. [Implementation Guide](#implementation-guide)
6. [AI-Assisted Documentation Maintenance](#ai-assisted-documentation-maintenance)

## Overview

The Audio AR project is a sophisticated spatial audio mapping application that allows users to create location-based audio experiences using GPS coordinates. The system enables users to place virtual sound sources at specific GPS locations and experience them spatially as they move through the physical environment.

### Key Capabilities
- Spatial audio with distance-based attenuation
- GPS-based positioning with drift compensation
- Multiple sound source types (oscillators, samples, areas)
- Offline mode with Service Worker caching
- Area-based audio zones with polygon boundaries
- Cross-platform compatibility (iOS, Android, Desktop)

## Architecture

### High-Level Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Applications                    │
├─────────────────────────────────────────────────────────────┤
│  MapEditorApp     MapPlayerApp     SoundscapePickerApp     │
│      │                 │                   │               │
│      └─────────────────┼───────────────────┘               │
│                        │                                   │
│              ┌─────────▼─────────┐                         │
│              │   MapAppShared   │                         │
│              │ (Base Class)     │                         │
│              └─────────┬─────────┘                         │
│                        │                                   │
│              ┌─────────▼─────────┐                         │
│              │ SpatialAudioApp   │                         │
│              └─────────┬─────────┘                         │
│                        │                                   │
│              ┌─────────▼─────────┐                         │
│              │ SpatialAudioEngine│                         │
│              └─────────┬─────────┘                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────────────────────┐
              │                Backend                        │
              │  Authentication | Soundscapes | Audio Assets │
              └───────────────────────────────────────────────┘
```

### Core Architecture Patterns

#### 1. Mode Presets Pattern
The application uses a preset system to configure different behaviors for editor vs player modes:
- **Editor mode**: Full editing capabilities, manual sync, detailed info
- **Player mode**: Read-only, auto-sync, GPS following, minimal UI
- **Extensible**: Easily add new modes by extending presets

#### 2. Data Mapper Pattern
Converts between server (snake_case) and client (camelCase) field names:
- `_toEntity()`: snake_case → camelCase
- `_toRow()`: camelCase → snake_case
- Provides consistent field conversion across API calls

#### 3. Abstract Base Class Pattern
- Enforces common interface across editor/player apps
- Shares common functionality while allowing specialization
- Uses "isEditing" guard to prevent reentrant operations

## Core Components

### 1. Audio System (`spatial_audio.js`)

#### Sound Source Hierarchy
```
SoundSource (Base)
├── OscillatorSource
│   └── GpsSoundSource
│       ├── MultiOscillatorSource
│       └── SampleSource
│           └── CachedSampleSource
└── AreaSoundSource
```

#### Key Classes
- **SpatialAudioEngine**: Core audio management with Web Audio API
- **SoundSource**: Base class for all sound emitters
- **GpsSoundSource**: Fixed at GPS coordinates with distance-based attenuation
- **SampleSource**: Plays audio files (MP3, WAV, M4A) at GPS positions
- **CachedSampleSource**: Extends SampleSource with offline cache support
- **AreaSoundSource**: For polygonal sound zones (no spatial panning)

#### Audio Features
- **HRTF Spatialization**: Realistic 3D audio positioning
- **Distance-Based Gain**: Fade zones with smooth transitions
- **Air Absorption Filtering**: High-frequency filtering based on distance
- **Reverb Zones**: Environment-based acoustic simulation
- **GPS Drift Compensation**: EMA-based smoothing with auto-lock when stationary

### 2. Mapping System (`map_shared.js`)

#### Base Class Structure
- **MapAppShared**: Abstract base class with shared functionality
- **MapEditorApp**: Full creation and editing capabilities
- **MapPlayerApp**: Read-only GPS-based audio experience

#### Key Features
- **Leaflet Integration**: Interactive maps with waypoint placement
- **Waypoint Management**: Add, edit, delete, and configure audio sources
- **Area Support**: Polygonal regions for zone-based audio
- **Simulation Mode**: Preview audio experience without GPS

### 3. Backend Services (`api-client.js`)

#### Authentication Service
- User registration and login with JWT-based authentication
- Token verification and management
- Session persistence with localStorage

#### Soundscape Management
- CRUD operations for soundscapes
- Multi-user support with data isolation
- Server-side persistence with timestamp-based sync

## Key Features

### 1. Spatial Audio Capabilities
- **3D Positioning**: HRTF-based spatialization for realistic audio placement
- **Distance Attenuation**: Fade zones with smooth enter/exit transitions
- **Air Absorption**: High-frequency filtering based on distance
- **Reverb Zones**: Environment-based acoustic simulation

### 2. GPS & Device Integration
- **Real-time Positioning**: GPS tracking with drift compensation
- **Compass Integration**: Device orientation with iOS-specific handling
- **Drift Compensation**: EMA-based smoothing with auto-lock when stationary
- **Device Detection**: Auto-routing based on device type

### 3. Offline Capabilities
- **Service Worker**: Asset caching with Cache API
- **Offline Soundscapes**: Download and playback without internet
- **IndexedDB**: Complex data structures for offline use
- **Failsafe Mode**: Graceful degradation when offline

### 4. Advanced Features
- **Lazy Loading**: Memory optimization with preload zones
- **Area Sound Sources**: Polygon-based audio zones with overlap handling
- **Simulation Mode**: Preview without requiring GPS
- **Multi-soundscape Support**: Multiple projects per user

## Implementation Guide

### Setting Up the Development Environment

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd audio_ar
   ```

2. **Start a local server** (for CORS compatibility)
   ```bash
   python -m http.server 8000
   # Access at http://localhost:8000
   ```

3. **Deploy to production** (using PowerShell on Windows)
   ```powershell
   & .\deploy.ps1
   ```

### Adding Private Audio Upload Feature

#### Backend Implementation
1. **Extend API endpoints** in the backend:
   - `POST /audio/upload` - Upload audio files
   - `GET /audio/:id` - Serve audio files
   - `DELETE /audio/:id` - Delete audio files
   - Update user-specific storage isolation

2. **Implement file validation**:
   - Audio format validation (MP3, WAV, etc.)
   - File size restrictions
   - Virus scanning for uploaded content
   - Content-type validation

3. **Update database schema**:
   - Add audio_assets table with user_id foreign key
   - Include metadata (filename, size, content-type, upload date)
   - Implement soft deletion for user privacy

#### Frontend Integration
1. **Modify the editor interface**:
   - Add audio upload UI component
   - Update waypoint editor to allow selecting uploaded files
   - Add audio management section (list, rename, delete)

2. **Update SampleSource handling**:
   - Modify to handle user-specific URLs
   - Update offline caching for user content
   - Add progress indicators for uploads

3. **Implement privacy controls**:
   - User-specific audio asset lists
   - Access control to prevent unauthorized access
   - Option to set audio as public or private

### API Endpoints for Audio Upload

#### Current API Structure
```
/auth/*
  - POST /register - Create new user
  - POST /login - Authenticate user
  - GET /verify - Verify token validity

/soundscapes/*
  - GET / - Retrieve all user's soundscapes
  - GET /:id - Get single soundscape with waypoints and behaviors
  - POST / - Create new soundscape
  - PUT /:id - Update soundscape metadata
  - DELETE /:id - Delete soundscape
  - POST /:id/save - Save waypoints, behaviors, and areas
  - GET /:id/modified - Get last modified timestamp
```

#### Actual API Endpoints Implemented
```
/auth/*
  - POST /register - Create new user
  - POST /login - Authenticate user
  - GET /verify - Verify token validity

/soundscapes/*
  - GET / - Retrieve all user's soundscapes
  - GET /:id - Get single soundscape with waypoints and behaviors
  - POST / - Create new soundscape
  - PUT /:id - Update soundscape metadata
  - DELETE /:id - Delete soundscape
  - POST /:id/save - Save waypoints, behaviors, and areas
  - GET /:id/modified - Get last modified timestamp
```

## AI-Assisted Documentation Maintenance

### Automated Verification Process
- **Class Reference Verification**: Checks that all documented classes exist in the codebase
- **API Endpoint Validation**: Verifies that documented endpoints exist and are accessible
- **Cross-Reference Analysis**: Identifies relationships between documentation files
- **Automated Reporting**: Generates detailed reports of findings

### Continuous Monitoring
- **Automated cross-referencing** against codebase
- **Accuracy checks** for technical details
- **Consistency verification** across documents
- **Gap analysis** for missing documentation
- **Redundant content identification** and consolidation

### Rapid Update Capabilities
- **Instant verification** of code changes
- **Automated documentation generation**
- **Quick consolidation** of redundant content
- **Real-time synchronization** with codebase

### Quality Assurance Pipeline
- **Accuracy validation** against current implementation
- **Completeness verification** of all major features
- **Consistency checks** across all documentation
- **Optimization** for clarity and usability