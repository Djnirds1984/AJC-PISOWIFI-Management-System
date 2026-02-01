-- Migration: Add centralized machine key to vendors table
-- Purpose: This allows machines to be managed centrally with a shared key
-- This enables centralized management where multiple machines can be grouped under a single key

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS centralized_key TEXT;

-- Add index for faster lookups by centralized key
CREATE INDEX IF NOT EXISTS idx_vendors_centralized_key ON vendors(centralized_key);

-- Add comment to document the purpose
COMMENT ON COLUMN vendors.centralized_key IS 'Shared key for centralized machine management';