# Feature 25: Natural Spatial Sound — Audit and Re-baseline

**Status:** 📋 Reference document and audit. **Three items have been built:** the master limiter
(decision 8), the listener-position repair (F10), and the per-waypoint muffling rescale with its
floor set to 1400 Hz (decisions 12 and 13). **All three are now live.** The position repair is
walk-confirmed; the limiter and the muffling rescale are deployed but have never been walked.
Deploy verified 2026-11-13 by downloading the two live audio files and reading the values out of
them — ceiling −3 dB at 20:1, and a floor of 1400 — not by trusting a timestamp or a deploy log.
The muffling rescale was deployed *before* it was committed; that gap is closed by `77573bb`.
Everything else is unbuilt.
**Date:** 2026-11-11, re-baselined 2026-11-12 after two walks, updated 2026-11-13
**Supersedes:** nothing. Re-frames Feature 23 around a single objective.
**Owner's objective, in their words:** *"What I want is natural sounding spatial sound."*

> **⚠️ Read F10 before trusting any perceptual claim in here.** The listener position trailed
> the walker by about twenty seconds until 2026-11-12, and could latch there for a whole walk.
> Every distance-driven observation from the walks of 2026-11-11 and early 2026-11-12 was made
> against a stale position. F5 is retracted outright.

---

## 1. Why this document exists

Feature 23 replaced a hand-written fade with a physical loudness curve, and a walk on
2026-11-11 confirmed the level is now much better. But the same walk turned up three things
that have nothing to do with level:

- ~~the sound source appears to move around while the listener stands still~~ — **resolved
  2026-11-12.** Not heading (F5, retracted). The listener position was trailing the walker by
  about twenty seconds (F10). Fixed and confirmed on a walk;
- a recorded-music waypoint on a 100 m circle turned audibly duller and washier over the
  outer part of its reach, then stopped changing altogether — **needs re-testing against a
  correct position**;
- a bell sounded like it was coming from overhead — **still open** (F6).

The owner's read is that repeated tweaks, each fixing a reported symptom, have moved the
implementation away from the original objective. That is a testable claim, and this document
is the test: first an inventory of everything that currently shapes what a walker hears, then
an assessment of which parts serve "natural" and which serve something else.

**The tension to hold onto.** There are two competing standards, and the implementation
currently mixes them without saying which it is following:

| | Hard science | Subjective perception |
|---|---|---|
| Goal | reproduce what a real source at that distance would do at the ear | make the walker *believe* the source is over there |
| Fails when | the physics is right but the cue is too weak to hear | it sounds convincing but the distances are meaningless |
| Used by | the loudness curve, the air-absorption concept | the dynamic-range compression, the calibration constant, the radius inference |

Neither is wrong. But a stage that is justified by physics cannot then be overridden by a
stage justified by perception without someone deciding which one wins. Right now that
decision is made implicitly, one tweak at a time. **§5 lists the places where the two
currently contradict each other.**

---

## 2. What currently exists

Everything below was read out of the shipping code on 2026-11-11, not recalled. Read it as
the path a sound takes from its file to the walker's ear.

### 2.1 Level

| Stage | What it does | Values | Physics or choice? |
|---|---|---|---|
| Source level | Each waypoint is described by one number: its real-world loudness 1 m away | Inferred, not stated: `50 dB + 20·log10(radius)`. A 20 m circle → 76 dB; a 100 m circle → 90 dB | Choice. Phase 0 stand-in until presets exist |
| Distance law | Level at the listener falls with distance | `level − 20·log10(distance)`, clamped so it stops rising inside 1 m | Physics (inverse square) |
| Dynamic range | Only part of the real loudness range is kept | 0.65 of it, measured against a 65 dB reference | Choice. Deliberately un-physical |
| Calibration | Converts the physical level into an output level | 0.25 | Choice |
| Waypoint volume | The artist's per-waypoint trim | 0–1, default 1.0, multiplied on top. 0 is a real mute | Choice |
| Final fade | A soft band so the sound ends where it is fetched rather than clicking off | Cosine over the last 20 m before the silence point | Choice |
| Smoothing | The level glides instead of stepping, so GPS jitter is not audible | 0.1 s time constant. The first application snaps; later ones glide | Choice |

Net effect for a default 20 m waypoint, as a fraction of the level at the centre:

| Distance | 1 m | 5 m | 10 m | 20 m (circle) | 40 m | 60 m |
|---|---|---|---|---|---|---|
| Level | 100% | 35% | 22% | 14% | 9% | silent |

For a 100 m waypoint the same shape is stretched: most of the fall happens inside the first
third of the reach, and the outer 60 m covers only a few dB.

### 2.2 Timbre — air absorption

A muffling filter whose cutoff falls in a straight line with distance and then stops:

| Distance | 0 m | 20 m | 40 m | 60 m | 80 m and beyond |
|---|---|---|---|---|---|
| Highest frequency still passing | full range | ~15 kHz | ~10.5 kHz | ~5.8 kHz | ~1 kHz, fixed |

**The scale is absolute — 80 m for every waypoint, whatever its size.** That is the direct
cause of the 100 m observation in §1: the filter reaches its floor 20 m *inside* the circle
and then changes no more across the remaining 60 m of reach.

### 2.3 Space — reverb

A wet/dry split whose wet amount rises with distance, in four bands with hard edges:

| Band | 0–10 m | 10–30 m | 30–60 m | 60 m+ |
|---|---|---|---|---|
| Wet mix, outdoors | 4.5% | 9% | 12.75% | 15% |

Three things about this that are not obvious:

- **The bands are absolute metres**, like the muffling, so for a 100 m waypoint all three
  edges fall inside the circle and everything beyond 60 m is pinned at maximum.
- **The edges are steps, not slopes**, and the wet level is written directly with no
  smoothing. Crossing 10 m, 30 m or 60 m is an abrupt change.
- **The reverb itself is always the same 0.25 second tail.** Five environments are defined
  (outdoor, indoor, large, cave, urban) and each carries a decay figure — but the decay
  figure is computed, returned, and never used. The five environments differ **only** in how
  loud the wet path is, never in how long the tail is. A 0.25 s tail is a small-room
  ambience; it is not an outdoor space and not a cathedral.
  **And nothing can select them.** Added 2026-11-13: the setter has zero call sites anywhere in
  the project, so every walk has always run the default, outdoor. The other four are unreachable.

### 2.4 Direction

