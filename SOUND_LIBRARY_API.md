# Sound Library API Endpoints

This document describes the API endpoints for the Sound Library feature implemented in Session 3.

## Overview

The Sound Library API allows users to manage their personal collection of sounds, including uploading, renaming, deleting, and assigning sounds to waypoints in their soundscapes.

## Authentication

All endpoints require authentication via a Bearer token in the Authorization header:

```
Authorization: Bearer <your-auth-token>
```

## Endpoints

### GET /api/sounds

Retrieve all sounds belonging to the authenticated user.

#### Response
```json
[
  {
    "id": "sound-id-uuid",
    "name": "My Sound File",
    "soundType": "file",
    "source": {
      "type": "file",
      "url": "/sounds/timestamp_filename.mp3",
      "fileSize": 123456,
      "duration": 15.3
    },
    "config": {},
    "createdAt": 1693742400000
  }
]
```

### POST /api/sounds/upload

Upload a new sound file to the user's library.

#### Request
Form data with file field named "sound":
```
Content-Type: multipart/form-data
```

#### Response
```json
{
  "id": "newly-created-sound-id",
  "name": "Uploaded File Name.mp3",
  "soundType": "file",
  "source": {
    "type": "file",
    "url": "/sounds/timestamp_filename.mp3",
    "fileSize": 123456
  },
  "config": {},
  "createdAt": 1693742400000
}
```

### DELETE /api/sounds/:id

Delete a sound from the user's library. The sound must not be used by any waypoints.

#### Path Parameters
- `id`: Sound ID to delete

#### Response
- Status 204: Successfully deleted
- Status 400: Sound is in use by waypoints
- Status 404: Sound not found

### PUT /api/sounds/:id/rename

Rename a sound in the user's library.

#### Path Parameters
- `id`: Sound ID to rename

#### Request Body
```json
{
  "name": "New Sound Name"
}
```

#### Response
```json
{
  "id": "sound-id-uuid",
  "name": "New Sound Name",
  "soundType": "file",
  "source": {
    "type": "file",
    "url": "/sounds/timestamp_filename.mp3",
    "fileSize": 123456
  },
  "config": {},
  "createdAt": 1693742400000
}
```

### PUT /api/waypoints/:id/sound

Assign a sound to a specific waypoint.

#### Path Parameters
- `id`: Waypoint ID to update

#### Request Body
```json
{
  "soundId": "sound-id-to-assign"
}
```

#### Response
```json
{
  "id": "waypoint-id",
  "soundscape_id": "soundscape-id",
  "name": "Waypoint Name",
  "lat": 45.5152,
  "lon": -122.6784,
  // ... other waypoint properties
  "sound_id": "sound-id-to-assign"
}
```

### GET /api/sounds/:id/usage

Get information about where a sound is being used.

#### Path Parameters
- `id`: Sound ID to check

#### Response
```json
{
  "count": 2,
  "waypoints": [
    {
      "id": "waypoint-id-1",
      "name": "First Waypoint"
    },
    {
      "id": "waypoint-id-2",
      "name": "Second Waypoint"
    }
  ]
}
```

## Error Handling

All endpoints return appropriate HTTP status codes:

- 200: Success (with response body)
- 201: Created (for uploads)
- 204: No content (for successful deletions)
- 400: Bad request (invalid input, usage conflicts)
- 401: Unauthorized (missing or invalid token)
- 404: Not found (sound or waypoint doesn't exist)
- 500: Internal server error

## File Upload Requirements

- Supported formats: MP3, WAV, OGG, M4A, FLAC, AAC, OPUS
- Maximum file size: 50MB
- Files are stored in the `/sounds/` directory with unique names