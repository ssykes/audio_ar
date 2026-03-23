# Audio AR Project - QWEN.md

## 📚 Documentation Hierarchy

**For new feature work, reference documentation in this order:**

```
QWEN.md (this file - project context & memories)
    ↓
FEATURES.md (feature catalog - all completed features)
    ↓
FEATURE_*.md (individual feature specs)
    ↓
Source code (implementation)
```

### Quick Reference

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **QWEN.md** | Project context, memories, setup | Starting session, need project info |
| **FEATURES.md** | Feature catalog (Features 1-16 completed) | Reference existing features, plan new ones |
| **FEATURE_*.md** | Deep-dive specs | Implementation details, debugging |
| **LAZY_*.md** | Lazy loading architecture | Audio optimization work |
| **CLOUDFLARE_*.md** | Server/CDN configuration | Deploy issues, cache problems |
| **SERVICE_WORKER_*.md** | Offline mode | SW caching, deploy verification |

---

## 💡 Qwen Added Memories

- **AI Joke**: User wants me to tell them an AI joke at the beginning of each session (without prompting)

- **PowerShell Scripts**: Use the `&` call operator: `& .\deploy.ps1`. Without `&`, PowerShell opens the script instead of executing it.

- **Deploy Script Cache-Busting**: `deploy.ps1` creates temporary `.deploy` versions with cache-busting query strings, uploads them, then cleans up.

---

## 📁 Current File Versions

| File | Version | Last Updated |
|------|---------|--------------|
| `map_player.html` | v7.2 | 2026-03-18 |
| `map_editor.html` | v6.119+ | 2026-03-18 |
| `index.html` | v6.8 | 2026-03-16 |
| `soundscape_picker.html` | - | 2026-03-21 (Feature 16) |
| `spatial_audio.js` | v5.1+ | 2026-03-20 (Feature 15) |
| `spatial_audio_app.js` | v2.8 | 2026-03-18 (Feature 14) |
| `download_manager.js` | v1.1 | 2026-03-21 (Feature 16: Version guard) |
| `sw.js` | v1.0 | 2026-03-21 (Feature 16: New) |
| `deploy.ps1` | - | 2026-03-21 (Feature 16) |
| `SERVICE_WORKER_REFACTOR.md` | v1.0 | 2026-03-21 (Feature 16B spec) |

**Note:** Cache-busting versions updated on every deploy. Check HTML files for current values.

---

## 🎯 Next Priority Items

1. **Feature 16B: Service Worker Refactor** - Code quality, remove duplication (~6h)
2. **Feature 17: Distance Envelope** - Three-zone volume control (~4h)
3. **Feature 20: Cached Streaming** - Session cache (~7h)
4. **Feature 21: Sound Walk Composer** - Routes + OSRM (~4h)
5. **Test on mobile** - Verify GPS/compass with lazy loading + air absorption
6. **Feature 18: Behavior UI** - Visual timeline

---

## 🐛 Known Issues

None currently - all lazy loading bugs fixed:
- ✅ Preload margin matches fade zone (20m)
- ✅ Preloaded sounds start playing immediately
- ✅ Hysteresis prevents rapid load/dispose cycles
- ✅ Zone naming clarified ('unload' → 'hysteresis')
- ✅ Debug logging verifies zone transitions

---

## 🚀 Quick Start Commands

```bash
# Test on PC
open map_player.html

# Test on Phone (local network)
python -m http.server 8000
# Access from phone at http://YOUR_IP:8000/map_player.html

# Deploy to test server
& .\deploy.ps1
```

---

## ⚠️ Git Commit on Windows (Important!)

**Problem:** Windows CMD doesn't handle multi-line commit messages.

**Solution:** Use `write_file` + `-F` flag:
```
1. write_file to create .git/COMMIT_EDITMSG with full message
2. git commit -F .git/COMMIT_EDITMSG
3. git push
```

**Alternative:** Single-line messages only: `git commit -m "Short message"`

---

## 🔧 Pre-commit Hook (Auto-Installed)

Cache-busting versions are **automatically stripped** before committing.

| Hook | Location | Status |
|------|----------|--------|
| Bash script | `.git/hooks/pre-commit` | ✅ Installed |
| PowerShell | `.git/hooks/pre-commit.ps1` | ✅ Installed |
| Git config | `core.hooksPath = .git/hooks` | ✅ Configured |

**What Gets Committed:**
- ✅ JavaScript files (without version numbers)
- ✅ HTML files (without cache-busting query strings)
- ✅ Display versions (e.g., `<span class="version">v7.2</span>`)

