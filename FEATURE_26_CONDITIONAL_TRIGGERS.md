# Feature 26: Conditional Triggers — DOCUMENTED, NOT AUTHORISED

**Status 2026-11-14: captured at the owner's request, explicitly deferred.** The owner's words:
*"I do not have a need for it yet so let's not spend time on it yet."*

This document exists so the idea is not lost and so the questions in it are answered **before** any
code is written, not during. **Do not build from this.** There is no schema, no design, no estimate.

---

## 1. What the owner asked for

Three examples, given 2026-11-14, verbatim:

- *"When I am < 10 feet from gps position X play this waypoint"*
- *"When I am past waypoint x play waypoint y"*
- *"When I exit Area x play/silence whatever"*

*"That sort of thing."*

## 2. What kind of thing this is

Today the system has exactly one relationship between a walker and a placed item: **distance**, which
is continuous and drives level, dullness, fetching and disposal. Everything the owner describes is
different in kind — it is a **discrete event**. Something happens at a moment, and it causes something
else to start or stop.

Reduced to a shape, all three examples are the same thing:

| Part | Example 1 | Example 2 | Example 3 |
|---|---|---|---|
| **Where** | a bare position | a waypoint | an area |
| **Which edge** | entering | passing | exiting |
| **Action** | play | play | play *or* silence |
| **Target** | "this waypoint" | waypoint y | "whatever" |

So the vocabulary is small: **a region, an edge direction, an action, and a target.** Two of the three
examples differ only in which of those four slots they fill.

That is encouraging — it suggests one mechanism rather than three features. It is also where the
difficulty hides, because each slot has cases that are not obvious until you try to write them down.

## 3. Questions to answer before building

**"Past" does not mean anything yet.** Example 1 and example 3 have a clear inside and outside.
*"When I am past waypoint x"* does not. Past it in which direction? A circle has no direction; you can
be north of it, beyond it along a road, or simply no longer inside it. To mean "past", the system needs
a **route** — a direction of travel the walker is following. That is Feature 21, which is planned and
unbuilt. **This is the one example of the three that cannot be built until routes exist.** The other
two can.

**Units.** The owner wrote "10 feet". Everything else in the project is metres, top to bottom —
database, model, editor labels, distance calculations. 10 feet is about 3 m. Decide once whether a
trigger distance is stored in metres and displayed in metres, or whether the editor shows feet too.
Mixing them is how a 3× error gets built in silently.

**Latching.** If a trigger fires when you enter a region, what happens when you leave and come back?
Fire again, or only once per walk? Both are useful and they are different pieces. This is the question
most likely to be answered wrongly by whoever writes the code first, because the obvious
implementation gives one behaviour and the obvious *use* often wants the other.

**Standing on the boundary.** A GPS position wanders by metres. A trigger whose region edge is where
the walker is standing will fire and un-fire repeatedly. Anything built here needs a margin between
"triggered" and "un-triggered" — the same reason the distance model has a hysteresis band.

**Ordering.** Example 2 is a chain: one thing's state depends on another's. Two chained triggers that
each fire the other is a loop. Whether that is prevented, allowed, or allowed once needs deciding.

## 4. Where it would live — and the trap already in the ground

The obvious home looks like the existing coordination rules, which already store a type, a list of
member waypoint ids, and a settings bag, and already run on a pass over the walker's position.

**Three reasons to be careful with that home, all of them recorded elsewhere in this project:**

1. **There is no editor interface for rules at all.** Nothing can create one today, so every rule in
   the system arrived by hand or through the API. A trigger feature is mostly an editor feature.
2. **The rule path bypasses distance-based loading.** It starts every member immediately regardless of
   where the walker is, on browser timers rather than the audio clock, so a piece carrying rules holds
   its whole membership in memory instead of fetching by distance. Loudness stays correct; memory and
   battery do not.
3. **A defect class in that path was only fixed on 2026-11-14** — a rule could mark a member as
   performing when nothing had started, leaving it permanently silent. It is fixed, but the path has
   been exercised only by scripts, never by a real piece, because nothing can author one.

**And the persistence trap, which is the one that has bitten twice.** Build it in memory and the
editor will appear to work, then every setting vanishes on reload and a phone never sees it. That is
exactly what happened to the contained waypoint kind, which is still shelved for that reason. Anything
built here needs its column, its API model, its repository, its editor read and save, and its player
application **designed together**, following `DATABASE_COLUMN_ADDITION_GUIDE.md` — six of the eight
places a persisted value can be silently dropped.

## 5. What is deliberately not in scope

- Speed-gated triggering (play only while walking within a speed range). Noted 2026-11-14 as a
  genuinely new instrument borrowed from the prior art, and **not** part of this feature. It needs a
  reliable speed estimate, which is a separate question.
- Time-of-day triggers. Mentioned in older notes as a future idea. Nothing here depends on it.
- Triggers that change anything other than play and silence — level, brightness, route. The owner's
  three examples all start or stop something, and keeping it to that is what makes the vocabulary
  small.

## 6. What would unblock this

The owner having a piece that needs it. That is the whole gate. Nothing here should be scheduled
against a guess about what a future piece will require — the project's own record is that features
built ahead of need (the contained waypoint kind, the coordination rules, five reverb environments
that nothing could select) are the ones that end up dead, half-finished or unpersisted.

If it is ever authorised, the order is: answer §3 first, then one trigger type end to end including
persistence, walked on a phone, before a second type is started.
