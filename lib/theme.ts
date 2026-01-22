export type ThemeId = 'default' | 'dark' | 'eco' | 'terminal';

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
  }
];

export const STORAGE_KEY = 'ajc_pisowifi_theme';

export function getStoredTheme(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEY);
  return (stored as ThemeId) || 'default';
}

export function setTheme(themeId: ThemeId) {
  localStorage.setItem(STORAGE_KEY, themeId);
  document.documentElement.setAttribute('data-theme', themeId);
}

export function initTheme() {
  const theme = getStoredTheme();
  setTheme(theme);
}
