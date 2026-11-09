# Audio AR Project - QWEN.md

## 📚 Documentation Hierarchy

**For new feature work, reference documentation in this order:**

```
QWEN.md (this file - project context & memories)
    ↓
README.md (project overview)
    ↓
CONSOLIDATED_DOCUMENTATION.md (comprehensive technical overview)
    ↓
FEATURES.md (feature catalog - all completed features)
    ↓
FEATURE_*.md (individual feature specs)
    ↓
Source code (implementation)
```

### Quick Reference

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **QWEN.md** | Project context, memories, setup | Starting session, need project info |
| **README.md** | Project overview and getting started | New contributor onboarding |
| **CONSOLIDATED_DOCUMENTATION.md** | Comprehensive technical overview | Deep technical understanding |
| **FEATURES.md** | Feature catalog (Features 1-16 completed) | Reference existing features, plan new ones |
| **FEATURE_*.md** | Deep-dive specs | Implementation details, debugging |
| **LAZY_*.md** | Lazy loading architecture | Audio optimization work |
| **🚚 *How a Change Reaches the Phone* (below)** | **Deploy, caching, service worker** | **Any cache or deploy problem — read this first** |
| **CLOUDFLARE_*.md** | Server/CDN configuration | ⚠️ Superseded by the section above |
| **SERVICE_WORKER_*.md** | Offline mode | ⚠️ Superseded by the section above |

---

## 💡 Qwen Added Memories

- **AI Joke**: User wants me to tell them an AI joke at the beginning of each session (without prompting)

- **PowerShell Scripts**: Use the `&` call operator: `& .\deploy.ps1`. Without `&`, PowerShell opens the script instead of executing it.

- **Deploy Script Cache-Busting**: `deploy.ps1` creates temporary `.deploy` versions with cache-busting query strings, uploads them, then cleans up.

---

## 📁 Current File Versions

| File | Version | Last Updated |
|------|---------|--------------|
| `map_player.html` | v7.2 | 2026-03-18 |
| `map_editor.html` | v6.119+ | 2026-03-18 |
| `index.html` | v6.8 | 2026-03-16 |
| `soundscape_picker.html` | - | 2026-03-21 (Feature 16) |
| `theme.css` | v1.0 | 2026-10-13 (Feature 17B phase 1: design tokens) |
| `spatial_audio.js` | v6.3 | 2026-11-09 (Feature 23 Phase 0: physical loudness) |
| `spatial_audio_app.js` | v3.3 | 2026-11-09 (Feature 23 Phase 0: disposal-distance pass-through) |
| `map_shared.js` | v6.9+ | 2026-04-03 (Sim waypoint zone logging) |
| `download_manager.js` | v1.1 | 2026-03-21 (Feature 16: Version guard) |
| `sw.js` | v1.0 | 2026-10-13 (offline fallback page; `theme.css` precached) |
| `deploy.ps1` | - | 2026-10-13 (`theme.css` registered) |
| `FEATURE_22_PWA_AND_UI_RESTYLE.md` | v1.0 | 2026-10-13 (Task A + Task B spec) |
| `FEATURE_23_PHYSICAL_LOUDNESS.md` | v1.1 | 2026-11-09 (Phase 0 implemented; decisions 9-13) |
| `SERVICE_WORKER_REFACTOR.md` | v1.0 | 2026-03-21 (Feature 16B spec) |

**⚠️ Dead files — do not edit:** `map_editor_v2.*`, `map_editor_old.*`, `map_editor_mockup.*`.
`FEATURE_17_MAP_EDITOR_UI_REFACTOR.md` wrongly calls `map_editor_v2.html` production. The live
editor is `map_editor.html`. See `FEATURE_22_PWA_AND_UI_RESTYLE.md` → *Live file map*.

**Note:** Cache-busting versions updated on every deploy. Check HTML files for current values.

---

## 🧪 Scratch Files

Throwaway test and debug pages are built in `scratch/` (gitignored) — never in the project root.
They are not tests: nothing runs them automatically and they prove nothing later. If a check needs
to survive, build it deliberately and say so. Nothing in `scratch/` is backed up; clear it out
periodically.

---

