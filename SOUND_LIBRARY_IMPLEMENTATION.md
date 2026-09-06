# Sound Library Implementation Guide

**Version:** 1.0  
**Date:** 2026-09-05  
**Status:** Skeleton Complete - Ready for Integration  

---

## 📋 Overview

This document provides everything needed to understand, integrate, and extend the Sound Library component across multiple development sessions.

---

## 🎯 What's Implemented (Session 1)

### ✅ **Core Features**
- [x] Sound library modal with Icon/List view toggle
- [x] FilePond drag-and-drop upload integration
- [x] Multi-select (Click, Ctrl+Click, Shift+Click, Ctrl+A)
- [x] Preview (double-click → OS player)
- [x] Rename (slow double-click or F2)
- [x] Delete with validation
- [x] Context menu (right-click)
- [x] Keyboard shortcuts (Delete, F2, Escape, type-to-jump)
- [x] Loading state with spinner
- [x] Empty state
- [x] Status bar (count, selection, total size)

### ✅ **P1 Fixes (Critical Issues)**
- [x] Memory leak prevention (event listener cleanup in `destroy()`)
- [x] Race condition fix (only add to `sounds[]` after successful upload)
- [x] Error handling (FilePond upload errors, API failures)

### ✅ **P2 Improvements**
- [x] Loading state during API calls
- [x] Validation before delete/rename/assign
- [x] Type-agnostic data model (`soundType` discriminator)

### ✅ **P3 Accessibility (ARIA)**
- [x] Modal: `role="dialog"`, `aria-modal`, `aria-labelledby`
- [x] Grid: `role="grid"`, `aria-rowcount`, `aria-label`
- [x] File items: `role="gridcell"`, `aria-selected`, `aria-label`
- [x] Buttons: `aria-pressed` for toggle buttons
- [x] Status bar: `aria-live="polite"`, `aria-atomic="true"`
- [x] Context menu: `role="menu"`, `role="menuitem"`
- [x] Focus management (close button on open, menu items on right-click)
- [x] Keyboard navigation support

### ❌ **Not Implemented (Future Sessions)**
- [ ] Offline caching (IndexedDB + Service Worker)
- [ ] User-specific libraries (server-side filtering)
- [ ] Multi-type creation (URL, oscillator, noise, recording)
- [ ] Drag-from-grid assignment to waypoint
- [ ] Sound usage tracking (real API, not mock)
- [ ] Pagination for large libraries (50+ sounds)
- [ ] Waveform previews
- [ ] Tags/categories

---

## 📁 File Structure

```
audio_ar/
├── sound_library.css           # Modal styles (NEW)
├── sound_library.js            # SoundLibrary class (NEW)
├── sound_library_demo.html     # Standalone demo (EXISTING - update to use new files)
├── map_editor.html             # Map editor (TO UPDATE: add Sound Library button)
├── map_editor.js               # Map editor logic (TO UPDATE: integrate SoundLibrary)
└── api-client.js               # API client (TO UPDATE: add sound endpoints)
```

---

## 🔧 Integration Checklist

### **Session 2: Integrate into map_editor.html**

**Step 1: Add CSS/JS includes to map_editor.html**
```html
<!-- In <head> section -->
<link rel="stylesheet" href="sound_library.css">
<script src="https://unpkg.com/filepond@4.30.4/dist/filepond.js"></script>
<script src="sound_library.js"></script>
```

**Step 2: Add Sound Library button to toolbar**
```html
<!-- In toolbar section -->
<button class="toolbar-btn" onclick="openSoundLibrary()">
    🔊 Sound Library
</button>
```

**Step 3: Initialize SoundLibrary in MapEditorApp**
```javascript
// In map_editor.js, MapEditorApp.init() method
this.soundLibrary = new SoundLibrary({
    apiBaseUrl: window.API_BASE_URL || '/api',
    onSoundAssign: (soundId, waypointId) => {
        this._onSoundAssigned(soundId, waypointId);
    },
    onError: (error) => {
        this._showToast('❌ Sound error: ' + error.message, 'error');
    }
});
```

**Step 4: Implement assignment handler**
```javascript
// In map_editor.js
MapEditorApp.prototype._onSoundAssigned = function(soundId, waypointId) {
    const waypoint = this.waypoints.find(wp => wp.id === waypointId);
    if (waypoint) {
        waypoint.soundId = soundId;
        this._saveWaypoint(waypoint);
        this._refreshWaypointPopup(waypointId);
        this._showToast('✅ Sound assigned', 'success');
    }
};
```

---

### **Session 3: Server API Implementation**

