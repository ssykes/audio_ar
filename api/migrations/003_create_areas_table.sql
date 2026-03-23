-- Migration: 003_create_areas_table.sql
-- Creates the areas table for polygon-shaped sound zones
-- Date: 2026-03-23

CREATE TABLE areas (
  id              TEXT PRIMARY KEY,
  soundscape_id   TEXT NOT NULL REFERENCES soundscapes(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  polygon         JSONB NOT NULL,          -- [{lat, lng}, ...]
  sound_url       TEXT NOT NULL,
  volume          REAL DEFAULT 0.8,
  loop            BOOLEAN DEFAULT TRUE,
  fade_zone_width REAL DEFAULT 5.0,        -- meters
  overlap_mode    TEXT DEFAULT 'mix',      -- 'mix' | 'opaque'
  "order"         INTEGER DEFAULT 0,       -- placement order for opaque priority
  icon            TEXT DEFAULT '◈',        -- diamond for Areas
  color           TEXT DEFAULT '#ff6b6b',  -- red-ish
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for soundscape lookup
CREATE INDEX idx_areas_soundscape ON areas(soundscape_id);

-- Index for sorting
CREATE INDEX idx_areas_sort_order ON areas(sort_order);

-- Comment
COMMENT ON TABLE areas IS 'Polygon-shaped sound zones (vs. point-source waypoints)';
COMMENT ON COLUMN areas.polygon IS 'Array of {lat, lng} vertices defining the polygon';
COMMENT ON COLUMN areas.fade_zone_width IS 'Width of fade zone at boundary in meters';
COMMENT ON COLUMN areas.overlap_mode IS 'How to handle overlap: mix (crossfade) or opaque (mask)';
COMMENT ON COLUMN areas."order" IS 'Placement order for opaque priority (higher = on top)';
