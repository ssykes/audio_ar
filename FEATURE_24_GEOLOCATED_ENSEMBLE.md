# Feature 24: Geolocated Ensemble — musicians placed in space, playing in time

**Status:** 🔵 BLUE SKY — design captured, **no implementation authorised**
**Date:** 2026-11-09
**Origin:** brainstorming session, "simulate multiple musicians playing together using waypoints"
**Depends on:** nothing in flight. **Blocks:** nothing.

---

## 0. Priority statement — read first

This document is a **capture**, not a work order. It records a **possible feature, not a necessity.**
Nothing here is scheduled, and none of it folds into current work.

- The **walk test** and **reverb retune** for Feature 23 come first. An ensemble is the worst possible
  case for the current loudness curve, so tuning sync on a mix nobody can hear would be wasted work.
- **Feature 22A (wake lock)** comes first. An ensemble walk test that dies silently at the first
  incoming call produces nothing.
- Items 1-13 of the handover TODO all outrank everything in this document.

**One exception, and it is not really an exception.** Scoping this feature surfaced three concrete
defects — the deploy script never uploads sound files (§11.1), the behavior executors contradict the
distance model (§11.3), and loops restart rather than looping (§4). Those have been **promoted into
`QWEN.md`'s Known Issues and handover TODO on their own merits.** They are current work whether or not
Feature 24 is ever built, and they are not gated on it. Do not read their presence here as coupling.

Everything else in this document waits until the user explicitly asks for it.

---

## 1. The idea

Place several musicians in geospace as separate waypoints — a violinist here, a cellist there, a
drummer by the wall — each carrying their own part. Walk among them and hear a real ensemble: each
player separately located, separately loud, and **all playing the same piece at the same time**.

The spatial half of this already works. The temporal half does not exist.

---

## 2. Vocabulary used in this document

| Word | Means |
|---|---|
| **musician** | one waypoint carrying one part of the performance |
| **ensemble** | several waypoints intended to be heard as one group |
| **locked group** | an ensemble whose members share one clock |
| **playhead** | the single shared position in the piece, e.g. "47 seconds in" |
| **part** | one musician's recording of the piece |
| **segment** | a fixed-length slice of a part, cut on a musical boundary |
| **radius slider** | how loud a physical waypoint is and how far it carries |
| **Contained** | the checkbox that holds a sound inside its circle instead of radiating |

---

## 3. What already works today, with no code at all

Verified by reading the audio layer on 2026-11-09.

- **Separate placement and direction.** Every musician gets their own directional panner. The fiddle
  sits left, the drum behind you, and they move as you turn. This is the whole point of the feature
  and it is already there.
- **Distance is handled in one place.** The panner carries *direction only*; loudness over distance
  lives in a separate stage, so the two never multiply into a doubled curve. Feature 23 Phase 0 did this.
- **Balance controls.** The radius slider sets each musician's level and carry. The volume slider
  trims. The Contained checkbox is the right tool for a busker you must walk right up to.
- **Distance muffles.** Air absorption rolls off the highs, reaching maximum muffling at about 80 m.
  Faraway players genuinely sound faraway.
- **No hard cap on simultaneous sources.** Nothing in the engine limits how many can play at once.
  Under six musicians is comfortable; the cost per musician is one directional panner plus a few
  processors.

**For a textural ensemble** — a rehearsal behind a wall, a crowd of buskers, a band warming up — this
is already good, and the imperfections described below actually help.

---

## 4. The core problem: there is no shared clock

**Each musician owns their own beginning.** A part starts playing at the moment the *walker* comes
into range of it, not at the moment the piece starts. Walk into a quartet and you hear four players
each at a different bar, joining one at a time. They never lock.

Three effects compound it:

1. **Random speed wobble.** Every part is given a tiny random speed variation each time it starts —
   deliberate, to stop loops sounding mechanical. It is under a twentieth of one percent, but over a
   three-minute loop that is tens of milliseconds, and it re-randomises on every repeat.