| Stage | What it does | Note |
|---|---|---|
| Spatialiser | Binaural model, direction only | Its own distance attenuation is switched off, so it cannot fight the level curve |
| Source height | Never set | Every source sits at ear height on a flat plane. **Nothing in the system ever asks for "above"** |
| Listener direction | Comes from the compass | Assigned straight through. No averaging, no damping, no lock |
| Listener position | Comes from GPS | Averaged over three readings, locked after 1.5 s within 30 cm, unlocked at 60 cm of movement, then smoothed again at 60% per reading when moving and 5% when still. **See F10** — the movement detection here was broken until 2026-11-12 |

**The asymmetry noted in the first version of this audit was a false lead, and is retracted.**
It claimed that because heading is damped not at all while position is damped twice, a compass
wobble must be what makes the source appear to move. Two walks contradict it: the soundfield is
steady when the walker stands still, and heading follows a turn immediately. **The real cause was
the position path, not the heading path — see F10.** Do not revive the heading stabiliser on the
strength of this section.

There is also a heading stabiliser already written — it blends the direction of travel with
the compass and switches between them on variance — that has never been switched on. There is
now no evidence that it is needed.

### 2.5 Output

The whole mix passes through one master stage before it reaches the headphones:

| Stage | Setting | Consequence |
|---|---|---|
| ~~Output trim~~ | ~~Device-saved, ±12 dB in 3 dB steps, default 0~~ | **Removed 2026-11-13**, implementing decision 4. The player's two buttons and the Level field are gone, the stored value is cleared on load and no longer read, and the shared mix bus stays at unity. |
| Limiter | Ceiling at −3 dB, hard knee, 20:1, 1 ms attack, 100 ms release | Catches clipping only; leaves the loudness curve untouched below the ceiling |

**Why removing the trim was the right order of operations.** The trim sat *ahead* of the limiter and
the phone's own volume sits *after* it. Pushing the trim up drove the mix into the ceiling, which
flattens exactly the loudness dynamics the physical model exists to guarantee — so the one control
the listener had was the one that could break the model's central promise, and it did so invisibly,
because pressing "louder" four times stops making peaks louder and starts crowding everything else
underneath. The phone's volume cannot do that at any setting.

A second consequence, and the reason this was done before the meter below: with no device trim,
every listener sits at unity ahead of the ceiling, which is what the editor's simulator runs. A
ceiling reading taken in the simulator is therefore true for any phone at any volume.

**Changed 2026-11-12.** This stage was a compressor — starting at −6 dB with a 12 dB knee at
4:1 — and it was doing dynamic-range work that the loudness model also does. Measured from the
model's own arithmetic: a default 20 m waypoint at its centre reaches about −5 dB, and a 100 m
waypoint at its centre reaches about +4 dB, so both were above where it started working, and the
soft knee meant it was already acting well below that. Because it sat on the shared bus, **how
much one sound was squeezed depended on how many other sounds were loud at the same moment**,
so a source's level was not a function of its own distance alone — precisely what the model was
built to guarantee. It now limits instead of compressing. See F1.

**What to expect on the next walk:** the mix will be louder and more dynamic, because nothing
below −3 dB is being touched any more. The piece's overall level may need re-checking, and a
very loud source will now pin the ceiling rather than being gradually squeezed.

### 2.6 Lifecycle — not acoustic, but it decides what you can hear

| Event | Distance, for a radius-*r* file waypoint |
|---|---|
| Fetched, started silent | *r* + 40 m + the download lead — about *r* + 119 m on the assumed defaults |
| Fade to silence completes | *r* + 40 m — **unchanged by Phase 3, and that is the point** |
| Thrown away | fetch + 20 m, so about *r* + 139 m |

**Changed 2026-11-13 (Feature 23 Phase 3).** Fetching and going silent used to happen at the same
distance, which meant the download only started at the moment the sound became audible — the 40 m
band was doing double duty as both the fade and the download lead. They are now separate: the fade
still ends at *r* + 40 m, so **nothing about what the walker hears moved**, and the fetch happens
further out by however long the file needs. The lead is the owner's formula — load time × walking
speed, plus a margin, capped at 400 m — estimated from an assumed 5 MB at ~1 Mbit/s because the
soundscape definition carries no file sizes. A soundscape already downloaded for offline play needs
no lead at all, so its fetch collapses back onto the silence point.

Note what this does and does not fix about F7: the download lead is now derived from the file rather
than from the radius, but the radius still sets the loudness, the map circle, and the silence point
the lead is measured from. Three jobs became two and a half.

### 2.7 Small print

- Every file source gets a random playback speed within ±0.02%, chosen once when it is
  created, so loops do not sound mechanical. Two waypoints carrying the same file therefore
  drift against each other by up to about half a second over four minutes.
- Areas are ambient beds. They have no distance model of their own, no spatialiser, and use
  a depth-weighted crossfade with a 5 m edge fade instead. Nothing in §2.1–§2.3 applies to
  them except the master output stage.

### 2.8 The contained waypoint — SHELVED

A second kind of waypoint exists that holds its sound inside the circle: a peak at the
centre falling to silence 3 m beyond the radius, with the radius meaning "the wall that holds
the sound" rather than "how far it carries". It is built in memory and in the editor's
waypoint panel, but **it has never been persisted** — there is no column for it, so every
waypoint reverts to physical on reload, and a phone has therefore never seen one.

**Shelved by the owner on 2026-11-11.** It stays in the code, unreached and unpersisted, and
no further work goes into it. Everything below assumes the physical kind only. If it is ever
revived, note that the muffling and reverb scales in §2.2–§2.3 make no sense for it: a
contained waypoint is a place you stand inside, not an object you approach, and scaling
timbre to a 3 m band would take it from fully bright to maximally dull in three steps.

---

## 3. Does the system provide the cues the ear actually uses?

Distance over headphones is judged from five things. This is the honest scorecard, and it is
the core of the "have we strayed" question.

