# Feature 28 — Moving Sources on Drawn Tracks

**Status: 🔵 PROPOSED — NOT AUTHORISED. Nothing is built, nothing is persisted, nothing has been
heard. One prerequisite — the session clock — is being built separately and is recorded in §10.**

| | |
|---|---|
| **Version** | v1.0 |
| **Written** | 2026-11-16 |
| **Depends on** | The session clock (§10). Feature 23's fetch-distance derivation is affected (§6) |
| **Supersedes part of** | The "Sound Walk Composer" entry in the planned-features list — see §11 |
| **Prior art** | GeoBuzz *Movement Path*; Valve Steam Audio and Google Resonance Audio for Doppler |

---

## 1. What it is

A **track** is a freeform line drawn on the map. A waypoint can be attached to one track and travels
along it at a stated speed. Many waypoints may share one track. A waypoint has **zero or one** track.

Speeds span a wide range on purpose: from a source creeping like the minute hand of a clock, to one
moving fast enough to be heard passing.

---

## 2. The owner's stated shape, recorded verbatim in intent

- The track is a **line**, drawn freeform on the map.
- A track is **assigned one or more waypoints**.
- **Velocity belongs to the waypoint-and-track relationship**, not to either alone — so two waypoints
  on the same track may move at different speeds.
- A track may carry **many** moving waypoints; a waypoint travels on **0 or 1** tracks.
- Speeds range from **very slow** (minute hand) to **fast enough to produce a Doppler effect**.

⚠️ **The "0 or 1" constraint is what makes this tractable.** It means no many-to-many join — just an
optional reference from a waypoint to a track, plus a speed and a behaviour. Do not relax it without
re-estimating.

---

## 3. What is easy, and what is not

| Part | Difficulty | Why |
|---|---|---|
| **Rendering a moving source** | Trivial | The renderer already takes a position every frame. A moving source is only a position that changes |
| **Drawing the line** | Low | The editor already draws freeform areas; a line is the same tooling with a different geometry |
| **Walking a point along a polyline** | Low | Arc-length interpolation over the drawn vertices, with optional smoothing at corners |
| **A time base** | **Architectural** | Nothing keeps time today. See §4 |
| **Loading and unloading a moving source** | **Hard** | The whole fetch/dispose machinery assumes only the listener moves. See §6 |
| **Persistence** | **Hard, and the real cost** | A new kind of entity plus a relationship. See §7 |
| **Editor UI and simulator preview** | Medium | The simulator moves the walker today; it has never animated a source |
| **Doppler** | Low to implement, see §8 | But it only matters above real speed, and it is wrong for music |

---

## 4. 🔴 The clock, and why it must be global

The obvious approach — start a timer when a source begins playing — **breaks immediately**, because
sources are disposed and reloaded as the listener moves in and out of range. A moving waypoint that
left range and came back would restart from the beginning of its track.

**The design that works: one clock for the whole piece, and a moving waypoint's position is a pure
function of that clock.** No per-source state to lose, so disposal costs nothing, and two waypoints
on the same track stay in phase with each other automatically.

The same clock is what coordinated music needs (Feature 24). It is being built as its own step —
see §10.

---

## 5. Open decisions

| # | Question | Options | Note |
|---|---|---|---|
| 1 | **What does a moving source's radius mean?** | The radius is today both the loudness control *and* the load lifecycle, and the map draws it out to the audible edge | A source travelling 2 km has no meaningful single circle. Most likely the radius stays as loudness, and the load lifecycle follows the moving position instead — **which changes what radius means** |
| 2 | **Does motion continue while the listener is far away?** | Global clock (yes) vs. only in range | **Global clock.** It makes position a pure function of time, so disposal is free. Anything else reintroduces §4's bug |
| 3 | **Speed, or cycle duration?** | m/s, or seconds per lap | **Pick one.** GeoBuzz offers both, which is redundant — one determines the other once the track length is known. Speed is what the owner described |
| 4 | **Behaviour at the ends** | Forward and stop / loop / ping-pong | GeoBuzz offers Forward, Backward and Ping-Pong. Loop and ping-pong are the useful two |
| 5 | **When does motion begin?** | At playback start, or when the listener first arrives | At playback start — consistent with §4's global clock, and it means the source is somewhere definite whenever you arrive |
| 6 | **Do waypoints on a track still trigger on proximity?** | Track motion replaces triggering, or coexists with it | Needs a ruling. A moving source may pass through another waypoint's circle |

---

## 6. Loading a moving source is a different problem

Today the fetch distance is derived from **download time × walking speed + margin** — it buys lead time
based on how fast the *listener* approaches. That assumption is now wrong in both directions:

- A source approaching at 30 km/h closes the gap far faster than a walking listener, so it would
  arrive before its file had landed.
- A source moving away needs no lead at all.

**The lead calculation must use the closing speed** — the rate at which the distance between listener
and source is actually changing — not the walker's speed alone. Note this needs a *predicted* closing
speed, since both are moving.

Two further traps already recorded elsewhere in this project:

- **Disposal during a download** was a real crash, fixed 2026-11-14 by refusing to tear down a source
  that is still loading. A moving source crosses range boundaries far more often, so that path gets
  exercised much harder.
- **A source is registered before its file finishes downloading.** A moving source can travel a long
  way during a slow download, so the position it is registered at may be stale by the time it plays.

⚠️ **A moving source that is disposed and reloaded must resume from the clock, not from where it
stopped.** This falls out of §4 for free if position is a pure function of the clock — and breaks if
it is ever implemented as per-source state.

---

## 7. Persistence

