export type BoardType = 'raspberry_pi' | 'orange_pi' | 'x64_pc' | 'none';

export interface SystemConfig {
  boardType: BoardType;
  coinPin: number;
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