| Cue | How the ear uses it | What we currently do | Verdict |
|---|---|---|---|
| **Level** | Louder = closer — but only if you know how loud the thing is | Physically derived, then reduced to 0.65 of the real range. The master stage now limits rather than compresses, so it no longer flattens it | Present, but ambiguous by nature. **Was also being compressed on the master bus — fixed 2026-11-12, not yet heard** |
| **Spectral balance** | Air removes highs; this is the strongest cue for a familiar sound like music | Present, but on a fixed 80 m scale that saturates inside any large waypoint | **Broken for large waypoints** |
| **Direct-to-reverberant ratio** | The strongest cue indoors; weak outdoors because outdoors has almost no reverberation | Present at 4.5%–15% wet with a 0.25 s small-room tail | Weak outdoors, and the tail's character is wrong for open air |
| **Motion parallax** | Turning your head changes a real source's direction and level; this is how you resolve front/back confusion | Turning changes direction only — level depends on distance, which turning does not change | Partially present. **This is the likely reason a bell sounds overhead**: the binaural model cannot distinguish ahead from behind from above on the median plane, and head-turning is the normal way the ear resolves that |
| **Familiarity** | You know how loud and how bright a bell, a voice or a bus is supposed to be | Nothing uses it | Not available to us |

Two conclusions worth acting on:

1. **The cue we are leaning on hardest — level — is the weakest one we have**, because it is
   ambiguous without knowing the source. It was also being flattened by two stages; one of those
   (the 0.65 fraction) is a deliberate artistic choice, and the other (the master compressor) was
   removed on 2026-11-12.
2. **The cue that would help most — spectral balance — is the one that is broken** for
   anything larger than a default circle. Fixing it is cheaper than fixing level, and it is
   what the owner already asked for ("that effect should be used across the entire waypoint").

---

## 4. Findings — where the implementation has strayed

Ordered by how much each is likely to cost the objective.

**F1. ✅ RESOLVED 2026-11-12 — the master compressor undid the model's dynamics.** Verified by
arithmetic in §2.5. Every source close enough to be loud was being compressed, and the amount
depended on its neighbours. This was the single largest gap between "the level is computed
physically" and "the level you hear is physical". It had been added for a legitimate reason —
stopping several sources from clipping — but a limiter and a compressor are not the same tool,
and what was fitted was a compressor with a soft knee and a moderate ratio, which is a mixing
device. **Replaced with a limiter** (ceiling −3 dB, hard knee, 20:1, 1 ms attack, 100 ms
release). The owner ruled on this on 2026-11-12, resolving contradiction C3. **Not yet heard on
a walk** — the level of the piece may need re-checking, since nothing below the ceiling is
being touched any more.

**F2. Muffling and reverb are on fixed metre scales while loudness is per-waypoint.** Verified
in §2.2–§2.3. For a 20 m circle the three scales happen to line up. For a 100 m circle both
saturate well inside the reach, leaving the outer half with no distance information at all —
a uniform dull wash whose level barely moves. **This is the best available explanation for
both "floaty" and "the muffling shift near the perimeter", and it predicts that small
waypoints sound more natural than large ones.** Not yet confirmed by a controlled listen.

**F3. The five reverb environments are one environment with five volumes.** Verified — the
decay figure is dead data and the tail is always 0.25 s. Choosing "cave" or "outdoor" changes
how much reverb there is, never what it sounds like.

**F4. The reverb steps instead of sliding.** Verified. Four hard edges, written with no
smoothing. Whether this is audible at 4.5%–15% wet outdoors is untested — it may be
inaudible, in which case it is a code-quality issue and not a perceptual one.

**F5. ❌ RETRACTED 2026-11-12 — "heading is undamped while position is damped twice" was not the
cause of the moving source.** The code claim in §2.4 is still accurate — heading really is
assigned straight through with no averaging, no damping and no lock, at up to ten updates a
second. But the *inference* drawn from it was wrong, and two walks contradict it:

- Standing still and turning ninety degrees, the compass readout responds immediately and stays
  steady, and the sound follows the turn promptly. An undamped compass should have made the
  soundfield wander while standing still. It does not.
- Turning while walking took about five seconds to correct — which a straight pass-through
  cannot produce, so the delay was never in the heading path at all.

**The real cause was the listener position trailing the walker. See F10.** The heading stabiliser
that has never been switched on should stay switched off; there is no evidence it is needed, and
decision 7 in §6 is now void.

**This is the second time a plausible mechanism was recorded here without being reproduced.**
It was ranked as the likely cause of a symptom nobody had instrumented, and it sent the sequence
in §8 after the wrong fix.

**F6. Nothing provides elevation, yet a bell sounded overhead.** Verified that no elevation
is ever computed. The overhead impression is therefore either binaural ambiguity on the
median plane (see the motion-parallax row in §3) or the recording itself — bells are usually
recorded from below, at a distance, with a great deal of their own reverberation, which is
itself an "up and far" cue. **Untested.** Two listens would split it: the same bell with
spatialisation off, and a dry close recording with spatialisation on.

**F7. The radius carries three unrelated jobs.** Verified in §2.6. Loudness, map circle size
and download trigger all come from one number, so changing any one of them changes the others.
The spec already flags this as blocking later phases: a 500 m circle would try to download a
file half a kilometre away.

**F8. Accumulated fixes have moved the geometry twice.** Recorded, not a defect. The final
fade originally ended where the source was thrown away, so a sound that had been discarded
stayed inaudible well inside the circle on the way back; it was moved to end where the source
is fetched, and the download margin doubled from 20 m to 40 m to keep the audible reach the
same. Both were correct fixes to real symptoms. The point of recording them is that **the
40 m band is a consequence of a loading constraint, not an acoustic decision** — and §3
suggests it is doing acoustic work anyway, because it is where the sound appears from.

**F9. The contained kind is half-built and unpersisted.** Now shelved. The cost of leaving it
in place is that the editor shows a control that does nothing after a reload. That should
either be hidden or clearly marked, so a future session does not rediscover it and assume it
works.

**F10. ✅ FIXED 2026-11-12 — the listener position trailed the walker by about twenty seconds,
and could latch there for the whole walk.** Found on the walk of 2026-11-12, not in this audit;
it is recorded here because it invalidates the perceptual evidence behind several other
findings.

**The mechanism.** The second smoothing layer decided whether the walker was moving by dividing
the gap between the smoothed and the reported position by the time since movement was last
detected. That gap has a ceiling — at walking pace with the stationary smoothing setting it
saturates around 27 m — while the denominator grows without bound for as long as the walker
stands still. To be detected as moving, the gap had to exceed half a metre *for every second
spent standing*. After about a minute of standing still, the gap could never reach the trigger
again, so heavy smoothing stayed on for the rest of the session.