## 🎯 Next Priority Items

**👉 Items 1-2 are fully specified in [`FEATURE_22_PWA_AND_UI_RESTYLE.md`](FEATURE_22_PWA_AND_UI_RESTYLE.md)**
They are two *independent* tasks — do them separately, they share no code.

1. **Feature 22A: Wake lock + PWA installability** - Audio dies silently mid-walk; installing the app 404s (~3h + device testing)
2. **Feature 22B: Contemporary UI restyle** - Phase 2; gated on a user-supplied reference example (~2-4h per page)
3. **Feature 16B: Service Worker Refactor** - Code quality, remove duplication (~6h)
4. **Feature 23: Physical Loudness Model** - **Phase 0 implemented 2026-11-09, NOT deployed, NOT yet verified on a walk.** Waypoints were faint until you were on top of them; the engine now uses one physical falloff curve and the spatialiser no longer attenuates on top of it. Spec in [`FEATURE_23_PHYSICAL_LOUDNESS.md`](FEATURE_23_PHYSICAL_LOUDNESS.md). Supersedes Feature 17. **Next step is a walk test, then retune the reverb bands — not more code.**
5. **Feature 20: Cached Streaming** - Session cache (~7h)
6. **Feature 21: Sound Walk Composer** - Routes + OSRM (~4h)
7. **Test on mobile** - Verify GPS/compass with lazy loading + air absorption
8. **Feature 18: Behavior UI** - Visual timeline

> **⚠️ About to continue Feature 23?** Phase 0 is done. What is still open, and which phase each
> one blocks, is in `FEATURE_23_PHYSICAL_LOUDNESS.md` §5 and §6: the gunshot limiter ceiling
> (**blocks Phase 1**), then the lazy-loading radius and its ceiling, artificial sources such as
> oscillators, and whether the dynamic-range knob belongs to the device or to the soundscape
> (**all block Phase 2/3 and change the schema**). The near-field clamp is resolved: 1 m.
> Ask before writing code — do not assume Phase 0's answers carry over.

---

## 🐛 Known Issues

**Open (see `FEATURE_22_PWA_AND_UI_RESTYLE.md` for detail and fixes):**

- 🔴 **Wake lock is never re-acquired** after the page is hidden. An incoming call or the notification shade silently kills audio and GPS mid-walk. `map_player.js` ~:1287
- 🔴 **`manifest.json` `start_url` points at `/audio_ar_app.html`, which does not exist** - installing to the home screen produces a 404
- 🟠 **No PNG icons anywhere** - iOS ignores the SVG icons, so an installed iOS app gets a screenshot thumbnail
- 🟠 **`wake_lock_helper.js` is dead code** - zero call sites, yet it is loaded by `map_player.html` and precached to every phone
- 🟠 **`offline.html` is broken** - its "Open App" button targets the same nonexistent file, and it is not in `FILES_TO_CACHE`
- 🟡 **Docs are unreliable about which editor file is live.** `FEATURE_17_MAP_EDITOR_UI_REFACTOR.md` and `FEATURES.md` both claim `map_editor_v2.html` is in production. It is **dead**; the live editor is `map_editor.html`. Verify with `grep "location.href.*map_editor" index.html soundscape_picker.html`
- 🟠 **Streamed sources are never disposed.** `ZoneConfig.stream` has no `preloadMargin`, so the zone maths yields `NaN` for their unload and disposal distances and `distance > NaN` is never true — a stream stays in memory for the whole session. Found 2026-11-09 while wiring Feature 23 Phase 0; **deliberately not fixed**, it is unrelated to loudness. `spatial_audio_app.js` → `_getSoundZone`, stream branch
- 🟡 **`gain_vs_distance.html` documents the pre-Feature-23 curve.** It hard-codes the old quadratic fade and its 20 m fade zone, so anything quoted from it is now wrong. Regenerate or delete it

**Fixed 2026-11-09, in the working tree, NOT yet deployed:**

