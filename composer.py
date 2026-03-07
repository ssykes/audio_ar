#!/usr/bin/env python3
"""
Algorithmic Music Composer
Sends MIDI notes to coffee shop player via WebSocket

Save as: composer.py on Mac Mini
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
            # This is a simple random generator - replace with your own algorithm
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