**The evidence.** A throwaway simulation in `scratch/verify-position-lag.js` drives the real
position code with two minutes standing still (1 m of scatter) then two minutes walking at
1.4 m/s, one fix per second, and runs the replaced detection alongside it. Seven checks, all
passing. The old detection never registers movement and ends 25.6 m behind — about 18 s, against
the owner's field estimate of 15 s — with a peak of 27.2 m, matching the predicted ceiling. The
repair detects movement and settles at 0.8 m. Standing still is unchanged, 1.15 m before and
1.13 m after, so the steadiness the owner liked was not bought at the cost of the fix.
**Confirmed on a walk the same day:** trail mostly under 1 m, twice reaching 1.3 m without being
audible, orientation responsive.

**What was changed.** Travel is now measured from the reported positions across a four-second
window, so drift cancels and real movement accumulates; a higher bar to start following than to
stop prevents chatter; the accumulated gap is discarded the moment movement begins; the moving
smoothing setting is lighter and the transition between settings faster. Stationary smoothing is
untouched — it is what keeps the soundfield steady against GPS drift while standing.

**Two consequences to carry forward.**
- The status bar's GPS field now shows the trail in metres beside the padlock, amber above 10 m.
  The words "Locked"/"Live" were dropped to fit a phone screen; the icon carries the state.
- The owner noticed the one-time position correction when setting off, and wants to listen for a
  while before deciding whether to spread it over a couple of seconds. **Do not change it yet.**

**What it invalidates.** Every distance-driven judgement from the walks of 2026-11-11 and
early 2026-11-12 was made against a position tens of metres stale. F2's arithmetic is unaffected
— it is a static property of the scales — but the *perceptual* reports behind it need re-checking,
as do the aggressive fade just before silence and the ten metres it took to hear a sound again
after turning back. Neither has been re-tested against a correct position.

`LISTENER_DRIFT_COMPENSATION.md` documents the replaced algorithm and is now stale.

---

## 5. Where hard science and subjective perception currently contradict each other

These are the decisions that have been made implicitly and need making explicitly.

| # | The contradiction | Physics says | Perception says |
|---|---|---|---|
| C1 | Air absorption scale | Absolute distance — 140 m of air really is duller than 60 m, whatever the circle size | Scale it to the waypoint, so every waypoint gets a full range of cue across its own reach |
| C2 | Dynamic range | Keep all of it; a real source 10× further is 20 dB quieter | Keep 0.65 of it, or the far end is below the street and the near end is unbearable on headphones |
| C3 | Master compressor — **RESOLVED 2026-11-12** | Should not exist. A real ear has no 4:1 bus compressor | Needed, or several sources together clip |
| C4 | Reverb outdoors | Almost none. Open air has no reflections | Some, or distance has no "space" cue at all |
| C5 | The fade band | Sound does not fade out over a defined band; it sinks below the noise floor | Needed, or a discarded source clicks off |

**C3 was resolved on 2026-11-12 by replacing the compressor with a limiter**, which satisfies
both sides at once: a ceiling protects the output without reshaping the loudness curve below it.

**C1 is the one the owner has already ruled on** — scale it to the waypoint (§6) — and with C3
closed it is now the only contradiction left that changes what a walker hears. C2, C4 and C5 are
deliberate artistic choices that are recorded rather than contested.

One sequencing consequence of closing C3: the level cue is no longer being flattened, so the
timbre change no longer has to fight it. But it also means **the mix is now louder and more
dynamic than anything the owner has walked with**, so the limiter change and the timbre change
must be walked separately or neither can be attributed.

---

## 6. Decisions taken 2026-11-11 and 2026-11-12

