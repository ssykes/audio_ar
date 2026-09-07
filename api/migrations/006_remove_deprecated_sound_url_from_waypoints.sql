-- Remove deprecated sound_url column from waypoints table
-- This assumes we're migrating to use sound_id only for referencing sounds

-- First, ensure all data is migrated to sound_id (if needed for existing data)
-- For a fresh database, this step is not necessary

-- Drop the deprecated column
ALTER TABLE waypoints DROP COLUMN IF EXISTS sound_url;

-- If needed, add a comment to document the change
COMMENT ON COLUMN waypoints.sound_id IS 'Foreign key reference to sounds table (replaces deprecated sound_url)';