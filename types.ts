
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

export interface WanConfig {
  proto: 'static' | 'dhcp';
  ipaddr: string;
  netmask: string;
  gateway: string;
  dns: string[];
}

export interface WlanConfig {
  ssid: string;
  encryption: 'psk2' | 'none' | 'wpa3';
  key: string;
  channel: number;
  power: number;
}

export interface HotspotConfig {
  name: string;
  maxClients: number;
  bandwidthLimit: number; // in Mbps
  enabled: boolean;
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
  Updater = 'updater'
}

export interface UpdateLog {
  timestamp: string;
  type: 'info' | 'error' | 'success';
  message: string;
}