- 🔴 **The area volume slider has never done anything.** Areas carry **two** level fields. The editor edits `volume`, and that is what the `areas` table stores. But `api/models/Area.js` also declares a `gain`, and **there is no `gain` column** — so `fromRow` fills in its 0.5 default on every read, and the area loader preferred `gain` over `volume`. Result: every area played at 50% no matter where the slider was. Fixed 2026-11-09 by making `volume` authoritative in the loader; the phantom field is still returned by the API and should be deleted from the model (**not done** — server-side, needs an API restart). Reproduced at three slider settings by `scratch/repro-area-volume.js`: deployed code gives 50% / 50% / 50% for a slider at 0% / 30% / 100%; working tree gives 0% / 30% / 100%.
- ⚠️ **Area levels will jump by ~60% when this is deployed.** Every area has been playing at 0.5 while its stored `volume` said something else (usually 0.8). Mixes balanced by ear before 2026-11-09 need re-checking.
- ✅ **A volume of 0 was separately read as "no value" in five places.** The slider looked like it reset to 80% on reopening, and muted sources were played loudly. The saved value was always correct — the client payload, the API models and the repositories all use nullish defaults, so 0 survives the round trip. The bug was in the read-back: `volume || 0.8` in the editor form (waypoints and areas), `volume > 0.1 ? volume : 1.0` in the editor's audio config (waypoints and areas), `areaConfig.volume || 0.8` in the area loader, and `options.gain || default` in three places in the engine. **This fix alone did not repair areas** — the phantom `gain` above was still overriding it, which is why the first report of "still not fixed" was correct. `scratch/verify-volume-zero.js` (20 checks).
- ✅ **A source could burst at full volume when it started.** A source is created before its distance is known, so it briefly holds its creation level; the new smoothing ramp then glided *down* from there instead of snapping. Entering a waypoint produced an abrupt loud hit. Fixed: the first level application snaps, later ones ramp, and both creation paths now start muted.
- **Waypoints were never affected by the area bug.** A waypoint's level is multiplied in on every frame from `volume`; an area's is captured once, when its source is created, from `gain`.
- **Because nothing is deployed, the live site still has all of this.** To tell which build a page is running, look for the engine's load line in the console: `Loading v6.1...` / `v6.2 (Area Debug Cleanup) loaded` is the old code, `Loading v6.3...` is the fix. A hard refresh is not enough on a locally served page if the script URL carries an old cache-busting stamp.

**Resolved:** all lazy loading bugs fixed
- ✅ Preload margin matches fade zone (20m) — *the fade zone itself is gone as of Feature 23 Phase 0; the 20 m margin now buys load lead time before a sound becomes audible. See the `ZoneConfig` comment*
- ✅ Preloaded sounds start playing immediately
- ✅ Hysteresis prevents rapid load/dispose cycles
- ✅ Zone naming clarified ('unload' → 'hysteresis')
- ✅ Debug logging verifies zone transitions

---

## 🚀 Quick Start Commands

```bash
# Test on PC
open map_player.html

# Test on Phone (local network)
python -m http.server 8000
# Access from phone at http://YOUR_IP:8000/map_player.html

# Deploy to test server
& .\deploy.ps1
```

---

## ⚠️ Git Commit on Windows (Important!)

**Problem:** Windows CMD doesn't handle multi-line commit messages.

**Solution:** Use `write_file` + `-F` flag:
```
1. write_file to create .git/COMMIT_EDITMSG with full message
2. git commit -F .git/COMMIT_EDITMSG
3. git push
```

**Alternative:** Single-line messages only: `git commit -m "Short message"`

---

## 🔧 Pre-commit Hook (Auto-Installed)

Cache-busting versions are **automatically stripped** before committing.

| Hook | Location | Status |
|------|----------|--------|
| Bash script | `.git/hooks/pre-commit` | ✅ Installed |
| PowerShell | `.git/hooks/pre-commit.ps1` | ✅ Installed |
| Git config | `core.hooksPath = .git/hooks` | ✅ Configured |

**What Gets Committed:**
- ✅ JavaScript files (without version numbers)
- ✅ HTML files (without cache-busting query strings)
- ✅ Display versions (e.g., `<span class="version">v7.2</span>`)

**What Does NOT Get Committed:**
- ❌ Cache-busting query strings (e.g., `?v=20260317233153`)

---