| # | Decision |
|---|---|
| 1 | **Objective restated: natural sounding spatial sound.** Where a tweak and the objective disagree, the objective wins. This document is the reference for that test. |
| 2 | **Scale the muffling and the reverb to each waypoint** rather than to fixed 80 m and 60 m. Approved in principle; the open questions in §7 must be answered before it is built. |
| 3 | **Map graphic:** solid fill inside the circle, an evenly spread gradient from the circle edge out to the inaudible edge, and the circle outline kept as the scale marker. Accepted that the even spread simplifies a curve whose final fade occupies only the last 20 m of the band. |
| 4 | **The player's volume buttons go entirely.** The listener uses the phone's own volume. Anything already stored as a device trim becomes dead and must read as no adjustment. ✅ **Implemented 2026-11-13.** Buttons and the Level field removed from the player, the trim removed from the engine so the shared mix bus stays at unity, and the stored value is cleared on load so nobody keeps an adjustment they can no longer see or undo. |
| 5 | **The dynamic-range fraction becomes an artistic setting on the piece**, set in the editor, not on the device. This makes it the only dynamic control left, so its default value matters more than it did. |
| 6 | **The contained waypoint kind is shelved.** No further work; not persisted; assumed out of scope for everything below. |
| 7 | ~~**Heading stabilisation is on hold** until a further walk establishes whether the moving source is the compass or the position.~~ **VOID 2026-11-12** — the walk established it was neither. The cause was the listener position (F10). The stabiliser stays off; there is no evidence it is needed. |
| 8 | **The master compressor is replaced with a limiter.** Ruled 2026-11-12, resolving C3. Ceiling −3 dB, hard knee, 20:1, 1 ms attack, 100 ms release. Built; **not yet heard on a walk.** |
| 9 | **The start-of-walk position correction stays as an immediate snap for now.** The owner noticed it and wants to listen for a while before deciding whether to spread it over a couple of seconds. **Do not change it without asking.** |
| 10 | **The status bar's GPS field shows the position trail in metres** beside the padlock, amber above 10 m, replacing the words "Locked"/"Live". It is the instrument that makes any future position complaint diagnosable without a simulation. |
| 11 | **The reverb wash is left alone, and the five environments stop pretending to differ.** Ruled 2026-11-12 after the owner heard no reverb at all on a walk, approaching and departing. Open air genuinely has almost no reverberation, so an absent wash outdoors is correct rather than broken. Distance work rests on level and dullness, which are audible. The follow-up is cosmetic and honest — **and smaller than it was first written up, because there is no environment choice to relabel.** Verified 2026-11-13 by searching the whole project: the setter has zero call sites, so nothing can select an environment, every walk has always run the default (outdoor), and the other four presets are a table of numbers no code path reaches. What remains is to delete the dead table and setter, or leave them and stop describing them as a choice. Answers §7 Q6; supersedes F3 as a thing to fix and Q5 and Q9 as things to decide. |
| 12 | **The muffling build is decision 2 *plus* softening the curve.** Ruled 2026-11-12. Scaling to each waypoint stands, and §7 Q3 is applied with it rather than instead of it: today's curve is absolute distance done far too aggressively and then clamped, so rescaling it unchanged would carry that into every waypoint. The framing of "extend the range" versus "rescale" as an open choice is withdrawn — it contradicted decision 2 and rested on a claim the owner never made (§7 Q4). |
| 13 | **The dullness floor is 1400 Hz.** Set by the owner on 2026-11-13 after dialling it in the editor's simulator, reporting that it works outside the waypoint circle. It is the highest frequency still passing at the far end of a waypoint's reach, so it fixes how dull a sound gets at its most distant. The simulator slider still moves it; do not treat 1400 as provisional, but do ask before changing it. |
| 14 | **The editor's simulator carries a peak-hold meter for the master ceiling.** Ruled and built 2026-11-13, after decision 4 was implemented so the reading needs no trim to interpret it. It exists because the question the limiter was built to answer — is the piece too loud now? — cannot be settled by ear: below roughly 3 dB of reduction, limiting is inaudible, and above it a listener cannot tell limiting from the piece simply being loud. The meter reports the worst pull-down seen since the simulation started, with a reset, and holds its value after stopping so it can be read at leisure. It is polled on a 50 ms timer rather than on position updates, because a parked avatar still plays transients and those are what a ceiling catches; the 100 ms release means a 50 ms poll cannot miss an event. **Editor only** — the player has no meter, deliberately, since the simulator now reads true for every phone. **Not yet read** — the owner walked on 2026-11-13 without consulting it, so decision 8's question is still open. |
| 15 | **The listening context is noise-cancelling headphones in a quiet environment.** Ruled 2026-11-13: *"I will be using noise canceling headphones. I am not concerned with compensating for 'street noise'. Assume the player will be used in a quiet environment."* This is a bigger change than it looks, because **the dynamic-range fraction was designed as compensation for a hostile listening environment** and that environment no longer exists. Contradiction C2 framed it as a choice between keeping the full real range (far end below the street) and keeping 0.65 of it (far end audible, near end bearable) — with nothing masking the far end, the first horn of that dilemma disappears. Consequences: the fraction stops being a compromise and becomes a purely artistic choice about how much real-world range to reproduce; **the natural direction of dialling reverses, toward 1.0**; the binding constraint moves from the far end to the **near end**, because a sealed silent ear gets a source with no context — no room, no ambience — so arrival at full inferred level is more startling than the same level outdoors; and a "too quiet at distance" complaint changes meaning, since it can no longer be masking, so it points at absolute calibration rather than at the fraction. The model's street-noise constant and its "typical street" label are now misnomers and should be relabelled, though **its value must not be changed casually** — it anchors every inferred source level. **Amended the same day by decision 17: the environment is not silent, it is the site.** Passthrough of the real location replaces the sealed-ear assumption, which *strengthens* the case for dialling toward 1.0 rather than weakening it — with a real ambient floor, true physics lets distance sink below it naturally, which is what happens in the world, whereas compressing the range lifts everything back above the floor and makes it sound closer than it is. The near-end concern is also largely answered by decision 17: what made arrival startling was the absence of context, not the level. |
| 16 | **The editor is a desktop configuration tool; GPS and network-economic loading are player concerns.** Ruled 2026-11-13. Nothing needs removing to satisfy it — the editor never feeds GPS to the audio layer, because the simulator places the walker by dragging an avatar. The simulator *does* still run distance-based loading, and that is deliberate and worth keeping: it is what lets the waypoint log show the intended fetch and silence distances while a piece is being composed. It shows them for an assumed connection, not a real one, which is the right thing for authoring. |
| 17 | **The site bed: an editor-only reference, and the real ambient is passed through.** Ruled 2026-11-13, amending decision 15. The walker hears **the actual location**, through the earbuds' own transparency mode — the owner's finding was that the mix was *more* engaging with passthrough on, and the reason is that a reproduced source needs a reference to be judged against. In a sealed silent ear nothing is "out there", so every source sounds close and inside the head. **App-mixed microphone capture is rejected** in favour of device passthrough: no latency, no battery cost, no microphone permission on a playback path that has never had one, and no feedback risk. The player's only job is to recommend transparency mode once, in plain words. **Corrected later the same day — the bed is a temporary area, and needs no new code.** This entry originally proposed building a bed player plus an ambient-level control whose value would replace the model's hard-coded ambient constant and ship with the piece. **Both are unnecessary.** The owner's own alternative is better: areas already *are* position-independent ambient beds with no distance model, the sound library already holds whatever recordings are wanted, and a calibration bed is drawn, used, then deleted — so nothing is built and nothing is persisted. And because the audibility-margin question dissolved (see the loudness spec §5.1), **the model's ambient constant is not replaced and does not ship**; it stays as it is. The bed is purely a listening reference. Level is set by ear against a waypoint using the area's existing volume control, which is valid despite being uncalibrated: bed and waypoints reach the ear through the same headphones at the same volume, so the relationship is correct even when the absolute figure is not. |
| 18 | **Do not use white noise as the reference bed.** Recorded 2026-11-13 so nobody reaches for it as a shortcut. The distance cue is *high-frequency content being removed with distance* — that is what the 1400 Hz floor sets. White noise carries equal energy per hertz and so is weighted heavily toward exactly those frequencies: masking against it means judging the dullness cue through a masker that eats the cue, and the floor gets set too bright as a result. Pink noise (equal energy per octave) is the acceptable synthetic stand-in, but a real recording of the site is better and nearly free — two minutes on the phone while placing waypoints. A steady noise also masks *steadily*, whereas a forest gusts and has birds in it, so a synthetic bed flatters the setting. **The owner will record the site.** |

---

## 7. Open questions — answer before building

### On scaling the muffling and reverb (decision 2)

1. **What is "the waypoint's own reach"?** The natural anchor is the point where the sound
   dies — radius + 40 m — but that is a derived number the artist never sets. Confirm it.
2. **Does the dullness floor stay the same, only reached later?** Or does the floor move too?
3. **Consider the alternative before committing.** Today's curve is not "absolute distance
   done right" — it is absolute distance done far too aggressively and then clamped. Real air
   at 80 m would not have removed everything above 1 kHz. Simply extending the range and
   softening the floor would fix the saturation on a 100 m waypoint without touching small
   ones at all. Compare the two against each other before choosing.
