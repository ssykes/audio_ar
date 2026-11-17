# Feature 27 — Source Directivity

**Status: 🔵 PROPOSED — NOT AUTHORISED. Nothing is built, nothing is persisted, nothing has been
heard. This document records a design and its open questions so a decision can be made; it is not a
work order.**

| | |
|---|---|
| **Version** | v1.0 |
| **Written** | 2026-11-16 |
| **Depends on** | Feature 23 (physical loudness model, Phase 0 shipped), Feature 25 (natural spatial sound) |
| **Blocks** | Nothing |
| **Prior art** | Google Resonance Audio (`directivity` alpha + sharpness), Valve Steam Audio |

---

## 1. What it is, in one paragraph

Today every source radiates equally in all directions. A bell is exactly as loud behind it as in
front of it; a band faces nowhere. Real sources are not like that. **Directivity gives a source an
aim** — a compass direction it points in — and makes it quieter as the listener moves around to the
back. Resonance Audio's own example is a guitar: loud from the front where the strings and sound hole
are, muffled from behind because the player's body is in the way.

Two words are used throughout and must not be confused:

- **Aim** — the direction the source points, as a compass bearing. A property of the source.
- **Bearing** — the direction from the source to the listener. Already computed every frame, because
  the spatialiser needs it to decide which ear to favour.

Directivity is a function of the **angle between those two**.

---

## 2. Why it is worth considering

| Property | Consequence |
|---|---|
| **It is arithmetic, not signal processing** | One cosine and one multiply per source per frame. **No new audio nodes**, so unlike source width it does not multiply the spatialiser count. |
| **It only ever subtracts level** | ⚠️ *Inference from the mechanism, not measured:* it cannot drive the mix into the limiter ceiling, and a strongly aimed source could slightly relieve ceiling pressure. Contrast width, which adds a second renderer per channel. |
| **It is desk-testable** | The gain depends on **where the listener stands relative to the aim**, not on which way the listener faces. The simulator places the walker by dragging, so the effect is audible without a walk. ⚠️ Only the *level shaping* — whether an aimed source also localises convincingly involves the spatialiser and the listener's heading, so the final verdict is still a walk. |
| **It composes with the loudness model instead of fighting it** | See §5. |

Note the contrast with the ground-locked-area question raised the same day (Feature 25 §12 and the
2026-11-16 discussion). That turns on **listener heading**, which the simulator holds at north and
cannot change, so it cannot be judged at a desk. This does not.

---

## 3. Prior art, and the honesty caveat

Read on **2026-11-16** from the public documentation of two shipped VR audio systems:

- **Google Resonance Audio** — the spatialiser GeoBuzz is built on. Offers a directivity pattern with
  two parameters: *alpha* (pattern shape: cardioid, circular, or figure-eight) and *sharpness*
  (pattern width). Also offers **occlusion**, which blocks high frequencies more than low, and treats
  it as closely related to directivity.
- **Valve Steam Audio** — occlusion, reflection and reverb derived from scene geometry; "go beyond
  HRTF."

🔴 **Caveat, stated plainly.** Both were read as vendor documentation pages. **Neither was run, and
neither's audio was heard.** Everything above about them is what their own pages claim. No listening
test, no benchmark, no comparison against this project's output exists. Do not cite this section as
evidence that directivity sounds good — only as evidence that two established systems offer it.

**GeoBuzz has no equivalent.** Its elements have an anchor point, a shape and a volume distribution
(Center Icon / Division / Centerline), and its Division mode has an *Angle* — but that angle orients
where the volume is **loudest inside the shape**, not the direction the source radiates toward. So
there is no prior art to copy from the project already being mined; the design below is derived from
the VR systems.

---

## 4. The two numbers

| | Meaning | Range | Default | How the artist sets it |
|---|---|---|---|---|
| **Aim** | Compass direction the source points. 0 = north | 0–359° | 0 | **Drag an arrow on the map.** The stored number is a consequence of the drag, not something typed |
| **Directivity** | How much quieter it is directly behind | 0–20 dB | **0** | A slider |

**Strength is expressed in decibels of rear attenuation, deliberately.** 0 dB means all-round —
exactly today's behaviour. 20 dB means the back is nearly gone. The curve between 0° and 180° is a
raised cosine (cardioid-like); the shape is fixed and not exposed.

**Precedent for the unit:** the dynamic-range slider reports *dB gained per halving of distance*
rather than the bare exponent, because the exponent is not a thing anyone can hear. Same reasoning
here — an artist can reason about "the back is 12 dB quieter" and cannot reason about a pattern
exponent.

