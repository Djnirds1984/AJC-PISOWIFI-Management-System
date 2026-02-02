-- Database Fingerprint Support Migration
-- Adds device_fingerprint column for persistent device identification
-- This helps with cross-machine roaming when MAC addresses change

-- For LOCAL SQLite database (sessions table)
ALTER TABLE sessions ADD COLUMN device_fingerprint TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_device_fingerprint ON sessions(device_fingerprint);

-- For SUPABASE/PostgreSQL database (clients table)
ALTER TABLE clients ADD COLUMN device_fingerprint TEXT;
CREATE INDEX IF NOT EXISTS idx_clients_device_fingerprint ON clients(device_fingerprint);

-- Add some comments about the purpose
-- This column stores SHA256 hashes of device fingerprints for persistent identification
-- even when MAC addresses change due to roaming between access points
-- The fingerprint combines IP, User-Agent, and Accept-Language for stable identification