**Endpoint: GET /api/sounds**
```javascript
// Server-side (pseudo-code)
app.get('/api/sounds', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    
    // For now: Return all sounds (global library)
    // Future: Filter by user_id
    const sounds = await db.sounds.findAll({
        where: { user_id: userId }  // When user libraries implemented
    });
    
    res.json(sounds.map(s => ({
        id: s.id,
        name: s.name,
        soundType: s.soundType || 'file',
        source: {
            type: 'file',
            url: s.filepath,
            fileSize: s.size,
            duration: s.duration
        },
        createdAt: s.createdAt
    })));
});
```

**Endpoint: POST /api/sounds/upload**
```javascript
app.post('/api/sounds/upload', authenticateUser, async (req, res) => {
    if (!req.files || !req.files.sound) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.files.sound;
    const userId = req.user.id;
    
    // Save file to disk
    const filepath = `/sounds/${Date.now()}_${file.name}`;
    await file.mv(filepath);
    
    // Create database record
    const sound = await db.sounds.create({
        user_id: userId,
        name: file.name,
        filepath: filepath,
        size: file.size,
        type: file.type,
        duration: 0  // TODO: Calculate from audio metadata
    });
    
    res.status(201).json({
        id: sound.id,
        name: sound.name,
        soundType: 'file',
        source: {
            type: 'file',
            url: filepath,
            fileSize: sound.size,
            duration: sound.duration
        },
        createdAt: sound.createdAt
    });
});
```

**Endpoint: DELETE /api/sounds/:id**
```javascript
app.delete('/api/sounds/:id', authenticateUser, async (req, res) => {
    const soundId = req.params.id;
    
    // Check usage
    const usageCount = await db.waypoints.count({
        where: { sound_id: soundId }
    });
    
    if (usageCount > 0) {
        return res.status(400).json({
            error: `Sound is used by ${usageCount} waypoints`
        });
    }
    
    // Delete from database
    await db.sounds.destroy({ where: { id: soundId } });
    
    // Delete from disk (optional, or mark as deleted)
    // fs.unlinkSync(sound.filepath);
    
    res.status(204).send();
});
```

**Endpoint: PUT /api/sounds/:id/rename**
```javascript
app.put('/api/sounds/:id/rename', authenticateUser, async (req, res) => {
    const soundId = req.params.id;
    const { name } = req.body;
    
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name cannot be empty' });
    }
    
    await db.sounds.update(
        { name: name.trim() },
        { where: { id: soundId } }
    );
    
    const sound = await db.sounds.findByPk(soundId);
    res.json({
        id: sound.id,
        name: sound.name,
        // ... other fields
    });
});
```

**Endpoint: PUT /api/waypoints/:id/sound**
```javascript
app.put('/api/waypoints/:id/sound', authenticateUser, async (req, res) => {
    const waypointId = req.params.id;
    const { soundId } = req.body;
    
    await db.waypoints.update(
        { sound_id: soundId },
        { where: { id: waypointId } }
    );
    
    const waypoint = await db.waypoints.findByPk(waypointId);
    res.json(waypoint);
});
```

**Endpoint: GET /api/sounds/:id/usage**
```javascript
app.get('/api/sounds/:id/usage', authenticateUser, async (req, res) => {
    const soundId = req.params.id;
    
    const waypoints = await db.waypoints.findAll({
        where: { sound_id: soundId },
        attributes: ['id', 'name']
    });
    
    res.json({
        count: waypoints.length,
        waypoints: waypoints.map(wp => ({
            id: wp.id,
            name: wp.name
        }))
    });
});
```

---

## 🏗️ Architecture

### **Component Diagram**

```
┌─────────────────────────────────────────────────────────────┐
│  map_editor.html                                            │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  SoundLibrary Button                                   │ │
│  │  onclick="openSoundLibrary()"                          │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  SoundLibrary Instance                                 │ │
│  │  - sounds[]                                            │ │
│  │  - selected Set                                        │ │
│  │  - onSoundAssign callback                              │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
         │
         │ onSoundAssign(soundId, waypointId)
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  MapEditorApp                                               │
│                                                             │
│  _onSoundAssigned(soundId, waypointId) {                    │
│      waypoint.soundId = soundId;                            │
│      this._saveWaypoint(waypoint);                          │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
         │
         │ PUT /api/waypoints/:id/sound
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Server API                                                 │
│                                                             │
│  /api/sounds        (GET, POST)                             │
│  /api/sounds/:id    (DELETE, PUT/rename, GET/usage)         │
│  /api/waypoints/:id/sound (PUT)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Model

### **SoundMetadata Type**

```javascript
/**
 * @typedef {Object} SoundMetadata
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} soundType - 'file' | 'url' | 'oscillator' | 'noise' | 'recording'
 * @property {Object} source - Type-specific source
 * @property {string} source.type - Matches soundType
 * @property {string} [source.url] - File/stream URL
 * @property {number} [source.fileSize] - File size in bytes
 * @property {number} [source.duration] - Duration in seconds
 * @property {string} [source.waveform] - Oscillator: 'sine' | 'square' | 'sawtooth' | 'triangle'
 * @property {number} [source.frequency] - Oscillator: Hz
 * @property {number} [source.gain] - Amplitude 0.0-1.0
 * @property {string} [source.color] - Noise: 'white' | 'pink' | 'brown'
 * @property {number} createdAt - Unix timestamp
 * @property {number} [userId] - For user libraries (future)
 */