4. **Know the cost of scaling.** For a 20 m waypoint, scaling to its own reach leaves the
   inside of the circle almost unchanged but makes the outer approach clearly duller — roughly
   a third more at 40 m, and much more at the edge.
   ⚠️ **Corrected 2026-11-12.** This item originally continued *"the 2026-11-11 walk approved
   how small waypoints currently sound, so this changes something that has already passed a
   listen."* **The owner never said that.** What the 2026-11-11 walk is recorded as confirming
   is that *the level* is much better — a statement about loudness, not about dullness. All
   three complaints from that walk concerned a 100 m circle or the direction of a sound; nothing
   was said about small circles in either direction. The claim was an argument from silence, and
   it was then used to argue against decision 2, which the owner had already made. **The cost
   above is still real arithmetic and still worth listening for — it is simply not a reason to
   override a ruling that was already given.**
5. **Bands or a curve?** Scaling the reverb bands moves the steps; making the reverb
   continuous removes them. Two different changes, only one of which has been asked for.
6. ✅ **Answered 2026-11-12 — how wet should outdoors be at all?** *Absent.* The owner noticed
   no reverb at all on the 2026-11-12 walk, approaching and departing. Ruled: leave the wash
   alone and stop pretending the five environments differ. See decision 11.
7. **Artificial sources — half answered, half still open.** The *dulling* half is settled by the
   build: every source type shares one notional 40 m band rather than using its own loading
   margin, so an oscillator is no longer made dull almost immediately by having no download to
   wait for. **What is still open is the loudness half, and it is the same question Feature 23
   Phase 1 is blocked on:** the model needs a real-world level at one metre, and for a source that
   is not a recording of a real thing that number is invented. Today it is inferred from the radius
   exactly as for a file, so a synthesised tone with a 30 m circle is treated as a source of
   ~80 dB at 1 m — a claim about the physical world that nobody made. At the other end, a stated
   preset of 140 dB stays above the mixing ceiling for roughly 800 m, so it pins the limiter for
   most of its own reach and carries no distance information at all. Three candidate rules: keep
   inferring from the radius, let the artist state a level, or give artificial sources one fixed
   sensible default. **Needs an owner ruling before presets are built.**
   ⏸️ **Deferred 2026-11-13.** Owner: *"Defer it. I have not had the need to do that yet. I want to
   get natural sound refined first."* Presets are deferred with it. **Reopen when an artificial
   source is actually placed on a map** — until then no shipped walk depends on the answer, because
   every source in use is a recording.
8. ✅ **Answered 2026-11-13 — areas are out of scope, deliberately.** Owner's ruling: *"Waypoints
   dull with distance; ambient beds don't. That is intended. Areas are ok the way they are."* This
   matches the reasoning already in the loudness spec — the physical point-source model does not
   apply to a bed, because you do not get quieter walking into a forest. **The asymmetry is a
   decision, not an oversight, and must not be "fixed" for consistency's sake.**
9. ✅ **Deferred 2026-11-13 — leave the reverb tail alone.** Owner's ruling: *"I can't hear it and
   don't have a need for it yet. leave it alone for now."* So the 0.25 s tail and the dead decay
   settings (F3) both stay as they are. This is consistent with decision 11, which already left the
   wash alone because no reverb was audible on a walk. **Reopen only if reverberation ever becomes
   load-bearing for distance** — until then, distance rests on level and dullness, which are
   audible.

### On the map graphic (decision 3)

10. **Contained waypoints are now shelved**, so only the physical case needs drawing — a
    40 m band. Confirm.
11. **The band width is derived, not stored.** The graphic must take it from the same place
    the audio does, not hard-code 40, or the two will drift apart.
12. **Editor and player must both change**, or the two pages will disagree about reach.
13. **The gradient has to be redrawn on zoom**, and in the editor it has to follow the radius
    live while it is being dragged. Technique not chosen: a stack of concentric rings is
    robust and reads as a fade at normal zoom; a true smooth gradient is prettier and fiddly.

### On the fraction and the buttons (decisions 4 and 5)

14. **Default value.** It is 0.65 today and the walk said the level is much better. Changing
    it blind risks undoing that.
15. **Dial it by ear in the simulator first?** Cheap, one sitting, and it should be done
    *after* the muffling change, not before — see §8.
16. **Where in the editor does it live?** Every *audio* setting today belongs to one waypoint or
    one area — you select a marker and its panel opens. This is the first setting that belongs to
    the whole walk instead.
    ⚠️ **Corrected 2026-11-13.** This originally said a whole-walk panel would have to be invented
    from nothing. That is wrong, and the work is smaller. The editor's main form is already
    soundscape-wide: it holds the name, the description, the public checkbox and a "More" section
    of whole-soundscape actions (sound library, sync, import, export, clear all, delete). What does
    not exist is any *audio* setting in it. So the slider goes into a panel that is already there
    and already saved as part of the soundscape — it is a new field, not a new screen.
17. **Storage.** It becomes a column on the soundscape record, and the migration tooling still
    prints a green success over a real failure. Fix that, or apply the change by hand.
    ✅ **Ruled 2026-11-13: apply it by hand.** The owner's *"Forget the migration tool. There are
    just a few reproducable soundscapes at this time"* means the broken tooling should not block the
    work — with only a few rows, the column can be added directly. **It does not mean skip
    persistence.** The fraction is per-piece and must be stored per-piece, because each piece is
    dialled against its own site's ambient: a louder site needs the far end lifted more (a lower
    fraction), a quiet one can afford true physics (a higher one), so a single global value would be
    wrong for every site but the one it was dialled at. An assistant briefly recorded the opposite
    and built only the simulator slider; the slider is the *dialling* half, not the feature. **This
    is the same trap that shelved the contained waypoint kind** — built in memory, never persisted,
    silently gone on reload.
18. ✅ **Done 2026-11-13 — and the cost it was weighing is now the only one left.** The player's
    buttons sat ahead of the master stage. Under the old compressor's soft knee they also changed
    the balance between loud and quiet sources, not just the level; under the limiter they were a
    pure level change for anything below −3 dB, and only shifted the balance for sources above the
    ceiling. The phone's volume buttons sit after everything and can do neither.
    **What is genuinely lost:** on a noisy street a listener can no longer lift the faint distant
    end toward audibility without lifting the peaks with it, because the phone's volume raises
    everything equally. The trim could do that — pushing the mix into the ceiling held the peaks
    while the quiet parts rose, which is a loudness maximiser in all but name. It did so by
    flattening the distance dynamics, which is why it went. Decision 5's dynamic-range fraction is
    the intended replacement, but it is the artist's setting for the piece rather than the
    listener's per-street correction. Recorded here so the loss is not rediscovered as a regression.