## 📝 Creating a New JavaScript File (Checklist)

When creating a new `.js` file, complete these steps:

### 1. **Add to `deploy.ps1`** (Required for deployment)

**Step 1a:** Add version pattern near line 105:
```powershell
$NEW_FILE_PATTERN = 'new_file\.js\?v=\d+'
```

**Step 1b:** Add version update code near line 149:
```powershell
# Update new_file.js version
if ($content -match $NEW_FILE_PATTERN) {
    $content = $content -replace $NEW_FILE_PATTERN, "new_file.js?v=$VERSION"
    Set-Content $filePath $content -NoNewline
    Write-Host "  Updated: $htmlFile (new_file.js)" -ForegroundColor Green
}
```

**Step 1c:** Add to `$ALL_FILES` array near line 315:
```powershell
$ALL_FILES = @(
    # ... existing files ...
    "new_file.js",  # ← Add here
)
```

### 2. **Add to HTML with cache-busting** (Required for browser updates)

```html
<script src="new_file.js?v=20260323"></script>
```

**Note:** Deploy script will auto-update the version number on each deploy.

### 3. **Verify Load Order** (If the script depends on other libraries)

Ensure dependencies load **before** your script:
```html
<!-- Leaflet must load BEFORE leaflet.draw -->
<script src="leaflet.js"></script>
<script src="leaflet.draw.js"></script>
<script src="area_drawer.js"></script>  <!-- Depends on both -->
```

### 4. **Test Deployment**

```powershell
& .\deploy.ps1
```

Verify in output:
- ✅ `Updated: map_editor.html (new_file.js)` - Version updated
- ✅ `new_file.js  100%  [OK]` - File uploaded

### 5. **Verify on Server**

Hard refresh browser (Ctrl+Shift+R) and check console:
- ✅ No 404 errors
- ✅ No "undefined" errors
- ✅ Your console.log() appears

---

## 🚚 How a Change Reaches the Phone — READ BEFORE TOUCHING CACHING

**Verified 2026-11-08 by reading the deploy script, both service worker files, the server config
and the pages themselves. This section supersedes `CLOUDFLARE_CACHE_TROUBLESHOOTING.md` and the
`SERVICE_WORKER_*.md` files wherever they disagree.**

### The pipeline

1. You edit a file. The committed copy carries **no** version strings — the pre-commit hook strips them.
2. The deploy script generates one timestamp and rewrites every known asset reference in the
   **working tree** to `name.ext?v=<timestamp>`. **A dirty working tree full of version stamps after
   a deploy is expected, not a mistake.** Never commit them; the hook strips them anyway.
3. It also stamps the cache version **in place** inside the two service worker files. Those two
   values must always match each other.
4. It writes throwaway `.deploy` copies of the pages, uploads those, then deletes the copies.
5. On the server, pages, scripts **and stylesheets** are all sent with headers that forbid caching.
   Nothing on the origin wants to be stored.
6. On the phone, the service worker builds a fresh cache, deletes the previous one, and reloads.

### Four caches sit between you and the phone — three are proven innocent

Browser HTTP cache → service worker cache → Cloudflare edge → Apache.

**Measured on the live site 2026-11-08:** pages, scripts and stylesheets all came back with
`Cache-Control: no-cache, no-store, must-revalidate`, `CF-Cache-Status: DYNAMIC` (`MISS` for CSS)
and no `Age` header. Caching level is `basic`, there are **zero** cache rules, and Rocket Loader
is off.

The browser, the edge and the origin are all refusing to store anything. **The service worker is
the only cache in this chain that can hand you a stale file.** Do not investigate the other three.

The zone is proxied, and the deploy script uploads to a LAN address while the public name resolves
to a different-looking one — but they are the same machine. The `Last-Modified` values on the live
site match the timestamp the deploy generated, to the second. **Uploads do land where the public
site reads from.** Do not go looking for a second server.

### ✅ Defect 1: the service worker defeated its own cache-busting

**Fixed in `7f3b85c`, deployed as `20261108153406`, and confirmed on a device 2026-11-08** — a
wording change reached the picker page with no cache clearing and no help. Reproduced in a browser
first: the same request served a stale copy under the old rule and the current copy under the new.

