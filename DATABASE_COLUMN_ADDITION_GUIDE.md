# Database Column Addition Guide

Quick reference for adding new columns to existing database tables.

## Example: Adding Oscillator Properties to `areas` table

### Step 1: Add Database Columns

SSH into the server and run:

```bash
ssh ssykes@macminiwebsever
sudo -u postgres psql -d audio_ar -c "ALTER TABLE areas ADD COLUMN IF NOT EXISTS waveform VARCHAR(50) DEFAULT 'sine', ADD COLUMN IF NOT EXISTS frequency FLOAT DEFAULT 440, ADD COLUMN IF NOT EXISTS detune FLOAT DEFAULT 0, ADD COLUMN IF NOT EXISTS gain FLOAT DEFAULT 0.5;"
```

**Verify columns were added:**

```bash
psql -U ssykes -d audio_ar -c "\d areas"
```

**Check existing data:**

```bash
psql -U ssykes -d audio_ar -c "SELECT id, name, type, waveform, frequency, detune, gain FROM areas WHERE type = 'oscillator';"
```

### Step 2: Update Domain Model (`api/models/Area.js`)

Add new properties to:

1. **Constructor parameters** (with defaults):
   ```javascript
   constructor(
       // ... existing params ...
       // Oscillator properties
       waveform = 'sine',
       frequency = 440,
       detune = 0,
       gain = 0.5
   ) {
       // ... existing assignments ...
       this.waveform = waveform;
       this.frequency = frequency;
       this.detune = detune;
       this.gain = gain;
   }
   ```

2. **`fromRow()` method** (snake_case → entity):
   ```javascript
   static fromRow(row) {
       return new Area(
           // ... existing mappings ...
           // Oscillator properties
           row.waveform ?? 'sine',
           row.frequency ?? 440,
           row.detune ?? 0,
           row.gain ?? 0.5
       );
   }
   ```

3. **`fromJSON()` method** (camelCase → entity):
   ```javascript
   static fromJSON(json) {
       return new Area(
           // ... existing mappings ...
           // Oscillator properties
           json.waveform ?? 'sine',
           json.frequency ?? 440,
           json.detune ?? 0,
           json.gain ?? 0.5
       );
   }
   ```

4. **`toRow()` method** (entity → snake_case):
   ```javascript
   toRow() {
       return {
           // ... existing fields ...
           // Oscillator properties
           waveform: this.waveform,
           frequency: this.frequency,
           detune: this.detune,
           gain: this.gain
       };
   }
   ```

5. **`toJSON()` method** (entity → camelCase):
   ```javascript
   toJSON() {
       return {
           // ... existing fields ...
           // Oscillator properties
           waveform: this.waveform,
           frequency: this.frequency,
           detune: this.detune,
           gain: this.gain
       };
   }
   ```

### Step 3: Update Repository (`api/repositories/AreaRepository.js`)

If using `insertBatch()` or similar bulk operations, add new properties:

```javascript
async insertBatch(soundscapeId, areas) {
    const inserted = [];
    for (let i = 0; i < areas.length; i++) {
        const area = areas[i];
        const row = this._toRow({
            // ... existing fields ...
            // Oscillator properties
            waveform: area.waveform ?? 'sine',
            frequency: area.frequency ?? 440,
            detune: area.detune ?? 0,
            gain: area.gain ?? 0.5
        });
        // ... rest of insert logic ...
    }
}
```

### Step 4: Update Parent Repository (`api/repositories/SoundScapeRepository.js`)

**Critical:** If the parent repository uses raw SQL INSERT statements, update them:

1. **Add columns to INSERT statement:**
   ```sql
   INSERT INTO areas (..., waveform, frequency, detune, gain)
   VALUES ($1, $2, ..., $14, $15, $16, $17) RETURNING *
   ```

2. **Add values to parameters array:**
   ```javascript
   [id, name, ..., waveform ?? 'sine', frequency ?? 440, detune ?? 0, gain ?? 0.5]
   ```

3. **Update both `createWithWaypoints()` and `saveFull()` methods**

4. **Add debug logging** to verify data is being sent:
   ```javascript
   console.log(`[SoundScapeRepository] Area ${i}:`, JSON.stringify({
       waveform: area.waveform,
       frequency: area.frequency,
       detune: area.detune,
       gain: area.gain
   }));
   ```

### Step 5: Update Frontend Form (`map_editor_v2.js`)

1. **Add form fields** in `TYPE_CONFIGS`:
   ```javascript
   'oscillator': {
       fields: `
           <input type="text" id="slideoutWaveform" value="sine">
           <input type="number" id="slideoutFrequency" value="440">
       `
   }
   ```

2. **Populate fields in `openSlideout()`**:
   ```javascript
   if (area.type === 'oscillator') {
       const slideoutWaveform = document.getElementById('slideoutWaveform');
       const slideoutFrequency = document.getElementById('slideoutFrequency');
       if (slideoutWaveform) slideoutWaveform.value = area.waveform || 'sine';
       if (slideoutFrequency) slideoutFrequency.value = area.frequency || 440;
   }
   ```

3. **Read fields in `getFormData()`**:
   ```javascript
   data.waveform = document.getElementById('slideoutWaveform').value;
   data.frequency = parseFloat(document.getElementById('slideoutFrequency').value);
   ```

### Step 6: Deploy and Test

```powershell
& .\deploy.ps1
```

**Test:**
1. Open map editor (hard refresh)
2. Edit an oscillator area
3. Change frequency/waveform
4. Save
5. Check console for payload
6. Verify database: `SELECT * FROM areas WHERE type = 'oscillator';`

## Checklist

- [ ] Database columns added (ALTER TABLE)
- [ ] Model constructor updated
- [ ] Model `fromRow()` updated
- [ ] Model `fromJSON()` updated
- [ ] Model `toRow()` updated
- [ ] Model `toJSON()` updated
- [ ] Repository `insertBatch()` updated
- [ ] Parent repository SQL INSERT statements updated
- [ ] Frontend form fields added
- [ ] Frontend `openSlideout()` populates fields
- [ ] Frontend `getFormData()` reads fields
- [ ] Deployed and tested

## Common Pitfalls

1. **Forgetting to update raw SQL** - `SoundScapeRepository` uses raw INSERT statements that must be updated manually
2. **Not setting defaults** - Always use `??` operator with sensible defaults
3. **Missing form population** - Fields must be populated when editing existing items
4. **Cache issues** - Hard refresh browser after deploy
5. **Database permissions** - Use `sudo -u postgres` if peer auth fails

## Quick SQL Reference

```sql
-- Add column
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name TYPE DEFAULT 'default_value';

-- Verify columns
\d table_name

-- Check data
SELECT column_name FROM table_name WHERE condition;

-- Update existing rows
UPDATE table_name SET column_name = 'value' WHERE condition;
```