**Resonance Audio's third parameter is dropped.** Its pattern-shape choice (heart-shaped versus two
opposing lobes) is a rare artistic option that would be one more thing to set wrong. Two-lobe
behaviour can be added later if a piece ever wants it; nothing in the site-based use case suggests it
will.

**Both fields are relative, not absolute.** The rear attenuation is a difference in dB, so it is
unaffected by the loudness model's calibration constant, which has never been checked against a real
meter (Feature 23 §5.1). Directivity inherits none of that uncertainty.

---

## 5. How it folds into the existing model

The loudness model already produces one level per source per frame, from distance. Directivity
produces a **multiplier from angle**, and the two are **multiplied together**.

Three constraints that must hold:

1. **It must never replace the distance level.** Directivity modulates it. The distance curve stays
   authoritative for how loud a source is; aim only redistributes that loudness by direction.
2. **It must be applied ahead of the limiter**, like every other level in the chain. The listener-side
   trim was removed in Feature 25 decision 4 precisely because it sat ahead of the ceiling and
   flattened the distance dynamics. Directivity is subtractive, so it cannot do the same damage — but
   the placement still matters and must be the same place the distance level is applied.
3. **It must not become a second source of truth for level.** One level per source per frame, computed
   in one place. Redundant level state is how this project acquired the phantom area level field that
   overrode a real slider for months.

---

## 6. 🔴 The open ruling: what does the drawn circle mean once a source is aimed?

The map now draws each waypoint's circle out to its **audible edge**. Aim a source and that edge
becomes true in one direction only; behind it, the reach collapses by up to the directivity setting.

| Option | The circle means | Consequence |
|---|---|---|
| **A** | Reach **on axis**, in the direction it is aimed | Most physical, and matches how an artist would describe it — "the band faces the street." **But the drawn circle becomes untrue in every other direction**, which conflicts with the work that just made it mean the audible edge |
| **B** | Reach in **all** directions; aim only redistributes level within it | Honest to the map. Less honest to the physics — a strongly aimed source would still be drawn as audible behind it |

This is an **artistic call, not a technical one**, and it should be settled **before** a column
exists, not after. It also interacts with the radius, which the model reads as the source's power
(Feature 23 decision 9: level at 1 m is inferred from the drawn radius). Under Option A, aiming a
source effectively shortens its reach behind it without the radius changing — so the radius stops
being a complete description of how far the source carries.

**No recommendation is recorded.** Both are defensible and the choice belongs to the owner.

---

## 7. Scope: waypoints only, not areas

Directivity is proposed for **placed sources (waypoints)** only.

An area is a region, not a thing with a front. Giving it an aim would need a decision about what the
aim is relative to — the polygon has no natural front, and its shape can be arbitrary. The 2026-11-14
record already reaches the same conclusion from the other direction: *a bed has no direction.*

⚠️ **This is a statement about geometry, not about material.** Nothing here assumes what an area
carries. Areas may hold field recordings, generated sound, music or something not yet imagined, and
no rule in this document constrains that.

---

## 8. Optional, later: off-axis dulling

A real source is not merely quieter from behind, it is **duller** — the body blocks high frequencies.
Resonance Audio models exactly this in its occlusion, treating high and low frequencies differently.

This project already has a per-source low-pass filter for air absorption, with a floor the owner
dialled by ear. Pushing that cutoff further down as the listener moves off-axis would reuse existing
machinery and add no nodes.

**Deliberately out of scope for a first attempt.** It is a second thing to dial, it interacts with the
distance dulling that is already tuned, and a bad result would not be attributable to either half.
Recorded here so it is not lost, and so it is not mistaken for an oversight if the first version
sounds thin behind the source.

---

## 9. Gates, in the order the project already uses

**G1 — does it sound worth anything? (simulator, nothing persisted)**
Hard-code an aim and a rear attenuation on one waypoint. Drag the walker around it in a circle and
listen. One question, narrowly: *does a source that faces somewhere feel more like a thing in the
world than one that faces everywhere?*
**No column, no API change, no editor control at this gate.** This is the contained-waypoint lesson
and the width gate applied deliberately: do not persist anything before it has been heard. Cost is
hours.

**G2 — can the phone afford it? (device, only if G1 passes)**
⚠️ *Expected to be a formality, and that expectation is an inference.* No new audio nodes and no
additional fetches, so the cost profile should be indistinguishable from today. **Confirm it rather
than assume it** — the width feature has an unrun cost gate for exactly this reason, and the project
records that there is no headroom measurement anywhere.

