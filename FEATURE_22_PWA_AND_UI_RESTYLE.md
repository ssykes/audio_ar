# Feature 22: PWA / Player Reliability + Contemporary UI Restyle

**Status:** 📋 **Planned** — not started
**Created:** 2026-10-13
**Scope:** Two independent bodies of work. Do them separately; they share no code.
**Supersedes:** nothing, but corrects `FEATURE_17_MAP_EDITOR_UI_REFACTOR.md` (see [Live file map](#live-file-map-critical))

> ⚠️ **Every line-number reference below was verified against the working tree on 2026-10-13.**
> Line numbers drift. Re-grep before trusting them.

---

## Task A — PWA installability and player reliability

### A1. Wake lock: the highest-impact fix

**Two coupled problems, both grep-verified.**

**(a) `wake_lock_helper.js` is dead code that every phone downloads.**

`WakeLockHelper` is defined at `wake_lock_helper.js:11` and has **zero call sites anywhere in the repo**. Its docstring claims *"Extracted from `single_sound_v2.html` for reuse"* — the reuse never happened. It is still:

- loaded by a `<script>` tag in `map_player.html`
- listed in `sw.js` → `FILES_TO_CACHE`

So it is downloaded and cached on every user's device and never executes. Its `isActive` flag is also unused.

**(b) The live duplicate never re-acquires the lock.**

`map_player.js` implements its own `_requestWakeLock()` (~:1281) and `_releaseWakeLock()` (~:1303).

What is **correct** today:

| | |
|---|---|
| Requested at ~:972 | Inside the Start handler — *"STEP 3: Request wake lock (must be in user gesture)"*. The API requires user activation, so this placement is right. |
| Released at ~:1259 | On stop. Avoids draining battery after the walk ends. |

What is **broken**: the `release` listener (~:1287-1290) only logs and nulls the reference.

```js
this.wakeLock.addEventListener('release', () => {
    console.log('[MapPlayer] 🔒 Wake lock released');
    this.wakeLock = null;      // ← noted, never re-acquired
});
```

Per spec the lock is **auto-released whenever the page becomes hidden**. There is no `visibilitychange` listener, so nothing re-acquires it. This is exactly the `TODO Session_2` at `wake_lock_helper.js:7`.

**Failure sequence the user experiences:**

1. Tap Start → lock acquired ✓
2. Incoming call, notification shade, switch to camera, Apple Pay → page hidden → **lock auto-released**
3. User returns → page visible → **lock not re-acquired**
4. Screen follows the normal timeout → dims → locks
5. **Audio stops and GPS freezes mid-walk. No error, no warning, nothing in the UI.**

On a 30-minute sound walk this is near-certain to occur at least once. Recovery requires unlocking, finding the app, and tapping Start again — losing position in the walk.

**Why this is existential rather than cosmetic:** when the page suspends, Web Audio stops *and* `watchPosition` stops firing. On resume the listener position jumps, which — given the EMA drift smoothing from Feature 13 — can snap panning.

**Fix (MDN-documented pattern):**

```js
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && this.isPlaying) {
        await this._requestWakeLock();
    }
});
```

**Related:** `spatial_audio_app.js:355` carries a matching TODO — `app.autoResumeAudio()` should handle `visibilitychange` internally so audio resumes too. Fixing the lock without fixing audio resume leaves half the problem.

**Second gap — silent failure.** `map_player.js:~1294` handles a failed request with `console.warn` only. If the lock is denied, unsupported, or loses activation, the user gets no indication and discovers it when audio dies. Surface it in the UI: `🔒 Screen will stay on` vs `⚠️ Keep your screen on manually`.

**Battery tradeoff (accept, don't fight).** Holding the screen on is the largest single battery drain on a phone, and **there is no PWA workaround** — no background audio mode. Functionality must win for this app. Mitigations: tell the user, and suggest lowering brightness manually before a walk (you cannot dim programmatically below the user's own setting).

**Recommended approach — consolidate, don't extend.** `WakeLockHelper` is already being downloaded; make it earn those bytes:

1. Move the player's logic into `WakeLockHelper`, delete the duplicate in `map_player.js`
2. Add the `visibilitychange` re-acquire there, once
3. Expose the existing `isActive` flag so the UI can show lock state
4. Surface failure to the user

**⚠️ Risk:** this touches STEP 3 of the start sequence, and `_requestWakeLock()` is `await`ed at ~:972. A throw or a block there breaks starting audio entirely. Re-acquire logic must not run inside that awaited path.

---

### A2. PWA install blockers

Two defects that mean **installing the app today produces a broken app.** Neither fails during development; both surface only after a real install on a phone, which is why they look like deploy problems rather than manifest bugs.

**(a) `start_url` points at a file that does not exist.**

```json
"start_url": "/audio_ar_app.html"
```

There is no `audio_ar_app.html` — only `audio_ar_app_v10.17_backup.html`. **Tapping an installed home-screen icon 404s.**

→ Change to `/index.html`. It already contains the offline-redirect logic (`if (!navigator.onLine)` → jump to the picker when cached soundscapes exist), which makes it the correct launch target for an app started offline.

**(b) Icons are SVG only — there are zero PNG files in the repo.**

Only `icon-192.svg` and `icon-512.svg` exist. Consequences:

| Problem | Detail |
|---|---|
| iOS ignores SVG home-screen icons | Without a PNG `apple-touch-icon`, an installed iOS app gets a screenshot thumbnail instead of your icon |
| `"sizes": "192x192"` is wrong for SVG | SVG is resolution-independent; declare `"sizes": "any"`. Fixed pixel sizes on a vector can make Chrome skip it |
| `"purpose": "any maskable"` should be split | Maskable icons need ~20% safe-zone padding; one file rarely serves both. Use separate entries |
| No live page declares `apple-touch-icon` | Only `auto_rotate.html:10` and the backup do — and both point at the SVG iOS ignores |

→ Generate 192px and 512px PNGs plus a 180×180 `apple-touch-icon.png`, split the `purpose` values, add the `<link>` to `index.html`, `soundscape_picker.html` and `map_player.html`.

**(c) Smaller manifest gaps.** No `"id"` field (stable identity across `start_url` changes — relevant because `start_url` is about to change).

**(d) No install prompt handling anywhere.** Grep-verified: **no `beforeinstallprompt` handler and no `display-mode: standalone` detection exist in the codebase.**

- Android/Chrome offers installation automatically once criteria are met
- **iOS Safari never prompts.** The user must manually do Share → Add to Home Screen

Since the player audience is phone users and likely a large iPhone share, you need explicit on-screen instructions in `soundscape_picker.html`. Without them, iPhone users simply will not install.

**(e) `offline.html` is also broken.** Its "Open App" button points at `/audio_ar_app.html` (same 404), its second button is mislabelled "Test Page", and it is **not** in `FILES_TO_CACHE` — so it is unavailable offline, which is the only time it would be used. Either fix and precache it, or delete it; `sw.js` now generates its own inline fallback (see [Already done](#a3-already-done-this-session--do-not-redo)).

---

### A3. Already done this session — do not redo

| Commit | Change |
|---|---|
| `dab9441` | **`theme.css` extraction** — 36 design tokens moved verbatim out of `map_editor.html`'s `:root` into a shared `theme.css`, linked first from all four live pages. Four hand-synced hex values in `sound_library.css` converted to `var()`. Registered in `deploy.ps1`. |
| `aea5e86` | **`theme.css` added to `sw.js` `FILES_TO_CACHE`** (now 17 entries). |
| `ac7bb04` | **`offlineFallbackResponse()` in `sw.js`** (~:142) — self-contained inline-HTML recovery page replacing both bare-text `503` navigation dead ends. Offers Try again / Home / Offline player / Clear cache. Returns status `200` deliberately, with `Cache-Control: no-store`. |
| `d6de294` | sound_id foreign-key work + base36 sound filenames (unrelated to this feature) |
| `4099451` | `clearcache.html` brought under version control |
| `6299344` | Display-version bumps (deploy artifact) |

### A4. Invariants — do not "fix" these

- **Audio-file `404`s in `sw.js` (~:402, ~:408, `🎵` log prefix) must stay genuinely failed.** `CachedSampleSource` depends on receiving a failed response to handle a missing sound. Returning HTML there breaks the audio pipeline worse.
- **Sub-resource empty-`200` catch-all (~:688)** is deliberate — commented *"don't break the page"*. Not a navigation.
- **Status `200` on the offline fallback is intentional**, not an error to correct. In `display: standalone` there is no back button, no reload, no URL bar; a `5xx` risks the browser showing its own error screen with no escape.
- **Two `rgba()` values in `sound_library.css` `.filepond--panel-root`** remain hand-synced to `--bg-panel` / `--border-input`. They encode alpha, so tokenizing them needs `color-mix()`, not a plain `var()` substitution. Deferred on purpose.

### A5. Open question to verify on device

`clearcache.html` is **not** in `FILES_TO_CACHE`. The new fallback page links to it as the recovery escape hatch — but offline, that link may itself be a dead end. **Test it**; if it fails, add `clearcache.html` to `FILES_TO_CACHE`.

---

## Task B — Contemporary UI restyle (phase 2)

Phase 1 (`theme.css` extraction) is complete. Phase 2 restyles all four live pages.

### B1. Approach: reference-driven, not invented

The user supplies a **reference example**. This is deliberate — an LLM asked to "make it contemporary" without a reference converges on a recognisable, tired aesthetic.

- **A URL is strongly preferred.** Raw CSS can be fetched with `Invoke-WebRequest` and read for exact hex, spacing scale, radii, shadows, transitions and font stacks — no approximation.
- **Also send a screenshot if the reference is a React / CSS-in-JS site** (styled-components, Emotion) or a heavy SPA. Those generate styles at runtime; a fetch returns an empty shell.
- Consider **Open Props** (`openprops.style`) — a library of pure CSS custom properties, no framework, no build step, just a `<link>`. It maps directly onto the existing `:root` architecture and supplies a professionally-designed scale to override.
- **Do not use v0 / Lovable / Bolt output directly.** They emit React + Tailwind; this project is vanilla HTML with Leaflet 1.9.4 and Leaflet.draw via script tag. Use them only as idea generators, then rebuild natively.

### B2. Order of work

Least risky first; the player last because it is phone- and field-critical.

| # | Page | Lines | Notes |
|---|---|---|---|
| 1 | `index.html` | 649 | Login / device routing |
| 2 | `soundscape_picker.html` | 1642 | List view, device selector |
| 3 | `map_editor.html` | 1296 | Desktop, sidebar + explorer + slideout |
| 4 | `map_player.html` | 615 | **Last.** See constraint below |

Commit each page separately so a bad restyle is a one-line revert.

### B3. Constraints

**🔴 The player is used outdoors, in daylight, on a phone.** Contemporary design trends toward low-contrast grey-on-off-white and thin type, which is genuinely hard to read in sunlight. The current `#1a1a2e` background with `#00d9ff` cyan accent performs well in the field. **High contrast and large touch targets outrank trendiness on `map_player.html`.**

> **Decision required before starting:** should the player match the new look, or stay high-contrast? Recommendation: keep it high-contrast and let the desktop editor carry the fashionable styling.

**Leaflet owns a lot of the UI.** `.leaflet-container`, `.leaflet-draw-toolbar`, popups, zoom controls and attribution all ship their own CSS and will not inherit tokens for free. Leaflet.draw's toolbar in particular is fiddly to restyle and is a common source of visual regressions. Budget real effort.

**Hundreds of inline `style="..."` attributes** exist in the live markup (e.g. `<label style="cursor: pointer; color: var(--accent-primary);">`). Phase 1 worked around them; a genuine restyle eventually requires editing markup, not just CSS.

**Load order:** `theme.css` must be linked **before** `sound_library.css`, which consumes its variables.

**Five tokens are defined but currently unused:** `--accent-warning`, `--radius-lg`, `--z-sidebar`, `--z-debug-console`, `--z-toast`. Kept for fidelity during extraction. Prune or adopt during phase 2.

### B4. Live file map (CRITICAL)

**`FEATURE_17_MAP_EDITOR_UI_REFACTOR.md` and `FEATURES.md` are wrong.** Both state `map_editor_v2.html` is *"✅ Production | deployed"* and document desktop routing as `picker → map_editor_v2.html`. It is **dead**. An agent that reads the spec instead of the router will confidently restyle a dead file and report success.

| Surface | File | Status |
|---|---|---|
| Editor (desktop) | `map_editor.html` + `map_editor.js` | ✅ **LIVE** |
| Player (phone) | `map_player.html` + `map_player.js` | ✅ **LIVE** |
| Picker | `soundscape_picker.html` | ✅ **LIVE** |
| Login / routing | `index.html` | ✅ **LIVE** |
| Shared styles | `theme.css`, `sound_library.css` | ✅ **LIVE** |
| `map_editor_v2.*` | | ❌ **DEAD** |
| `map_editor_old.*` | | ❌ Archived |
| `map_editor_mockup.*` | | ❌ Reference only |

**How to verify the live file yourself** (do not trust the docs):

```
grep "location.href.*map_editor" index.html soundscape_picker.html
```
→ all four hits target `map_editor.html`. Then confirm against `$ALL_FILES` in `deploy.ps1`, which lists `map_editor.html` and never mentions v2.

`deploy.ps1` still carries vestigial version-bump patterns for `map_editor_v2.js` and `map_editor_mockup.js`, which reinforces the false impression. The user chose on 2026-10-13 to **leave the dead files alone** — do not delete or archive them without asking.

### B5. Per-page workflow

1. Build in a scratch copy first (e.g. `map_editor_ui_test.html`) — an established pattern in this repo (`layout_test.html`, `test_formatting.html`, `waypoint_click_test.html`)
2. Verify visually with `python -m http.server 8000`
3. Promote to the live file
4. Commit separately
5. Remember the cache layers on deploy: Cloudflare + service worker + browser. `clearcache.html` is the recovery tool.

---

## Testing caveats (applies to both tasks)

**None of this is verifiable from a desktop.**

- **Browser Use cannot run on this Windows machine** — no Native Messaging host is registered there, so sessions fail with `BROWSER_DISCONNECTED`. Do not retry it. Reading a URL with `Invoke-WebRequest` works fine; *rendering* one does not.
- Visual sign-off must come from the user. `read_file` handles images, so a screenshot dropped in the repo can be read and critiqued.
- **Task A needs a real phone**, iOS and Android separately. Wake-lock suspension only reproduces on device: start playback, hide the page, return, wait for the screen timeout.
- **Fallback page desktop test recipe:** DevTools → Network → **Offline**, then navigate to a page *not* in `FILES_TO_CACHE` (`auto_rotate.html` or `layout_test.html` — the precache list only holds `soundscape_picker.html`, `map_player.html`, `map_offline.html`). Expect the dark recovery card, not a white screen reading `Offline - page not cached`.

---

## Process notes (hard-won — read before committing)

**`deploy.ps1` belongs to the user.** Commit and push on request; never run the deploy, and never edit the script as a side effect of a code change. A deploy stamps cache-busting versions into many files and uploads to the live test server.

**The pre-commit hook has an early-exit trap.** `.git/hooks/pre-commit` begins:

```sh
STAGED_HTML_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.html$')
if [ -z "$STAGED_HTML_FILES" ]; then
    exit 0     # ← exits BEFORE the sw.js / sw-register.js blocks
fi
```

So **committing `sw.js` alone never normalizes `CACHE_VERSION`** — the deploy timestamp gets baked into the repo, breaking the canonical `'v1'` invariant. Always stage at least one HTML file alongside it. Pick one whose only changes are cache-bust stamps (e.g. `index.html`): the hook strips those to an empty diff, so the commit still contains just `sw.js`. Verified working in `ac7bb04`.

**`sw.js` and `sw-register.js` always show modified after a deploy.** This is expected, not breakage. `deploy.ps1` (~:282-320) stamps `CACHE_VERSION` in place; the hook resets it to `'v1'` at commit time. Clients invalidate on the *deployed* `CACHE_NAME`, which only changes when `deploy.ps1` runs, and the activate handler deletes only `audio-ar-*` caches — `soundscape-*` downloads are preserved.

**`deploy.ps1` also auto-increments display versions** (`auto_rotate.html` v3.726→v3.727, `single_sound_v2.html` v2.730→v2.731 per run), so those two files show modified after every deploy permanently.

**`deploy.ps1` stamps `?v=` into comments and prose.** Its cache-busting regexes are bare filename patterns with no HTML/CSS context, so they match anywhere — including inside CSS comments, JS comments and TODO strings. When a post-deploy diff looks large, treat `?v=` inside comments as script noise.

**New files need three `deploy.ps1` edits** — see the checklist in `QWEN.md`.

---

## Effort estimate

| Item | Effort |
|---|---|
| A1 Wake lock consolidation + re-acquire + UI feedback | ~1.5h code, plus device testing |
| A2 `start_url` fix | minutes |
| A2 PNG icons + `apple-touch-icon` + `purpose` split | ~1h |
| A2 iOS install instructions in picker | ~30m |
| A2 `offline.html` fix-or-delete | ~15m |
| B Restyle, per page | ~2-4h each, reference-dependent |

Task A is small and high-value. Task B is the larger effort and is gated on the reference example.
