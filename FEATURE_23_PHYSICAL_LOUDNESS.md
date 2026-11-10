# Feature 23: Physical Loudness Model

**Status:** 🔨 Phase 0 implemented, deployed (stamp `20261109175443`) and **confirmed by ear in the
simulator** 2026-11-09 — a physical waypoint is heard about 40 m outside its circle, swelling
smoothly, with departure mirroring approach. **Still never verified on a walk.**
**Date:** 2026-11-08 (design) · 2026-11-09 (Phase 0)
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

### Decisions taken 2026-11-09 (Phase 0)

| # | Decision |
|---|---|
| 9 | **Phase 0 infers each source's level from its activation radius**: `L1m = ambient + 20·log10(radius)`. The radius an artist already drew is read as "audible out to here", so existing walks keep roughly their reach and only the *shape* of the falloff changes. Phase 1 replaces this with an artist-stated preset. A per-source `sourceLevelDb` override is already honoured if set, but nothing populates it yet. |
| 10 | **Near-field clamp `d_near` = 1 m**, not the 0.5 m suggested in §6. Roughly the closest anyone naturally stands, and it keeps a real sense of approach without an absurd peak. |
| 11 | **No hard cutoff.** Level falls continuously with distance, and a cosine fade over the last 20 m ends exactly where the lazy loader disposes the source, so disposal is never audible. Reach is therefore still capped by the load zones until Phase 3 — for a default 20 m waypoint that means audible to ~60 m instead of silence at 40 m. |
| 12 | **One listener control in Phase 0: louder/quieter on the player**, in 3 dB steps, ±12 dB, saved on the device only. The `calibration = 0.25` constant stays inside the model; the trim multiplies on top of it at the shared output stage, ahead of the limiter, so waypoint sources and area beds move together. |
| 13 | **Deferred, deliberately:** the gunshot limiter ceiling (§6) cannot bite until presets exist in Phase 1. The reverb bands (§7) are untouched and must be retuned *after* the walk test, not before. |

---

## 4. What each existing control becomes

| Control | Today | After |
|---|---|---|
| `volume` (0–1, default 0.8) | Peak of the fade curve — *is* the loudness | Trim multiplier after the model. Default **1.0**. Still 0 = mute. |
| `activationRadius` (default 20) | Acoustic range *and* load lifecycle *and* the map circle | **Load/attention radius only.** Acoustic range is derived. See §5. |
| — | — | **New:** source preset + custom dB |
| — | — | **New:** dynamic range `k`, calibration — player-side |
| `fadeZoneWidth` (areas, 5 m) | Edge fade | Unchanged |

**Note on decision 2 (0 = mute), 2026-11-09:** the code did not actually honour it. Five places read
a volume of 0 as "no value supplied" and substituted a default, so a muted waypoint or area played
at 80% — and in the editor's preview, at *full* volume, because the guard there was
`volume > 0.1 ? volume : 1.0`. All five are fixed. The saved data was never wrong: the client
payload, the API models and the repositories all use nullish defaults, so 0 survived the round trip
and only the read-back lied. This matters for Phase 0's walk test — a waypoint the artist had
"quieted" was in fact being played loudly, which is part of why levels sounded arbitrary.

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

**Partly overtaken by events, 2026-11-09.** One invariant is now enforced rather than proposed: *a
source goes silent exactly where it is fetched*. Walking out, it fades to nothing across the band
ending at the load boundary; walking back in, it is created silent at that same boundary and swells
up across the identical band. Disposal sits further out again, in silence, so it cannot be heard.
Before this, the fade ended at the *disposal* distance while loading began 20 m earlier, so a sound
that had been thrown away stayed inaudible until well inside the radius on the way back — reported
from the simulator as "it doesn't start until I'm entering the waypoint". The fade band also never
reaches inside the radius now, so it cannot eat into the circle where the sound is meant to be heard.

Consequence: the buffer preload margin went from 20 m to **40 m**, which keeps the audible reach
the same shape it was (fade from radius+20 to radius+40) while making approach and departure
mirror images. It also doubles the fetch lead time to roughly 30 seconds of walking. The
`minLoadRadius` / `maxLoadRadius` clamping proposed above is still Phase 3 work and still needed
once a source's level is stated rather than inferred.

