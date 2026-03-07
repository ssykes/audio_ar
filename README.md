# WiFi MIDI Player for Coffee Shop Display

A complete guide to building a small, pretty WiFi-connected MIDI player for public spaces.

---

## Overview

**Architecture:**
```
Mac Mini (Composer) ──[WiFi/WebSocket]──→ Pi Zero 2W (Player) ──→ Speakers
```

- **Mac Mini**: Runs algorithmic composition software at your location
- **WiFi**: Wireless connection to coffee shop network
- **Pi Zero 2W**: Tiny, hidden player at coffee shop
- **Speakers**: Coffee shop audio system

---

## Hardware (~$100 total)

| Component | Price | Notes |
|-----------|-------|-------|
| **Raspberry Pi Zero 2 W** | $25 | Tiny (65×30mm), built-in WiFi |
| **HiFiBerry DAC Zero HAT** | $35 | Excellent audio, stacks on Pi |
| **Official Case** | $10 | Clean professional look |
| **Micro USB Power Supply** | $10 | 5V 2.5A |
| **32GB Micro SD Card** | $15 | For OS + SoundFonts |
| **3.5mm Audio Cable** | $5 | To coffee shop speakers |
| **Total** | **~$100** | |

### Where to Buy:
- Raspberry Pi: https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/
- HiFiBerry DAC: https://www.hifiberry.com/shop/boards/dac-zero/
- Case: https://www.raspberrypi.com/products/raspberry-pi-zero-2-case/

---

## Physical Setup

```
┌─────────────────────────────────────────┐
│  Coffee Shop                            │
│                                         │
│     ┌──────────┐                        │
│     │   Pi     │───────→ To Speakers    │
│     │  Zero 2W │    (3.5mm audio)       │
│     │ [WiFi]   │                        │
│     └────┬─────┘                        │
│          │                              │
│     [Power]                             │
│          │                              │
│     ┌────┴─────┐                        │
│     │  Wall    │                        │
│     │  Outlet  │                        │
│     └──────────┘                        │
│                                         │
│  Hide behind:                           │
│  - Counter                              │
│  - Shelf                                │
│  - Picture frame                        │
│  - Plant (with ventilation)             │
└─────────────────────────────────────────┘
```

### Installation Tips:
- **Location**: Near power outlet, within WiFi range
- **Ventilation**: Don't completely seal the case
- **Access**: Leave SD card accessible for updates
- **Security**: Mount where it can't be easily stolen

---

## Software Installation

### 1. Flash Raspberry Pi OS

Download **Raspberry Pi Imager**: https://www.raspberrypi.com/software/

**Settings:**
- OS: Raspberry Pi OS Lite (64-bit)
- Storage: 32GB SD card
- Click gear icon (Settings):
  - ✓ Enable SSH
  - ✓ Configure WiFi (coffee shop network name + password)
  - ✓ Set hostname: `coffee-player`
  - ✓ Set username/password (e.g., `pi` / `raspberry`)

### 2. First Boot

Insert SD card into Pi, connect power. Wait 2 minutes for first boot.

**SSH from Mac:**
```bash
ssh pi@coffee-player.local
# Password: raspberry (or what you set)
```

### 3. Install Software

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install audio + MIDI
sudo apt install -y \
    fluidsynth \
    libfluidsynth-dev \
    python3-pip \
    python3-rtmidi \
    git

# Install Python dependencies
pip3 install websockets rtmidi
```

### 4. Download SoundFont

```bash
cd ~
wget https://github.com/FluidSynth/fluidsynth/files/11899689/GeneralUser_GS_1.471.zip
unzip GeneralUser_GS_1.471.zip
```

### 5. Start FluidSynth

```bash
# Run in background
fluidsynth -a alsa -l -g 0.5 ~/GeneralUser_GS.sf2 &

# Test it works
aconnect -i  # Should show FluidSynth MIDI port
```

### 6. Deploy Player Software

Create the player script:

```bash
nano ~/coffee_player.py
```

Paste the code from [coffee_player.py](coffee_player.py) (see below).

### 7. Create systemd Service

```bash
sudo nano /etc/systemd/system/coffee-player.service
```

**Add:**
```ini
[Unit]
Description=Coffee Shop MIDI Player
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi
ExecStart=/usr/bin/python3 /home/pi/coffee_player.py
Restart=always

