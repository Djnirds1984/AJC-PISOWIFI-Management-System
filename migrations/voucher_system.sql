-- AJC PisoWiFi Voucher System Database Schema
-- Run this to restore voucher functionality

-- Create vouchers table
CREATE TABLE IF NOT EXISTS vouchers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    code TEXT UNIQUE NOT NULL,
    minutes INTEGER NOT NULL,
    price INTEGER NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
    download_limit INTEGER DEFAULT 0,
    upload_limit INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    used_by_mac TEXT,
    used_by_ip TEXT,
    session_token TEXT
);

-- Create voucher usage logs table
CREATE TABLE IF NOT EXISTS voucher_usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id TEXT NOT NULL,
    voucher_code TEXT NOT NULL,
    mac_address TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    minutes_granted INTEGER NOT NULL,
    price INTEGER NOT NULL,
    session_token TEXT,
    used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
);

-- Add voucher_code column to sessions table if it doesn't exist
ALTER TABLE sessions ADD COLUMN voucher_code TEXT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_expires_at ON vouchers(expires_at);
CREATE INDEX IF NOT EXISTS idx_voucher_usage_logs_voucher_id ON voucher_usage_logs(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_usage_logs_mac ON voucher_usage_logs(mac_address);
CREATE INDEX IF NOT EXISTS idx_sessions_voucher_code ON sessions(voucher_code);

-- Insert some sample vouchers for testing
INSERT OR IGNORE INTO vouchers (id, code, minutes, price, expires_at) VALUES 
('voucher_sample_1', 'AJC12345', 30, 5, datetime('now', '+30 days')),
('voucher_sample_2', 'AJC67890', 60, 10, datetime('now', '+30 days')),
('voucher_sample_3', 'AJCTEST1', 120, 20, datetime('now', '+30 days'));

-- Verify tables were created
SELECT 'Vouchers table created' as status, count(*) as sample_vouchers FROM vouchers;
SELECT 'Voucher usage logs table created' as status FROM voucher_usage_logs LIMIT 1;