-- Add session_id column to sessions table for new Session ID system
-- This column will store the unique session identifier from browser storage

ALTER TABLE sessions ADD COLUMN session_id TEXT;

-- Create index for faster session ID lookups
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);

-- Update existing sessions to have session_id = token for backward compatibility
-- This ensures existing sessions continue to work
UPDATE sessions 
SET session_id = token 
WHERE session_id IS NULL AND token IS NOT NULL;

-- Log the migration
INSERT INTO system_logs (level, message, timestamp) 
VALUES ('INFO', 'Added session_id column to sessions table', datetime('now'))
ON CONFLICT DO NOTHING;