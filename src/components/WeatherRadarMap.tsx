import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icons } from './WeatherIcons';
import { Location } from '../types';
import { cn } from '../lib/utils';
import { Haptic } from '../lib/haptics';
import { Translate } from '../lib/translations';

interface WeatherRadarMapProps {
  activeLocation: Location;
  onClose: () => void;
  hapticEnabled: boolean;
  lang: string;
}

type RadarLayer = 'temp' | 'rain' | 'clouds' | 'wind';

export default function WeatherRadarMap({ activeLocation, onClose, hapticEnabled, lang }: WeatherRadarMapProps) {
  const [activeLayer, setActiveLayer] = useState<RadarLayer>('rain');
  const [iframeLoading, setIframeLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isWeakNetwork, setIsWeakNetwork] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      setIsOffline(true);
      setIsWeakNetwork(false);
    };

    const checkConnection = () => {
      const conn = (navigator as any).connection;
      if (conn) {
        setIsWeakNetwork(conn.effectiveType === '2g' || conn.effectiveType === '3g' || conn.saveData);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const conn = (navigator as any).connection;
    if (conn) {
      conn.addEventListener('change', checkConnection);
      checkConnection();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (conn) {
        conn.removeEventListener('change', checkConnection);
      }
    };
  }, []);

  // Re-trigger loading state when layer or city coordinates change with safety timeout fallback
  useEffect(() => {
    if (isOffline || isWeakNetwork) return;
    setIframeLoading(true);
    
    const fallbackTimer = setTimeout(() => {
      setIframeLoading(false);
    }, 2000); // Faster fallback to let the user see whatever is loading immediately

    return () => clearTimeout(fallbackTimer);
  }, [activeLayer, activeLocation.latitude, activeLocation.longitude, isOffline, isWeakNetwork]);

  const layers: { id: RadarLayer; label: string; icon: keyof typeof Icons; desc: string }[] = [
    { 
      id: 'rain', 
      label: 'Precip', 
      icon: 'CloudRain', 
      desc: 'Real-time rain, snow, thunder & precipitation forecast loops' 
    },
    { 
      id: 'temp', 
      label: 'Temp', 
      icon: 'Thermometer', 
      desc: 'Thermal contour visualizer showing global heat and cold gradients' 
    },
    { 
      id: 'clouds', 
      label: 'Clouds', 
      icon: 'Cloud', 
      desc: 'High-resolution satellite view mapping cloud density and visibility' 
    },
    { 
      id: 'wind', 
      label: 'Wind', 
      icon: 'Wind', 
      desc: 'Dynamic streamline particle map depicting wind velocities and direction' 
    },
  ];

  const currentLayerObj = layers.find(l => l.id === activeLayer);

  // Construct Windy Embed URL centering on the active city coordinates
  const lat = activeLocation.latitude.toFixed(4);
  const lon = activeLocation.longitude.toFixed(4);
  const embedUrl = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=6&level=surface&overlay=${activeLayer}&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default`;

  return (
    <>
      {/* Outer bounds constraints matching mobile structure */}
      <div className="max-w-[390px] mx-auto w-full h-full flex flex-col px-6 pt-[calc(env(safe-area-inset-top,24px)+56px)] pb-8 overflow-hidden">
        
        {/* HEADER */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex flex-col gap-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.2em]"><Translate text="LIVE RADAR" lang={lang} /></p>
            </div>
            <h1 className="text-[28px] font-bold text-app-text tracking-tight leading-none">
              <Translate text={activeLocation.name} lang={lang} />
            </h1>
          </div>

          <motion.button 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            type="button"
            onClick={() => {
              Haptic.medium(hapticEnabled);
              onClose();
            }}
            className="w-12 h-12 bg-app-surface border border-app-border backdrop-blur-md flex items-center justify-center rounded-full text-app-text hover:bg-app-surface/80 transition-all shadow-xl select-none mt-1 cursor-pointer"
            aria-label="Back"
          >
            <Icons.ChevronLeft className="w-5.5 h-5.5 text-app-text" strokeWidth={2.5} />
          </motion.button>
        </div>

        {/* INTERACTIVE CONTROLS */}
        <div className="flex p-1 bg-app-text/[0.04] border border-app-border/30 rounded-[16px] w-full mb-4 relative">
          {layers.map((layer) => {
            const isSelected = activeLayer === layer.id;
            const IconComponent = Icons[layer.icon];
            return (
              <button
                key={layer.id}
                onClick={() => {
                  if (!isSelected) {
                    Haptic.light(hapticEnabled);
                    setActiveLayer(layer.id);
                  }
                }}
                className={cn(
                  "flex-1 py-2 flex flex-col items-center justify-center gap-1 text-[9px] min-[360px]:text-[10px] font-bold rounded-[14px] relative z-10 min-w-0 px-0.5 transition-all duration-200",
                  isSelected ? "text-black" : "text-app-text-dim hover:text-app-text/70"
                )}
              >
                <IconComponent className={cn("w-4 h-4 shrink-0", isSelected ? "text-black" : "text-app-text-dim")} />
                <span className="whitespace-nowrap truncate w-full text-center tracking-tight px-0.5"><Translate text={layer.label} lang={lang} /></span>
                {isSelected && (
                  <div
                    className="absolute inset-0 bg-white rounded-[14px] -z-10 shadow-md"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* MAP PANEL */}
        <div 
          className="flex-1 w-full relative rounded-[28px] overflow-hidden border border-app-border bg-[#08080a] shadow-2xl group flex flex-col justify-center items-center"
          style={{ touchAction: 'none' }}
        >
          {/* Subtle meteorological coordinate blueprint grid */}
          <div className="absolute inset-0 opacity-15 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
          
          {isOffline || isWeakNetwork ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-black/80 z-20 gap-4">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2">
                <Icons.CloudOff className="w-8 h-8 text-app-text-dim" strokeWidth={1.5} />
              </div>
              <p className="text-[12px] font-black text-white uppercase tracking-[0.15em] leading-none">
                {isOffline ? <Translate text="NO NETWORK CONNECTION" lang={lang} /> : <Translate text="WEAK CONNECTION detected" lang={lang} />}
              </p>
              <p className="text-[14px] text-app-text-dim max-w-[280px] leading-relaxed mt-1">
                {isOffline 
                  ? <Translate text="Connect to the internet to view real-time meteorological radar simulations." lang={lang} />
                  : <Translate text="Your connection is too weak to stream high-density live radar simulations." lang={lang} />
                }
              </p>
            </div>
          ) : (
            <>
              {/* Live Embed Iframe */}
              <iframe
                id="radar-iframe"
                src={embedUrl}
                className="w-full h-full border-0 rounded-[28px] select-none relative z-10"
                style={{ touchAction: 'none' }}
                allowFullScreen
                onLoad={() => setIframeLoading(false)}
              />

              {/* Loading Layer */}
              <AnimatePresence>
                {iframeLoading && (
                  <motion.div 
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-transparent pointer-events-none z-20 gap-4"
                  >
                    <div className="relative flex items-center justify-center">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="w-12 h-12 border-2 border-indigo-500/10 rounded-full border-t-2 border-t-indigo-500" 
                      />
                      <Icons.Map className="w-5 h-5 text-indigo-400 absolute animate-pulse" />
                    </div>
                    <div className="flex flex-col items-center text-center gap-1">
                      <p className="text-xs font-bold uppercase tracking-widest text-[#a5cbfb]"><Translate text="Loading Live Radar" lang={lang} /></p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

      </div>
    </>
  );
}
