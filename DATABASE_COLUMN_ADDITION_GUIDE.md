# Adding a Field End to End — Database → API → Client → Editor → Player

**Read this before adding any persisted field.** It is the checklist, the traps, and a worked
example. Written 2026-11-14 from actually doing it for the soundscape's dynamic-range fraction,
which took several attempts because four separate places silently dropped the value.

Supersedes the older version of this file, which was written for the `areas` table and told you to
edit `map_editor_v2.js` — **a dead file**. The live editor is `map_editor.html` / `map_editor.js`.

---

## The one-paragraph version

A field has to survive **seven** hops, and each one can drop it silently: the database column, the
INSERT, the UPDATE, the route's request parsing, the API client's response whitelist, the client
model's serialisation, and the editor's load/save. **Nothing errors when a hop drops it** — the value
just comes back as the default. So verify the round trip, do not assume it.

---

## Step 0 — Decide where the field belongs first

| Belongs to | Store on | Example |
|---|---|---|
| The whole piece | `soundscapes` | dynamic-range fraction, name, public flag |
| One waypoint | `waypoints` | radius, volume, sound id |
| One area | `areas` | polygon, volume, fade width |
| The listener's device | browser local storage, never the server | (the output trim used to live here; it is gone) |

Getting this wrong is expensive to undo. The contained-waypoint kind was built, shipped to the
editor, and then **shelved because it was never persisted** — it reverted on every reload.

---

## Step 1 — The database column

**The migration runner is broken. Do not use it.** It prints `✅ Database migrations completed`
immediately after `FATAL: Peer authentication failed for user "postgres"`. Apply by hand.

Declare the column in `api/database/schema.sql` anyway — that file is a record, not a runner, and
keeping it truthful is what stops the next person guessing.

Local database (connection string lives in `api/.env`, which is gitignored):

```powershell
cd E:\vsCode\workspaces\audio_ar\api
$env:DBURL = (Get-Content .env | Select-String '^DATABASE_URL=').ToString().Substring(13)
psql $env:DBURL -c "ALTER TABLE soundscapes ADD COLUMN dynamic_range NUMERIC(3,2);"
psql $env:DBURL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='soundscapes' AND column_name='dynamic_range';"
```

Server database:

```bash
ssh ssykes@macminiwebsever
sudo -u postgres psql -d audio_ar -c "ALTER TABLE soundscapes ADD COLUMN IF NOT EXISTS dynamic_range NUMERIC(3,2);"
```

**The second command is the one that matters.** Never accept a tool's success message as evidence —
query the table. PowerShell 5 has no `&&`; one command per line.

**Nullable, not defaulted, when "unset" must mean something.** A NULL fraction means "never dialled,
use the engine default". A column defaulted to 0.65 cannot tell "never dialled" from "dialled to
exactly the default", and rewriting every existing row is a change nobody asked for.

---

## Step 2 — The server

### 2a. The INSERT (create path)

`api/repositories/SoundScapeRepository.js` → `createWithWaypoints` uses **raw SQL with an explicit
column list**. Add the column, add a placeholder, add the value.

⚠️ **Read the value from the snake_case row.** The repository calls `_toRow(data)` first, which
converts every key. Reading `row.isPublic` after that is always `undefined`. This is a **live bug
today**: the create path reads `row.isPublic ?? true`, so every new soundscape is created public no
matter what the artist chose. Read `row.is_public`.

### 2b. The UPDATE (save path)

Soundscape-level fields are written by the route calling the repository's generic `update(id, data)`
in `BaseRepository`. It builds its SET clause from **every key present in the object**, so:

⚠️ **Drop undefined keys before updating.** `{ name, description, isPublic }` destructured from a
request body has all three keys even when the client sent one. Any key left in with value `undefined`
becomes `SET column = NULL` — silently wiping a stored value.

⚠️ `updateWithChildren` / `saveFull` only run `UPDATE soundscapes SET updated_at = NOW()`. They are
the **save-the-children** path, not the field path. Looking for the write there is a dead end.

### 2c. The route

`api/routes/soundscapes.js`.

⚠️ **The client sends snake_case; accept both spellings.** `api-client.js` runs every outgoing
payload through `_toRow`, which converts camelCase to snake_case. A route that destructures
`const { isPublic } = req.body` therefore receives `undefined` — the body has `is_public`. This is
the second half of the public-flag bug. Read both:

```javascript
const publicFlag = isPublic !== undefined ? isPublic : req.body.is_public;
```

### 2d. The domain model — probably NOT needed

⚠️ **Check whether `api/models/*.js` is even on the path before editing it.** For soundscapes it is
not: `api/models/SoundScape.js` is required only by `api/scripts/test-domain-models.js`, and the
repository uses the inherited generic snake↔camel conversion instead. The model does not even carry
the public flag. Editing it would be cosmetic churn that implies it matters.

`api/models/Area.js` and `api/models/Waypoint.js` **are** used, so for those tables the old
five-place routine (constructor, `fromRow`, `fromJSON`, `toRow`, `toJSON`) still applies. **Grep for
`require('../models/X')` first and only then decide.**

### 2e. Restart the API

Route and repository changes are not live until the API process restarts. That is the owner's job.

---

## Step 3 — The API client (`api-client.js`)

### 3a. The request

Add the parameter and pass it through `_toRow`. Note the signature is **positional** — add at the
end, and default to `undefined` rather than a value, so "not supplied" is distinguishable:

```javascript
async updateSoundscape(id, name, description = '', isPublic = true, dynamicRange = undefined)
```

