-- Audio AR Database Schema
-- Supports multi-user workspaces with soundscapes and waypoints

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
    sound_url VARCHAR(512) NOT NULL,
    volume DOUBLE PRECISION DEFAULT 0.8,
    loop BOOLEAN DEFAULT true,
    activation_radius DOUBLE PRECISION DEFAULT 20.0,
    icon VARCHAR(50) DEFAULT '🎵',
    color VARCHAR(50) DEFAULT '#00d9ff',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

-- Create indexes for performance
CREATE INDEX idx_soundscapes_user_id ON soundscapes(user_id);
CREATE INDEX idx_waypoints_soundscape_id ON waypoints(soundscape_id);
CREATE INDEX idx_behaviors_soundscape_id ON behaviors(soundscape_id);
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

-- Grant permissions to audio_ar_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO audio_ar_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO audio_ar_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO audio_ar_user;
