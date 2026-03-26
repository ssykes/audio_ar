# Feature 17: Map Editor UI Refactor

**Status:** 📋 Planned  
**Priority:** High  
**Estimated Effort:** ~20-25 hours (5 sessions × 4-5h each)  
**Date Created:** 2026-03-25  

---

## 📋 Overview

Replace the existing `map_editor.html` UI with a modern, streamlined interface while preserving all existing functionality. The new UI improves usability, reduces clutter, and follows modern design patterns.

---

## 🎯 Goals

### Primary
1. **Modern UI/UX** - Clean, professional interface with consistent styling
2. **Feature Parity** - All existing `map_editor.html` features must work
3. **Better Organization** - Logical grouping of related functions
4. **Responsive Design** - Works on desktop and tablet
5. **Maintainability** - Clean separation of concerns (HTML/CSS/JS)

### Secondary
1. **Improved Workflow** - Fewer clicks for common actions
2. **Visual Feedback** - Clear status indicators, loading states
3. **Accessibility** - Keyboard navigation, screen reader support
4. **Performance** - Optimized rendering for large soundscapes (100+ waypoints)

---

## 📊 Current State Analysis

### Existing `map_editor.html` Features

| Feature | Status | Notes |
|---------|--------|-------|
| Soundscape management | ✅ | Create, edit, delete, sync |
| Waypoint drawing | ✅ | Leaflet.draw markers |
| Area drawing | ✅ | Leaflet.draw polygons |
| Waypoint editing | ✅ | Drag markers, edit popup |
| Area editing | ✅ | Drag vertices, edit popup |
| Audio playback | ✅ | Via `spatial_audio_app.js` |
| Simulation mode | ✅ | Avatar dragging, stats panel |
| GPS status | ✅ | Status bar indicator |
| Compass heading | ✅ | Status bar indicator |
| Debug console | ✅ | Color-coded logs, copy |
| Import/Export | ✅ | JSON backup files |
| Server sync | ✅ | Via `api-client.js` |
| Offline mode | ✅ | Service Worker compatible |
| Multi-user support | ✅ | Auth via `index.html` |

### Existing `map_editor_mockup.html` Features

| Feature | Status | Notes |
|---------|--------|-------|
| Modern sidebar layout | ✅ | 280px width, flexbox |
| Soundscape selector | ✅ | Dropdown + new button |
| Edit form | ✅ | Always visible |
| Area/Waypoint lists | ✅ | VSCode-style explorer |
| Slideout edit panel | ✅ | Overlays map |
| Debug modal | ✅ | Popup with copy/clear |
| Toolbar icons | ✅ | Simulate, Sync, Import, Export |
| Bottom action bar | ✅ | Sync, Debug, Clear, Logout |
| CSS custom properties | ✅ | Theming support |
| External JS file | ✅ | `map_editor_mockup.js` |

### Missing from Mockup

| Feature | Priority | Effort |
|---------|----------|--------|
| Leaflet map integration | 🔴 Critical | 4h |
| Start/Stop audio button | 🔴 Critical | 2h |
| GPS/Heading status bar | 🟠 High | 2h |
| Simulation stats panel | 🟠 High | 2h |
| Drawing mode indicator | 🟠 High | 1h |
| Waypoint/Area counts | 🟡 Medium | 1h |
| Delete soundscape button | 🟡 Medium | 1h |
| Edit soundscape button | 🟡 Medium | 1h |
| User panel/logout | 🟡 Medium | 1h |
| Keyboard shortcuts | 🟢 Low | 2h |

---

## 🏗️ Architecture

### File Structure

```
audio_ar/
├── map_editor.html              # ← Old (keep during transition)
├── map_editor.js                # ← Old (merge into new)
├── map_editor_mockup.html       # ← Becomes new map_editor.html
├── map_editor_mockup.js         # ← Becomes new map_editor.js
├── map_editor_ui_refactor.js    # ← New: UI-specific logic
└── FEATURE_17_MAP_EDITOR_UI_REFACTOR.md  # ← This spec
```

### Dependencies

**External Libraries:**
- Leaflet 1.9.4 (map rendering)
- Leaflet.draw 1.0.4 (drawing tools)

**Internal Modules:**
- `api-client.js` (server communication)
- `soundscape.js` (data model)
- `spatial_audio.js` (audio engine)
- `spatial_audio_app.js` (audio app logic)
- `map_shared.js` (shared map functionality)
- `map_editor.js` (editor-specific logic)

### Component Hierarchy

```
MapEditorApp (extends MapAppShared)
├── UI Components
│   ├── Sidebar
│   │   ├── Header (back, logout)
│   │   ├── Soundscape Selector
│   │   ├── Edit Form
│   │   ├── Explorer (Areas, Waypoints)
│   │   └── Footer (Sync, Debug, Clear)
│   ├── Map Canvas (Leaflet)
│   ├── Slideout Panel (item editing)
│   ├── Debug Modal
│   └── Status Bar
├── Audio Engine
│   └── spatial_audio_app.js
└── Data Layer
    └── api-client.js
```

