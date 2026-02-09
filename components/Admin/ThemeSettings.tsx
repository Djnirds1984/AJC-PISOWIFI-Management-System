import React, { useState, useEffect } from 'react';
import { THEMES, ThemeId, getStoredAdminTheme, setAdminTheme } from '../../lib/theme';

const ThemeSettings: React.FC = () => {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>('default');

  useEffect(() => {
    setCurrentTheme(getStoredAdminTheme());
  }, []);

  const handleThemeChange = (id: ThemeId) => {
    setCurrentTheme(id);
    setAdminTheme(id);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <section className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <div className="mb-6">
          <h2 className="text-sm font-black text-slate-900 tracking-tight uppercase tracking-widest flex items-center gap-2">
            <span className="p-1.5 bg-blue-600 rounded-lg text-white">🎨</span>
            Theme Engine
          </h2>
          <p className="text-slate-400 text-[9px] font-bold uppercase tracking-tighter mt-1">Select visual architecture for admin dashboard</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {THEMES.map((theme) => (
            <div 
              key={theme.id}
              onClick={() => handleThemeChange(theme.id)}
              className={`
                relative cursor-pointer overflow-hidden rounded-xl border transition-all duration-200 group
                ${currentTheme === theme.id 
                  ? 'border-blue-600 shadow-lg bg-blue-50/30' 
                  : 'border-slate-100 hover:border-slate-300 bg-white'}
              `}
            >
              <div className="p-3 h-full flex flex-col">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-[11px] font-black text-slate-900 uppercase">{theme.name}</h3>
                    <div className="flex items-center mt-1 space-x-1">
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${
                        theme.performanceScore === 100 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        PERF: {theme.performanceScore}%
                      </span>
                      {currentTheme === theme.id && (
                        <span className="text-[8px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">
                          ACTIVE
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex -space-x-1.5">
                    {theme.previewColors.map((color, i) => (
                      <div 
                        key={i} 
                        className="w-5 h-5 rounded-full border border-white shadow-sm" 
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                
                <p className="text-[9px] text-slate-500 font-bold leading-tight mb-3 flex-grow uppercase tracking-tighter">
                  {theme.description}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                   <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${currentTheme === theme.id ? 'bg-blue-500 animate-pulse' : 'bg-slate-200'}`}></div>
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                        {currentTheme === theme.id ? 'Running' : 'Select'}
                      </span>
                   </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="bg-blue-900/5 rounded-xl p-3 border border-blue-100 flex items-start gap-3">
        <div className="text-lg">⚡</div>
        <div>
          <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-tight">Optimization Advisory</h4>
          <p className="text-[9px] text-blue-800/70 font-bold uppercase tracking-tighter leading-normal">
            Terminal theme reduces load by 40% on low-spec hardware (Pi Zero/Orange Pi One).
            Midnight theme is optimized for OLED displays.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ThemeSettings;
