-- Add foreign key constraint for sound_id in waypoints table
-- Links waypoints.sound_id to sounds.id with appropriate referential action

-- Add foreign key constraint with ON DELETE SET NULL to prevent cascading deletions
-- This ensures that if a sound is deleted, the waypoint still exists but without a sound reference
ALTER TABLE waypoints 
ADD CONSTRAINT fk_waypoints_sound_id 
FOREIGN KEY (sound_id) REFERENCES sounds(id) 
ON DELETE SET NULL 
ON UPDATE CASCADE;

-- Additionally, add an index on the foreign key column for performance
CREATE INDEX idx_waypoints_sound_id ON waypoints(sound_id);