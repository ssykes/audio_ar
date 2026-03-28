# New Soundscape Mode Implementation

**Date:** 2026-03-28  
**Feature:** 17B - Map Editor UI Refactor  
**Status:** ✅ Complete

---

## 📋 Overview

Added support for creating new soundscapes via a `?new=true` query parameter that primes the map editor to prompt the user for soundscape creation.

---

## 🎯 User Flow

### 1. User clicks "+ New Soundscape" in soundscape_picker.html
```
soundscape_picker.html → map_editor_v2.html?new=true
```

### 2. Map Editor detects `?new=true` and shows creation dialog

```
┌─────────────────────────────────────────┐
│  🎧 Create New Soundscape               │
│                                         │
│  Enter a name for your new soundscape.  │
│  You can add waypoints and areas after  │
│  creation.                              │
│                                         │
│  Name *                                 │
│  [My Awesome Soundscape________]        │
│                                         │
│  Description (optional)                 │
│  [______________________________]       │
│  [______________________________]       │
│                                         │
│              [Cancel] [Create Soundscape]│
└─────────────────────────────────────────┘
```

### 3a. User clicks "Create Soundscape"
- Soundscape is created with the provided name and description
- Edit form is populated with the soundscape data
- Soundscape is auto-saved to server (if logged in)
- Toast notification: `✅ Created "My Awesome Soundscape"`
- URL query parameter is removed (clean URL)
- User can now add waypoints and areas

### 3b. User clicks "Cancel" or presses Escape
- Toast notification: `ℹ️ New soundscape canceled`
- Redirects back to `soundscape_picker.html` after 1 second
- No soundscape is created

---

## 🔧 Technical Implementation

### Files Modified

| File | Changes |
|------|---------|
| `soundscape_picker.html` | Added "+ New Soundscape" link next to title |
| `map_editor_v2.js` | Added new soundscape mode handling logic |

### New Methods in `MapEditorApp`

#### `_checkNewSoundscapeMode()`
Checks URL for `?new=true` query parameter.

```javascript
_checkNewSoundscapeMode() {
    const params = new URLSearchParams(window.location.search);
    const isNew = params.get('new') === 'true';
    this.debugLog(`🔍 New soundscape mode: ${isNew}`);
    return isNew;
}
```

#### `_promptNewSoundscape()`
Shows creation dialog and handles user choice.

```javascript
async _promptNewSoundscape() {
    this.debugLog('🆕 New soundscape mode activated');
    const result = await this._showCreateSoundscapeDialog();
    
    if (result && result.name) {
        this._createNewSoundscape(result.name.trim(), result.description || '');
    } else {
        this._showToast('New soundscape canceled', 'info');
        setTimeout(() => {
            window.location.href = 'soundscape_picker.html';
        }, 1000);
    }
}
```

#### `_showCreateSoundscapeDialog()`
Displays modal dialog with name/description inputs.

**Features:**
- Modal overlay with dark background
- Name input (required, auto-focused)
- Description textarea (optional)
- Create/Cancel buttons
- Enter key submits, Escape cancels
- Validation: requires non-empty name

#### `_createNewSoundscape(name, description)`
Creates the soundscape and initializes the editor.

**Actions:**
1. Creates new `SoundScape` instance
2. Updates edit form with soundscape data
3. Marks soundscape dirty for auto-save
4. Shows success toast
5. Removes `?new=true` from URL

---

## 🎨 UI/UX Details

