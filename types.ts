export type BoardType = 'raspberry_pi' | 'orange_pi' | 'x64_pc' | 'none';

export interface SystemConfig {
  boardType: BoardType;
  coinPin: number;
}

export interface Rate {
  id: string;
  pesos: number;
  minutes: number;
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
  Devices = 'devices'
}

export interface UpdateLog {
  timestamp: string;
  type: 'info' | 'error' | 'success';
  message: string;
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
}

export interface DeviceSession {
  deviceId: string;
  startTime: number;
  endTime?: number;
  duration: number;
  dataUsed?: number;
}