# Audio AR Project - Quick Reference

## File Structure
- `index.html` - Landing/login page
- `map_editor.html` - Creation interface
- `map_player.html` - GPS-based playback
- `soundscape_picker.html` - Soundscape selection
- `spatial_audio.js` - Core audio engine
- `map_shared.js` - Shared app logic
- `api-client.js` - Backend API communication

## Key Classes
- `SpatialAudioEngine` - Audio processing
- `MapAppShared` - Base app functionality
- `MapEditorApp` - Editor mode
- `MapPlayerApp` - Player mode
- `ApiClient` - Server communication
- `GPSUtils` - Location calculations

## API Endpoints (Current)
- `/auth/register` - User registration
- `/auth/login` - User login
- `/auth/verify` - Token verification
- `/soundscapes/*` - Soundscape operations

## Key Features
- Spatial audio with HRTF
- GPS-based positioning
- Offline support with SW
- Lazy loading
- Area-based sounds
- Simulation mode
- Multi-soundscape support

## Documentation & Maintenance
- AI-assisted documentation maintenance
- Automated verification tools
- Rapid cleanup and consolidation capabilities

## Future Enhancement: Audio Upload
- Backend: Add `/audio/*` endpoints
- Frontend: Add upload UI in editor
- Storage: User-isolated audio assets
- Privacy: User-specific access control