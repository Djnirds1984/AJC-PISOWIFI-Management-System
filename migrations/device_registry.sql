-- Device Registry for Hardware-Based Session Ownership
-- This table tracks device hardware signatures to prevent session theft

CREATE TABLE IF NOT EXISTS device_registry (
    mac TEXT PRIMARY KEY,
    hardware_signature TEXT UNIQUE NOT NULL,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    session_count INTEGER DEFAULT 0
);

-- Index for fast hardware signature lookups
CREATE INDEX IF NOT EXISTS idx_device_registry_hardware ON device_registry(hardware_signature);

-- Index for MAC lookups
CREATE INDEX IF NOT EXISTS idx_device_registry_mac ON device_registry(mac);

-- Trigger to update last_seen timestamp
CREATE TRIGGER IF NOT EXISTS update_device_last_seen 
    AFTER UPDATE ON device_registry
    FOR EACH ROW
BEGIN
    UPDATE device_registry 
    SET last_seen = CURRENT_TIMESTAMP 
    WHERE mac = NEW.mac;
END;

-- Sample data for testing (optional)
-- INSERT OR IGNORE INTO device_registry (mac, hardware_signature) VALUES 
-- ('AA:BB:CC:DD:EE:FF', 'hw_sig_device_a'),
-- ('11:22:33:44:55:66', 'hw_sig_device_b');