⚠️ `_toRow` converts **every key present**, so an unset optional field goes up as
`dynamic_range: undefined` and wipes the stored value. Delete it from the payload:

```javascript
if (dynamicRange === undefined || dynamicRange === null) delete payload.dynamic_range;
```

### 3b. The response — the quiet killer

⚠️ **The response builder in `getSoundscapeFull` is an explicit whitelist.** It constructs a fresh
object naming each field it wants. Anything not named is **silently discarded**, no matter how
faithfully the server returned it. A field can be correctly stored, correctly queried, correctly
serialised — and still never reach the editor, because of this one object literal.

Add the field there. This is the hop most likely to be missed, because it fails with no symptom
except "the value is always the default".

---

## Step 4 — The client model (`soundscape.js`)

Class `SoundScape`. Its constructor is **positional and long**
(`id, name, description, isPublic, soundIds, behaviors, waypointData, areas`) — do not insert a
parameter in the middle. Set new fields as properties and populate them in `fromJSON`.

Add the field to `toJSON` as well, or saving drops it.

⚠️ **PostgreSQL returns `NUMERIC` and `BIGINT` as strings.** `'1.00'` will not drive a slider or a
comparison correctly. Parse it.

⚠️ **Use nullish (`??`), never falsy (`||`).** This project has shipped the same bug twice:
`volume || 0.8` turned a deliberate mute into 80%, and the area loader preferred a phantom field over
the real one. `|| default` also converts a legitimate `0`, `''` or `false` into the default.

⚠️ **A stored NULL must not become 0.** Parse, and if the result is not finite, keep it null so the
engine default applies.

---

## Step 5 — Editor and player

**Editor** (`map_editor.js` + `map_editor.html` — never the `_v2`, `_old` or `_mockup` files, they
are dead):

- Load: populate the control in `_initForms`, from the loaded soundscape.
- Save: read the control in `_updateSoundscapeFromForm`, then `_markSoundscapeDirty()` and
  `_scheduleAutoSave()`.
- If the control lives somewhere else (a simulator panel, a slideout), it must **write back to the
  soundscape object on change**, or the dialled value and the saved value are two unrelated numbers.
- The save itself goes out through `map_shared.js` → `api.updateSoundscape(...)`. Add the argument
  there too — it is a positional call and silently ignores anything past its last parameter.

**Player** (`map_player.js`): apply the value after the audio app exists, and log it. A small
numeric difference is not reliably audible, so the console line is the real verification.

---

## Step 6 — Verify the round trip

A syntax check proves grammar only. It cannot see a dropped field. Two things are worth doing:

1. **A throwaway script in `scratch/`** that loads the *real* file in a sandbox and asserts the
   round trip — see `scratch/verify-dynamic-range-roundtrip.js`. Load the module; never mirror it,
   because a mirror passes while the real thing fails.
2. **The owner's own manual test**, because the HTTP path and the database write cannot be exercised
   from a script here: change the value, let it autosave, **reload the page**, confirm it survived.
   Then open the same piece in the player and confirm from the console.

Reload-survival is *the* test. It is exactly what the contained waypoint kind failed.

---

## The trap list, condensed

| # | Trap | Symptom | Guard |
|---|---|---|---|
| 1 | Migration runner lies | Green success over an auth failure | Apply by hand, verify by query |
| 2 | Route reads camelCase, client sends snake_case | Field always undefined server-side | Accept both spellings |
| 3 | `_toRow` sends every key, including undefined | Stored value wiped to NULL | Delete unset keys from the payload, server and client |
| 4 | Response builder is an explicit whitelist | Value stored fine, never reaches the UI | Add the field to the whitelist |
| 5 | Reading `row.isPublic` after `_toRow` | Always undefined → `?? true` | Read `row.is_public` |
| 6 | `NUMERIC` arrives as a string | Comparison and slider misbehave | `Number(...)` and check `isFinite` |
| 7 | `\|\|` instead of `??` | A deliberate 0 / false / '' becomes the default | Always nullish |
| 8 | Positional function signatures | Extra argument silently ignored | Add at the end; check every call site |
| 9 | Editing a dead file | Change does nothing, no error | `map_editor.html` is live; `_v2`, `_old`, `_mockup` are dead |
| 10 | Editing a model that is not on the path | Wasted work, false confidence | Grep for `require('../models/X')` first |
| 11 | Deploy stamps in the working tree | Noisy diffs | Expected; the pre-commit hook strips them |

**After any rename or removal, grep the old name across every file that could call it.** A syntax
check will not catch a stale call site; it fails at runtime in the browser, after a deploy.

---

## Worked example — `dynamic_range` on `soundscapes` (2026-11-13)

Every file that had to change, in the order they were changed:

1. `api/database/schema.sql` — column declared, plus the hand-applied statement beside it
2. `api/repositories/SoundScapeRepository.js` — INSERT column list and value
3. `api/routes/soundscapes.js` — create and update accept it; update drops undefined keys; both
   accept the snake_case spelling
4. `api-client.js` — `updateSoundscape` parameter, payload pruning, **and the response whitelist**
5. `soundscape.js` — property, `toJSON`, `fromJSON` with string parsing
6. `map_editor.js` — seed the simulator slider from the piece on load; write back and mark dirty on
   change
7. `map_shared.js` — pass it in the `updateSoundscape` call
8. `map_player.js` — apply it once the engine exists, and log it

Eight files for one number. Six of the eight are places the value can be silently dropped.
