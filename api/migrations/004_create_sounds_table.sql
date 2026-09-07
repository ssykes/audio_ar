-- Create sounds table for the sound library
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

-- Index for performance
CREATE INDEX idx_sounds_user_id ON sounds(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_sounds_updated_at BEFORE UPDATE ON sounds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();