[Install]
WantedBy=multi-user.target
```

**Enable and start:**
```bash
sudo systemctl enable coffee-player
sudo systemctl start coffee-player
sudo systemctl status coffee-player
```

---

## Composer Software (Mac Mini)

Create `composer.py` on your Mac:

```python
#!/usr/bin/env python3
"""
Algorithmic Music Composer
Sends MIDI notes to coffee shop player via WebSocket
"""

import asyncio
import websockets
import json
import time
import random

class AlgorithmicComposer:
    def __init__(self, ws_url="ws://coffee-player.local:8765"):
        self.ws_url = ws_url
        self.websocket = None
        
    async def connect(self):
        """Connect to coffee shop player"""
        try:
            self.websocket = await websockets.connect(self.ws_url)
            print(f"✅ Connected to coffee shop player")
            return True
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False
            
    async def send_note(self, pitch, velocity, duration):
        """Send MIDI note with timestamp for latency compensation"""
        if not self.websocket:
            return
            
        note = {
            "type": "note_on",
            "pitch": pitch,
            "velocity": velocity,
            "duration": duration,
            "timestamp": time.time(),
        }
        
        await self.websocket.send(json.dumps(note))
        
    async def compose(self):
        """Generate algorithmic music"""
        while not await self.connect():
            print("Retrying in 5 seconds...")
            await asyncio.sleep(5)
        
        print("🎵 Starting composition...")
        
        while True:
            # Your algorithmic composition here
            pitch = random.randint(48, 84)  # C3 to C6
            velocity = random.randint(60, 100)
            duration = random.uniform(0.5, 2.0)
            
            await self.send_note(pitch, velocity, duration)
            
            # Wait before next note
            await asyncio.sleep(random.uniform(0.5, 1.5))

# Run
if __name__ == "__main__":
    composer = AlgorithmicComposer()
    asyncio.run(composer.compose())
```

**Run it:**
```bash
python3 composer.py
```

---

## Player Software (Pi Zero 2W)

Save as `~/coffee_player.py`:

```python
#!/usr/bin/env python3
"""
WebSocket MIDI Player with Latency Compensation
Receives notes from Mac Mini and plays via FluidSynth
"""

import asyncio
import websockets
import json
import time
import rtmidi
from collections import deque