---

## 📅 Implementation Sessions

### Session 1: Infrastructure Setup (~4h)

**Goal:** Get mockup loading real dependencies and data

**Tasks:**
- [ ] Add Leaflet CSS/JS to `map_editor_mockup.html`
- [ ] Add internal script references (`api-client.js`, etc.)
- [ ] Remove mock data from `map_editor_mockup.js`
- [ ] Initialize real `MapEditorApp` class
- [ ] Wire up soundscape selector to real data
- [ ] Test: Load soundscapes from server
- [ ] Test: Switch between soundscapes

**Acceptance Criteria:**
- ✅ Mockup loads without errors
- ✅ Soundscape dropdown shows real data from server
- ✅ Selecting soundscape updates UI
- ✅ Console shows no errors

**Files Modified:**
- `map_editor_mockup.html` (add script tags)
- `map_editor_mockup.js` (remove mock data, init real app)

---

### Session 2: Map Integration (~5h)

**Goal:** Get Leaflet map working with drawing tools

**Tasks:**
- [ ] Replace map placeholder with `<div id="map">`
- [ ] Initialize Leaflet map in `map_editor_mockup.js`
- [ ] Integrate `MapEditorApp` map logic
- [ ] Add Leaflet.draw toolbar
- [ ] Test: Draw waypoint markers
- [ ] Test: Draw area polygons
- [ ] Test: Edit waypoints (drag markers)
- [ ] Test: Edit areas (drag vertices)
- [ ] Test: Delete waypoints/areas

**Acceptance Criteria:**
- ✅ Map renders correctly
- ✅ Drawing tools work (waypoints + areas)
- ✅ Editing works (drag markers/vertices)
- ✅ Deletion works
- ✅ Drawn items persist on save

**Files Modified:**
- `map_editor_mockup.html` (map container)
- `map_editor_mockup.js` (map initialization)
- `map_editor_ui_refactor.js` (new: drawing logic)

---

### Session 3: UI Component Mapping (~5h)

**Goal:** Add missing UI elements from old editor

**Tasks:**
- [ ] Add Start/Stop audio button
- [ ] Add GPS/Heading status bar (bottom of sidebar)
- [ ] Add Simulation stats panel (slideout tab?)
- [ ] Add Drawing mode indicator
- [ ] Add Delete soundscape button
- [ ] Add Edit soundscape button (or integrate into form)
- [ ] Add User panel (email, logout)
- [ ] Add Waypoint/Area counts to explorer headers
- [ ] Update Debug modal to match old console (color coding)

**Acceptance Criteria:**
- ✅ All old UI elements have new equivalents
- ✅ Status bar updates with GPS/heading
- ✅ Start button controls audio engine
- ✅ Simulation stats visible when active
- ✅ Drawing mode clearly indicated

**Files Modified:**
- `map_editor_mockup.html` (add UI elements)
- `map_editor_mockup.css` (new styles)
- `map_editor_ui_refactor.js` (UI logic)

---

### Session 4: Feature Parity (~6h)

**Goal:** Ensure all features work identically to old editor

**Tasks:**
- [ ] Soundscape CRUD operations
- [ ] Waypoint CRUD operations
- [ ] Area CRUD operations
- [ ] Audio playback (Start/Stop)
- [ ] Simulation mode (avatar, stats)
- [ ] Import/Export JSON
- [ ] Server sync
- [ ] Debug logging (color-coded)
- [ ] Offline mode compatibility
- [ ] Multi-user auth integration

**Acceptance Criteria:**
- ✅ All features from old editor work in new UI
- ✅ No regression in functionality
- ✅ Side-by-side testing passes
- ✅ User acceptance testing passes

**Files Modified:**
- `map_editor_mockup.js` (feature implementations)
- `map_editor_ui_refactor.js` (integration logic)

---

### Session 5: Polish & Deployment (~5h)

**Goal:** Final testing, optimization, and deployment

**Tasks:**
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Mobile/tablet testing (responsive design)
- [ ] Performance testing (100+ waypoints)
- [ ] Accessibility audit (keyboard nav, screen readers)
- [ ] Add keyboard shortcuts (Ctrl+S, Delete, Escape)
- [ ] Add loading states/spinners
- [ ] Add toast notifications
- [ ] Deploy as `map_editor_v2.html` alongside existing
- [ ] User acceptance testing period (1 week)
- [ ] Full replacement (rename files)

**Acceptance Criteria:**
- ✅ Works on all major browsers
- ✅ Works on tablets (iPad, Surface)
- ✅ Handles 100+ waypoints without lag
- ✅ Keyboard navigation works
- ✅ Deployed to test server
- ✅ Users approve new UI
- ✅ Old `map_editor.html` archived

**Files Modified:**
- `map_editor_mockup.html` (final polish)
- `map_editor_mockup.js` (optimizations)
- Deploy script (add new files)

