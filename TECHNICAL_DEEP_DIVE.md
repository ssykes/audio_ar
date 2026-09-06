# Audio AR Project - Technical Deep Dive

## Architecture Patterns

### 1. Mode Presets Pattern (map_shared.js)
The application uses a preset system to configure different behaviors for editor vs player modes:
- Editor mode: Full editing capabilities, manual sync
- Player mode: Read-only, auto-sync, GPS following
- Easily extensible to new modes

### 2. Data Mapper Pattern (api-client.js)
Converts between server (snake_case) and client (camelCase) field names:
- `_toEntity()`: snake_case → camelCase
- `_toRow()`: camelCase → snake_case
- Provides consistent field conversion across API calls

### 3. Abstract Base Class Pattern (MapAppShared)
- Enforces common interface across editor/player apps
- Shares common functionality while allowing specialization
- Uses "isEditing" guard to prevent reentrant operations

## Audio System Complexity

### 1. Coordinate System Conversion
Critical Z-axis flip for proper GPS to Web Audio mapping:
- GPS: +lat=N, +lon=E
- Web Audio: +z=back, -z=front
- Conversion: `setPosition(x, -z)` to flip Z-axis

### 2. Fade Zone Implementation
Hybrid fade zones for smooth transitions:
- Full volume zone: Within activation radius
- Fade zone: 20m transition zone
- Silent zone: Beyond activation + fade distance
- Prevents audio popping during enter/exit

### 3. GPS Drift Compensation
EMA-based smoothing with auto-lock when stationary:
- 3-sample smoothing for walking scenarios
- Auto-lock after 1.5s of stationary detection
- Unlock threshold to prevent rapid lock/unlock cycles
- Different profiles possible for various movement speeds

## Advanced Features

### 1. Lazy Loading Zones
Memory optimization with three-tier loading:
- Active zone: 0-50m (fully loaded)
- Preload zone: 50-100m (prepared for playback)
- Hysteresis zone: >100m (disposed to save memory)

### 2. Area Sound Sources
Complex polygon-based audio zones:
- Martinez intersection algorithm for overlap handling
- Distance-to-edge calculations for fade zones
- Depth-weighted crossfading for overlapping areas
- No spatial panning (volume-only control)

### 3. Device Orientation Permissions
iOS-specific requirements for compass access:
- Permission must be requested synchronously in user gesture
- Cannot await the permission promise in the gesture context
- Requires special handling for webkitCompassHeading

## Backend Architecture Implications

### 1. Scalability Considerations
- Multi-user with isolated data spaces
- Timestamp-based sync for conflict resolution
- Caching strategies for performance
- File storage for user-uploaded content

### 2. Offline Capabilities
- Service Worker for asset caching
- IndexedDB for complex data structures
- Cache API for audio files
- Fallback strategies when offline

## Documentation & Maintenance

### 1. AI-Assisted Documentation
- Automated verification against codebase
- Rapid consolidation of redundant content
- Instant accuracy checking
- Continuous monitoring capabilities

### 2. Automated Quality Assurance
- Cross-reference validation
- Consistency checking across documents
- Gap analysis for missing documentation
- Code-documentation synchronization

## Future Audio Upload Implementation

### 1. Security Requirements
- File type validation (audio formats only)
- Size limitations to prevent abuse
- Virus scanning for uploaded content
- User isolation to prevent cross-contamination

### 2. Performance Considerations
- Audio transcoding for standard formats
- CDN distribution for global access
- Progressive loading for large files
- Caching strategies for frequently accessed content

### 3. Integration Points
- Modify SampleSource to handle user URLs
- Extend API to support file upload endpoints
- Update UI to allow audio selection in editor
- Maintain offline capabilities for user content