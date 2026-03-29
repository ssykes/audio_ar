# MIDI Sequencer Brainstorming

**Date:** 2026-03-27  
**Purpose:** Explore JavaScript MIDI sequencer options for desktop composition → real-time map_player alteration workflow

---

## 🎯 Goal

Enable users to:
1. **Compose** musical sequences on desktop
2. **Alter** them in real-time within map_player (key, tempo, etc.)
3. **Optionally generate** procedural variations based on location/GPS

---

## 🔍 Library Research

### Headless MIDI Sequencers

| Library | Headless (Node.js) | Audio Output | MIDI File Support | Notes |
|---------|-------------------|--------------|-------------------|-------|
| **js-synthesizer** | ✅ Yes (v1.11.0+) | ✅ WAV frames | ✅ SF2/SF3 + SMF | WebAssembly FluidSynth port |
| **js-sequencer** | ⚠️ Browser-only | ✅ Web Audio | ✅ SMF files | Pairs with js-synthesizer |
| **soundfont-player** | ❌ Browser-only | ✅ Web Audio | ❌ Notes only | Lightweight, no MIDI files |
| **SpessaSynth** | ❌ Browser-only | ✅ Web Audio + WAV export | ✅ Full MIDI player | TypeScript, feature-rich |
| **Tone.js** | ❌ Browser-only | ✅ Web Audio | ⚠️ Via Tone.Midi | Best real-time API |

### Winner: **Tone.js** for Real-time Control

Despite not being headless, Tone.js offers the best API for real-time alterations:

- ✅ Simple tempo changes: `Tone.Transport.bpm.value = 120`
- ✅ Smooth transitions: `Tone.Transport.bpm.rampTo(140, 5)`
- ✅ Position jumping: `Tone.Transport.position = "1:2:0"`
- ✅ Loop control: `Tone.Transport.setLoopPoints("0:0:0", "2:0:0")`
- ✅ Built-in synthesizers and samplers

---

## 🧰 Tone.js Generative Toolkit

| Component | What it does | Use case for map_player |
|-----------|--------------|------------------------|
| **`Tone.Pattern`** | Arpeggiates through notes with patterns (up, down, upDown, random) | Create evolving backgrounds from composed motifs |
| **`Tone.CtrlMarkov`** | Markov chains with weighted probabilities | Generate melodies that follow your composed style |
| **`Tone.CtrlRandom`** | Random value selection with ranges | Add controlled randomness to rhythm/pitch |
| **`Tone.Transport`** | Global tempo, position, loop control | Real-time tempo/position changes based on GPS |
| **`.probability`** | Skip events probabilistically | Create sparse/dense textures dynamically |
| **`.humanize`** | Add timing variation | Make sequences feel more organic |

### Markov Chain Example

```javascript
const melodyGen = new Tone.CtrlMarkov({
  "C4": [
    { value: "E4", probability: 0.6 },
    { value: "G4", probability: 0.3 },
    { value: "C4", probability: 0.1 }
  ],
  "E4": "G4",  // Always goes to G4
  "G4": ["C4", "E4"]  // 50/50
});

melodyGen.value = "C4";
const nextNote = melodyGen.next(); // Generates next note based on probabilities
```

---

## 🏗️ Hybrid Architecture

```
┌─────────────────────────────────────────────────────────┐
│  DESKTOP COMPOSER (Tone.js + UI)                        │
├─────────────────────────────────────────────────────────┤
│  1. Compose base motifs (melodies, chord progressions) │
│  2. Define Markov transition rules                      │
│  3. Set variation parameters (tempo range, key, density)│
│  4. Export as JSON                                      │
└─────────────────────────────────────────────────────────┘
                          ↓ JSON
┌─────────────────────────────────────────────────────────┐
│  MAP_PLAYER (Real-time + Generative)                    │
├─────────────────────────────────────────────────────────┤
│  Base Layer: Pre-composed motifs (looping)              │
│  Variation Layer: Markov chain generates new melodies   │
│  Control Layer: GPS-driven parameters                   │
│    • Zone A → Key of C, tempo 120, high density         │
│    • Zone B → Key of G, tempo 90, low density           │
│    • Moving fast → Increase tempo, add randomness       │
└─────────────────────────────────────────────────────────┘
```

---

## 💻 Example Implementation

```javascript
// === DESKTOP: Compose and export ===
const composition = {
  motifs: {
    main: ["C4", "E4", "G4", "B4"],
    bass: ["C2", "G2", "A2", "F2"]
  },
  markovRules: {
    "C4": [
      { value: "E4", probability: 0.6 },
      { value: "G4", probability: 0.3 },
      { value: "C4", probability: 0.1 }
    ],
    "E4": "G4",
    "G4": ["C4", "E4"]
  },
  zones: {
    zoneA: { key: 0, tempo: 120, density: 0.8 },
    zoneB: { key: 7, tempo: 90, density: 0.4 }
  }
};

// === MAP_PLAYER: Real-time alteration ===
const melodyGen = new Tone.CtrlMarkov(composition.markovRules);
const pattern = new Tone.Pattern((time, note) => {
  synth.triggerAttackRelease(note, "8n", time);
}, composition.motifs.main);

// GPS-based zone detection
function onZoneEnter(zoneId) {
  const zone = composition.zones[zoneId];
  
  // Real-time alterations
  Tone.Transport.bpm.rampTo(zone.tempo, 5);  // Smooth transition
  pattern.transpose = zone.key;  // Change key
  pattern.probability = zone.density;  // Skip some notes
  
  // Regenerate melody using Markov chain
  const newMelody = [];
  for (let i = 0; i < 8; i++) {
    newMelody.push(melodyGen.next());
  }
  pattern.values = newMelody;
}
```

