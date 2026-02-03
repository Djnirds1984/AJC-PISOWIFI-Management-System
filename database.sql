-- PisoWifi Database Export
-- Generated: 2026-02-02T05:32:40.534Z
-- Tables: rates, sqlite_sequence, sessions, config, hotspots, wireless_settings, wifi_devices, device_sessions, bridges, vlans, admin, admin_sessions, pppoe_server, pppoe_users, license_info, pppoe_profiles, pppoe_billing_profiles, chat_messages, gaming_rules, multi_wan_config

-- Table: rates
CREATE TABLE rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pesos INTEGER,
    minutes INTEGER
  , download_limit INTEGER DEFAULT 0, upload_limit INTEGER DEFAULT 0);

-- Table: wireless_settings
CREATE TABLE wireless_settings (
    interface TEXT PRIMARY KEY,
    ssid TEXT,
    password TEXT,
    channel INTEGER DEFAULT 1,
    hw_mode TEXT DEFAULT 'g'
  , bridge TEXT);

-- Table: wifi_devices
CREATE TABLE wifi_devices (
    id TEXT PRIMARY KEY,
    mac TEXT NOT NULL,
    ip TEXT NOT NULL,
    hostname TEXT,
    interface TEXT NOT NULL,
    ssid TEXT,
    signal INTEGER DEFAULT 0,
    connected_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    session_time INTEGER,
    is_active INTEGER DEFAULT 0,
    custom_name TEXT
  , download_limit INTEGER DEFAULT 0, upload_limit INTEGER DEFAULT 0);

-- Table: device_sessions
CREATE TABLE device_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    duration INTEGER DEFAULT 0,
    data_used INTEGER DEFAULT 0,
    FOREIGN KEY (device_id) REFERENCES wifi_devices(id)
  );

-- Table: sessions
CREATE TABLE sessions (
    mac TEXT PRIMARY KEY,
    ip TEXT,
    remaining_seconds INTEGER,
    total_paid INTEGER,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , token TEXT, download_limit INTEGER DEFAULT 0, upload_limit INTEGER DEFAULT 0, is_paused INTEGER DEFAULT 0);

-- Table: vlans
CREATE TABLE vlans (
    name TEXT PRIMARY KEY,
    parent TEXT NOT NULL,
    id INTEGER NOT NULL
  );

-- Table: admin
CREATE TABLE admin (
    username TEXT PRIMARY KEY,
    password_hash TEXT,
    salt TEXT
  );

-- Table: admin_sessions
CREATE TABLE admin_sessions (
    token TEXT PRIMARY KEY,
    username TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  );

-- Table: pppoe_server
CREATE TABLE pppoe_server (
    interface TEXT PRIMARY KEY,
    local_ip TEXT NOT NULL,
    ip_pool_start TEXT NOT NULL,
    ip_pool_end TEXT NOT NULL,
    dns1 TEXT DEFAULT '8.8.8.8',
    dns2 TEXT DEFAULT '8.8.4.4',
    service_name TEXT DEFAULT '',
    enabled INTEGER DEFAULT 0
  );

-- Table: pppoe_users
CREATE TABLE pppoe_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , billing_profile_id INTEGER);

-- Table: license_info
CREATE TABLE license_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hardware_id TEXT UNIQUE NOT NULL,
    license_key TEXT,
    is_active INTEGER DEFAULT 0,
    activated_at DATETIME,
    trial_started_at DATETIME,
    trial_expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , is_revoked INTEGER DEFAULT 0, expires_at DATETIME);

-- Table: pppoe_profiles
CREATE TABLE pppoe_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rate_limit_dl INTEGER DEFAULT 0,
    rate_limit_ul INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

-- Table: pppoe_billing_profiles
CREATE TABLE pppoe_billing_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES pppoe_profiles(id)
  );

-- Table: chat_messages
CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    recipient TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read INTEGER DEFAULT 0
  );