2. **Loops restart rather than continuing.** A part reaching its end is started again a moment later,
   losing a few milliseconds each cycle. The lock decays over time even if it began perfect.
3. **Entry is staggered by walking.** Parts are fetched individually as the walker approaches each
   one, so a late-arriving player pops in mid-phrase.

For drones and ambience, all three are features. For anything with a groove, they are audible as
flams and phasing.

---

## 5. Design: the shared clock

### 5.1 One playhead, not five starts

The **piece** owns the beginning; the musicians read from it. A single clock runs and keeps a position
in the piece. When the walker comes into range of a musician, that musician does not start at their
own beginning — they start at wherever the playhead currently is.

Walk up to the cellist mid-phrase and she is already mid-phrase, in time with the violin heard from
further away. The players are performing whether the walker is there or not; the walker is moving
into earshot.

### 5.2 Out of range means muted, not rewound

A musician the walker cannot hear **keeps their place silently**. They are not stopped and rewound.
This removes the seam problem entirely for the walk-away-and-return case, and it is what makes the
ensemble feel like it exists independently of the listener.

### 5.3 Behaviour changes

| Situation | Today | With a shared clock |
|---|---|---|
| Enter a musician's range | Starts from their own beginning | Starts at the playhead position |
| Leave and come back | Starts again from the beginning | Never stopped counting; resumes in time |
| A part reaches its end | Restarts a moment later, losing time each cycle | Loops in place; the lock holds |
| Random speed wobble | Applied to every part | Off for locked groups; kept everywhere else |
| Group loading in | Parts fetched individually as approached | Group loads as a unit |

### 5.4 How the system knows five waypoints are one ensemble

The data model **already has a slot for this**: soundscapes can carry groupings of waypoints with a
coordination rule — start together, staggered entries, a tempo grid, a shared reverb, a group volume.

Two caveats, verified 2026-11-09:

- **There is no editing screen.** The editor will save groupings but never lets you create one.
- **The two rules that matter here were written against the pre-Feature-23 model.** They kick off
  every member the moment they are told, whether or not the walker is in range, and they use ordinary
  browser timers rather than the audio clock. They would both fight the distance-based loading and
  drift over time. Treat them as a sketch of the right shape, **not** as something to build on directly.

Two routes to an editing surface:

| Route | What you get | Cost |
|---|---|---|
| **Areas as the stage** | An area polygon already has a full editing screen. Declare that every waypoint inside one area plays to that area's clock | No new interface; matches the mental model — the courtyard *is* where the band is |
| **A grouping screen** | Name the group, tick its members, set where it starts | More flexible, more work; where this ends up if the idea survives a real walk |

**Recommendation:** start with areas as the stage. Only build a grouping screen if a real case appears
that a polygon cannot express.

---

## 6. Segmented parts

Chop each part into equal-length segments cut on musical boundaries — bars, phrases — and play them
back in sequence so a part behaves like a stream.

### 6.1 What nothing exists for yet

Verified 2026-11-09: **there is no segmented playback anywhere in the system.** Every sound is
fetched whole, decoded whole, and held whole in memory. A musician is one complete recording.

There is a cached-streaming design from March 2026 that was never built. Its "chunks" are about
downloading **one long file progressively**, not cutting a piece into musical segments. Different idea;
do not confuse them.

### 6.2 What segmentation buys

- **Sync becomes a whole number.** If all parts are cut into equal segments, "which segment are we on"
  is one integer every musician shares. No fractional position to reconcile, nothing to drift.
- **Phone memory drops sharply.** Today five musicians means five complete recordings decoded and held
  at once. Segmented, each holds maybe two short pieces.
- **Variation becomes possible.** Different takes of the same bar. A player who drops out for a bar and
  returns. An ending that happens once. This is where a placed ensemble stops being five tape loops and
  starts feeling like musicians. **Whole files cannot do this at all.**