---

## 8. Sequencing

**Re-baselined 2026-11-12.** The original sequence sent the next walk after heading damping.
That was the wrong target (F5 is retracted); the walk found the position trail instead (F10),
which is now fixed and confirmed. The discipline that made that possible is worth keeping:
**one variable per walk, and each walk must be able to answer one specific question.**

Done:

1. ✅ Walk with the audio as it was, plus the quieted console and interruption recovery.
2. ✅ Heading settled — not the cause. Position trail found, reproduced in simulation, fixed,
   and confirmed on a second walk the same day.
3. ✅ Master compressor replaced with a limiter.

Next, in order:

4. **Walk the limiter on its own.** Nothing else should change. The question is whether the
   piece is now too loud, and whether the loudness curve reads more clearly with nothing
   squeezing it. Also settle the bell (F6) if spatialisation can be switched off, and note the
   position trail readout stays near a metre.
   - ✅ **The two observations the trail was probably faking are both closed.** Reported gone by
     the owner on 2026-11-13, while testing the new dullness sweep outside the waypoint circle:
     no aggressive fade just before silence, and no ten-metre dead band when turning back. They
     are off the list. *Not attributed to a cause* — the position repair and the muffling
     rescale both changed between the report and the walks that raised them, and the owner's
     words did not separate them.
   - 🎛️ **Half of this step no longer needs a walk.** Decision 14 added a ceiling meter to the
     simulator, so "is the piece too loud" now has an instrument: run a simulation, park the
     avatar where the most sources overlap, and read the worst pull-down. Zero means the limiter
     never engaged and the piece sounds exactly as the model intends. What still needs a walk is
     the other half — whether the loudness curve *reads* more clearly outdoors, and the bell.
     ⚠️ **Not done yet.** The owner walked on 2026-11-13 but did not read the meter, and reported
     nothing about loudness in either direction. **This step's central question is still open**, and
     it is now the cheapest unanswered question in the whole feature — it needs a simulation, not a
     journey.
5. **Then build the muffling scaling. The direction is already settled by decision 2 — scale it
   to each waypoint.** What remains open is §7 Q3, and it is not an alternative to scaling but a
   correction to it: today's curve is absolute distance done far too aggressively and then
   clamped, so rescaling it as it stands would carry that over-aggressiveness into every
   waypoint. Build the two together — rescale to the waypoint's own reach *and* soften the curve
   toward what real air actually does.
   ⚠️ **Corrected 2026-11-12.** This step originally presented "extend the range" versus
   "rescale per waypoint" as an open choice and recommended the first. That contradicted
   decision 2, which the owner had already made on 2026-11-11, and the recommendation rested on
   the false claim about small circles corrected in §7 Q4.
   🔨 **Built 2026-11-12; floor set 2026-11-13.** The sweep now spans each waypoint's own reach
   (radius plus the shared 40 m band) and falls exponentially rather than linearly, so each metre
   of walking buys the same perceived amount of dulling. All source types share one band, which
   is what §7 Q7 asked for. The floor is diallable in the editor's simulator and the owner set it
   to **1400 Hz** on 2026-11-13, reporting that it works outside the waypoint circle — down from
   the 5000 Hz the build shipped with, and a long way above the old 1000 Hz clamp. **Steps 5 and 6
   are both closed.**
6. **Build it, then walk.** Question: does a large circle now carry distance information all
   the way out, and do small circles still sound right?
   ✅ **Walked and accepted 2026-11-13.** Owner's words: *"the muffling rescale sounded ok.
   Consider it done."* Recorded as acceptance, not as praise. The walk also carried the limiter,
   which had shipped at the same time, so nothing here separates the two — and the owner reported
   nothing about loudness either way, so step 4's question is still open.
7. **Then dial the fraction in the simulator against the new sound.** Dialling it earlier means
   dialling it against something about to change — and it is now doubly true, because the
   limiter has already moved the level.
   ⚠️ **Corrected 2026-11-13, twice.** This step first said "dial it in the simulator", then said
   "the simulator is the wrong room because it has no street noise". **Both were wrong, because
   both assumed the walk happens on a street.** Decision 15 settles the listening context: noise-
   cancelling headphones, quiet environment, no compensation for street noise. That reverses the
   second warning — a silent simulator is now *closer* to the real listening condition than a
   street is, so the simulator is a legitimate place to dial the fraction, provided it is dialled on
   the same headphones the walk will use.
   **What still has to be true:** the fraction decides how faint the far end gets, and *faint is not
   the same as inaudible*. With nothing masking it, a faint far end is genuinely heard, so the old
   argument for compressing the range to lift the far end no longer applies. Expect to dial **up**
   toward 1.0, not down. See decision 15 for why the binding constraint moves to the near end.
8. **Then the presentation work** — map graphic, editor control for the fraction. It depends on
   nothing acoustically and can slot in anywhere.
   ✅ **The player's volume buttons are already gone** (decision 4, implemented 2026-11-13), which
   was the third item on this list. What remains is the map gradient out to the inaudible edge and
   the editor control for the dynamic-range fraction — and §7 Q16 now records that the control
   goes into a panel that already exists.

**The trap that applied to step 1 no longer does** — the console quieting and interruption
recovery are deployed. The normal order is back in force: change → owner tests → commit →
owner deploys.

---

## 9. Also outstanding, unrelated to any of the above

- **Every area is about 60% louder than it was** since the volume fix on 2026-11-09. Mixes
  balanced by ear before that date need re-checking. The 2026-11-11 walk did not report on
  this either way.
- **Streamed sources are never released from memory**, and if timbre ever becomes
  per-waypoint they need a rule (§7 Q7).
- **Behaviour rules start every member regardless of where the walker is.** A memory and
  processor cost, not an audible one.
- **The migration tooling reports success over failure**, which blocks decision 5's storage.

---

## 10. Verification status

