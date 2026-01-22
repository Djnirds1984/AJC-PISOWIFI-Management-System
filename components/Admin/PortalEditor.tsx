import React, { useState, useEffect } from 'react';
import { PortalConfig, getPortalConfig, setPortalConfig, DEFAULT_PORTAL_CONFIG } from '../../lib/theme';

const PortalEditor: React.FC = () => {
  const [config, setConfig] = useState<PortalConfig>(DEFAULT_PORTAL_CONFIG);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setConfig(getPortalConfig());
  }, []);

  const [mode, setMode] = useState<'visual' | 'code'>('visual');

  const handleChange = (key: keyof PortalConfig, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    setPortalConfig(config);
    setHasChanges(false);
    // Optional: Trigger a toast or notification
    alert('Portal configuration saved successfully!');
  };

  const handleReset = () => {
    if (confirm('Reset portal configuration to defaults?')) {
      setConfig(DEFAULT_PORTAL_CONFIG);
      setPortalConfig(DEFAULT_PORTAL_CONFIG);
      setHasChanges(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Editor Column */}
      <div className="space-y-6">
        <section className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Captive Portal</h3>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Portal Designer</h2>
            </div>
            {hasChanges && (
              <span className="bg-yellow-100 text-yellow-700 text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-widest animate-pulse">
                Unsaved Changes
              </span>
            )}
          </div>

          {/* Mode Switcher */}
          <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
            <button
              onClick={() => setMode('visual')}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                mode === 'visual' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              🎨 Visual Editor
            </button>
            <button
              onClick={() => setMode('code')}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                mode === 'code' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              👨‍💻 Code Editor
            </button>
          </div>

          {mode === 'visual' ? (
            <div className="space-y-6">
            {/* Text Content */}
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Portal Title</label>
              <input 
                type="text" 
                value={config.title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
            
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Subtitle / Slogan</label>
              <input 
                type="text" 
                value={config.subtitle}
                onChange={(e) => handleChange('subtitle', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            <div className="h-px bg-slate-100 my-6"></div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={config.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    className="h-10 w-10 rounded-lg cursor-pointer border-0 p-0"
                  />
                  <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200">{config.primaryColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Secondary Color</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={config.secondaryColor}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    className="h-10 w-10 rounded-lg cursor-pointer border-0 p-0"
                  />
                  <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200">{config.secondaryColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Background</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={config.backgroundColor}
                    onChange={(e) => handleChange('backgroundColor', e.target.value)}
                    className="h-10 w-10 rounded-lg cursor-pointer border-0 p-0"
                  />
                  <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200">{config.backgroundColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Text Color</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={config.textColor}
                    onChange={(e) => handleChange('textColor', e.target.value)}
                    className="h-10 w-10 rounded-lg cursor-pointer border-0 p-0"
                  />
                  <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200">{config.textColor}</span>
                </div>
              </div>
            </div>
          </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-black text-purple-600 uppercase tracking-widest mb-2">Custom CSS</label>
                <p className="text-[10px] text-slate-400 mb-2">Styles injected into the portal page head. Use specific selectors.</p>
                <textarea 
                  value={config.customCss || ''}
                  onChange={(e) => handleChange('customCss', e.target.value)}
                  placeholder=".portal-header { background: red !important; }"
                  className="w-full h-32 bg-slate-900 text-green-400 font-mono text-xs p-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-purple-600 uppercase tracking-widest mb-2">Header HTML Injection</label>
                <p className="text-[10px] text-slate-400 mb-2">HTML content inserted below the header.</p>
                <textarea 
                  value={config.customHtmlTop || ''}
                  onChange={(e) => handleChange('customHtmlTop', e.target.value)}
                  placeholder="<div class='alert'>Welcome to my Wifi!</div>"
                  className="w-full h-24 bg-slate-900 text-blue-400 font-mono text-xs p-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-purple-600 uppercase tracking-widest mb-2">Footer HTML Injection</label>
                <p className="text-[10px] text-slate-400 mb-2">HTML content inserted above the footer.</p>
                <textarea 
                  value={config.customHtmlBottom || ''}
                  onChange={(e) => handleChange('customHtmlBottom', e.target.value)}
                  placeholder="<div>Call 555-0123 for support</div>"
                  className="w-full h-24 bg-slate-900 text-blue-400 font-mono text-xs p-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
          )}

          <div className="mt-8 flex gap-4">
            <button 
              onClick={handleSave}
              className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
            >
              Save Configuration
            </button>
            <button 
              onClick={handleReset}
              className="px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-red-500 transition-all"
            >
              Reset
            </button>
          </div>
        </section>
      </div>

      {/* Live Preview Column */}
      <div className="space-y-6">
        <div className="flex justify-between items-center px-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Live Mobile Preview</h3>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">iPhone 13 View</span>
        </div>

        <div className="mx-auto w-[320px] h-[640px] border-[12px] border-slate-900 rounded-[3rem] shadow-2xl overflow-hidden bg-white relative">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-32 bg-slate-900 rounded-b-2xl z-50"></div>
          
          {/* Preview Content */}
          <div 
            className="h-full w-full overflow-y-auto flex flex-col"
            style={{ backgroundColor: config.backgroundColor, color: config.textColor }}
          >
            {/* Header */}
            <div 
              className="pt-12 pb-16 px-6 text-center rounded-b-[30px] shadow-lg relative"
              style={{ background: `linear-gradient(135deg, ${config.primaryColor} 0%, ${config.secondaryColor} 100%)`, color: '#fff' }}
            >
              <h1 className="text-xl font-black tracking-tight mb-1 uppercase">{config.title}</h1>
              <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">{config.subtitle}</p>
            </div>

            {/* Card */}
            <div className="flex-1 px-4 -mt-8 relative z-10">
              <div 
                className="bg-white/90 backdrop-blur-sm p-6 rounded-[30px] shadow-xl border border-white/20 text-center"
                style={{ color: '#0f172a' }}
              >
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: config.primaryColor }}>Authenticated Session</p>
                <h2 className="text-4xl font-black mb-4 tracking-tighter">00:00:00</h2>
                
                <div className="flex justify-center gap-2 mb-6">
                   <div className="h-2 w-2 rounded-full bg-green-500"></div>
                   <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Internet Active</span>
                </div>

                <button 
                  className="w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-white shadow-lg mb-3"
                  style={{ background: `linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)` }}
                >
                  Pause Time
                </button>
                <button className="w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-slate-100 text-slate-500">
                  Insert Coin
                </button>
              </div>

              {/* Rates Preview */}
              <div className="mt-6 grid grid-cols-2 gap-3 pb-8">
                {[1, 5].map((amt) => (
                   <div key={amt} className="bg-white p-3 rounded-2xl text-center shadow-sm border border-slate-100">
                      <span className="block text-xl font-black text-slate-900">₱{amt}</span>
                      <span className="block text-[8px] font-bold uppercase tracking-widest" style={{ color: config.primaryColor }}>
                        {amt === 1 ? '10 Mins' : '1 Hour'}
                      </span>
                   </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalEditor;
