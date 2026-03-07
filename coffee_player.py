#!/usr/bin/env python3
"""
WebSocket MIDI Player with Latency Compensation
Receives notes from Mac Mini and plays via FluidSynth

Save as: ~/coffee_player.py on Raspberry Pi Zero 2 W
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