**G3 — did it hold up on a walk? (real site, only if G2 passes)**
Walk a piece with one aimed source. Report whether the front-versus-back difference was audible
outdoors, where real ambient is present, and whether it survived the site's own sound. **Report the
observation. Do not write a mechanism into this document for either outcome** — that is the F5
failure, and the 2026-11-12 trap.

---

## 10. Persistence, if and only if G1 passes

Two new columns on the waypoint. Both default to today's behaviour, so applying them changes nothing
audible and the change is safe to deploy unheard:

| Column | Type | Default | Meaning |
|---|---|---|---|
| `aim` | degrees | 0 | Direction the source points. Irrelevant while `directivity` is 0 |
| `directivity` | dB | 0 | Rear attenuation. **0 = exactly today's behaviour** |

🔴 **Follow `DATABASE_COLUMN_ADDITION_GUIDE.md` end to end.** This project has lost a persisted field
to every one of these hops at least once:

1. Database column, applied by hand — the migration tooling is broken and prints success over failure.
2. Server model.
3. Repository read **and** write path. The repository's update path once touched only a timestamp,
   which is where the dynamic-range fraction nearly died.
4. Wire format and route — the route reads camelCase while the client sends snake_case. This exact
   mismatch is one of three breaks that made every new soundscape public.
5. Client model and its **response whitelist**, which silently drops unnamed fields.
6. The editor **reading** it into the form and **saving** it back.
7. The editor's **export-to-file whitelist**, which names every field it copies and silently drops
   anything unlisted — this is where `width` and `reverb_send` were caught on 2026-11-15.
8. The player **applying** it at start.

Then: export, reimport, and confirm both values survived. The failure is invisible in every other way.

🔴 **The API must be restarted by hand after deploy.** The deploy uploads the server files, checks
only that a process manager is running, prints a green OK, and **restarts nothing**. Until it is
restarted, a value saves without error and comes back as its default — which looks exactly like a
dropped field and will send you hunting through the eight hops above for a bug that isn't there.

---

## 11. Do not do

- **Do not expose a pattern-shape choice.** Fixed cardioid-like curve. One more control is one more
  thing to set wrong.
- **Do not make directivity a listener-side setting.** It is a property of the source material and the
  artist's intent, like width. Decision 4 removed the last of the listener controls for good reason.
- **Do not let it become a second level authority.** See §5 constraint 3.
- **Do not add off-axis dulling in the same change as the level effect.** Two variables at once means
  a bad result cannot be attributed — the same problem that made the 2026-11-13 walk unable to
  separate the muffling rescale from everything else.
- **Do not persist anything before G1 has been heard.**
- **Do not apply this to areas.** See §7.

---

## 12. Definition of done

For **G1** — the only gate currently authorised to be contemplated:

- [ ] One waypoint in the simulator carries a hard-coded aim and rear attenuation.
- [ ] Dragging the walker in a circle around it produces an audible level change, loudest in front.
- [ ] The change is reported as heard or not heard, in the owner's words, with no mechanism attached.
- [ ] Nothing is persisted. No column, no API change, no editor control.
- [ ] The ceiling meter reads zero throughout, confirming §2's inference that directivity cannot
      reach the limiter. **If it does not read zero, the inference was wrong and this document must
      be corrected.**

For the whole feature — **not defined yet**, because §6 is unresolved and the circle-meaning ruling
changes what the editor must draw.

---

## 13. What is known, and what is inferred

Recorded separately because this project has repeatedly converted an inference into a fact, and then
into a constraint. See the 2026-11-12 handover.

| Claim | Status |
|---|---|
| Resonance Audio and Steam Audio offer directivity | **Read from their documentation.** Neither was run or heard |
| GeoBuzz has no directivity equivalent | **Established by searching its docs and source.** It was never run either — same caveat the 2026-11-14 GeoBuzz comparison carries |
| Directivity needs no new audio nodes | **Design statement about a proposal.** Nothing is built, so nothing is verified |
| It cannot reach the limiter ceiling | **Inference** from the mechanism (it only subtracts). G1 checks it with the ceiling meter |
| The effect is audible in the simulator | **Reasoned**, from the fact that the gain depends on listener position rather than heading. Not demonstrated |
| It will sound better | **Unknown. No opinion is recorded either way.** This is the entire purpose of G1 |

---

*End of Feature 27.*
