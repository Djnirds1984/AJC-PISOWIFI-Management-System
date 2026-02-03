-- Enhanced MAC Address Roaming Support Migration
-- Adds indexes and columns for improved roaming detection and session management

-- Ensure wifi_devices table has proper indexing for MAC roaming
CREATE INDEX IF NOT EXISTS idx_wifi_devices_session_token ON wifi_devices(session_token);
CREATE INDEX IF NOT EXISTS idx_wifi_devices_updated_at ON wifi_devices(updated_at);

-- Add updated_at column to sessions table if it doesn't exist
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add index on sessions.updated_at for cleanup operations
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);

-- Ensure proper foreign key relationships for session tracking
-- This helps with cross-machine session transfers
CREATE INDEX IF NOT EXISTS idx_sessions_token_mac ON sessions(token, mac);

-- Add a sessions_log table for tracking MAC address changes (optional but useful for debugging)
CREATE TABLE IF NOT EXISTS sessions_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT NOT NULL,
    old_mac TEXT,
    new_mac TEXT NOT NULL,
    change_type TEXT NOT NULL, -- 'roaming', 'initial', 'manual'
    ip_address TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_token) REFERENCES sessions(token)
);

-- Index for fast lookup of session logs
CREATE INDEX IF NOT EXISTS idx_sessions_log_token ON sessions_log(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_log_timestamp ON sessions_log(timestamp);

-- Create a view for monitoring active roaming sessions
CREATE VIEW IF NOT EXISTS active_roaming_sessions AS
SELECT 
    s.token,
    s.mac as current_mac,
    sl.old_mac,
    sl.new_mac,
    sl.timestamp as last_change,
    s.remaining_seconds,
    s.ip,
    CASE 
        WHEN sl.old_mac IS NOT NULL THEN 'ROAMING'
        ELSE 'STABLE'
    END as status
FROM sessions s
LEFT JOIN (
    SELECT 
        session_token,
        old_mac,
        new_mac,
        timestamp,
        ROW_NUMBER() OVER (PARTITION BY session_token ORDER BY timestamp DESC) as rn
    FROM sessions_log 
    WHERE change_type = 'roaming'
) sl ON s.token = sl.session_token AND sl.rn = 1
WHERE s.remaining_seconds > 0;

-- Add triggers to automatically log MAC changes
DROP TRIGGER IF EXISTS log_mac_changes;
CREATE TRIGGER log_mac_changes 
    AFTER UPDATE OF mac ON sessions
    FOR EACH ROW
    WHEN OLD.mac != NEW.mac
BEGIN
    INSERT INTO sessions_log (session_token, old_mac, new_mac, change_type, ip_address)
    VALUES (OLD.token, OLD.mac, NEW.mac, 'roaming', NEW.ip);
END;

-- Add trigger for initial MAC recording
DROP TRIGGER IF EXISTS log_initial_mac;
CREATE TRIGGER log_initial_mac
    AFTER INSERT ON sessions
    FOR EACH ROW
    WHEN NEW.mac IS NOT NULL
BEGIN
    INSERT INTO sessions_log (session_token, old_mac, new_mac, change_type, ip_address)
    VALUES (NEW.token, NULL, NEW.mac, 'initial', NEW.ip);
END;

-- Vacuum database to optimize after schema changes
VACUUM;

-- Analyze tables for better query planning
ANALYZE;

-- Migration completion message
SELECT 'Enhanced MAC roaming support migration completed successfully' as message;