### 6.3 What segmentation costs

- **The seam.** A segment must be scheduled ahead of time against the audio clock, not started when the
  decision to start it is made — deciding and starting are not the same instant. The next segment must
  be loaded and queued before the current one ends. Well-understood machinery, but real machinery.
- **Arrival gets worse before it gets better.** With a whole recording in memory you can start a
  musician at exactly 47.3 seconds. With segments you can only start at a boundary. Walk in mid-segment
  and you either wait in silence or arrive out of step. **§6.4 removes this problem.**
- **Request count.** Five parts, four minutes, ten-second segments ≈ **120 audio files.** See §11.
- **Segment length is a trade.** Short = tight sync, fast arrival, many requests. Long = few requests,
  but widely spaced joinable boundaries. Cutting on musical lines matters more than absolute length.

### 6.4 Prefetch at selection — the user's proposal, and it is the right one

**Fetch all parts when the soundscape is chosen on the picker page, and hold the play button disabled
until the musicians are ready.**

This dissolves the hardest problem in the whole design. If every part is local before play starts,
arriving mid-piece stops being a race: the playhead position is known, the segment it implies is known,
and reading it from local storage is instant. No boundary waiting, no out-of-step arrival.

Three refinements:

**a) Freeze until *verified present*, not until *requested*.** "Ready" must mean every file the
ensemble needs has been confirmed to exist locally — not merely that the browser was asked for them.
This is what catches a file the deploy missed (§11.1). A missing file then costs an error at the picker
instead of a musician going silent forty seconds into a piece, on a walk.

**b) Download everything, decode only a window.** Prefetching all segments appears to undo the memory
benefit that motivated segmentation. It does not, if the two are separated:

| | Compressed on disk | Decoded in memory |
|---|---|---|
| Rough cost, five 4-minute parts | ~19 MB | ~200 MB |

Decoded audio is roughly ten times the compressed size. So: hold all five parts as small downloaded
files — cheap, and it kills the arrival race — while decoding only a couple of segments per musician at
any moment. **Prefetch-everything plus decode-a-window beats either alone.** This is the single most
important implementation decision in the feature.

**c) It must be scoped, not global.** Prefetch should apply only to sounds belonging to a locked group,
never to every soundscape, and it should reuse the existing offline download rather than become a
second download path.

**The honest cost:** every walker downloads ~19 MB whether or not they reach the ensemble, and waits
for it at the picker. On a phone connection that wait is dominated by request overhead, not by audio
size — which is exactly why (b) matters and why segment length needs tuning by measurement.

### 6.5 A consequence for the artistic fork

Prefetching at selection time quietly favours **"the piece starts when the walker presses play."**

With a continuous clock that began at selection, a walker who dawdles for ten minutes has a stale
prefetch — the segments downloaded are no longer the ones playing, so a re-fetch is needed on arrival
and the freeze moves to the worst possible moment. With starts-on-press, the first segment is always
the one needed, and the freeze reads naturally as "the ensemble is getting ready."

Not decisive, but it tilts the decision. See §10, D1.

### 6.6 Missing-segment behaviour — an undefined case

With 120 files, the chance that one is missing rises sharply: a deploy that skipped it, a cache cleared
partway, a download that timed out on a hill. The offline layer is **deliberately** built to fail loudly
on a missing sound (§11.2), so "one missing segment" stops being rare.

**Segmentation therefore needs an answer to a question it does not have today: what does a musician do
when their next segment is not there?** Hold the current one and retry? Go silent and rejoin at the next
boundary? That is an artistic decision about how the ensemble degrades, and it must be made before the
engineering — because the current answer, by design, is "fail." See §10, D5.

---

## 7. Whole files versus segments