Devices that installed the app *before* that deploy still carry the old worker and need one manual
clear to escape. Anything installed after it is fine.

The catch-all branch of the fetch handler is **cache-first even when online**, and when the exact
URL misses it **strips the query string and tries again**. So a request for the freshly versioned
registration script falls back to the bare copy cached at install time — the *old* file, carrying
the *old* version. The old version then registers the old worker, the old cache stays, and nothing
updates.

**The one file whose job is to detect a new deploy is itself served stale by the mechanism built to
detect new deploys. It cannot update itself.**

This is why unregistering the service worker has always made the change appear. That is the
*diagnostic*, not the fix, and it is not evidence that the versioning scheme is wrong.

**Every precached asset was affected, not just the updater.** A versioned request for any script
or stylesheet in the precache list resolved the same way, so no code change at all could arrive.
The registration script is simply the one that stopped the system ever recovering on its own.

`map_player.html` escapes the deadlock because it registers the worker inline with a URL that
changes on every load. **The two pages therefore behave differently** — which is why symptoms look
inconsistent from one test to the next.

### ✅ Defect 2: that inline registration URL was malformed

**Fixed in the same commit and verified on the live server.** The address is well formed, and the
2026-11-08 deploy stamped it cleanly — confirming the script handles a bare filename correctly.

`map_player.html` builds a worker address containing **two question marks** — the deploy script's
pattern matched a bare filename inside code that was already appending its own version suffix, and
inserted a second one. The resulting address changes on every page load, so the worker reinstalls
endlessly instead of updating cleanly.

### When a deployed change does not appear, check in this order

1. Did the upload succeed? The script prints a pass/fail line per file.
2. Do the two service worker files hold the **same** cache version in your working tree?
3. Load the site with the service worker unregistered. **If the change appears, it is Defect 1.**
4. Only if all three are clean, re-measure the edge — it may have been reconfigured since the
   2026-11-08 check above:

```powershell
Invoke-WebRequest -Uri "https://ssykes.net/map_player.js" -UseBasicParsing |
    Select-Object -ExpandProperty Headers
# CF-Cache-Status should be DYNAMIC or MISS, never HIT. Age should be absent.
```

**Ignore the Cloudflare advice the deploy script prints when it finishes.** It recommends a caching
setting that does not exist on this account, and the intent behind it — making the edge ignore query
strings — would disable cache-busting outright. The script also never purges Cloudflare; it only
prints instructions and leaves the purge to you.

**Do not redesign the cache-busting scheme because one change failed to appear.** That reaction has
already produced more breakage than the original problem. The scheme is sound; the service worker's
query-string fallback contradicts it. Fix the contradiction.

### Committing rules

- Never commit version stamps.
- Never commit the service worker files **without also staging an HTML file**. The pre-commit hook
  exits early when no HTML is staged, so the deploy timestamp gets baked into history permanently
  and the canonical reset value is lost.

### 🧹 Cleanup backlog

All verified 2026-11-08. **None of it is urgent** — the caching path works today. These are the
things that make it fragile and expensive to reason about.

**Service worker**

- **Two registration paths.** The picker loads the shared updater script; the player registers the
  worker inline. Unify on the shared one. The inconsistency is what made symptoms look random.
- **Two offline fallback pages** are built in two different places. Keep the self-contained one.
- The wake-lock helper is precached to every phone but never called (see Known Issues).
- **Keep the stripped-query lookup.** It is the offline fallback and it is correct — it simply must
  never run *ahead* of the network again.

**Deploy script**

- **It edits your working tree.** This one choice causes the permanently dirty tree, the pre-commit
  hook, and that hook's early-exit trap. Stamp only the throwaway copies and all three disappear
  together — the hook can be deleted outright. *Highest-value change on this list.*
- It stamps everything twice; the second pass is a no-op for seven of the eight pages. Collapse it.
- Its patterns match a bare filename **anywhere**, including inside strings, comments and prose.
  That already corrupted live code once. Anchor them to attribute context, or drop the first pass.
- It verifies one file by grepping the server for one hardcoded word. Rename that word and every
  future deploy falsely reports old code and re-uploads.
