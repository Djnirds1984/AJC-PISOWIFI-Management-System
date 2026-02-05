-- Add used_by_session_id column to vouchers table for Session ID binding
-- This column will store the Session ID that used the voucher

ALTER TABLE vouchers ADD COLUMN used_by_session_id TEXT;

-- Create index for faster Session ID lookups
CREATE INDEX IF NOT EXISTS idx_vouchers_used_by_session_id ON vouchers(used_by_session_id);

-- Log the migration
INSERT OR IGNORE INTO system_logs (level, message, timestamp) 
VALUES ('INFO', 'Added used_by_session_id column to vouchers table', datetime('now'));