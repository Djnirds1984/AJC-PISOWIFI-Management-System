export type BoardType = 'raspberry_pi' | 'orange_pi' | 'x64_pc' | 'none';

export interface SystemConfig {
  boardType: BoardType;
  coinPin: number;
  boardModel?: string | null;
}

export interface Rate {
  id: string;
  pesos: number;
  minutes: number;
  download_limit?: number; // Mbps
  upload_limit?: number; // Mbps
}

export interface QoSConfig {
  discipline: 'cake' | 'fq_codel';
}

export interface NetworkInterface {
  name: string;
  type: 'ethernet' | 'wifi' | 'bridge' | 'vlan' | 'loopback';
  status: 'up' | 'down';
  ip?: string;
  mac: string;
  isLoopback?: boolean;
}

export interface WirelessConfig {
  interface: string;
  ssid: string;
  password?: string;
  channel: number;
  hw_mode: 'g' | 'a';
  bridge?: string;
}

export interface HotspotInstance {
  interface: string;
  ip_address: string;
  dhcp_range: string;
  bandwidth_limit: number;
  enabled: number;
}

export interface WanConfig {
  proto: 'static' | 'dhcp';
  ipaddr: string;
  netmask: string;
  gateway: string;
  dns: string[];
}

export interface VlanConfig {
  id: number;
  parentInterface: string;
  name: string;
}

export interface PPPoEServerConfig {
  interface: string;
  local_ip: string;
  ip_pool_start: string;
  ip_pool_end: string;
  dns1?: string;
  dns2?: string;
  service_name?: string;
  enabled: number;
}

export interface PPPoEUser {
  id?: number;
  username: string;
  password: string;
  enabled: number;
  ip_address?: string;
  created_at?: string;
}

export interface PPPoESession {
  username: string;
  ip: string;
  interface: string;
  uptime: number;
  rx_bytes: number;
  tx_bytes: number;
}

export interface UserSession {
  mac: string;
  ip: string;
  remainingSeconds: number;
  totalPaid: number;
  connectedAt: number;
  downloadLimit?: number;
  uploadLimit?: number;
}

export interface WifiDevice {
  id: string;
  mac: string;
  ip: string;
  hostname: string;
  interface: string;
  ssid: string;
  signal: number;
  connectedAt: number;
  lastSeen: number;
  sessionTime?: number;
  isActive: boolean;
  customName?: string;
  totalPaid?: number;
  downloadLimit?: number;
  uploadLimit?: number;
}

export interface DeviceSession {
  id: number;
  deviceId: string;
  startTime: number;
  endTime?: number;
  duration: number;
  dataUsed: number;
}

export interface AnalyticsData {
  date: string;
  earnings: number;
  users: number;
}

export enum AdminTab {
  Analytics = 'analytics',
  Rates = 'rates',
  Network = 'network',
  Hardware = 'hardware',
  System = 'system',
  Updater = 'updater',
  Devices = 'devices',
  Themes = 'themes',
  PortalEditor = 'portal_editor'
}

export interface UpdateLog {
  timestamp: string;
  version: string;
  description: string;
  status: 'success' | 'failed';
}

export interface SystemStats {
  cpu: {
    manufacturer: string;
    brand: string;
    speed: number;
    cores: number;
    load: number;
    temp: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    active: number;
    available: number;
  };
  network: {
    iface: string;
    rx_bytes: number;
    tx_bytes: number;
    rx_sec: number;
    tx_sec: number;
  }[];
}

// ============================================
// VENDOR DASHBOARD TYPES
// ============================================

export interface VendorMachine {
  id: string;
  vendor_id: string;
  hardware_id: string;
  machine_name: string;
  location: string | null;
  license_key: string | null;
  is_licensed: boolean;
  activated_at: string | null;
  status: 'online' | 'offline' | 'maintenance';
  last_seen: string;
  coin_slot_pulses: number;
  total_revenue: number;
  created_at: string;
  updated_at: string;
}

export interface SalesLog {
  id: string;
  vendor_id: string;
  machine_id: string;
  amount: number;
  currency: string;
  session_duration: number | null;
  data_used: number | null;
  customer_mac: string | null;
  customer_ip: string | null;
  transaction_type: 'coin_insert' | 'voucher' | 'refund';
  created_at: string;
  notes: string | null;
}

export interface VendorDashboardSummary {
  vendor_id: string;
  total_machines: number;
  online_machines: number;
  total_revenue: number;
  total_transactions: number;
  revenue_24h: number;
  revenue_7d: number;
  revenue_30d: number;
}

export interface VendorProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface RealtimeVendorUpdate {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'vendors' | 'sales_logs';
  record: VendorMachine | SalesLog;
  old_record?: VendorMachine | SalesLog;
}