---

## 🎨 UI/UX Specifications

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Sidebar (280px)          │  Map Canvas (flex)              │
├──────────────────────────┤                                  │
│ 🚪 Logout  ← Back        │                                  │
│ Soundscape               │                                  │
│ [Dropdown▼][➕]           │                                  │
├──────────────────────────┤                                  │
│ Forest Ambience          │                                  │
│ 📍 12 wp  🗺️ 3 areas     │                                  │
├──────────────────────────┤                                  │
│ Name: [__________]       │                                  │
│ Desc: [__________]       │                                  │
│ ☑ Public [🎮][📥][📤]    │                                  │
├──────────────────────────┤                                  │
│ Areas               [3]  │                                  │
│ ◈ Forest Zone            │                                  │
│ ◈ Clearing               │                                  │
│                          │                                  │
│ Waypoints           [12] │                                  │
│ 🎵 Bird Song 1           │                                  │
│ 🎵 Bird Song 2           │                                  │
│ ... (scrolls)            │                                  │
├──────────────────────────┤                                  │
│ 📋 Debug  🔄 Sync  🗑️   │                                  │
└──────────────────────────┘                                  │
                                                              │
                                                              │
                                                              │
                                                              │
                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Color Scheme

```css
:root {
  /* Backgrounds */
  --bg-body: #1a1a2e;       /* Dark blue-black */
  --bg-sidebar: #16213e;    /* Dark blue */
  --bg-panel: #0f3460;      /* Medium blue */
  
  /* Borders */
  --border-sidebar: #0f3460;
  --border-input: #1a5f7a;
  
  /* Accents */
  --accent-primary: #00d9ff;   /* Cyan */
  --accent-success: #00ff88;   /* Green */
  --accent-danger: #e94560;    /* Red */
  
  /* Text */
  --text-primary: #eee;
  --text-muted: #888;
}
```

### Typography

- **Font:** -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
- **Base size:** 14px
- **Headers:** 16-18px, 600 weight
- **Meta text:** 11-12px, muted color

---

## ✅ Acceptance Criteria (Overall)

### Functional
- [ ] All existing features work identically
- [ ] No data loss during migration
- [ ] Backward compatible with existing soundscapes
- [ ] Offline mode works
- [ ] Multi-user support works

### Visual
- [ ] Consistent styling throughout
- [ ] Responsive on tablets (768px+)
- [ ] No layout shifts or jank
- [ ] Smooth animations (60fps)

### Performance
- [ ] Initial load < 2 seconds
- [ ] Map renders < 1 second
- [ ] 100+ waypoints without lag
- [ ] No memory leaks

### Accessibility
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Color contrast meets WCAG AA
- [ ] Focus indicators visible

---

## 📝 Testing Checklist

### Manual Testing
- [ ] Create new soundscape
- [ ] Edit soundscape name/description
- [ ] Delete soundscape
- [ ] Draw 10+ waypoints
- [ ] Draw 3+ areas
- [ ] Edit waypoint positions
- [ ] Edit area vertices
- [ ] Start audio playback
- [ ] Enter simulation mode
- [ ] Import JSON file
- [ ] Export JSON file
- [ ] Sync from server
- [ ] Clear all data
- [ ] Logout

### Automated Testing
- [ ] Unit tests for UI components
- [ ] Integration tests for CRUD operations
- [ ] E2E test for full workflow

### Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## 🚀 Deployment Plan

### Phase 1: Development
- Work in `map_editor_mockup.html`
- Test locally with `python -m http.server 8000`

### Phase 2: Staging
- Deploy as `map_editor_v2.html` on test server
- Share with beta testers
- Collect feedback

### Phase 3: Production
- Address feedback
- Final QA pass
- Rename files:
  - `map_editor.html` → `map_editor_old.html` (archive)
  - `map_editor_mockup.html` → `map_editor.html`
  - `map_editor_mockup.js` → `map_editor.js`
- Update deploy script
- Deploy to production

### Phase 4: Monitoring
- Monitor error logs
- Watch for user reports
- Be ready to rollback if needed

---

## 📚 Related Documents

- `FEATURES.md` - Feature catalog
- `map_editor.html` - Current implementation
- `map_editor_mockup.html` - New UI mockup
- `map_shared.js` - Shared map functionality
- `spatial_audio_app.js` - Audio engine

---

## 🔧 Technical Debt

### To Address
1. **Inline styles** in mockup → Move to CSS
2. **Hardcoded colors** → Use CSS custom properties
3. **Duplicate CSS** → Clean up
4. **No error boundaries** → Add try/catch
5. **No loading states** → Add spinners

### To Avoid
1. Don't break existing functionality
2. Don't change data structures
3. Don't modify API contracts
4. Don't remove features without replacement

---

**Created:** 2026-03-25  
**Last Updated:** 2026-03-25  
**Next Session:** Session 1 - Infrastructure Setup
