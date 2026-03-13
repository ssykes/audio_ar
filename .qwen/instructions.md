# Audio AR Project - Session Instructions

## Current State (as of 2026-03-12)

**Version:** v5.1 - Z-Axis Coordinate Fix Complete

**Completed:**
- ✅ Phase 1: Basic audio panning (index.html v3.66)
- ✅ Phase 2: Reusable classes (spatial_audio.js v5.1, spatial_audio_app.js v2.5)
- ✅ Phase 3: Multiple sound types (SampleSource, OscillatorSource, MultiOscillatorSource)
- ✅ Phase 4: GPS integration (GPSTracker with auto-lock)
- ✅ Phase 5: Compass rotation (DeviceOrientationHelper, HeadingManager)
- ✅ Phase 6: Map editor + player mode (map_placer.html v2.7)

**Latest Fix:** v5.1 Z-axis flip for GPS→WebAudio coordinate conversion
- Bug: Sounds were 180° flipped (North sounded like South)
- Fix: `this.setPosition(x, -z)` in GpsSoundSource.updatePosition()

**Next Planned Work:**
- Phase 3 enhancement: MIDI source type
- Phase 6 enhancement: JSON import (export works)
- Future: Dynamic GPS profiles for driving/cycling

---

## My Preferences

### Commit Messages
- **Use underscores, NO spaces:** `v5.1_Z-Axis_Fix` not `v5.1 Z-Axis Fix`
- Include version number
- Keep it concise but descriptive

### Explanation Style
- **Keep it brief** - I'm an experienced developer
- Only explain bugs in detail if I ask
- Skip the summaries after code changes unless I ask

### Logging & Debugging
- **Keep debug logging ENABLED** in map_placer.js
- Auto-copy after 3s stillness (for hands-free field testing)
- 1000-line buffer (captures ~50-100 seconds of walking)
- To disable: set `this.autoCopyLogs = false` in constructor

### Testing
- I test on **Android phone via HTTPS**
- GPS + compass integration is critical
- Real-world walking tests are my primary validation method

### Code Style
- Follow existing conventions in the codebase
- Add inline comments for complex math (like coordinate conversions)
- Document bug fixes with version and root cause

---

## How to Start a Session

**If continuing work:**
> "Continuing from last session. We're working on [feature]. Current version is v5.1."

**If debugging:**
> "Bug: [describe behavior]. Here are the logs: [paste]"

**If starting new feature:**
> "Starting [Phase X feature]. Here's what I want: [requirements]"

---

## Key Files

| File | Purpose | Current Version |
|------|---------|-----------------|
| `spatial_audio.js` | Core audio engine classes | v5.1 |
| `spatial_audio_app.js` | App orchestration | v2.5 |
| `map_placer.js` | Map editor + player mode | v2.5 |
| `map_placer.html` | Map UI | v2.7 |
| `index.html` | Audio panning test bench | v3.66 |
| `single_sound_v2.html` | Single GPS sound test | v2.71 |
| `auto_rotate.html` | Compass rotation test | v3.0 |
| `docs/architecture.md` | Project roadmap & docs | Updated v5.1 |

---

## Session Workflow

1. **Read this file** at session start
2. **Check git status** for pending changes
3. **Confirm current state** with user
4. **Proceed with task**

---

## Notes for Future Sessions

- GPS coordinate conversion is documented in `spatial_audio.js` (line ~265)
- Debug logging auto-capture is in `map_placer.js` constructor
- Architecture docs have Known Issues section for bug history
- All changes should be committed with underscored messages