**What Does NOT Get Committed:**
- ❌ Cache-busting query strings (e.g., `?v=20260317233153`)

---

## 📝 Creating a New JavaScript File (Checklist)

When creating a new `.js` file, complete these steps:

### 1. **Add to `deploy.ps1`** (Required for deployment)

**Step 1a:** Add version pattern near line 105:
```powershell
$NEW_FILE_PATTERN = 'new_file\.js\?v=\d+'
```

**Step 1b:** Add version update code near line 149:
```powershell
# Update new_file.js version
if ($content -match $NEW_FILE_PATTERN) {
    $content = $content -replace $NEW_FILE_PATTERN, "new_file.js?v=$VERSION"
    Set-Content $filePath $content -NoNewline
    Write-Host "  Updated: $htmlFile (new_file.js)" -ForegroundColor Green
}
```

**Step 1c:** Add to `$ALL_FILES` array near line 315:
```powershell
$ALL_FILES = @(
    # ... existing files ...
    "new_file.js",  # ← Add here
)
```

### 2. **Add to HTML with cache-busting** (Required for browser updates)

```html
<script src="new_file.js?v=20260323"></script>
```

**Note:** Deploy script will auto-update the version number on each deploy.

### 3. **Verify Load Order** (If the script depends on other libraries)

Ensure dependencies load **before** your script:
```html
<!-- Leaflet must load BEFORE leaflet.draw -->
<script src="leaflet.js"></script>
<script src="leaflet.draw.js"></script>
<script src="area_drawer.js"></script>  <!-- Depends on both -->
```

### 4. **Test Deployment**

```powershell
& .\deploy.ps1
```

Verify in output:
- ✅ `Updated: map_editor.html (new_file.js)` - Version updated
- ✅ `new_file.js  100%  [OK]` - File uploaded

### 5. **Verify on Server**

Hard refresh browser (Ctrl+Shift+R) and check console:
- ✅ No 404 errors
- ✅ No "undefined" errors
- ✅ Your console.log() appears

---

## ⚠️ Cloudflare Cache Issue

**Problem:** Cloudflare may cache JavaScript files despite no-cache headers.

**Solution:** Cloudflare Dashboard → Caching → Configuration → Set **Caching Level** to **`No Query String`**

**Verification:**
```powershell
Invoke-WebRequest -Uri "https://ssykes.net/map_player.js" -UseBasicParsing | 
    Select-Object -ExpandProperty Headers | 
    Where-Object {$_.Key -eq "CF-Cache-Status"}
# Expected: CF-Cache-Status: DYNAMIC or BYPASS
```

**Full troubleshooting guide:** `CLOUDFLARE_CACHE_TROUBLESHOOTING.md`

---

## ✅ Completed Features Summary

| Feature | Description | Status |
|---------|-------------|--------|
| **1-3** | SoundScape persistence + phone mode | ✅ Complete |
| **4** | Hit list cleanup | ✅ Complete |
| **5A-5D** | Multi-soundscape support | ✅ Complete |
| **5E** | Auto-sync with timestamps | ✅ Complete |
| **6** | Separate editor/player pages | ✅ Complete |
| **7** | Data Mapper pattern (repositories) | ✅ Complete |
| **8** | Device-aware auto-routing | ✅ Complete |
| **9** | Soundscape selector page | ✅ Complete |
| **10** | Icon bar UI redesign | ✅ Complete |
| **11** | Debug log copy | ✅ Complete |
| **12** | Edit waypoint duplicate fix + refresh persistence | ✅ Complete |
| **13** | Listener drift compensation (EMA smoothing) | ✅ Complete |
| **13** | Lazy loading for sound walks | ✅ Complete |
| **14** | Distance-based audio filtering (air absorption) | ✅ Complete |
| **15** | Offline soundscape download (Cache API) | ✅ Complete |
| **16** | Service Worker offline mode + corruption guards | ✅ Complete |

**Detailed feature documentation:** See `FEATURES.md`

---

## 📋 Planned Features

| Feature | Description | Priority |
|---------|-------------|----------|
| **16B** | Service Worker Refactor (constants, helpers, cache opt) | Medium |
| **17** | Distance Envelope Behavior | High |
| **18** | Behavior editing UI | Medium |
| **19** | Multi-user collaboration | Low |
| **20** | Session-based cached streaming | High |
| **21** | Sound Walk Composer (Routes + OSRM) | High |

---

**Last Updated:** 2026-03-21 (Pruned for clarity)
