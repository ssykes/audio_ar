# Feature 23: Physical Loudness Model

**Status:** 📋 Planned — design agreed, not started
**Date:** 2026-11-08
**Priority:** High
**Supersedes:** Feature 17 (Distance Envelope) for waypoint loudness. See *Relationship to Feature 17*.

---

## 1. The problem

Waypoints are faint until the listener is almost on top of them, and there is no way to express
that a gunshot and a conversation behave differently at the same distance.

Measured 2026-11-08 against the live code, for a default waypoint (20 m activation radius).
Level at the listener relative to standing 2 m away:

| Distance | Current | Physical reality | Error |
|---|---|---|---|
| 5 m | −10 dB | −8 dB | 2 dB |
| 10 m | −19 dB | −14 dB | 5 dB |
| 20 m | −33 dB | −20 dB | **13 dB** |
| 30 m | −48 dB | −24 dB | **24 dB** |
| 40 m | **silent** | −26 dB | hard cutoff |

Ten dB is roughly "half as loud". At 20 m the current model delivers about a quarter of the
loudness the real world would.

### Root causes (all verified in source)

1. **Two attenuations are multiplied.** `updateGainByDistance()` applies a hand-written quadratic
   fade to `this.gain`, and the signal then passes through a `PannerNode` configured with
   `distanceModel = 'inverse'`, `refDistance = 1`, `rolloffFactor = 1.5` (`spatial_audio.js`
   ~1149-1153, and again ~637-643 for oscillators). Both are driven by the same distance, so the
   falloff is roughly squared. Chain is `source → gain → dryGain → panner → masterGain`.
2. **The full-volume branch is unreachable at the default radius.** `fadeStart = max(0, radius − 20)`.
   With the default radius of 20 m, `fadeStart = 0`, and the guard is `max(dist,2) < fadeStart`,
   which can never be true. The 1.5× close-approach boost and the 2 m floor live inside that dead
   branch and never execute.
3. **Hard cutoff at radius + 20 m.** Gain, wet and dry are all forced to zero. Real sound does not
   switch off; it sinks below the ambient noise.
4. **No concept of source loudness.** Every waypoint peaks at the same `targetGain` (0.8). Nothing
   distinguishes a whisper from a gunshot.
5. **No ambient noise floor.** Silence is absolute zero rather than "below the street".
6. **Inconsistent default radius:** 20 m in `spatial_audio.js`, `map_editor.js`, `api/models/Waypoint.js`
   and the schema; 30 m in the `spatial_audio_app.js` fallbacks.

---

## 2. The model

Level at the listener, in dB SPL, from one number per source — its real-world level at 1 m:

```
L(d) = L1m − 20·log10(max(d, d_near))
```

`d_near` is a near-field clamp (see §6). Audible range falls out rather than being configured:

```
d_max = 10^((L1m − L_ambient) / 20)
```

Output gain, after the two listener-side controls:

```
g = calibration · 10^(k · (L(d) − 65) / 20)      then soft-limit
```

### Agreed constants (2026-11-08)

| Constant | Value | Meaning |
|---|---|---|
| `k` (dynamic range) | **0.65** | fraction of real dynamic range retained |
| `calibration` | **0.25** | output level for a conversation at 1 m |
| reference level | 65 dB | conversation at 1 m, the anchor |
| default ambient | 50 dB | typical street |

### Source presets

| Preset | dB at 1 m | Carries to (50 dB ambient) |
|---|---|---|
| Whisper | 30 | 0.1 m |
| Conversation | 65 | 5.6 m |
| Busker | 80 | 32 m |
| Jackhammer | 90 | 100 m |
| Gunshot | 140 | kilometres — **see §6, this is wrong as stated** |

These ranges are derived, not tuned. That is the point: the artist states what the thing *is*, and
the physics decides how far it carries.

---

## 3. Decisions taken 2026-11-08

