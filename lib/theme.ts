import { apiClient } from './api';

export type ThemeId = 'default' | 'dark' | 'eco' | 'terminal' | 'light_minimal';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  performanceScore: number; // 1-100, higher is better
  previewColors: string[];
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'default',
    name: 'Classic Blue',
    description: 'Standard professional interface with balanced contrast.',
    performanceScore: 90,
    previewColors: ['#2563eb', '#f8fafc', '#0f172a']
  },
  {
    id: 'dark',
    name: 'Midnight',
    description: 'High contrast dark mode, optimized for OLED and low light.',
    performanceScore: 92,
    previewColors: ['#1e293b', '#0f172a', '#38bdf8']
  },
  {
    id: 'eco',
    name: 'Eco Saver',
    description: 'Soft natural tones with reduced blue light emission.',
    performanceScore: 95,
    previewColors: ['#166534', '#f0fdf4', '#14532d']
  },
  {
    id: 'terminal',
    name: 'System Terminal',
    description: 'Ultra-lightweight, no gradients, minimal rendering cost.',
    performanceScore: 100,
    previewColors: ['#000000', '#22c55e', '#000000']
  },
  {
    id: 'light_minimal',
    name: 'Light Minimal',
    description: 'Clean, bright interface with soft blue accents and geometric typography.',
    performanceScore: 98,
    previewColors: ['#f8fafc', '#3b82f6', '#1e293b']
  }
];

export const ADMIN_THEME_KEY = 'ajc_pisowifi_theme';
export const PORTAL_CONFIG_KEY = 'ajc_portal_config';

export interface PortalConfig {
  title: string;
  subtitle: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  customCss?: string;
  customHtmlTop?: string; // Injected below header
  customHtmlBottom?: string; // Injected above footer
  insertCoinAudio?: string; // Path to audio file
  coinDropAudio?: string; // Path to audio file
  connectedAudio?: string; // Path to audio file
}

export const DEFAULT_PORTAL_CONFIG: PortalConfig = {
  title: 'AJC PISOWIFI',
  subtitle: 'Enterprise Internet Gateway',
  primaryColor: '#3b82f6', // soft blue-500
  secondaryColor: '#1d4ed8', // soft blue-700
  backgroundColor: '#ffffff', // pure white
  textColor: '#1e293b', // slate-800
  customCss: '',
  customHtmlTop: '',
  customHtmlBottom: '',
  insertCoinAudio: '',
  coinDropAudio: '',
  connectedAudio: ''
};

// --- Admin Theme Utilities ---

export function getStoredAdminTheme(): ThemeId {
  const stored = localStorage.getItem(ADMIN_THEME_KEY);
  return (stored as ThemeId) || 'default';
}

export function setAdminTheme(themeId: ThemeId) {
  localStorage.setItem(ADMIN_THEME_KEY, themeId);
  document.documentElement.setAttribute('data-theme', themeId);
}

export function initAdminTheme() {
  const theme = getStoredAdminTheme();
  setAdminTheme(theme);
}

// --- Portal Config Utilities ---

export function getPortalConfig(): PortalConfig {
  try {
    const stored = localStorage.getItem(PORTAL_CONFIG_KEY);
    return stored ? { ...DEFAULT_PORTAL_CONFIG, ...JSON.parse(stored) } : DEFAULT_PORTAL_CONFIG;
  } catch (e) {
    return DEFAULT_PORTAL_CONFIG;
  }
}

export function setPortalConfig(config: PortalConfig) {
  localStorage.setItem(PORTAL_CONFIG_KEY, JSON.stringify(config));
}

export async function fetchPortalConfig(): Promise<PortalConfig> {
  try {
    const remote = await apiClient.getPortalConfig();
    if (remote && Object.keys(remote).length > 0) {
        const merged = { ...DEFAULT_PORTAL_CONFIG, ...remote };
        setPortalConfig(merged);
        return merged;
    }
    return getPortalConfig();
  } catch (e) {
    console.error('Failed to fetch portal config from server, using local', e);
    return getPortalConfig();
  }
}

export async function savePortalConfigRemote(config: PortalConfig) {
  setPortalConfig(config);
  await apiClient.savePortalConfig(config);
}

// Helper to apply portal config to CSS variables (if we decide to use them for portal too)
// For now, the Portal component will read this directly.
export function initTheme() {
  initAdminTheme();
}
