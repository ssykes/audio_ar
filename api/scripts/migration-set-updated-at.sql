-- Migration: Set updated_at for existing soundscapes
-- Run this once to ensure all soundscapes have updated_at set
-- For soundscapes that haven't been modified, use created_at

-- Update soundscapes where updated_at is NULL (if any exist)
UPDATE soundscapes 
SET updated_at = created_at 
WHERE updated_at IS NULL;

-- Update waypoints where updated_at is NULL (if any exist)
UPDATE waypoints 
SET updated_at = created_at 
WHERE updated_at IS NULL;

-- Verify the migration
SELECT 
    'soundscapes' as table_name,
    COUNT(*) as total_rows,
    COUNT(updated_at) as with_updated_at,
    MIN(updated_at) as earliest_update,
    MAX(updated_at) as latest_update
FROM soundscapes
UNION ALL
SELECT 
    'waypoints' as table_name,
    COUNT(*) as total_rows,
    COUNT(updated_at) as with_updated_at,
    MIN(updated_at) as earliest_update,
    MAX(updated_at) as latest_update
FROM waypoints;

-- Expected output: All rows should have updated_at populated