### 5.2 Artificial sources

The artist wants oscillators and other unnatural sources with a hand-defined listening radius.
Proposal: a per-waypoint flag or a `source_kind` of `physical | artificial`. Artificial sources
skip the derived radius and use the manual value, and may want a different falloff entirely
(linear, or none). **Do not build this yet** — but do not let the schema or the model make it
impossible. Add the field now, implement later.

**Answered by the artist 2026-11-09.** There are two kinds of waypoint, and the physical model is
*not* being replaced:

| Kind | What it is | Falloff |
|---|---|---|
| **Physical** (the default for future soundscapes) | A sound happening in the world | The continuous curve from §2. No plateau, no edge. This is what Phase 0 built and it stays. |
| **Contained** — the "blue circle" waypoint | A zone that *holds* a sound; the natural home for oscillators and other unnatural sources | Silence outside. A fixed **3 m band** beyond the radius fades in on approach and out on departure, and inside the radius the level keeps rising to the configured volume at the centre. The band is a softening of that ramp, not a separate zone. |

So the 3 m band belongs to the contained kind only. It is not a revision of the physical curve, and
the two must not be conflated: a contained waypoint has an edge by design, a physical one has none.

Still open, and now blocking Phase 1 rather than Phase 3: the field that distinguishes them, its
name, its default for existing rows, and whether the contained kind also gets a source level in dB
or keeps a plain 0-1 volume. The contained shape needs no schema beyond the kind itself, so it can
be built as soon as the field exists.

**Built in memory 2026-11-09, not persisted.** The artist chose *"a peak you have to walk to"*, at
about 2% of the configured volume at the circle's edge. One quadratic runs from the full configured
volume at the centre to silence 3 m beyond the radius, so the band is the soft start of that ramp
rather than a separate zone:

```
gain(d) = volume · (1 − d / (radius + 3))²      for d ≤ radius + 3, else 0
```

No plateau, no hard edge, no infinite peak at the centre, and the configured volume is the level at
the centre — for this kind, `volume` is the peak itself rather than a trim on a physical level.
The load lifecycle is untouched: a contained source still loads 20 m out and is disposed 40 m out,
but it is silent beyond radius + 3 either way, so neither boundary is audible.

**Consequence of a fixed 3 m band: the edge level depends on the circle's size.** Measured, as a
percentage of the configured volume:

| Radius | At the edge | Halfway to the centre |
|---|---|---|
| 5 m | 14.1% | 47.3% |
| 10 m | 5.3% | 37.9% |
| 20 m | **1.7%** | 31.9% |
| 40 m | 0.5% | 28.6% |
| 100 m | 0.1% | 26.5% |

The requested ~2% is what a default 20 m circle gives. A small circle therefore has a much softer
edge and a large one a much sharper approach. If one consistent feel is wanted regardless of size,
the band has to scale with the radius (say 15% of it) instead of being fixed — a one-line change,
not yet made because the artist asked for a fixed 3 m.

Where it lives: the envelope and its 3 m band are in the engine next to the physical model; a source
carries a `falloff` of `physical` (default) or `contained`; the app layer passes it through from the
waypoint; and the editor's waypoint panel has a **Contained** checkbox, unchecked by default. It is
hidden for areas, which keep their own edge fade and depth crossfade. **The choice is not saved** —
there is no column for it — so every waypoint reverts to physical on reload. That is deliberate, per
the in-memory-first decision; persisting it is the schema change described above.