| | Whole files, one clock | Segmented, one clock |
|---|---|---|
| Lock in steady state | Good | Exact |
| Arriving mid-piece | Precise to the millisecond | Only at a boundary — **solved by §6.4** |
| Phone memory | Five full recordings | A couple of short pieces each |
| Requests per musician | One | Dozens |
| New machinery | Modest | Substantial (scheduling, prefetch, decode window) |
| Variation over time | Impossible | Possible |

**Segmentation does not solve the sync problem — the shared clock does.** Segmentation solves the memory
problem and enables variation, at the cost of request count and machinery.

---

## 8. Recommended sequence

1. **Fix the deploy sound discovery** (§11.1). One line. Prerequisite for *any* new audio, segmented or not.
2. **Shared clock on whole files.** The smaller change, no new plumbing, and it answers the only question
   that really matters: does a locked ensemble in geospace actually *feel* like musicians playing together?
   If it does not, segmentation will not rescue it.
3. **Walk it.** Feature 23's loudness curve bites hardest here — see §9.
4. **Segment only if** memory pressure or a desire for variation appears. Both are discovered by walking,
   not by predicting.

---

## 9. The gate: were the parts recorded to a click?

**A shared clock can only preserve alignment that already exists in the recordings.**

If the parts were recorded to the same click, all the same length, all starting at the same instant,
this works beautifully and needs little machinery. If they were recorded freely against each other, no
clock will lock them — that needs time-stretching, a much larger job.

**Two zero-code checks, do these before anything else:**

1. Play two parts at once at full volume and listen where they repeat. If they flam or swim, they were
   not recorded to a click.
2. Cut all five parts at the same bar lines in any audio editor and play the first segment of each
   simultaneously. Ten seconds settles it. **Segmentation makes this more unforgiving, not less** — you
   cannot hide drift behind a grid when the grid is explicit.

**Second gate — loudness.** With the current curve, a 20 m radius waypoint sits at only about **14% of
its centre level at the edge of its own circle.** Five musicians at the edge of their circles are all at
~14%. If they are too quiet to hear as a group, sync will not rescue it. An ensemble needs generously
**overlapping** radii, or it reads as a series of isolated solos rather than a band. Test in the editor's
simulator with headphones before building anything.

---

## 10. Open decisions

| # | Decision | Options | Status |
|---|---|---|---|
| **D1** | **Does the piece run continuously, or start when the walker arrives?** | Continuous = a real ensemble on its own schedule; simpler, but arriving at minute twenty of a four-minute piece may feel unsatisfying, and prefetch goes stale. Starts-on-press = every walker hears the same performance from the top; better if the piece has a shape; needs a trigger rule and resets on every arrival | **Open.** §6.5 tilts it toward starts-on-press |
| **D2** | **How is a locked group declared?** | Area polygon as the stage (no new UI) vs. a dedicated grouping screen | **Open.** Recommendation: areas first |
| **D3** | **Whole files or segments, for the first build?** | See §8 — recommendation is whole files first | **Open.** Recommendation recorded |
| **D4** | **Segment length and where to cut** | Short/tight vs. long/few requests; musical grid vs. fixed seconds | **Blocked** on D3 and needs measurement, not prediction |
| **D5** | **What a musician does when their next segment is missing** | Hold and retry vs. go silent and rejoin at the next boundary | **Open.** Artistic; must precede engineering |
| **D6** | **Does the random speed wobble stay for non-locked sounds?** | It is deliberate anti-mechanical behaviour; locked groups must not have it | **Recommendation:** off for locked groups, unchanged elsewhere |
| **D7** | **Does prefetch reuse the offline download or add a path?** | Reuse avoids two download systems with different failure modes | **Recommendation:** reuse |
| **D8** | **Inherited from Feature 23:** does the dynamic-range knob belong to the device or the soundscape? | An ensemble is the case where it matters most — five parts all at ~14% | **Open in Feature 23 §5.3.** Do not re-decide here |

---

## 11. Bugs, issues and TODOs