| # | Decision |
|---|---|
| 1 | Adopt the physical model. Do **not** merge the abandoned Feature 17 envelope branch. |
| 2 | **Volume stays a slider**, not a mute switch — field recordings vary in amplitude and need a trim. It becomes a multiplier applied *after* the physical model. |
| 3 | Volume default changes **0.8 → 1.0** in the schema and both API models, so unity means "exactly what the preset says". |
| 4 | Source preset, dynamic range and calibration controls go on the **waypoint and area edit panels**, under the volume slider. |
| 5 | **No data migration.** Only one soundscape exists and it will be re-entered by hand. Existing rows may default however is simplest. |
| 6 | Both gain implementations (sample and oscillator) converge on the physical model. |
| 7 | Areas confirmed to use **no panner** — gain only. They are out of scope for the spatialiser changes. |
| 8 | Global knobs live on the **player**, with defaults, so a listener never has to configure anything. |

---

## 4. What each existing control becomes

| Control | Today | After |
|---|---|---|
| `volume` (0–1, default 0.8) | Peak of the fade curve — *is* the loudness | Trim multiplier after the model. Default **1.0**. Still 0 = mute. |
| `activationRadius` (default 20) | Acoustic range *and* load lifecycle *and* the map circle | **Load/attention radius only.** Acoustic range is derived. See §5. |
| — | — | **New:** source preset + custom dB |
| — | — | **New:** dynamic range `k`, calibration — player-side |
| `fadeZoneWidth` (areas, 5 m) | Edge fade | Unchanged |

---

## 5. Open questions — resolve before Phase 1

### 5.1 How does lazy loading work?

The existing zone machinery in `spatial_audio_app.js` (~1159-1360) stays exactly as it is:
`preloadStart = radius + preloadMargin`, `unloadDistance = radius + preloadMargin + unloadMargin`,
`disposeThreshold = unloadDistance + hysteresis`. **Only the number fed in as `radius` changes.**

Proposal: derive it, then clamp it.

```
loadRadius = clamp(derived d_max, minLoadRadius, maxLoadRadius)
```

- `maxLoadRadius` is needed because a gunshot's derived range is kilometres and GPS accuracy on a
  phone is ~5-10 m. Preloading at 3 km is meaningless. Suggest **300-500 m**, to be decided.
- `minLoadRadius` prevents a whisper (0.1 m derived) from being disposed before it can be heard.
  Suggest **20-30 m**.
- Keep the manual radius field as an **override** for sources that aren't meant to be natural.

This is the riskiest part of the feature. QWEN.md records that every lazy-loading bug was fixed;
changing what radius means reopens that. Must be verified on a real walk, not in a browser.

### 5.2 Artificial sources

The artist wants oscillators and other unnatural sources with a hand-defined listening radius.
Proposal: a per-waypoint flag or a `source_kind` of `physical | artificial`. Artificial sources
skip the derived radius and use the manual value, and may want a different falloff entirely
(linear, or none). **Do not build this yet** — but do not let the schema or the model make it
impossible. Add the field now, implement later.

### 5.3 Where do the global knobs actually live?

The app has two audiences: the artist on the PC editor, and listeners on phones.

- **Calibration** is genuinely per-device — it depends on the listener's headphones and ears. It
  belongs in device-local storage with a sensible default, plus one simple louder/quieter control
  on the player. No server involvement.
- **Dynamic range `k`** is an *artistic* choice about the piece. If it only lives on the artist's
  device, every listener hears something different from what was intended.

**Recommendation:** store `k` with the soundscape (one column, artist-set in the editor, default
0.65); keep calibration device-local with a default. **This needs confirming** — it changes whether
Phase 2 touches the schema for one field or two.

### 5.4 Areas

Areas are ambient beds and correctly use no panner. The physical point-source model does **not**
apply to them — you don't get quieter walking into a forest. Their existing depth-weighted
crossfade with a 5 m edge fade is right.