A track is a **new kind of entity** with its own identity and vertices, plus a relationship from a
waypoint carrying speed and behaviour.

🔴 **Follow `DATABASE_COLUMN_ADDITION_GUIDE.md` end to end.** This project has lost a persisted field
at nearly every hop, at least once each: the database, the server model, the repository's read *and*
write path, the wire format and route (the route reads camelCase while the client sends snake_case),
the client model and its response whitelist, the editor's export-to-file whitelist, and the player
applying it. Then **restart the API process by hand** — the deploy uploads the server files, checks
only that a process manager is running, prints a green OK, and restarts nothing.

🔴 **Do not build this in memory only.** That is exactly how the *contained* waypoint kind was
shelved: built, never persisted, so it silently vanished on reload. If a stage of this feature cannot
persist, say so loudly in the handover rather than shipping something that looks finished.

**Vertices:** a freeform line may carry many points. Decide whether they are stored as a list on the
track or as a GeoJSON geometry, and whether the track is smoothed on the way in or on the way out.
Smoothing at draw time is cheaper at runtime and keeps the drawn line and the travelled line
visually identical.

---

## 8. Doppler

Small to implement — it modulates playback speed by the radial velocity — but three things to know:

**It only matters when the source is genuinely fast.** At walking pace the pitch shift is around
0.4%, inaudible. Around 35 km/h it is roughly 3%, about half a semitone. So the minute-hand case gets
nothing from it, which is correct: a real minute hand has no Doppler either.

⚠️ **It changes pitch, which is wrong for music.** A moving band would go out of tune as it passed.
Right for a vehicle, a siren, a train. **Make it per source, never global**, and default it off.

🔴 **It collides with an existing deliberate behaviour.** Every source already receives a small random
speed variation, chosen once when it is created, so that loops do not sound mechanical. Doppler
modulates the same control. The two must be combined deliberately, not left to fight. Note also that
the existing variation is why two waypoints carrying parts of one piece drift against each other —
any time-locked source must have it suppressed (see §10).

---

## 9. Prior art

**GeoBuzz has exactly this feature.** Its *Movement Path* attaches a sound to a path with a speed in
metres per second, a total cycle duration, and a behaviour of Forward, Backward or Ping-Pong. Paths
are first-class elements that sounds reference, so many sounds share one path — the same shape as §2.
It can also simulate movement along a path in the editor, which is the preview capability §10's
simulator work would need.

Its *Relative Speed* path property is a speed multiplier applied when the **listener** is on the path,
which is a different idea and not needed here.

🔴 **Caveat, stated plainly.** GeoBuzz's documentation and source were read; **it was never run.**
Nothing here is evidence about how its motion sounds.

---

## 10. Staging

| Stage | What | Cost | Gate |
|---|---|---|---|
| **0** | **The session clock** — one time base for the piece. Being built now | Small | It is a prerequisite for everything below, and independently useful for coordinated music |
| **1** | One track, one waypoint, constant speed, **hard-coded in the simulator, nothing persisted** | Hours | Does a moving source sound like anything at all? Same discipline as the width and directivity gates — do not persist before it has been heard |
| **2** | Persistence, editor drawing, speed and behaviour controls | **The expensive stage** | Round-trip test: draw, save, reload, confirm the track and its assignments survived |
| **3** | Many waypoints per track, loop and ping-pong | Medium | Falls out once stage 2 works |
| **4** | Simulator preview of motion | Medium | The simulator moves the walker today and has never animated a source |
| **5** | Doppler | Low | Only if something actually moves fast enough, and only for sources where pitch change is wanted |

**Stage 1 must not be skipped.** It answers the artistic question — is a moving source worth anything
in a site-based piece — before a schema exists.

---

## 11. Relationship to the planned "Sound Walk Composer"

The planned-features list carries a *Sound Walk Composer (Routes + OSRM)* entry estimated at about
four hours. **That estimate covers routing the *listener* along real streets, which is a different and
much smaller job.** Moving sources along drawn lines must not inherit it.

The two are related only in that both involve paths. Listener routing needs a street network and an
external routing service; this needs neither. They should be estimated and scheduled separately.

---

## 12. Do not do

- **Do not implement position as per-source state.** See §4 and §6 — it breaks on every reload.
- **Do not relax the "0 or 1 track per waypoint" constraint** without re-estimating.
- **Do not make Doppler global.** Per source, default off. See §8.
- **Do not let Doppler and the deliberate speed variation fight over the same control.**
- **Do not persist anything before stage 1 has been heard.**
- **Do not build stage 1 in memory only and call it done.** See §7.
- **Do not reuse the listener's walking speed for the fetch lead calculation.** See §6.

---

## 13. What is known, and what is inferred

| Claim | Status |
|---|---|
| Nothing keeps time today | **Recorded twice independently** — in the ensemble decision of 2026-11-09 and in the natural-spatial-sound audit. Verified by reading at the time |
| Sources drift against each other by up to ~half a second over four minutes | **Calculated** from the recorded ±0.02% speed variation, not measured with a clock |
| Rendering a moving source needs no new audio machinery | **Design statement.** The renderer already takes a position per frame. Not yet demonstrated |
| The fetch lead calculation is wrong for a fast source | **Reasoned** from the recorded formula (load time × walking speed). Not measured |
| Doppler figures (0.4% walking, ~3% at 35 km/h) | **Physics**, from the speed of sound. Not measured in this project |
| GeoBuzz's motion sounds good | **Unknown.** Never run, never heard |
| A moving source will be worth having in a site-based piece | **Unknown. No opinion recorded either way.** This is the entire purpose of stage 1 |

---

*End of Feature 28.*