> **§11.1 and §11.3 are not Feature 24 work.** Both have been promoted into `QWEN.md` → *Known Issues*
> and the handover TODO, where they stand on their own merits as current work. They are reproduced here
> only because this is where they were found. §11.7 below **is** Feature 24 work and is not authorised.

### 11.1 🔴 Deploy sound discovery finds nothing — VERIFIED, one-line fix, do first

The publish script has a step meant to find sound files in the audio folder and upload them. It uses a
filter form that only takes effect when the search is also told to look *inside* the folder, and it is
not. So the search matches nothing.

**Measured 2026-11-09 by running both forms against the real folder:**

| Form | Files found |
|---|---|
| The one the script uses | **0** |
| The corrected form | **18** |

The folder holds 19 files, so one is not an audio file.

**Why this is dangerous rather than merely broken:** the script prints "No sound files found" in grey
and continues, **reporting overall success.** The site works today because those files are already on
the server from earlier. Drop in a new sound and publish, and it never arrives — nothing warns you.

With whole-file waypoints that is one missing sound: obvious and easy to trace. With 120 segments it is
an ensemble going silent partway through a piece, on a walk, with 120 candidates to debug.

**Fix before any new audio work, segmented or not.** Note the deploy script's summary is already known
to print success over real failures (a failed database migration reports green), so "the deploy said OK"
is not evidence of anything. Verify new audio by hash.

### 11.2 🟠 Missing audio must keep failing loudly — invariant, do not "fix"

The offline layer has a deliberate two-tier behaviour:

| What is missing while offline | What happens |
|---|---|
| A **page** | A friendly recovery page, reported as success |
| A **sound file** | A genuine failure, reported as a failure |

This asymmetry is correct and **must stay.** If a missing sound got the recovery page instead, the player
would try to interpret a page of HTML as audio and fail confusingly. The audio layer depends on hearing
"that failed" so it can fall back to the network.

**Consequence for this feature:** see §6.6 and D5. Segmentation multiplies the number of files that can
be missing, and the system is designed to fail loudly on each one.

### 11.3 🟠 Existing coordination rules are unusable as-is — and can silence a sound

Two separate problems, found by reading on 2026-11-09. **Not reproduced.**

**a) They contradict the distance model.** The groupings that already exist in the data model start
every member unconditionally — regardless of where the walker is — and use browser timers rather than
the audio clock. They predate Feature 23. **Do not build on them**; treat as a shape hint only (§5.4).

**b) They can leave a sound permanently silent.** They set the "is playing" flag *outside* the guard
that checks a source actually exists. A member that has not loaded yet is therefore marked as playing
when nothing started. If that member was **preloaded but not yet started** — exactly the state the 40 m
preload margin produces — it then fails both routes that could start it: the unmute path skips it
because the flag claims it is already playing, and the load path returns early for the same reason.
Result: a silent musician that the system believes is performing.

**Currently unreachable.** The editor has no interface for creating these rules, so no soundscape has
any. This is dormant code on a live path — it fires the moment the behavior editing UI (Feature 18)
lands, or the moment rules arrive by hand or through the API. **Feature 18 should not proceed without
fixing this first.**

### 11.4 🟠 Contained kind is not persisted — inherited blocker

The Contained choice works in the editor's simulator and is then **lost**, so the phone always treats the
waypoint as radiating. Needs one database column. **Blocked:** the migration runner fails with a
peer-authentication error and then prints a green success.

Relevant here because Contained is the natural tool for "walk right up to this busker," which an ensemble
may well want for a soloist.

### 11.5 🟡 Streams are never disposed

A stream-type waypoint stays in memory for the whole session because its zone maths yields no disposal
distance. Known, deliberately unfixed. Relevant only if §12's streaming route is taken, or if segments
are implemented by masquerading as streams.

### 11.6 🟡 Streams have never been exercised since the preload fix

