-- Audio AR Database Schema
-- Supports multi-user workspaces with soundscapes and waypoints
-- Updated to reflect all migrations including sound library implementation

-- Enable UUID extension for better IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Soundscapes table (one user can have multiple soundscapes)
CREATE TABLE soundscapes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    -- FEATURE 25 decision 5: the dynamic-range fraction, an artistic setting on the piece.
    -- How much of the real loudness range between near and far is kept; 1.00 is true physics.
    -- Nullable so an existing soundscape keeps the engine default rather than being rewritten.
    dynamic_range NUMERIC(3,2),
    -- FEATURE 25 §13: how much reverberation the site has, as the wet/dry ratio the wash reaches
    -- at the edge of a waypoint's reach. A property of the PLACE, not of any one source — two
    -- sounds in the same street share the same reverberant field — so it lives here beside the
    -- fraction rather than on the waypoint. Nullable for the same reason: NULL means "never
    -- dialled, use the engine default", and the default is still being found by ear.
    reverb_wet NUMERIC(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- This file is a record, not a runner. The migration tool prints a green success over a real
-- failure, so the columns above must be applied to the live database BY HAND, by the owner:
--   ALTER TABLE soundscapes ADD COLUMN dynamic_range NUMERIC(3,2);
--   ALTER TABLE soundscapes ADD COLUMN reverb_wet NUMERIC(3,2);
-- Then verify they actually exist rather than trusting any tool's output:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'soundscapes' AND column_name IN ('dynamic_range','reverb_wet');
-- dynamic_range was applied 2026-11-14. reverb_wet NOT YET APPLIED.
-- ⚠️ The API needs a restart afterwards, and the deploy script does NOT restart it — it only
-- checks that a process manager is running and prints a green OK. Restart by hand.

-- Sounds table (sound library for user sounds)
CREATE TABLE sounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'file', -- 'file', 'url', 'oscillator', 'noise', 'recording'
    filepath VARCHAR(512),                   -- For file type
    url TEXT,                                -- For URL type
    config_json JSONB NOT NULL DEFAULT '{}', -- For oscillator/noise configs
    file_size BIGINT,                        -- File size in bytes
    duration DOUBLE PRECISION,               -- Duration in seconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Waypoints table (sounds in each soundscape)
CREATE TABLE waypoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    soundscape_id UUID NOT NULL REFERENCES soundscapes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL DEFAULT 'Sound',
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    sound_id UUID REFERENCES sounds(id) ON DELETE SET NULL,  -- Foreign key to sounds table
    type VARCHAR(50) DEFAULT 'file',
    volume DOUBLE PRECISION DEFAULT 0.8,
    loop BOOLEAN DEFAULT true,
    activation_radius DOUBLE PRECISION DEFAULT 20.0,
    -- FEATURE 25 §12: physical width of the source in metres. Above zero the stereo file is split
    -- across two spatialisers that many metres apart, which is what puts the sound outside the
    -- listener's head. 0 keeps the single-point rendering, so every existing waypoint is unchanged.
    width DOUBLE PRECISION DEFAULT 0,
    -- FEATURE 25 §13: how much of the site's reverberation this recording accepts, as a multiplier
    -- on what the distance curve asks for. A property of the RECORDING, not the place: a dry studio
    -- voice wants the full site, a recording made in a cathedral already carries its own space.
    -- 1.0 is neutral, which is what every existing waypoint gets.
    reverb_send NUMERIC(3,2) DEFAULT 1.0,
    icon VARCHAR(50) DEFAULT '🎵',
    color VARCHAR(50) DEFAULT '#00d9ff',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Applied BY HAND, by the owner — the migration tool lies:
--   ALTER TABLE waypoints ADD COLUMN width DOUBLE PRECISION DEFAULT 0;
--   ALTER TABLE waypoints ADD COLUMN reverb_send NUMERIC(3,2) DEFAULT 1.0;
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'waypoints' AND column_name IN ('width','reverb_send');
-- NOT YET APPLIED as of 2026-11-14. Both defaults reproduce today's behaviour exactly, so applying
-- them changes nothing audible on its own.

-- Behaviors table (optional: for tempo_sync, time_sync, etc.)
CREATE TABLE behaviors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    soundscape_id UUID NOT NULL REFERENCES soundscapes(id) ON DELETE CASCADE,   
    type VARCHAR(50) NOT NULL,
    member_ids UUID[] NOT NULL,  -- Array of waypoint IDs
    config_json JSONB NOT NULL DEFAULT '{}',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Areas table (sound polygons in each soundscape)
CREATE TABLE areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    soundscape_id UUID NOT NULL REFERENCES soundscapes(id) ON DELETE CASCADE,   
    name VARCHAR(255) NOT NULL DEFAULT 'Area',
    polygon JSONB NOT NULL,  -- [{lat, lng}, ...]
    sound_id UUID REFERENCES sounds(id) ON DELETE SET NULL,  -- Foreign key to sounds table
    type VARCHAR(50) DEFAULT 'file',
    volume DOUBLE PRECISION DEFAULT 0.8,
    loop BOOLEAN DEFAULT true,
    fade_zone_width DOUBLE PRECISION DEFAULT 5.0,
    overlap_mode VARCHAR(50) DEFAULT 'mix',  -- 'mix' | 'opaque'
    "order" INTEGER DEFAULT 0,
    icon VARCHAR(50) DEFAULT '◈',
    color VARCHAR(50) DEFAULT '#ff6b6b',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_soundscapes_user_id ON soundscapes(user_id);
CREATE INDEX idx_waypoints_soundscape_id ON waypoints(soundscape_id);
CREATE INDEX idx_waypoints_sound_id ON waypoints(sound_id);  -- Index for sound lookups
CREATE INDEX idx_behaviors_soundscape_id ON behaviors(soundscape_id);
CREATE INDEX idx_areas_soundscape_id ON areas(soundscape_id);
CREATE INDEX idx_areas_sound_id ON areas(sound_id);  -- Index for sound lookups
CREATE INDEX idx_sounds_user_id ON sounds(user_id);  -- Index for user's sounds
CREATE INDEX idx_users_email ON users(email);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_soundscapes_updated_at BEFORE UPDATE ON soundscapes       
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_waypoints_updated_at BEFORE UPDATE ON waypoints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_areas_updated_at BEFORE UPDATE ON areas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to ssykes user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ssykes;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ssykes;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ssykes;