```

**Example (file type):**
```javascript
{
    id: 'snd_abc123',
    name: 'BoxingBell.mp3',
    soundType: 'file',
    source: {
        type: 'file',
        url: '/sounds/abc123_BoxingBell.mp3',
        fileSize: 2412345,
        duration: 15.3
    },
    createdAt: 1693742400000
}
```

---

## 🎯 Development Sessions Roadmap

### **Session 1: ✅ COMPLETE**
- [x] Extract SoundLibrary class
- [x] Create sound_library.css
- [x] Create sound_library.js
- [x] Fix P1 issues (memory leak, race condition, error handling)
- [x] Add P2 improvements (loading state, validation)
- [x] Add ARIA accessibility
- [x] Document architecture

### **Session 2: Integration**
- [ ] Add CSS/JS includes to map_editor.html
- [ ] Add Sound Library button to toolbar
- [ ] Initialize SoundLibrary in MapEditorApp
- [ ] Implement _onSoundAssigned callback
- [ ] Test: Modal opens, uploads work, selection works
- [ ] Test: Assign sound to waypoint (mock for now)

### **Session 3: Server API**
- [ ] Implement GET /api/sounds
- [ ] Implement POST /api/sounds/upload
- [ ] Implement DELETE /api/sounds/:id
- [ ] Implement PUT /api/sounds/:id/rename
- [ ] Implement PUT /api/waypoints/:id/sound
- [ ] Implement GET /api/sounds/:id/usage
- [ ] Test: Upload persists, delete works, rename works

### **Session 4: Assignment Flow**
- [ ] Implement drag-from-grid (or click-to-assign mode)
- [ ] Update waypoint popup with "Change sound" button
- [ ] Test: Assign sound, refresh popup shows new sound
- [ ] Test: Usage warning on delete

### **Session 5: Multi-Type Support**
- [ ] Add type picker to "Add Sound" flow
- [ ] Implement URL sound creation dialog
- [ ] Implement oscillator creation dialog
- [ ] Implement noise creation dialog
- [ ] Add type-specific preview (Web Audio API for synth types)
- [ ] Test: Create oscillator, assign to waypoint, plays correctly

### **Session 6: User Libraries**
- [ ] Add user_id column to sounds table
- [ ] Update server to filter by logged-in user
- [ ] Add "Shared with me" filter (optional)
- [ ] Test: User A doesn't see User B's sounds

---

## 🧪 Testing Checklist

### **Manual Testing**

**Modal & View**
- [ ] Modal opens on button click
- [ ] Modal closes on X button, Escape, overlay click
- [ ] Icon view displays grid correctly
- [ ] List view displays table correctly
- [ ] Toggle between views works

**Upload**
- [ ] Drag & drop files works
- [ ] Click to browse works
- [ ] Multi-file upload works
- [ ] Progress bar shows during upload
- [ ] Upload error shows toast notification
- [ ] Uploaded file appears in grid

**Selection**
- [ ] Click selects single file
- [ ] Ctrl+Click toggles selection
- [ ] Shift+Click selects range
- [ ] Ctrl+A selects all
- [ ] Escape deselects all
- [ ] Selected state visible (blue highlight)

**Preview**
- [ ] Fast double-click opens in new tab
- [ ] Context menu → Preview works

**Rename**
- [ ] Slow double-click starts rename
- [ ] F2 starts rename
- [ ] Context menu → Rename works
- [ ] Enter saves, Escape cancels
- [ ] Empty name rejected

**Delete**
- [ ] Delete button enabled when selection > 0
- [ ] Delete key works
- [ ] Context menu → Delete works
- [ ] Usage warning shown (mock)
- [ ] Confirmation dialog shown

**Keyboard**
- [ ] Type "b" jumps to "BoxingBell.mp3"
- [ ] Tab navigation works
- [ ] Focus visible on focused elements

**Accessibility**
- [ ] Screen reader announces modal as dialog
- [ ] Grid announced with row count
- [ ] Selected state announced
- [ ] Context menu items announced
- [ ] Status bar updates announced

---

## ⚠️ Known Issues & Limitations

| Issue | Impact | Workaround | Future Fix |
|-------|--------|------------|------------|
| **No offline support** | Requires internet | Use only when online | Session 6 (IndexedDB) |
| **Mock usage tracking** | Delete warning is random | None needed for demo | Session 3 (real API) |
| **No pagination** | Slow with 50+ sounds | None yet | Session 5 (virtual scroll) |
| **No waveform previews** | Can't see audio structure | None needed | Session 5 (waveform gen) |
| **File-only type** | Can't create URL/oscillator | None yet | Session 4 (type picker) |

---

## 🔐 Security Considerations

| Risk | Mitigation |
|------|------------|
| **XSS via filename** | `_escapeHtml()` on all renders |
| **Unauthorized uploads** | Server: `authenticateUser` middleware |
| **File size abuse** | FilePond `maxFileSize: '50MB'` + server validation |
| **Path traversal** | Server: Sanitize filename, use safe filepath |
| **CSRF on uploads** | Server: CSRF token validation |

---

## 📚 References

- **FilePond Documentation:** https://pqina.nl/filepond/
- **ARIA Authoring Practices:** https://www.w3.org/WAI/ARIA/apg/
- **Web Audio API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

---

## 🎉 Quick Start (Next Session)

**To resume development:**

1. **Open these files:**
   - `sound_library.js` (main component)
   - `sound_library.css` (styles)
   - `map_editor.html` (integration target)

2. **Next task:** Session 2 Integration
   - Add `<link>` and `<script>` tags to map_editor.html
   - Add Sound Library button
   - Initialize SoundLibrary in MapEditorApp.init()

3. **Test:** Open map_editor.html → Click "Sound Library" button → Modal should open

**Everything you need is in this document and the code files.**

---

## 🔄 Session Handoff Notes

**Last Session Completed:** Session 1 (Skeleton)
**Next Session:** Session 2 (Integration into map_editor.html)

**Files Modified in Session 1:**
- ✅ sound_library.css (created)
- ✅ sound_library.js (created)
- ✅ SOUND_LIBRARY_IMPLEMENTATION.md (created)

**Files to Modify in Session 2:**
- ⏳ map_editor.html (add includes + button)
- ⏳ map_editor.js (initialize SoundLibrary)

**Quick Start Command:**
```
1. Open map_editor.html
2. Search for "toolbar"
3. Add Sound Library button following existing pattern
4. Test: Button should open modal
```

**Map Editor Integration Notes:**

**Toolbar location:** Search for `.toolbar` or existing toolbar buttons in map_editor.html (typically in the left icon bar or top toolbar)

**Existing button pattern:**
```html
<button class="icon-btn" id="someBtn" data-tooltip="Some Action">
    <svg class="icon-svg" viewBox="0 0 24 24">
        <path d="..."/>
    </svg>