Future opportunity, **not to be built now**: areas may need a level control to sit correctly
against waypoint sources of very different loudness (a whisper inside a traffic bed vs a gunshot
inside the same bed). Structure the data so this can be added; do not implement it.

---

## 6. Known problems with the model itself

**Gunshot pins the limiter for ~800 m.** With `k = 0.65` and `calibration = 0.25`, anything above
about 82 dB at the listener saturates the soft limiter. Solving for a 140 dB source:

```
140 − 20·log10(d) = 82   →   d ≈ 794 m
```

So a gunshot has *no distance dynamics at all* until nearly 800 m away. Jackhammer (90 dB) only
limits inside 2.5 m, which is fine. Busker and below never limit.

Options — pick one:
- Add a lower preset, e.g. *gunshot (distant)* at ~110 dB, and treat 140 dB as unrealistic for
  headphone playback.
- Per-source headroom, so very loud sources are scaled before the limiter.
- Accept it: a gunshot *should* be overwhelming, and the flattening is arguably correct.

**Inverse square alone over-predicts range.** Real sound at kilometres is limited by air absorption
and terrain, not by the inverse square law. Feature 14 already implements distance-based filtering
(air absorption) — the two need to be reconciled rather than double-counted. A maximum audible
range per preset may be the pragmatic answer.

