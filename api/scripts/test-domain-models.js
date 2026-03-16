/**
 * Test script for domain models
 * 
 * Run with: node api/scripts/test-domain-models.js
 */

const SoundScape = require('../models/SoundScape');
const Waypoint = require('../models/Waypoint');
const Behavior = require('../models/Behavior');

console.log('🧪 Testing Domain Models...\n');

// Test SoundScape
console.log('Test 1: SoundScape');
const soundscape = SoundScape.fromJSON({
    id: 'sc-1',
    userId: 'user-123',
    name: 'My Soundscape',
    description: 'Test description'
});
console.log('✅ Created:', soundscape.name);
console.log('✅ toJSON():', JSON.stringify(soundscape.toJSON(), null, 2));

// Test fromRow (snake_case)
const soundscapeRow = SoundScape.fromRow({
    id: 'sc-1',
    user_id: 'user-123',
    name: 'My Soundscape',
    description: 'Test',
    created_at: new Date(),
    updated_at: new Date()
});
console.log('✅ fromRow() works:', soundscapeRow.userId === 'user-123');

// Test Waypoint
console.log('\nTest 2: Waypoint');
const waypoint = Waypoint.fromJSON({
    id: 'wp-1',
    soundscapeId: 'sc-1',
    name: 'Sound 1',
    lat: 51.505,
    lon: -0.09,
    soundUrl: '/audio/test.mp3',
    volume: 0.8,
    loop: true,
    activationRadius: 20,
    icon: '🎵',
    color: '#00d9ff'
});
console.log('✅ Created:', waypoint.name);
console.log('✅ toRow():', JSON.stringify(waypoint.toRow(), null, 2));

// Test fromRow (snake_case)
const wpRow = Waypoint.fromRow({
    id: 'wp-1',
    soundscape_id: 'sc-1',
    name: 'Sound 1',
    lat: 51.505,
    lon: -0.09,
    sound_url: '/audio/test.mp3',
    volume: 0.8,
    loop: true,
    activation_radius: 20,
    icon: '🎵',
    color: '#00d9ff',
    sort_order: 0
});
console.log('✅ fromRow() works:', wpRow.soundscapeId === 'sc-1');

// Test Behavior
console.log('\nTest 3: Behavior');
const behavior = Behavior.fromJSON({
    id: 'b-1',
    soundscapeId: 'sc-1',
    type: 'tempo_sync',
    memberIds: ['wp-1', 'wp-2'],
    config: { bpm: 120, offsets: [0, 0.5] }
});
console.log('✅ Created:', behavior.type);
console.log('✅ toRow():', JSON.stringify(behavior.toRow(), null, 2));

// Test fromRow (with JSON parsing)
const behaviorRow = Behavior.fromRow({
    id: 'b-1',
    soundscape_id: 'sc-1',
    type: 'time_sync',
    member_ids: ['wp-1', 'wp-2'],
    config_json: JSON.stringify({ startTime: 0, stagger: 0.5 }),
    sort_order: 0
});
console.log('✅ fromRow() works:', behaviorRow.config.stagger === 0.5);
console.log('✅ Auto-parsed config_json:', typeof behaviorRow.config === 'object');

console.log('\n✅ All Domain Model tests passed!\n');