</button>
```

**Add Sound Library button:**
```html
<button class="icon-btn" id="soundLibraryBtn" data-tooltip="Sound Library">
    <svg class="icon-svg" viewBox="0 0 24 24">
        <path d="M3 9v6h6l5 5V4L9 9H3zm13.5 3c0-1.7-1-3.2-2.5-4v8c1.5-.8 2.5-2.3 2.5-4z"/>
    </svg>
</button>
```

**MapEditorApp.init():** Search for `async init()` in map_editor.js (inherits from MapAppShared)

**Initialization pattern:**
```javascript
async init() {
    await super.init();  // MapAppShared init
    
    // === Add SoundLibrary initialization ===
    this.soundLibrary = new SoundLibrary({
        apiBaseUrl: window.API_BASE_URL || '/api',
        onSoundAssign: (soundId, waypointId) => {
            this._onSoundAssigned(soundId, waypointId);
        },
        onError: (error) => {
            this._showToast('❌ Sound error: ' + error.message, 'error');
        }
    });
    
    // ... rest of init
}
```

**Add assignment handler:**
```javascript
/**
 * Handle sound assignment from SoundLibrary
 * @param {string} soundId - ID of assigned sound
 * @param {string} waypointId - ID of target waypoint
 * @private
 */
_onSoundAssigned(soundId, waypointId) {
    const waypoint = this.waypoints.find(wp => wp.id === waypointId);
    if (waypoint) {
        waypoint.soundId = soundId;
        this._saveWaypoint(waypoint);
        this._refreshWaypointPopup(waypointId);
        this._showToast('✅ Sound assigned', 'success');
    }
}
```

**Session 2 Success Criteria:**
- [ ] Sound Library button visible in toolbar
- [ ] Click opens modal
- [ ] FilePond upload zone visible
- [ ] Mock sounds loaded (6 sounds)
- [ ] Selection works (Click, Ctrl+Click, Shift+Click)
- [ ] Preview, rename, delete work
- [ ] Close modal works (X, Escape, overlay click)
