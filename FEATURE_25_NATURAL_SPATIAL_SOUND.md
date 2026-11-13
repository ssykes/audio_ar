# Feature 25: Natural Spatial Sound — Audit and Re-baseline

**Status:** 📋 Reference document and audit. **Three items have been built:** the master limiter
(decision 8), the listener-position repair (F10), and the per-waypoint muffling rescale with its
floor set to 1400 Hz (decisions 12 and 13). **All three are now live.** The position repair is
walk-confirmed; the limiter and the muffling rescale are deployed but have never been walked.
Deploy verified 2026-11-13 by downloading the two live audio files and reading the values out of
them — ceiling −3 dB at 20:1, and a floor of 1400 — not by trusting a timestamp or a deploy log.
The muffling rescale is still uncommitted in git. Everything else is unbuilt.
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
| Output trim | Device-saved, ±12 dB in 3 dB steps, default 0 | The player's two buttons. Slated for removal — see §6 |
| Limiter | Ceiling at −3 dB, hard knee, 20:1, 1 ms attack, 100 ms release | Catches clipping only; leaves the loudness curve untouched below the ceiling |

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
| Fetched, started silent | *r* + 40 m |
| Fade to silence completes | *r* + 40 m (same point — approach and departure mirror each other) |
| Thrown away | *r* + 60 m |

The 40 m exists to buy download time before a sound is loud enough to hear. Note the
consequence: **the radius decides three separate things at once** — how loud the source is,
how big the map circle is, and how far away the file is downloaded from.

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
| 4 | **The player's volume buttons go entirely.** The listener uses the phone's own volume. Anything already stored as a device trim becomes dead and must read as no adjustment. |
| 5 | **The dynamic-range fraction becomes an artistic setting on the piece**, set in the editor, not on the device. This makes it the only dynamic control left, so its default value matters more than it did. |
| 6 | **The contained waypoint kind is shelved.** No further work; not persisted; assumed out of scope for everything below. |
| 7 | ~~**Heading stabilisation is on hold** until a further walk establishes whether the moving source is the compass or the position.~~ **VOID 2026-11-12** — the walk established it was neither. The cause was the listener position (F10). The stabiliser stays off; there is no evidence it is needed. |
| 8 | **The master compressor is replaced with a limiter.** Ruled 2026-11-12, resolving C3. Ceiling −3 dB, hard knee, 20:1, 1 ms attack, 100 ms release. Built; **not yet heard on a walk.** |
| 9 | **The start-of-walk position correction stays as an immediate snap for now.** The owner noticed it and wants to listen for a while before deciding whether to spread it over a couple of seconds. **Do not change it without asking.** |
| 10 | **The status bar's GPS field shows the position trail in metres** beside the padlock, amber above 10 m, replacing the words "Locked"/"Live". It is the instrument that makes any future position complaint diagnosable without a simulation. |
| 11 | **The reverb wash is left alone, and the five environments stop pretending to differ.** Ruled 2026-11-12 after the owner heard no reverb at all on a walk, approaching and departing. Open air genuinely has almost no reverberation, so an absent wash outdoors is correct rather than broken. Distance work rests on level and dullness, which are audible. The follow-up is cosmetic and honest — **and smaller than it was first written up, because there is no environment choice to relabel.** Verified 2026-11-13 by searching the whole project: the setter has zero call sites, so nothing can select an environment, every walk has always run the default (outdoor), and the other four presets are a table of numbers no code path reaches. What remains is to delete the dead table and setter, or leave them and stop describing them as a choice. Answers §7 Q6; supersedes F3 as a thing to fix and Q5 and Q9 as things to decide. |
| 12 | **The muffling build is decision 2 *plus* softening the curve.** Ruled 2026-11-12. Scaling to each waypoint stands, and §7 Q3 is applied with it rather than instead of it: today's curve is absolute distance done far too aggressively and then clamped, so rescaling it unchanged would carry that into every waypoint. The framing of "extend the range" versus "rescale" as an open choice is withdrawn — it contradicted decision 2 and rested on a claim the owner never made (§7 Q4). |
| 13 | **The dullness floor is 1400 Hz.** Set by the owner on 2026-11-13 after dialling it in the editor's simulator, reporting that it works outside the waypoint circle. It is the highest frequency still passing at the far end of a waypoint's reach, so it fixes how dull a sound gets at its most distant. The simulator slider still moves it; do not treat 1400 as provisional, but do ask before changing it. |

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
7. **Artificial sources.** Anything not fetched 40 m out has a much shorter reach, so scaling
   to it would make oscillators dull almost immediately. They need a rule.
8. **Areas.** Presumably out of scope — but say so, or the map ends up with waypoints that
   dull with distance and beds that do not.
9. **The reverb tail itself.** If distance is going to lean on reverberation, the 0.25 s
   small-room tail and the dead decay settings (F3) should be settled at the same time, or
   the rescaled cue will still sound like a small room.

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
18. **Losing the listener's trim has one real cost, and it got smaller on 2026-11-12.** The
    player's buttons sit ahead of the master stage. Under the old compressor's soft knee they
    also changed the balance between loud and quiet sources, not just the level; under the
    limiter they are a pure level change for anything below −3 dB, and only shift the balance
    for sources above the ceiling. The phone's volume buttons sit after everything and cannot
    do either. Accepted trade, recorded here so it is not rediscovered as a regression.

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
   the 5000 Hz the build shipped with, and a long way above the old 1000 Hz clamp. Step 5 is done
   in the working tree; step 6's walk is not.
6. **Build it, then walk.** Question: does a large circle now carry distance information all
   the way out, and do small circles still sound right?
7. **Then dial the fraction in the simulator against the new sound.** Dialling it earlier means
   dialling it against something about to change — and it is now doubly true, because the
   limiter has already moved the level.
8. **Then the presentation work** — map graphic, editor control, removing the player's volume
   buttons. It depends on nothing acoustically and can slot in anywhere.

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

Parts of this document have now been built: the limiter (decision 8) and the position repair
(F10). Everything else remains unbuilt.