### Dialog Styling
- Uses CSS custom properties from `map_editor_v2.html`
- Consistent with existing UI theme
- Responsive width (90% on mobile, max 400px)
- Box shadow for depth
- Dark overlay background (rgba(0, 0, 0, 0.8))

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Enter` | Create soundscape |
| `Escape` | Cancel and return to picker |

### Validation
- Name field is required
- Empty name shows alert and refocuses input
- Description is optional (defaults to empty string)

---

## 🧪 Testing

### Manual Test Cases

#### Test 1: Create new soundscape
1. Open `soundscape_picker.html`
2. Click "+ New Soundscape"
3. Enter name: "Test Soundscape"
4. Enter description: "Test description"
5. Click "Create Soundscape"
6. **Expected:** Editor loads with new soundscape, form populated, toast shown

#### Test 2: Cancel creation
1. Open `soundscape_picker.html`
2. Click "+ New Soundscape"
3. Click "Cancel"
4. **Expected:** Redirect to picker, no soundscape created

#### Test 3: Cancel with Escape key
1. Open `soundscape_picker.html`
2. Click "+ New Soundscape"
3. Press `Escape`
4. **Expected:** Redirect to picker, no soundscape created

#### Test 4: Submit with Enter key
1. Open `soundscape_picker.html`
2. Click "+ New Soundscape"
3. Enter name
4. Press `Enter`
5. **Expected:** Soundscape created

#### Test 5: Validation - empty name
1. Open `soundscape_picker.html`
2. Click "+ New Soundscape"
3. Leave name empty
4. Click "Create Soundscape"
5. **Expected:** Alert shown, focus returned to name input

#### Test 6: Normal editor load (no ?new=true)
1. Open `map_editor_v2.html` (no query params)
2. **Expected:** Editor loads existing soundscape (no dialog)

---

## 📝 Code Changes Summary

### `soundscape_picker.html`

**CSS Added:**
```css
h1 {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.new-soundscape-link {
    font-size: 0.7em;
    color: #00ff88;
    text-decoration: none;
    cursor: pointer;
    padding: 4px 10px;
    border: 1px solid rgba(0, 255, 136, 0.5);
    border-radius: 4px;
    background: rgba(0, 255, 136, 0.1);
    transition: all 0.2s;
    font-weight: 500;
}
.new-soundscape-link:hover {
    background: rgba(0, 255, 136, 0.2);
    border-color: #00ff88;
    transform: translateY(-1px);
}
```

**HTML Modified:**
```html
<h1>
    <span><span class="icon">🎧</span> Choose Soundscape</span>
    <a class="new-soundscape-link" id="newSoundscapeLink">+ New Soundscape</a>
</h1>
```

**JavaScript Added:**
```javascript
// New Soundscape link handler
document.getElementById('newSoundscapeLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'map_editor_v2.html?new=true';
});
```

### `map_editor_v2.js`

**Modified `init()` method:**
- Added `_checkNewSoundscapeMode()` call
- Conditional logic for new vs. existing soundscape

**New Methods:**
1. `_checkNewSoundscapeMode()` - Check query parameter
2. `_promptNewSoundscape()` - Handle creation flow
3. `_showCreateSoundscapeDialog()` - Show modal dialog
4. `_createNewSoundscape(name, description)` - Create soundscape

---

## 🚀 Deployment

### Update deploy.ps1
Add `map_editor_v2.js` to the list of files to deploy:

```powershell
$ALL_FILES = @(
    # ... existing files ...
    "map_editor_v2.js",
)
```

### Test on Server
1. Deploy to test server
2. Open `soundscape_picker.html`
3. Click "+ New Soundscape"
4. Verify dialog appears
5. Create test soundscape
6. Verify save to server

---

## 🔗 Related Documents

- `FEATURE_17_MAP_EDITOR_UI_REFACTOR.md` - Main feature spec
- `soundscape_picker.html` - Soundscape selection UI
- `map_editor_v2.html` - Map editor UI
- `map_editor_v2.js` - Map editor logic

---

## ✅ Acceptance Criteria

- [x] "+ New Soundscape" link visible in soundscape picker
- [x] Link navigates to `map_editor_v2.html?new=true`
- [x] Dialog prompts for name (required) and description (optional)
- [x] Create button validates name is not empty
- [x] Cancel button returns to soundscape picker
- [x] Escape key cancels
- [x] Enter key creates
- [x] Soundscape is created with correct name/description
- [x] Edit form is populated with soundscape data
- [x] Soundscape is auto-saved to server
- [x] Success toast is shown
- [x] URL query parameter is removed after creation
- [x] Cancel shows info toast and redirects
- [x] No soundscape created on cancel
- [x] Normal editor load (without `?new=true`) works unchanged

---

**Implementation Status:** ✅ Complete  
**Next Steps:** Test on mobile, deploy to server