**The radius slider stays for both kinds** (artist's decision, 2026-11-09), because it means
something in both cases — just different things, so a hint under the slider says which is in force:

| Kind | What the radius is | Hint shown |
|---|---|---|
| Physical (Contained unticked) | How loud the source is and how far it carries, via the inference in decision 9 | "How far the sound carries before it fades out" |
| Contained (ticked) | The wall that holds the sound | "The circle that holds the sound" |
| Area | Not applicable — the slider is hidden | — |

This is a **deliberate departure from the spec's original plan**, which was the reverse: state what
the source *is* in dB and let the reach be derived, with the radius demoted to a loading detail.
Phase 0's stand-in inference happens to run the relationship the artist's way, so it stays. When
presets arrive (Phase 1) they should **move this slider**, not replace it.

An earlier pass hid the slider for physical waypoints and defaulted new ones to a 5 m circle; that
was reverted the same day, because with the radius driving loudness a 5 m default infers ~64 dB —
audible to about 5 m and ~8 dB quieter at the centre than the 20 m default. The default is **20 m**
everywhere: new waypoints, the panel's fallback, and the markup.

⚠️ **Still to watch:** this one number is both the acoustic reach and the thing that decides when a
sound is fetched (radius + 40 m). Normal circles are fine; a 500 m gunshot would try to load half a
kilometre away. That is what the `maxLoadRadius` clamp in §5.1 is for, and it is still Phase 3 work.

Verified by `scratch/verify-contained.js` (17 checks): the shape, monotonic approach, silence beyond
the band, the peak equalling the configured volume, a muted contained source staying silent,
degenerate radii, and a physical source still audible at 45 m where a contained one is silent.
Approach/departure symmetry is covered by `scratch/smoke-engine.js` (50 checks).

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

**Still open as of 2026-11-09.** It blocks Phase 1 (the first phase in which a source can be given a
level), not Phase 0 — Phase 0 infers every level from a radius the artist already chose, so nothing
can reach 140 dB yet.

**Inverse square alone over-predicts range.** Real sound at kilometres is limited by air absorption
and terrain, not by the inverse square law. Feature 14 already implements distance-based filtering
(air absorption) — the two need to be reconciled rather than double-counted. A maximum audible
range per preset may be the pragmatic answer.

**Near-field singularity.** `20·log10(d)` diverges as d → 0. Clamp with `d_near`; suggest **0.5 m**
(arm's length) so leaning into a source doesn't produce infinite gain.
**Resolved 2026-11-09: `d_near` = 1 m** (decision 10).

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

**As of Phase 0 (2026-11-09):** a default waypoint is now audible to ~60 m, so the *far* band is
fully in play and the *distant* band is only reached at the very end of the fade-out. None of the
four numbers has been touched — deliberately, so the walk test hears the unmodified bands and the
retuning is driven by what is actually heard rather than by guesswork.

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

**Phase 0 — engine only. No schema, no editor, no persistence.** ✅ **implemented 2026-11-09**
Neutralise the panner's distance attenuation (set `rolloffFactor = 0`, keeping HRTF for direction)
and replace the quadratic fade with inverse-square. Leave `volume` and `radius` semantics untouched.
Two files: `spatial_audio.js`, and `spatial_audio_app.js` only if the pass-through blocks it.
**This alone should fix the faintness complaint.** Verify on a walk before continuing.
Then listen at distance and retune the reverb bands (§7).

What actually changed, 2026-11-09 — four files, not two:

| File | Change |
|---|---|
| `spatial_audio.js` → **v6.3** | Model constants and four pure functions (`sourceLevelFromRadius`, `levelAtDistance`, `physicalGain`, `fadeOutMultiplier`). One `updateGainByDistance` on `OscillatorSource`, inherited by every source type — the duplicate on `GpsSoundSource` is deleted, so decision 6 is satisfied. `rolloffFactor = 0` in **both** panner setups (`SoundSource.init` had 1, `SampleSource.init` had 1.5 — they disagreed, which is why the two source types behaved differently). Gain is now ramped with `setTargetAtTime` instead of written per frame, and the computed target is kept on `lastComputedGain` for logging. New `SpatialAudioEngine.setOutputTrimDb()`. |
| `spatial_audio_app.js` → **v3.3** | New `_getDisposeDistance(sound)` is the single source of the disposal distance; `_getSoundZone` now derives its threshold from it and returns it. Both gain call sites pass it. Zone debug logs no longer claim a 20 m fade zone, and the un-throttled per-frame FADE ZONE line is gone. |
| `map_player.html` / `map_player.js` | Two icon-bar buttons (quieter/louder, 3 dB steps) and a **Level** readout in the status bar, persisted to `player_output_trim_db` on the device and applied after the engine is built. |

Two pre-existing bugs fixed in passing because they would have corrupted the walk test:

- The "initial gain" debug line read `sound.gainNode`, which does not exist, so it always printed
  `0.000`. It now reads the source's computed gain.
- `isFinite(null)` is `true` in JavaScript. The first cut of `fadeOutMultiplier` treated a null
  disposal distance as "dispose at 0 m" and silenced the source — which is what streams pass.
  Caught by the arithmetic check, not by reading.

**Found and NOT fixed (out of scope):** streams are never disposed. `ZoneConfig.stream` has no
`preloadMargin`, so `_getSoundZone` computes `unloadDistance` and `disposeThreshold` as `NaN` for
them, and `distance > NaN` is always false. A streamed source therefore stays in memory forever.
Pre-existing, unrelated to loudness, and `_getDisposeDistance` returns `null` for streams so the new
fade does not interact with it. Fix separately.

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
**It still exists.** An earlier note here claimed `scratch/` was empty on 2026-11-09 — that was
wrong: the folder is gitignored, so a file-pattern search skips it. List the directory instead.

**Phase 0 acceptance:** standing 20 m from a waypoint, the sound is roughly 20 dB below its level
at 1 m — not 33 dB — and remains faintly audible well past 40 m rather than cutting out.

### Phase 0 checks, 2026-11-09

Throwaway scripts in `scratch/` (gitignored, disposable), all requiring the real source files
through their `module.exports` branch — no browser, and no re-implementation of the model:

```
node scratch/verify-loudness.js    # 17 checks on the pure arithmetic, plus an old-vs-new table
node scratch/smoke-engine.js       # 36 checks driving the real methods against a stub AudioContext
node scratch/verify-volume-zero.js # 20 checks that a volume of 0 survives save → load → playback
node scratch/repro-area-volume.js  # runs one muted area through HEAD and the working tree
```

`repro-area-volume.js` exists because a bug was reported from the simulator — an area set to 0%
still played at full volume — and it settles which build was being heard. It extracts the committed
files with `git show HEAD:…` and runs the *same* area config through both. Result: the deployed code
builds the area source with gain **0.8** from a stored volume of **0**, reproducing the report; the
working tree builds it with **0** and the area is silent. Waypoints were never affected, because
their level is multiplied in on every frame rather than captured once when the source is created.

They cover: the near clamp, monotonic falloff, audibility past 40 m, silence at the disposal point
and not before, derived reach equal to the radius for 10/20/30/50 m, no NaN or Infinity from a
missing or zero radius, both panners reporting `rolloffFactor = 0`, oscillator and GPS sources now
agreeing at the same distance, a moved GPS source following its own position, `volume` behaving as
a trim with 0 still muting, and the trim clamping to ±12 dB and reaching the master gain.

Measured for a default 20 m waypoint (inferred level 76 dB at 1 m, disposed at 60 m), gain relative
to standing 1 m away:

| Distance | Old model | New model | Old gain | New gain |
|---|---|---|---|---|
| 1 m | 0 dB | 0 dB | 0.761 | 0.570 |
| 5 m | −18.8 dB | −9.1 dB | 0.088 | 0.200 |
| 10 m | −27.8 dB | −13.0 dB | 0.031 | 0.128 |
| 20 m | −41.0 dB | **−16.9 dB** | 0.0068 | 0.081 |
| 30 m | −56.6 dB | −19.2 dB | 0.0011 | 0.063 |
| 40 m | silent | −20.8 dB | 0 | 0.052 |
| 50 m | silent | −28.1 dB | 0 | 0.022 |
| 60 m | silent | silent (disposed) | 0 | 0 |

The acceptance criterion is met in arithmetic — 24 dB more at 20 m, audible to ~60 m instead of
cutting out at 40 m. **It is not yet met in the field.** Note the close end is slightly *quieter*
than before (0.57 vs 0.76 at 1 m): that is the dynamic range being spent on distance instead of on
proximity, and it is what the louder/quieter control is for.

Still to be judged by ear on a walk, and deliberately not pre-tuned: the four reverb bands (§7),
now that the far and distant bands are reachable for the first time — outdoor `maxWet` is only
0.15, so the wet levels may turn out to be far too subtle at 60 m rather than too strong.

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
