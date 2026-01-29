import React from 'react';
import { createRoot } from 'react-dom/client';
import LandingPageOptimized from './components/Portal/LandingPageOptimized';
import './dist/portal-lightweight.css';

// Lightweight entry point for optimized bundle
const root = createRoot(document.getElementById('root')!);

// Mock minimal dependencies for old devices
const mockRates = [
  { pesos: 5, minutes: 30, description: '₱5 = 30 minutes' },
  { pesos: 10, minutes: 60, description: '₱10 = 1 hour' },
  { pesos: 20, minutes: 120, description: '₱20 = 2 hours' },
  { pesos: 50, minutes: 300, description: '₱50 = 5 hours' }
];

const mockSessions = [];

// Minimal API functions for old devices
const startSession = (pesos: number) => {
  return fetch('/api/start-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pesos })
  }).then(res => res.json());
};

const refreshSessions = () => {
  return fetch('/api/sessions').then(res => res.json());
};

const restoreSession = (sessionId: string) => {
  return fetch('/api/restore-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  }).then(res => res.json());
};

// Render optimized app
root.render(
  <React.StrictMode>
    <LandingPageOptimized
      rates={mockRates}
      sessions={mockSessions}
      onSessionStart={startSession}
      refreshSessions={refreshSessions}
      onRestoreSession={restoreSession}
    />
  </React.StrictMode>
);