| Claim | How it was established |
|---|---|
| Everything in §2 | Read out of the shipping code on 2026-11-11; §2.4 and §2.5 re-read and updated 2026-11-12 |
| The level percentages in §2.1 | Computed from the model's own arithmetic; matches the figures recorded when the model was built |
| F1, the compressor | Arithmetic from the model plus the compressor's own settings. **Was never measured with a meter or confirmed by ear** — resolved on the arithmetic and the owner's ruling, and the replacement is still unheard |
| F2, scale saturation | Arithmetic. Consistent with the owner's report from the walk; **not confirmed by a controlled listen, and that report was made against a position trailing by ~20 m** |
| F3, dead decay settings | Verified — the value is produced and never consumed |
| F4, F6 | Mechanisms verified in code; **the perceptual conclusions are hypotheses, and each has a named test in §8** |
| F5 | **Retracted.** The code claim was verified; the inference drawn from it was contradicted by two walks |
| F10, the position trail | **Reproduced.** Mechanism read from the code, then reproduced in `scratch/verify-position-lag.js` against the real methods (7 checks), and confirmed by the owner on a walk the same day. This is the only finding in this document established to that standard |

Built so far: the limiter (decision 8), the position repair (F10), the per-waypoint muffling rescale
with its floor at 1400 Hz (decisions 12 and 13), the removal of the player's output trim (decision 4),
the simulator's ceiling meter (decision 14), the deletion of the unreachable reverb environments
(decision 11), the derived fetch distance (Feature 23 Phase 3), and the simulator slider for the
dynamic-range fraction (decision 5, **half done — see §11**). Everything else remains unbuilt.

---

## 11. Work order — persistence of the dynamic-range fraction

**Resume with the prompt:** *"Continue with persistence of the dynamic range slider."*

This section is self-contained. Read it and §7 Q17 and decision 5; nothing else is required.

### Why it is unfinished

The fraction is diallable in the editor's simulator but **is not saved anywhere**. Close the editor
and the value is gone; the phone has never seen it. Decision 5 rules that the fraction is an artistic
setting **on the piece**, and the owner confirmed on 2026-11-13 that it must be stored per soundscape,
because each piece is dialled against its own site's ambient — a louder site needs the far end lifted
more (lower fraction), a quiet one can afford true physics (higher fraction). One global number would
be wrong for every site except the one it was dialled at.

⚠️ **Do not repeat the error already made here.** The owner's *"Forget the migration tool. There are
just a few reproducable soundscapes at this time"* was misread as "do not persist it". It means the
**broken migration tooling should not block the work** — with only a few rows, the column can be
applied by hand. This is the same trap that shelved the contained waypoint kind: built in memory,
never persisted, silently reverted on every reload.

### What already exists — do not rebuild

| Piece | Where | State |
|---|---|---|
| The model constant the fraction writes to | `spatial_audio.js` → `PHYSICAL_MODEL.dynamicRangeK`, read live by `physicalGain` | Done, default 0.65 |
| Setter and reader on the app layer | `spatial_audio_app.js` → `setDynamicRangeFraction`, `getDynamicRangeFraction` (clamps to 0.10–1.00, falls back to 0.65) | Done, verified by `scratch/verify-dynamic-range-slider.js` |
| The simulator control | `map_editor.html` → `simDynRangeSlider`, `simDynRange`, `simDynRangeHelp`; `map_editor.js` → `dynamicRangeFraction`, `applyDynamicRangeFraction`, `renderDynamicRangeFraction`, applied on simulation start | Done. Readout is dB gained per halving of distance, not the raw exponent — keep that, the exponent is not hearable |

### What is missing — five pieces

1. **The column.** Add a nullable numeric column to the `soundscapes` table, defaulting so that
   existing soundscapes keep 0.65. Declare it in `api/database/schema.sql` for the record, **and
   apply it by hand** — see the trap below.
2. **The API model.** `api/models/SoundScape.js` follows the house pattern: constructor argument,
   `fromRow` reading the snake_case column, `toRow` writing it, `toJSON` emitting camelCase,
   `fromJSON` reading it back. Use nullish defaults, **never falsy ones** — a deliberate value must
   survive, and this project has already shipped a bug where `volume || 0.8` turned a mute into 80%.
3. **The write path.** ⚠️ **Resolve this first, it is the one genuine unknown.**
   `SoundScapeRepository.updateWithChildren` only runs `UPDATE soundscapes SET updated_at = NOW()`,
   so name, description and the public flag are evidently persisted somewhere else. Find that path
   and follow it — do not assume the repository is where soundscape-level fields are written.
   The `INSERT` at line ~91 lists its columns explicitly and will also need the new one.
4. **The client model.** `soundscape.js` → class `SoundScape`. Its constructor is **positional**
   (`id, name, description, isPublic, soundIds, behaviors, waypointData, areas`), so do not insert a
   parameter in the middle; add it last or, better, populate it in `fromJSON` and `toJSON` where
   every real load and save goes through.
5. **Editor and player.** The editor's main form (`map_editor.html`, the panel holding name,
   description and public) is already soundscape-wide, so this is a new field in an existing panel,
   not a new screen — see §7 Q16. Load it in the form-populate path, save it in the form-read path,
   and follow the `editPublic` change-listener pattern. The player must apply it once the engine
   exists, in the same place it already builds the audio app.

### The trap

**The migration runner fails and then prints a green success.** It has been observed reporting
"Database migrations completed" directly after *Peer authentication failed for user "postgres"*. So:
apply the column by hand, and **verify it exists by querying the table** — never accept a tool's
output as evidence. The owner runs the database and the API restart, not the assistant.

### Decisions already made — do not re-litigate

- Per soundscape, not per device and not global.
- Range 0.10–1.00, step 0.05, default 0.65 when unset.
- Dialled by ear, on site, with the real ambient present (decision 15 as amended by 17). Expect to
  dial **up** toward 1.0, not down — there is no street noise to lift the far end above.
- The simulator keeps working as the dialling instrument; persistence does not replace it.

### Definition of done

1. Dial the slider, save, reload the editor — **the value is still there.** This is the check that
   the contained waypoint kind failed.
2. Open the same piece on the player — **the walk uses the saved fraction**, not 0.65. Confirm from
   the console rather than by ear, since a small difference is hard to hear.
3. An existing soundscape that has never been edited still behaves exactly as before.
4. A throwaway script in `scratch/` proves the round trip against the real model files, in the style
   of `verify-dynamic-range-slider.js` — load the module, do not mirror it.
5. Nothing is committed until the owner has done 1 and 2 themselves.