**Near-field singularity.** `20·log10(d)` diverges as d → 0. Clamp with `d_near`; suggest **0.5 m**
(arm's length) so leaning into a source doesn't produce infinite gain.

---

## 7. Reverb bands will wake up

`spatial_audio.js` ~1896-1899 defines four distance bands:

| Band | Range | Wet mix |
|---|---|---|
| close | 0-10 m | 0.30 |
| medium | 10-30 m | 0.60 |
| far | 30-60 m | 0.85 |
| distant | 60 m+ | 1.00 |

Because gain currently hits zero at 40 m, **the distant band is unreachable and the far band only
exists between 30 and 40 m.** Two of the four bands have never been heard.

Once sounds carry to hundreds of metres, both far bands activate for the first time. Expect distant
sounds to become much wetter than anything previously experienced, and expect to retune these four
numbers. Note they are absolute distances, not relative to the source's own scale — "full wet at
60 m" may be right for a busker and wrong for a gunshot.

---

## 8. The four hand-written INSERT statements

`api/repositories/SoundScapeRepository.js` writes waypoints and areas with explicit column lists
and separately-written value arrays, at approximately lines **113** and **204** (waypoints) and
**138** and **240** (areas). Two operations — create and replace — each with two tables, hence four.

Adding a column means editing **both** the column list and the value array, in the same position,
in all four places. The failure mode is not a crash: if the lists drift out of step, a value lands
in the wrong column silently, or the insert fails at *save time on a phone in the field* rather
than at deploy time.

Mitigation: add new columns last, and after the change save a walk and read the row back from the
database rather than trusting the UI.

`api/repositories/WaypointRepository.js` (~92-94) and `AreaRepository.js` (~77-79) have their own
row-mapping objects — separate places to update.

---

## 9. Scope

Nine live files plus schema and one migration. Roughly 250-400 lines.

| Layer | Change |
|---|---|
| `api/database/schema.sql` + new migration | `source_level` on waypoints and areas; volume default 0.8 → 1.0; possibly `dynamic_range` on soundscapes (§5.3); possibly `source_kind` (§5.2) |
| `api/models/Waypoint.js`, `Area.js` | constructor, `fromRow`, `fromJSON`, both serialisers — ~6 places each |
| `api/repositories/*` | §8 |
| `api/routes/soundscapes.js` | Probably nothing; confirm it passes objects through |
| `map_editor.html` / `map_editor.js` | Preset dropdown + two sliders under volume on both panels; form read ~2283, populate ~2545-2548 and ~2656-2657, defaults ~542/~806 |
| `map_shared.js` | `soundConfig` defaults ~103, config build ~794/~815, popup ~932, prompt editor ~969, simulator ~1484-1487 |
| `spatial_audio.js` | **Core:** both `updateGainByDistance` implementations (~755 oscillator, ~931 sample), panner config (~637-643, ~1149-1153), reverb bands (~1896) |
| `spatial_audio_app.js` | Config pass-through (~191, ~240-269, ~370, ~510, ~770, ~951-975, ~1098, ~1464, ~1524, ~1598, ~1836, ~2074) and zone calc (~1159-1360) |
| `map_player.js` | Config pass-through ~1067, area popup ~370 |
| Player settings UI | New: calibration control, persisted device-locally |

---

## 10. Phased plan

Each phase is independently shippable and independently revertible.

**Phase 0 — engine only. No schema, no editor, no persistence.**
Neutralise the panner's distance attenuation (set `rolloffFactor = 0`, keeping HRTF for direction)
and replace the quadratic fade with inverse-square. Leave `volume` and `radius` semantics untouched.
Two files: `spatial_audio.js`, and `spatial_audio_app.js` only if the pass-through blocks it.
**This alone should fix the faintness complaint.** Verify on a walk before continuing.
Then listen at distance and retune the reverb bands (§7).

**Phase 1 — source presets, in memory only.**
Add the preset dropdown and custom dB field to the editor panel. Do not persist. Confirms the
gunshot-vs-conversation behaviour is what the artist wants before anything is stored.

**Phase 2 — persistence.**
Fix the migration runner first (see below). Then schema, models, repositories, and the save path.
Verify by reading a row back from the database (§8).

**Phase 3 — load radius and cutoff.**
Derive the load radius (§5.1), retire the acoustic hard cutoff, and resolve the artificial-source
override. Highest risk; verify lazy loading on a real walk with sounds near and far.

### Blocking issue for Phase 2

**The migration runner is broken.** The 2026-11-08 deploy logged:

```
Running migration: 003_create_areas_table.sql... [FAILED]
Migration Error: psql: ... FATAL: Peer authentication failed for user "postgres"
✅ Database migrations completed
```

A failure followed by a green success. Either fix the authentication or plan to apply the migration
by hand. Do not trust the script's summary.

---

## 11. Verification

A browser demonstrator was built 2026-11-08 at `scratch/loudness-demo/index.html` (gitignored,
disposable). It implements all three models — current, radius-based, physical — with a distance
slider, a walk-past animation, an ambient noise bed, the dynamic-range and calibration knobs, and a
limiter indicator. It models the arithmetic only, not the live engine.

If it has been deleted, the constants in §2 and the formulae above are sufficient to rebuild it.

**Phase 0 acceptance:** standing 20 m from a waypoint, the sound is roughly 20 dB below its level
at 1 m — not 33 dB — and remains faintly audible well past 40 m rather than cutting out.

---

## 12. Relationship to Feature 17

Feature 17 (Distance Envelope) solved the same problem with a hand-authored three-zone curve:
fade in, sustain plateau, fade out. That work is complete-ish but abandoned on a local branch,
seven months diverged, and it is **not** in the deployed code.

The physical model is preferred because one honest number per source replaces a curve the artist
has to draw, and because carrying distance becomes derived rather than configured.

The envelope is not worthless: its sustain plateau is an *artistic* option that physics does not
offer, and its framework design (base class handling smoothing, caching and validation, thin
subclasses per effect) is the right shape if distance ever drives reverb or filtering as well as
level. Treat it as a possible future per-waypoint override, not as the model.

**Before deleting that branch and its stash:** extract the spec and the preset design. They are the
only parts that are neither stale code nor 2.9 GB of accidentally committed audio. See the note in
QWEN.md under *Planned Features*.

---

**Last updated:** 2026-11-08 — design agreed, measurements taken, nothing implemented.
