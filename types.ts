
export type BoardType = 'raspberry_pi' | 'orange_pi' | 'none';

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
  type: 'ethernet' | 'wifi' | 'bridge';
  status: 'up' | 'down';
  ip?: string;
  mac: string;
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
  Updater = 'updater'
}

export interface UpdateLog {
  timestamp: string;
  type: 'info' | 'error' | 'success';
  message: string;
}
