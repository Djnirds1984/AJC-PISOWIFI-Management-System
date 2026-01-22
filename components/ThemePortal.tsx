import React, { useState, useEffect } from 'react';
import { THEMES, setTheme, getStoredTheme, ThemeId } from '../../lib/theme';

const ThemePortal: React.FC = () => {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>('default');

  useEffect(() => {
    setCurrentTheme(getStoredTheme());
  }, []);

  const handleThemeChange = (id: ThemeId) => {
    setTheme(id);
    setCurrentTheme(id);
  };

  const handleBack = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-main)] transition-colors duration-300">
      <div className="max-w-4xl mx-auto p-6">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight mb-2">Theme Portal</h1>
            <p className="text-[var(--text-muted)]">Select a visual system optimized for your hardware.</p>
          </div>
          <button 
            onClick={handleBack}
            className="px-6 py-2 rounded-full bg-[var(--bg-card)] border border-[var(--border)] font-medium hover:bg-[var(--bg)] transition-all"
          >
            Exit Portal
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {THEMES.map((theme) => (
            <div 
              key={theme.id}
              onClick={() => handleThemeChange(theme.id)}
              className={`
                relative cursor-pointer overflow-hidden rounded-3xl border-2 transition-all duration-300 group
                ${currentTheme === theme.id 
                  ? 'border-[var(--primary)] shadow-xl scale-[1.02]' 
                  : 'border-[var(--border)] hover:border-[var(--text-muted)] hover:scale-[1.01]'}
              `}
            >
              <div className="p-6 bg-[var(--bg-card)] h-full flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold">{theme.name}</h3>
                    <div className="flex items-center mt-1 space-x-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        theme.performanceScore === 100 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        Performance: {theme.performanceScore}%
                      </span>
                      {currentTheme === theme.id && (
                        <span className="text-xs bg-[var(--primary)] text-white px-2 py-1 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex -space-x-2">
                    {theme.previewColors.map((color, i) => (
                      <div 
                        key={i} 
                        className="w-8 h-8 rounded-full border-2 border-white shadow-sm" 
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                
                <p className="text-[var(--text-muted)] text-sm mb-6 flex-grow">
                  {theme.description}
                </p>

                {/* Live Preview Mini-UI */}
                <div className="mt-auto rounded-xl p-4 border border-[var(--border)]" style={{
                  backgroundColor: theme.id === 'dark' || theme.id === 'terminal' ? '#000' : '#f8fafc'
                }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-2 w-1/3 rounded bg-[var(--primary)] opacity-50"></div>
                    <div className="h-6 w-6 rounded-full bg-[var(--primary)]"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-2 w-full rounded bg-[var(--text-muted)] opacity-20"></div>
                    <div className="h-2 w-2/3 rounded bg-[var(--text-muted)] opacity-20"></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)]">
          <h2 className="text-lg font-bold mb-4">Performance Metrics</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-muted)]">Current Render Cost</span>
              <span className="font-mono font-bold text-[var(--primary)]">
                {currentTheme === 'terminal' ? '~0.2ms' : currentTheme === 'default' ? '~1.5ms' : '~1.2ms'}
              </span>
            </div>
            <div className="w-full bg-[var(--border)] rounded-full h-2">
              <div 
                className="bg-[var(--primary)] h-2 rounded-full transition-all duration-500" 
                style={{ width: `${100 - (THEMES.find(t => t.id === currentTheme)?.performanceScore || 90) + 20}%` }}
              ></div>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Lower render cost improves battery life and responsiveness on single-board computers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemePortal;
