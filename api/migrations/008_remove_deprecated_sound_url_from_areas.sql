-- Remove deprecated sound_url column from areas table and add sound_id column
-- This makes the areas table consistent with the waypoints table

-- First, add the sound_id column to areas table if it doesn't exist
ALTER TABLE areas 
ADD COLUMN IF NOT EXISTS sound_id UUID REFERENCES sounds(id) ON DELETE SET NULL;

-- Then, remove the deprecated sound_url column
ALTER TABLE areas 
DROP COLUMN IF EXISTS sound_url;

-- Add an index on the foreign key column for performance
CREATE INDEX IF NOT EXISTS idx_areas_sound_id ON areas(sound_id);

-- Update the comment for the sound_id column
COMMENT ON COLUMN areas.sound_id IS 'Foreign key reference to sounds table (replaces deprecated sound_url)';