class LatencyCompensator:
    """Continuously measures and compensates for network latency"""
    
    def __init__(self):
        self.latency_samples = deque(maxlen=50)
        self.base_latency = 30.0  # Start with 30ms estimate
        self.jitter_buffer = 20.0  # Extra buffer for WiFi variation
        
    def add_sample(self, send_time, receive_time):
        """Record latency measurement"""
        latency = (receive_time - send_time) * 1000  # ms
        self.latency_samples.append(latency)
        
        # Update average (use median for stability)
        if len(self.latency_samples) >= 10:
            sorted_samples = sorted(self.latency_samples)
            self.base_latency = sorted_samples[len(sorted_samples) // 2]
            
        return self.base_latency
    
    def get_play_time(self, receive_time):
        """Calculate when to play (compensated for latency + jitter)"""
        compensation = (self.base_latency + self.jitter_buffer) / 1000.0
        return receive_time + compensation

class CoffeeShopPlayer:
    def __init__(self):
        # MIDI output to FluidSynth
        self.midi_out = rtmidi.MidiOut()
        self.midi_out.open_virtual_port("WebSocket MIDI")
        
        # Latency compensation
        self.compensator = LatencyCompensator()
        
        # Audio stats
        self.notes_played = 0
        self.start_time = time.time()
        
    def schedule_note(self, pitch, velocity, duration, play_at):
        """Schedule MIDI note with timestamp"""
        # Note On
        note_on = [0x90, pitch, velocity]
        self.midi_out.send_message(note_on, play_at * 1000)
        
        # Note Off (scheduled)
        note_off = [0x80, pitch, 0]
        off_time = play_at + duration
        self.midi_out.send_message(note_off, off_time * 1000)
        
        self.notes_played += 1
        
    async def handle_message(self, websocket, message):
        """Process incoming WebSocket message"""
        try:
            note = json.loads(message)
            receive_time = time.time()
            
            # Measure latency if timestamp provided
            if 'timestamp' in note:
                send_time = note['timestamp']
                latency = self.compensator.add_sample(send_time, receive_time)
                
            # Calculate play time (compensated)
            play_time = self.compensator.get_play_time(receive_time)
            
            # Schedule the note
            if note.get('type') == 'note_on':
                self.schedule_note(
                    pitch=note['pitch'],
                    velocity=note['velocity'],
                    duration=note['duration'],
                    play_at=play_time
                )
                
        except Exception as e:
            print(f"Error processing note: {e}")
            
    async def status_report(self):
        """Print periodic status"""
        while True:
            await asyncio.sleep(60)
            elapsed = time.time() - self.start_time
            print(f"🎵 Playing for {elapsed/60:.1f} min | "
                  f"Notes: {self.notes_played} | "
                  f"Latency: {self.compensator.base_latency:.1f}ms")
            
    async def run(self):
        """Main server loop"""
        print("🎹 Coffee Shop MIDI Player starting...")
        print(f"📡 Listening on ws://0.0.0.0:8765")
        
        # Start status reporter
        asyncio.create_task(self.status_report())
        
        # Run WebSocket server
        async with websockets.serve(
            self.handle_message,
            "0.0.0.0",
            8765,
            ping_interval=30,
            ping_timeout=10
        ):
            await asyncio.Future()  # Run forever

# Run player
if __name__ == "__main__":
    player = CoffeeShopPlayer()
    asyncio.run(player.run())
```

---

## Network Setup

```
☕ Coffee Shop WiFi Router
       │
       │ WiFi
       │
┌──────┴──────┐
│  Pi Zero 2W │
│  (player)   │
└─────────────┘

🏠 Your Home/Studio (Mac Mini)
       │
       │ Internet
       │
       └────→ Connects to coffee shop WiFi
              Runs composer software
              Sends MIDI via WebSocket
```

### Important:
- Both Mac Mini and Pi need to connect to the **same WiFi network**
- If coffee shop has guest WiFi, make sure it allows device-to-device communication
- Some public WiFi networks block local traffic - test first!

---

## Testing & Calibration

### Test Network Connection

**From Mac:**
```bash
# Ping the Pi
ping coffee-player.local

# Should see:
# 64 bytes from ... time=25.3 ms
# 64 bytes from ... time=28.1 ms
# 64 bytes from ... time=24.9 ms
```

**Good latency:** <50ms average  
**Acceptable jitter:** <20ms variation

### Monitor Player Status

**SSH to Pi:**
```bash
ssh pi@coffee-player.local

# Check service status
sudo systemctl status coffee-player

# View logs
journalctl -u coffee-player -f

# Check network latency
ping router-ip
```

### Test Audio

```bash
# SSH to Pi
ssh pi@coffee-player.local

# Send test MIDI note
aconnect -i  # Find FluidSynth port number
amidi -p 'FluidSynth port' -S '90 3C 40'  # Play middle C
```

---

## Latency Compensation

### How It Works:

```
1. Mac Mini generates note at time T0
2. Note travels over WiFi (20-50ms)
3. Pi receives note at time T1
4. Pi calculates: latency = T1 - T0
5. Pi schedules playback: T1 + latency + buffer
6. Result: Notes play in sync with composition timing
```

### Why It Matters:

**Without compensation:**
- WiFi jitter causes timing variations
- Notes sound "rushy" or uneven
- Rhythm feels off

**With compensation:**
- Consistent timing despite WiFi variation
- Smooth, professional sound
- Algorithmic patterns preserved

---

## Troubleshooting

### WiFi Disconnects

```bash
# On Pi, check signal strength
iwconfig wlan0

# If weak signal:
# - Move Pi closer to router
# - Add WiFi antenna extension
# - Use WiFi repeater
```

### Audio Dropouts

```bash
# Increase FluidSynth buffer
fluidsynth -a alsa -l -g 0.8 --audio-channels=4 soundfont.sf2

# Or reduce polyphony in composer
# Limit simultaneous notes to 4-8
```

### High Latency (>100ms)

```bash
# Check coffee shop WiFi load
# Try 5GHz band if available
# Move Pi closer to router
# Ask coffee shop about network priority
```

### Can't Connect to Pi

```bash
# Check if Pi is on network
nmap -sn 192.168.1.0/24  # Find all devices

# Try IP address instead of hostname
ssh pi@192.168.1.XXX

# Check WiFi credentials
sudo nano /etc/wpa_supplicant/wpa_supplicant.conf
```

### Service Won't Start

```bash
# Check logs
sudo journalctl -u coffee-player -n 50

# Test script manually
python3 ~/coffee_player.py

# Check if port is in use
sudo netstat -tulpn | grep 8765
```

---

## Advanced Configuration

### Change SoundFont

```bash
# Download different SoundFont
wget <url-to-soundfont>.sf2

# Edit systemd service to use new SoundFont
sudo nano /etc/systemd/system/coffee-player.service

# Or start FluidSynth separately with different SF
```

### Adjust Volume

```bash
# In FluidSynth shell
fluidsynth -a alsa -l soundfont.sf2

# Commands:
gain 0.8        # Set master gain (0.0-1.0)
chorus 1        # Enable chorus
reverb 1        # Enable reverb
```

### Multiple Instruments

```python
# In composer.py, add instrument changes
note = {
    "type": "program_change",
    "program": 0  # Piano
}
await websocket.send(json.dumps(note))
```

### Static IP Address

```bash
# Edit netplan config
sudo nano /etc/netplan/01-netcfg.yaml

# Add:
network:
  wifis:
    wlan0:
      addresses: [192.168.1.100/24]
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
      access-points:
        "CoffeeShopWiFi":
          password: "password123"

# Apply
sudo netplan apply
```

---

## Security Considerations

### For Public Deployment:

1. **Change default password:**
   ```bash
   passwd
   ```

2. **Disable password login (use SSH keys):**
   ```bash
   ssh-keygen  # On Mac
   ssh-copy-id pi@coffee-player.local
   sudo nano /etc/ssh/sshd_config
   # Set: PasswordAuthentication no
   ```

3. **Firewall (optional):**
   ```bash
   sudo apt install ufw
   sudo ufw allow 22/tcp    # SSH
   sudo ufw allow 8765/tcp  # WebSocket
   sudo ufw enable
   ```

4. **Auto-updates:**
   ```bash
   sudo apt install unattended-upgrades
   ```

---

## Maintenance

### Weekly:
- Check logs: `journalctl -u coffee-player`
- Verify audio is playing
- Check WiFi signal strength

### Monthly:
- Update software: `sudo apt update && sudo apt upgrade`
- Check SD card health: `sudo smartctl -a /dev/mmcblk0`
- Clean dust from case

### As Needed:
- Update composition software on Mac
- Change SoundFont for different sounds
- Adjust volume/gain settings

---

## Cost Summary

| Item | Cost |
|------|------|
| Raspberry Pi Zero 2 W | $25 |
| HiFiBerry DAC Zero | $35 |
| Official Case | $10 |
| Power Supply | $10 |
| 32GB SD Card | $15 |
| Audio Cable | $5 |
| **Total** | **~$100** |

---

## Next Steps

1. [ ] Order hardware
2. [ ] Flash SD card with Raspberry Pi OS
3. [ ] Test on your network first
4. [ ] Configure for coffee shop WiFi
5. [ ] Install at coffee shop
6. [ ] Test WebSocket connection from Mac
7. [ ] Fine-tune latency compensation
8. [ ] Hide player in decor
9. [ ] Enjoy your algorithmic music installation! 🎹☕

---

## Support & Resources

- Raspberry Pi Docs: https://www.raspberrypi.com/documentation/
- FluidSynth: https://www.fluidsynth.org/
- WebSockets: https://websockets.readthedocs.io/
- RTMIDI: https://www.music.mcgill.ca/~gary/rtmidi/

---

**Happy composing!** 🎵
