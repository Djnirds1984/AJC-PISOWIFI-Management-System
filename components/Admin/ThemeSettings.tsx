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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
        <div className="mb-8">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Interface Appearance</h3>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Admin Theme System</h2>
          <p className="text-slate-500 text-sm mt-2">Select a visual system optimized for your specific hardware and environment.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {THEMES.map((theme) => (
            <div 
              key={theme.id}
              onClick={() => handleThemeChange(theme.id)}
              className={`
                relative cursor-pointer overflow-hidden rounded-3xl border-2 transition-all duration-300 group
                ${currentTheme === theme.id 
                  ? 'border-blue-600 shadow-xl scale-[1.02] bg-slate-50' 
                  : 'border-slate-100 hover:border-slate-300 hover:scale-[1.01] bg-white'}
              `}
            >
              <div className="p-6 h-full flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{theme.name}</h3>
                    <div className="flex items-center mt-2 space-x-2">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                        theme.performanceScore === 100 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        Perf Score: {theme.performanceScore}%
                      </span>
                      {currentTheme === theme.id && (
                        <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-1 rounded-full uppercase tracking-wider">
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
                
                <p className="text-sm text-slate-500 font-medium leading-relaxed mb-6 flex-grow">
                  {theme.description}
                </p>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                   <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${currentTheme === theme.id ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'}`}></div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {currentTheme === theme.id ? 'Currently Active' : 'Click to Apply'}
                      </span>
                   </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="bg-blue-50 rounded-3xl p-6 border border-blue-100 flex items-start gap-4">
        <div className="text-2xl">💡</div>
        <div>
          <h4 className="text-sm font-black text-blue-900 uppercase tracking-tight mb-1">Performance Note</h4>
          <p className="text-xs text-blue-800/80 font-medium leading-relaxed">
            Using the "System Terminal" theme can reduce rendering load by up to 40% on single-board computers like Raspberry Pi Zero or Orange Pi One.
            "Midnight" theme is recommended for screens to reduce power consumption.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ThemeSettings;
