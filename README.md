# Audio AR - Spatial Audio Mapping Application

A sophisticated web-based application that enables users to create and experience location-based audio experiences using GPS coordinates.

## Overview

Audio AR is a spatial audio mapping system that allows users to place virtual sound sources at specific GPS locations and experience them spatially as they move through the physical environment. The application combines Web Audio API, GPS positioning, and offline capabilities to create immersive location-based audio experiences.

## Key Features

- **Spatial Audio**: HRTF-based 3D positioning with distance-based attenuation
- **GPS Integration**: Real-time location tracking with drift compensation
- **Multiple Sound Sources**: Oscillators, audio files, and area-based zones
- **Offline Mode**: Service Worker caching for offline playback
- **Area Support**: Polygonal regions for zone-based audio experiences
- **Cross-Platform**: Works on iOS, Android, and Desktop browsers

## Architecture

### Core Components
- `spatial_audio.js`: Audio engine with Web Audio API implementation
- `map_shared.js`: Shared application logic and base classes
- `api-client.js`: Backend API communication layer
- `map_editor.html`: Creation interface for soundscapes
- `map_player.html`: GPS-based playback interface

### Key Classes
- `SpatialAudioEngine`: Core audio processing
- `MapAppShared`: Base application functionality
- `MapEditorApp`: Full editing capabilities
- `MapPlayerApp`: Read-only GPS experience
- `SampleSource`: Audio file playback at GPS positions
- `AreaSoundSource`: Polygon-based audio zones

## Getting Started

### Local Development
1. Clone the repository
2. Start a local server (for CORS compatibility):
   ```bash
   python -m http.server 8000
   ```
3. Access the application at http://localhost:8000

### Production Deployment
Use the provided deployment script:
```powershell
& .\deploy.ps1
```

## Private Audio Upload Feature

The application can be extended to support user-uploaded audio content:

### Backend Implementation
- Extend API with audio upload endpoints
- Implement user-specific storage with privacy controls
- Add file validation and security measures

### Frontend Integration
- Add audio upload UI in the editor
- Update waypoint configuration to support user content
- Implement offline caching for uploaded audio

## Documentation

- `CONSOLIDATED_DOCUMENTATION.md`: Comprehensive technical overview
- `QWEN.md`: Project context and memories
- `FEATURES.md`: Complete feature catalog
- Individual feature documentation in the `docs/` directory

## Technologies Used

- **Web Audio API**: Spatial audio processing
- **Leaflet**: Interactive map interface
- **Service Worker**: Offline capabilities
- **Cache API**: Audio file caching
- **Geolocation API**: GPS positioning
- **Device Orientation**: Compass integration

## Contributing

This project uses an AI-assisted documentation approach to maintain accurate and up-to-date documentation. When making changes to the codebase, ensure that relevant documentation is updated accordingly.

## License

[Specify license information here]