-- Table: gaming_rules
CREATE TABLE gaming_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    protocol TEXT NOT NULL, -- 'tcp', 'udp', 'both'
    port_start INTEGER NOT NULL,
    port_end INTEGER NOT NULL,
    enabled INTEGER DEFAULT 1
  );

-- Table: multi_wan_config
CREATE TABLE multi_wan_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER DEFAULT 0,
    mode TEXT DEFAULT 'pcc', -- 'pcc' or 'ecmp'
    pcc_method TEXT DEFAULT 'both_addresses', -- 'both_addresses', 'both_addresses_ports'
    interfaces TEXT DEFAULT '[]' -- JSON array of interfaces
  );

-- Table: config
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT
  );

-- Table: hotspots
CREATE TABLE hotspots (
    interface TEXT PRIMARY KEY,
    ip_address TEXT,
    dhcp_range TEXT,
    bandwidth_limit INTEGER,
    enabled INTEGER DEFAULT 0
  );

-- Table: bridges
CREATE TABLE bridges (
    name TEXT PRIMARY KEY,
    members TEXT,
    stp INTEGER DEFAULT 0
  );

-- Data for rates
INSERT INTO rates (id, pesos, minutes, download_limit, upload_limit) VALUES (1, 5, 120, 10, 10);

-- Data for admin
INSERT INTO admin (username, password_hash, salt) VALUES ('admin', '0d837ce81d8e3baf386a4d86fbec5b38704b7ea637fe857cae1f29dbbf21d7a34ecb09e4ef6c90bea0fa3929e6630fa39cd7812c9865d1e071b5e737b89574eb', 'fe570a2be373ee7bba5b301d7ad812a2');

-- Data for admin_sessions
INSERT INTO admin_sessions (token, username, created_at, expires_at) VALUES ('7a7ee830685a286ff2642e3e741449d5d518d6c91c5d08087afefc2a93639ecf', 'admin', '2026-01-20 04:16:06', '2026-01-21T04:16:06.246Z');
INSERT INTO admin_sessions (token, username, created_at, expires_at) VALUES ('f12303ba52fbd2f149234dfb55887401698c35d093f4285c5df87f4f487669ab', 'admin', '2026-01-20 04:16:06', '2026-01-21T04:16:06.288Z');
INSERT INTO admin_sessions (token, username, created_at, expires_at) VALUES ('58ab3e1a7dba420f90a3941879ce42deeb33efd6ad491a25a66b4717e006595a', 'admin', '2026-01-20 04:27:10', '2026-01-21T04:27:10.104Z');
INSERT INTO admin_sessions (token, username, created_at, expires_at) VALUES ('2cb2e301cd66ebb01e9d9f0536b56b2539ae92e27528d12fe04f2f4ec184ed1c', 'admin', '2026-02-01 12:20:32', '2026-02-02T12:20:32.156Z');
INSERT INTO admin_sessions (token, username, created_at, expires_at) VALUES ('11dae0f49795a2fdf59a2922a5c2f702c233d9b17a7592bba8f5a421d5994cce', 'admin', '2026-02-01 13:05:37', '2026-02-02T13:05:37.383Z');
INSERT INTO admin_sessions (token, username, created_at, expires_at) VALUES ('34e5ff3e03347bdbd4b82862d920ba70145655bc82cc8de596559106388f9c74', 'admin', '2026-02-01 13:06:22', '2026-02-02T13:06:22.917Z');
INSERT INTO admin_sessions (token, username, created_at, expires_at) VALUES ('890037e50e61d2eb3f7f3e39802a4533e2cd9a0f318d17c0a8e5e126d0a33052', 'admin', '2026-02-02 05:17:31', '2026-02-03T05:17:31.969Z');
INSERT INTO admin_sessions (token, username, created_at, expires_at) VALUES ('0de140768d8c96df9e681aefd4eeba7ca99a3cea86f27dc20d972bed1303dc3b', 'admin', '2026-02-02 05:25:30', '2026-02-03T05:25:30.551Z');
INSERT INTO admin_sessions (token, username, created_at, expires_at) VALUES ('f7c749f4c72c9034cc5fd0955e67cd230f04b07f6ba132c57ab197bc1f968b84', 'admin', '2026-02-02 05:28:33', '2026-02-03T05:28:33.944Z');