Their type handling changed as a side effect of that fix and has never been tested. Same relevance as
§11.5.

### 11.7 TODO list for this feature (when authorised)

**Prerequisites — do not start the feature until these are done:**
- [ ] Fix §11.1 (one line)
- [ ] Complete the Feature 23 walk test and reverb retune
- [ ] Feature 22A wake lock — otherwise a long ensemble walk test produces nothing
- [ ] Run the §9 recording-alignment gate
- [ ] Settle D1 and D2

**Phase A — shared clock on whole files:**
- [ ] One playhead per locked group, driven by the audio clock
- [ ] A part starts at the playhead position, not at its own beginning
- [ ] Out of range = muted, not rewound
- [ ] Seamless looping in place
- [ ] Random speed wobble disabled for locked-group members only
- [ ] Group loads as a unit when any member comes into range
- [ ] Declare the group via an area polygon (D2)

**Phase B — prefetch (only if Phase A proves the idea):**
- [ ] Fetch at soundscape selection, scoped to locked groups
- [ ] Hold the play control until every file is **verified present** locally
- [ ] Reuse the existing offline download path
- [ ] Download all, decode a window (§6.4b)

**Phase C — segments (only if memory or variation demands it):**
- [ ] Segment schedule per part, cut on musical boundaries
- [ ] Ahead-of-time scheduling against the audio clock
- [ ] Missing-segment behaviour per D5
- [ ] Segment length tuned by measurement

---

## 12. 🔵 Blue sky: the BART sonification as geolocated sound

> Captured at the user's request as an interesting idea. **Explicitly not scheduled and explicitly must
> not affect the TODOs above.** Recorded so it is not lost.

The thought: take the BART sonification from the separate sonification workspace and place it in
geospace as a sound you walk through.

### 12.1 What is known from notes (unverified — separate workspace, nothing carries over)

- It lives in a **different project** with a **different stack**: a Next.js application, whereas Audio AR
  is static files served by Apache behind a CDN.
- Its player runs on **plain Web Audio**; the compiled-ChucK sandbox is confined to other routes.
- The project's Qwen memory is **scoped per directory**, so no context from there is visible here and
  none of this document is visible there.

### 12.2 The central mismatch: generated versus recorded

The BART sonification **generates audio live from a data feed.** Audio AR places **files.** Three routes,
in increasing order of difficulty:

| Route | What you get | Cost / risk |
|---|---|---|
| **Render it to files** | Record a performance and place it as waypoints. Fits everything in §5-§8 unchanged | Simplest. But the output is **frozen** — it no longer responds to live transit data. It becomes "a recording of one moment in the system" |
| **Bring the engine in as an artificial source** | Live generation, placed in space | Audio AR already has a synthetic oscillator source type, **but Feature 23 explicitly lists artificial sources as an unresolved question.** The loudness model infers a source's level from its radius, which was designed for recordings. A coupled-oscillator generator has no natural sound-pressure level to infer from |
| **Stream it** | Live generation running elsewhere, streamed in | Streams exist but are never disposed (§11.5) and have never been exercised (§11.6). Needs network on the walk; the offline story does not cover generated audio |

**If this is ever pursued, render-to-files is the route that costs least and reuses the most.**

### 12.3 The interesting part: Kuramoto is the same shape of problem

The sonification work involves **coupled oscillators drifting into synchrony.** That is structurally the
same question as this feature — many independent voices finding a common pulse — but with the **opposite
answer**:

| | Feature 24 ensemble | Kuramoto coupling |
|---|---|---|
| Synchrony | **Authoritative.** One clock; every part obeys it exactly | **Emergent.** Voices drift toward each other; the lock is approximate and always moving |
| Feeling | A rehearsed band | A crowd settling into a rhythm |