---

## 🎼 Motif Transformation Options

Inspired by Polychron MIDI project:

| Transformation | Musical effect | Map integration idea |
|----------------|----------------|---------------------|
| **Transposition** | Shift pitch up/down | Change key per location zone |
| **Inversion** | Flip intervals (up→down) | "Mirror mode" for special areas |
| **Retrograde** | Play backwards | Reverse when moving backward on path |
| **Augmentation** | Slow down note durations | Calm zones → slower, longer notes |
| **Diminution** | Speed up note durations | Active zones → faster, shorter notes |
| **Fragmentation** | Use only parts of motif | Low density areas → sparse motifs |

---

## 📋 Recommended Implementation Phases

### Phase 1: Pre-composed with Real-time Controls
**Timeline:** ~1-2 weeks

- [ ] Desktop tool to compose 2-4 bar motifs
- [ ] Export as JSON (notes + timing)
- [ ] map_player loads motifs, loops them
- [ ] Real-time controls: tempo, key, loop points, mute/solo

### Phase 2: Add Generative Variation
**Timeline:** ~2-3 weeks

- [ ] Add Markov chain rules (desktop)
- [ ] map_player generates infinite variations
- [ ] GPS controls density, complexity, randomness
- [ ] Zone-based parameter transitions

### Phase 3: Full Hybrid System
**Timeline:** ~3-4 weeks

- [ ] Motif transformation engine
- [ ] Multi-layer arrangement (bass, melody, percussion)
- [ ] Zone-based arrangement rules (which layers play where)
- [ ] Advanced transformations (inversion, retrograde, augmentation)

---

## 🔗 Related Libraries & Resources

### Core Libraries
- **Tone.js**: https://tonejs.github.io/
- **Tone.CtrlMarkov**: https://tonejs.github.io/docs/r13/CtrlMarkov
- **Tone.Pattern**: https://tonejs.github.io/docs/r12/Pattern

### Inspiration Projects
- **Polychron MIDI**: https://github.com/PolychronMidi/Polychron
  - Advanced motif transformation engine
  - Polyrhythmic composition
  - Signal-based arrangement control

- **midi-tape**: https://mortenson.coffee/blog/making-multi-track-tape-recorder-midi-javascript
  - Web-based MIDI tape recorder
  - Web MIDI API integration

### Research Papers
- Markov Chain Based Procedural Music Generator (2026)
- Score generation with L-systems (Prusinkiewicz, 1986)
- Dynamic Procedural Music Generation from NPC Attributes (CalPoly thesis)

---

## 🎹 Desktop Composer UI Ideas

### Minimal Viable Composer
```
┌────────────────────────────────────────┐
│  🎵 Desktop Composer                   │
├────────────────────────────────────────┤
│  [Piano Roll Grid - 16 steps]          │
│  C4 ████░░████░░████░░████░░          │
│  E4 ░░████░░████░░████░░████          │
│  G4 ████░░░░████░░░░████░░░░          │
│                                        │
│  Tempo: [====120====] BPM              │
│  Key:   [C Major ▼]                    │
│                                        │
│  [▶ Play] [⏹ Stop] [💾 Export JSON]   │
└────────────────────────────────────────┘
```

### Advanced Composer (Phase 2+)
```
┌────────────────────────────────────────┐
│  🎵 Desktop Composer Pro               │
├────────────────────────────────────────┤
│  Layers: [Bass] [Melody] [Percussion]  │
│                                        │
│  Motif Editor:                         │
│  [Piano Roll with velocity]            │
│                                        │
│  Markov Rules:                         │
│  C4 → E4 (60%)  G4 (30%)  C4 (10%)    │
│  [Add Rule]                            │
│                                        │
│  Zone Parameters:                      │
│  Zone A: 🎹C  🎚120  📊80%             │
│  Zone B: 🎹G  🎚90   📊40%             │
│  [Add Zone]                            │
│                                        │
│  [▶ Play] [🎲 Preview Variation]      │
│  [💾 Export Composition]               │
└────────────────────────────────────────┘
```

---

## 🚀 Next Steps

1. **Prototype Phase 1**: Simple motif composer (piano roll → JSON)
2. **Test Tone.js integration** in map_player
3. **Experiment with GPS → tempo mapping**
4. **Design zone transition system**

---

## 📝 Notes

- **File format**: JSON preferred over MIDI for easier manipulation
- **Caching**: Pre-render complex sequences to audio buffers for performance
- **Mobile considerations**: Keep CPU usage low on phones
- **Offline support**: Compositions should work without network

---

**Last Updated:** 2026-03-27
