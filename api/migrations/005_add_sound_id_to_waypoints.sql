-- Add sound_id column to waypoints table to reference the sounds table
ALTER TABLE waypoints ADD COLUMN sound_id UUID REFERENCES sounds(id);

-- Optionally migrate existing sound_url values to sound_id if they correspond to sound IDs
-- This would be done with a custom script if needed