Choosing between "locked" and "drifting toward locked" is an **artistic decision, not a technical one**,
and it is worth knowing both are available. A geolocated Kuramoto field — oscillators placed around a
square, coupling more strongly when the walker stands between them — is a genuinely novel idea and is
not expressible in either project today.

### 12.4 ⚠️ The conflict that must be resolved first: muffling alters the data

The user's own sonification principle applies directly: **under resource pressure, degrade timbre
richness, never a parameter that carries data meaning.**

Audio AR's air absorption **rolls off high frequencies with distance**, reaching maximum muffling at
about 80 m. If the BART data is encoded in anything spectral — brightness, harmonic content, filter
position — then **walking away from the source silently changes what the data says.** That is precisely
the failure mode the principle forbids: an aesthetic parameter becoming a function of something else,
so the output encodes the implementation rather than the data.

This is not a detail. It is the reason a sonification cannot simply be dropped into a distance-aware
player.

**Possible resolutions, none chosen:**
- Encode the data only in parameters distance does not touch (timing, pitch, amplitude envelope) and
  accept that spectral encoding is unavailable in geospace
- Exempt artificial/data-carrying sources from air absorption, and say so explicitly in the loudness model
- Make the muffling itself meaningful — distance from the source *is* distance from the data's origin,
  which may be a legitimate part of the mapping rather than a corruption of it

The third is the most interesting and the most likely to be right, but it needs the user's judgement.

### 12.5 Other considerations

- **Position semantics.** In Audio AR, position means *where the sound is.* For transit data, position
  could mean the actual station or vehicle location — which makes it a **moving source.** Moving sources
  do not exist today; waypoints are fixed. That is a separate capability of similar size to this feature.
- **Voice budget.** The user's established principle is tiered ceilings — give cheap and expensive voices
  separate budgets — and that rejecting a new note is not neutral in a sonification the way it is in a
  synth, because it corrupts the mapping. Placing many generators in space multiplies voice count.
- **Two workspaces, two memories.** Anything decided here must be carried across by hand. Neither
  assistant session can see the other.

### 12.6 Verdict

Genuinely interesting, **not** a small add-on, and gated behind both §9 and §12.4. Capture and park.

---

## 13. Verified versus assumed

Everything asserted above was checked on 2026-11-09 unless marked otherwise.

**Verified by reading or running:**
- No segmented playback exists; every sound is whole-file (§6.1)
- The March cached-streaming design was never built and its chunks are progressive download, not musical
  segments (§6.1)
- Deploy sound discovery returns 0 files; the corrected form returns 18; the folder holds 19 (§11.1)
- Groupings exist in the data model, have no editing screen, start members unconditionally, and use
  browser timers (§5.4, §11.3)
- Each musician has its own directional panner; distance lives in a separate stage (§3)
- Air absorption reaches maximum muffling at 80 m (§3, §12.4)
- Random speed wobble is applied on every start, ~±0.02% (§4)
- Loops restart rather than continuing seamlessly (§4)
- Prefetch margin for recorded sounds is 40 m beyond the radius (§5.3)
- No cap on simultaneous sources exists in the engine (§3)

**From project notes, not re-verified today:**
- Contained kind is not persisted; migration blocked by an authentication failure (§11.4)
- Streams are never disposed and have not been exercised since the preload fix (§11.5, §11.6)
- A 20 m radius waypoint is at ~14% of centre level at its own edge (§9) — this figure was measured
  2026-11-09 but from the curve, not from a walk
- Deploy summary prints success over real failures (§11.1)

**Rough estimates, not measurements:**
- ~120 files for five 4-minute parts at ten-second segments (§6.3)
- ~19 MB compressed, ~200 MB decoded for five 4-minute parts (§6.4b) — assumes ~128 kbps stereo and
  44.1 kHz 16-bit; the ratio is the point, not the figures

**Assumed from notes about a workspace that cannot be seen from here:**
- Everything in §12.1 about the sonification project. **Treat as unverified.**

---

**End of Feature 24.**