- Its corruption check reads the first fifteen lines looking for common words. False alarms train
  you to ignore the real one.
- Sound file discovery finds nothing, though nineteen files sit in the folder. New audio silently
  does not ship.
- A failed database migration prints a green success. The summary cannot be trusted.
- The closing Cloudflare advice names a setting this account does not have, and following its
  intent would disable cache-busting. Delete it.
- Display versions increment on every deploy (`v2.733`). They count deploys, not releases.

---

## ✅ Completed Features Summary

| Feature | Description | Status |
|---------|-------------|--------|
| **1-3** | SoundScape persistence + phone mode | ✅ Complete |
| **4** | Hit list cleanup | ✅ Complete |
| **5A-5D** | Multi-soundscape support | ✅ Complete |
| **5E** | Auto-sync with timestamps | ✅ Complete |
| **6** | Separate editor/player pages | ✅ Complete |
| **7** | Data Mapper pattern (repositories) | ✅ Complete |
| **8** | Device-aware auto-routing | ✅ Complete |
| **9** | Soundscape selector page | ✅ Complete |
| **10** | Icon bar UI redesign | ✅ Complete |
| **11** | Debug log copy | ✅ Complete |
| **12** | Edit waypoint duplicate fix + refresh persistence | ✅ Complete |
| **13** | Listener drift compensation (EMA smoothing) | ✅ Complete |
| **13** | Lazy loading for sound walks | ✅ Complete |
| **14** | Distance-based audio filtering (air absorption) | ✅ Complete |
| **15** | Offline soundscape download (Cache API) | ✅ Complete |
| **16** | Service Worker offline mode + corruption guards | ✅ Complete |

**Detailed feature documentation:** See `FEATURES.md`

---

## 📋 Planned Features

| Feature | Description | Priority |
|---------|-------------|----------|
| **16B** | Service worker + deploy script cleanup — see *Cleanup backlog* above | Medium |
| **17** | Distance Envelope Behavior — **superseded by Feature 23.** Extract the spec and preset design from the abandoned branch before deleting it | Low |
| **17B** | Map Editor UI Refactor — **phase 1 done** (`theme.css` token extraction, `dab9441`) | High |
| **18** | Behavior editing UI | Medium |
| **19** | Multi-user collaboration | Low |
| **20** | Session-based cached streaming | High |
| **21** | Sound Walk Composer (Routes + OSRM) | High |
| **22A** | Wake lock re-acquire + PWA installability (`start_url` 404, PNG icons) | High |
| **22B** | Contemporary UI restyle (phase 2, reference-driven) | Medium |
| **23** | **Physical Loudness Model** — Phase 0 implemented 2026-11-09 (engine only, not deployed). Walk test + reverb retune next; Phases 1-3 blocked on the open questions in the spec | High |

**Specs:** `FEATURE_22_PWA_AND_UI_RESTYLE.md` (22A/22B) · `FEATURE_23_PHYSICAL_LOUDNESS.md` (23)

**Also outstanding, unrelated to caching:** the local branch and the forgotten stash both hold
abandoned distance-envelope work and are the only things keeping ~2.9 GB of accidentally committed
audio reachable. Inspect them before deleting either — see the envelope note under Feature 17.
Local `main` has also diverged from the remote (1 ahead, 9 behind).

---

**Last Updated:** 2026-11-09 (Feature 23 Phase 0 implemented in the audio engine — one physical
falloff curve, spatialiser reduced to direction only, no hard cutoff, louder/quieter control on the
player. Also fixed a volume-of-0 bug in five places across the editor, the player and the engine:
muted sounds were being played loudly, while the saved value was correct all along. Verified by
three throwaway `scratch/` scripts (17 + 36 + 20 checks), **nothing heard on a walk and nothing
deployed**. Decisions 9-13 recorded in the spec; the stream-disposal `NaN` defect found and left
alone. Previous entry: 2026-11-08 — service worker cache-busting deadlock found, reproduced,
fixed, deployed and verified on a device; added *How a Change Reaches the Phone*, the cleanup
backlog and the scratch folder convention; repaired `.gitignore`; specified Feature 23.)