-- Data for license_info
INSERT INTO license_info (id, hardware_id, license_key, is_active, activated_at, trial_started_at, trial_expires_at, created_at, is_revoked, expires_at) VALUES (4, 'WIN-60F67771B604', 'f0220ac595f1d9ad08f55bedfb0d6a54', 1, '2026-02-02T02:56:09.523+00:00', NULL, NULL, '2026-02-02T02:54:21.899367+00:00', 0, NULL);
INSERT INTO license_info (id, hardware_id, license_key, is_active, activated_at, trial_started_at, trial_expires_at, created_at, is_revoked, expires_at) VALUES (19, 'CPU-00000000d00629bc', 'd693b6fba6b2aed59cc2ef9a638d54dd', 1, '2026-01-31T12:59:37.812+00:00', NULL, NULL, '2026-01-28T15:27:43.075397+00:00', 0, NULL);

-- Data for gaming_rules
INSERT INTO gaming_rules (id, name, protocol, port_start, port_end, enabled) VALUES (1, 'Mobile Legends', 'both', 30000, 30300, 1);
INSERT INTO gaming_rules (id, name, protocol, port_start, port_end, enabled) VALUES (2, 'Mobile Legends (Voice)', 'udp', 5000, 5200, 1);
INSERT INTO gaming_rules (id, name, protocol, port_start, port_end, enabled) VALUES (3, 'Call of Duty Mobile', 'udp', 7000, 9000, 1);
INSERT INTO gaming_rules (id, name, protocol, port_start, port_end, enabled) VALUES (4, 'PUBG Mobile', 'udp', 10000, 20000, 1);
INSERT INTO gaming_rules (id, name, protocol, port_start, port_end, enabled) VALUES (5, 'League of Legends: Wild Rift', 'both', 10001, 10010, 1);
INSERT INTO gaming_rules (id, name, protocol, port_start, port_end, enabled) VALUES (6, 'Roblox', 'udp', 49152, 65535, 1);

-- Data for config
INSERT INTO config (key, value) VALUES ('boardType', 'raspberry_pi');
INSERT INTO config (key, value) VALUES ('coinPin', '2');
INSERT INTO config (key, value) VALUES ('qos_discipline', 'cake');
INSERT INTO config (key, value) VALUES ('serialPort', '/dev/ttyUSB0');
INSERT INTO config (key, value) VALUES ('espIpAddress', '192.168.4.1');
INSERT INTO config (key, value) VALUES ('espPort', '80');
INSERT INTO config (key, value) VALUES ('coinSlots', '[]');
INSERT INTO config (key, value) VALUES ('nodemcuDevices', '[]');
INSERT INTO config (key, value) VALUES ('default_download_limit', '5');
INSERT INTO config (key, value) VALUES ('default_upload_limit', '5');
INSERT INTO config (key, value) VALUES ('cloud_vendor_id', '7ff9ecb4-0a66-446b-8f58-ed921721ec2c');

-- Data for hotspots
INSERT INTO hotspots (interface, ip_address, dhcp_range, bandwidth_limit, enabled) VALUES ('br0', '10.0.0.1', '10.0.0.50,10.0.0.250', NULL, 1);

-- Data for bridges
INSERT INTO bridges (name, members, stp) VALUES ('br0', '["wlan0","enx00e04c360c82","ifb0","ztwfue5e6p"]', 0);

-- Data for multi_wan_config
INSERT INTO multi_wan_config (id, enabled, mode, pcc_method, interfaces) VALUES (1, 0, 'pcc', 'both_addresses', '[]');

-- Data for wireless_settings
INSERT INTO wireless_settings (interface, ssid, password, channel, hw_mode, bridge) VALUES ('wlan0', 'AJC_PisoWifi_Hotspot', '', 1, 'g', 'br0');

