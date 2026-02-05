-- Add is_transfer_allowed column to sessions table for MAC transfer control
-- This column controls whether a session can be transferred to a different MAC address

ALTER TABLE sessions ADD COLUMN is_transfer_allowed INTEGER DEFAULT 0;

-- Create index for faster transfer permission lookups
CREATE INDEX IF NOT EXISTS idx_sessions_transfer_allowed ON sessions(is_transfer_allowed);

-- Set existing sessions to not allow transfer by default (security)
UPDATE sessions 
SET is_transfer_allowed = 0 
WHERE is_transfer_allowed IS NULL;

-- Log the migration
INSERT INTO system_logs (level, message, timestamp) 
VALUES ('INFO', 'Added is_transfer_allowed column to sessions table', datetime('now'))
ON CONFLICT DO NOTHING;