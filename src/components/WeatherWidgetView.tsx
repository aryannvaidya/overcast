import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sun, 
  Cloud, 
  CloudRain, 
  CloudLightning, 
  CloudSnow, 
  Droplet, 
  Wind, 
  Eye, 
  Compass, 
  Clock, 
  ArrowLeft, 
  Sparkles,
  Layers,
  Palette,
  Play,
  Copy,
  Check,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Location, WeatherData, Settings } from '../types';
import { WeatherIcon } from './WeatherIcons';
import { getWeatherInfo, parseTimeToAbsoluteDate } from '../services/weatherService';
import { translateWmoCode, t } from '../lib/translations';
import { formatTemp, formatWind, formatPrecipitation } from '../lib/units';
import { calibrateTemperature, getMLModelStats } from '../services/mlService';
import { parseISO } from 'date-fns';
import { cn } from '../lib/utils';

interface WeatherWidgetViewProps {
  locations: Location[];
  weatherData: Record<number, WeatherData>;
  activeLocationIndex: number;
  settings: Settings;
  onClose: () => void;
}

export default function WeatherWidgetView({
  locations,
  weatherData,
  activeLocationIndex,
  settings,
  onClose
}: WeatherWidgetViewProps) {
  // Parse URL Search Parameters for embedding options
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isEmbed = searchParams.get('embed') === 'true';

  // Customize states (synced with settings but customizable in Studio)
  const [layout, setLayout] = useState<'mini' | 'detailed' | 'forecast'>(() => {
    const urlVal = searchParams.get('layout');
    if (urlVal === 'mini' || urlVal === 'detailed' || urlVal === 'forecast') return urlVal;
    return settings.widgetLayout || 'detailed';
  });

  const [theme, setTheme] = useState<'glass' | 'black' | 'gradient'>(() => {
    const urlVal = searchParams.get('theme');
    if (urlVal === 'glass' || urlVal === 'black' || urlVal === 'gradient') return urlVal;
    return settings.widgetTheme || 'glass';
  });

  const [animations, setAnimations] = useState<boolean>(() => {
    const urlVal = searchParams.get('animations');
    if (urlVal === 'on') return true;
    if (urlVal === 'off') return false;
    return settings.widgetAnimations !== false;
  });

  const [selectedLocIndex, setSelectedLocIndex] = useState<number>(() => {
    const urlVal = searchParams.get('location');
    if (urlVal !== null) {
      const idx = parseInt(urlVal);
      if (!isNaN(idx) && idx >= 0 && idx < locations.length) return idx;
    }
    return activeLocationIndex >= 0 && activeLocationIndex < locations.length ? activeLocationIndex : 0;
  });

  const [useMLCorrection, setUseMLCorrection] = useState<boolean>(() => {
    return settings.mlEnabled !== false;
  });

  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const activeLocation = locations[selectedLocIndex] || locations[0];
  const rawWeather = weatherData[selectedLocIndex] || weatherData[activeLocationIndex] || Object.values(weatherData)[0];

  const cityKey = activeLocation ? `${activeLocation.name}_${activeLocation.latitude.toFixed(2)}_${activeLocation.longitude.toFixed(2)}`
    .replace(/\s+/g, "_")
    .toLowerCase() : 'unknown';

  // Apply on-device ML bias calibration to weather data if toggled
  const weather = useMemo(() => {
    if (!rawWeather || !useMLCorrection || !activeLocation) return rawWeather;
    const isNight = !rawWeather.current.isDay;
    
    return {
      ...rawWeather,
      current: {
        ...rawWeather.current,
        temperature: calibrateTemperature(cityKey, rawWeather.current.temperature, isNight),
        apparentTemperature: calibrateTemperature(cityKey, rawWeather.current.apparentTemperature, isNight),
      },
      hourly: {
        ...rawWeather.hourly,
        // For hourly, check if each hour is daytime based on sunrise/sunset index
        temperature: rawWeather.hourly.temperature.map((t, i) => {
          const isHourNight = rawWeather.hourly.isDay ? !rawWeather.hourly.isDay[i] : isNight;
          return calibrateTemperature(cityKey, t, isHourNight);
        }),
        temperature_2m: rawWeather.hourly.temperature_2m?.map((t, i) => {
          const isHourNight = rawWeather.hourly.isDay ? !rawWeather.hourly.isDay[i] : isNight;
          return calibrateTemperature(cityKey, t, isHourNight);
        }) || [],
      },
      daily: {
        ...rawWeather.daily,
        // Max temps are daytime; min temps are typically nighttime
        temperatureMax: rawWeather.daily.temperatureMax.map(t => calibrateTemperature(cityKey, t, false)),
        temperatureMin: rawWeather.daily.temperatureMin.map(t => calibrateTemperature(cityKey, t, true)),
      }
    };
  }, [rawWeather, useMLCorrection, cityKey, activeLocation]);

  const mlStats = useMemo(() => getMLModelStats(cityKey), [cityKey]);

  // Generate URL for copying/embedding
  const widgetUrl = useMemo(() => {
    const origin = window.location.origin;
    return `${origin}/widget?embed=true&layout=${layout}&theme=${theme}&animations=${animations ? 'on' : 'off'}&location=${selectedLocIndex}`;
  }, [layout, theme, animations, selectedLocIndex]);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(widgetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddShortcut = () => {
    const title = `${activeLocation.name} - Overcast Weather`;
    const iconUrl = window.location.origin + '/assest/icons/cloud-sun.svg';
    // Use embed=true so the shortcut opens the beautiful full-screen weather widget view
    const shortcutUrl = `${window.location.origin}/widget?embed=true&layout=${layout}&theme=${theme}&animations=${animations ? 'on' : 'off'}&location=${selectedLocIndex}`;

    // 1. GoNative Android — try all known shortcut creation APIs
    if (typeof window !== 'undefined' && (window as any).gonative) {
      const gonative = (window as any).gonative;
      let triggered = false;

      // Method A: gonative.homescreen.addShortcut (Median SDK preferred)
      try {
        if (gonative.homescreen?.addShortcut) {
          gonative.homescreen.addShortcut({ url: shortcutUrl, title, icon: iconUrl });
          triggered = true;
        }
      } catch (e) { console.warn('homescreen.addShortcut failed:', e); }

      // Method B: gonative.shortcuts.create
      if (!triggered) {
        try {
          if (gonative.shortcuts?.create) {
            gonative.shortcuts.create({ url: shortcutUrl, title, icon: iconUrl });
            triggered = true;
          }
        } catch (e) { console.warn('shortcuts.create failed:', e); }
      }

      // Method C: gonative://shortcuts/create URI scheme (most universal)
      if (!triggered) {
        try {
          const encodedUrl = encodeURIComponent(shortcutUrl);
          const encodedTitle = encodeURIComponent(title);
          const encodedIcon = encodeURIComponent(iconUrl);
          const commandUrl = `gonative://shortcuts/create?url=${encodedUrl}&title=${encodedTitle}&icon=${encodedIcon}`;
          // Prefer nativebridge.custom() to avoid page reload
          if (gonative.nativebridge?.custom) {
            gonative.nativebridge.custom(commandUrl);
          } else {
            // Safe fallback — use iframe trick to avoid unloading current page
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = commandUrl;
            document.body.appendChild(iframe);
            setTimeout(() => document.body.removeChild(iframe), 1000);
          }
          triggered = true;
        } catch (e) { console.warn('URI scheme shortcut failed:', e); }
      }

      setShowToast(true);
      setTimeout(() => setShowToast(false), 5000);
      return;
    }

    // 2. Standard PWA install prompt (browser)
    if ((window as any).deferredPrompt) {
      (window as any).deferredPrompt.prompt();
      (window as any).deferredPrompt.userChoice.then(() => {
        (window as any).deferredPrompt = null;
      });
      return;
    }

    // 3. Fallback: Copy URL to clipboard
    navigator.clipboard.writeText(shortcutUrl).catch(() => {});
    setShowToast(true);
    setTimeout(() => setShowToast(false), 5000);
  };

  // Weather theme object helper
  const weatherCode = weather?.current?.weatherCode ?? 0;
  const isDay = weather?.current?.isDay !== false;
  const info = getWeatherInfo(weatherCode, isDay);
  
  // Theme Background and border style mappings
  const bgStyles = useMemo(() => {
    if (theme === 'black') {
      return 'bg-black border border-neutral-800 text-widget-white';
    }
    if (theme === 'gradient') {
      // Linear gradients corresponding to weather codes
      if (weatherCode === 0 || weatherCode === 1) {
        return isDay 
          ? 'bg-gradient-to-br from-amber-400 via-orange-400 to-amber-500 text-widget-dark border border-amber-300'
          : 'bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-widget-white border border-indigo-950';
      }
      if (weatherCode === 2 || weatherCode === 3) {
        return isDay
          ? 'bg-gradient-to-br from-blue-300 via-slate-300 to-blue-400 text-widget-dark border border-blue-200'
          : 'bg-gradient-to-br from-slate-800 via-slate-900 to-zinc-950 text-widget-white border border-slate-800';
      }
      if (weatherCode >= 50 && weatherCode <= 67) {
        return 'bg-gradient-to-br from-slate-700 via-blue-900 to-slate-900 text-widget-white border border-slate-700';
      }
      if (weatherCode >= 71 && weatherCode <= 86) {
        return 'bg-gradient-to-br from-sky-400 via-blue-100 to-sky-200 text-widget-dark border border-sky-300';
      }
      if (weatherCode >= 95) {
        return 'bg-gradient-to-br from-purple-950 via-slate-900 to-amber-950 text-widget-white border border-purple-900';
      }
      return 'bg-gradient-to-br from-neutral-900 to-neutral-950 text-widget-white border border-neutral-800';
    }
    
    // Glassmorphism default
    return isDay
      ? 'bg-white/10 backdrop-blur-2xl border border-white/20 text-widget-dark shadow-2xl'
      : 'bg-black/25 backdrop-blur-2xl border border-white/10 text-widget-white shadow-2xl';
  }, [theme, weatherCode, isDay]);

  // Weather Animation Overlay Renderer
  const renderWeatherAnimation = () => {
    if (!animations) return null;

    // Rain Animation
    if (weatherCode >= 51 && weatherCode <= 67 || weatherCode >= 80 && weatherCode <= 82 || weatherCode >= 95) {
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[24px]">
          {[...Array(20)].map((_, i) => (
            <div 
              key={`rain-${i}`}
              className="absolute bg-blue-300/40 w-[1.5px] h-4 rounded-full animate-fall"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-${Math.random() * 20}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${0.8 + Math.random() * 0.5}s`
              }}
            />
          ))}
        </div>
      );
    }

    // Snow Animation
    if (weatherCode >= 71 && weatherCode <= 86) {
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[24px]">
          {[...Array(15)].map((_, i) => (
            <div 
              key={`snow-${i}`}
              className="absolute bg-white/80 rounded-full animate-drift"
              style={{
                width: `${2 + Math.random() * 4}px`,
                height: `${2 + Math.random() * 4}px`,
                left: `${Math.random() * 100}%`,
                top: `-${Math.random() * 10}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${3 + Math.random() * 4}s`
              }}
            />
          ))}
        </div>
      );
    }

    // Clouds Animation (floating overcast elements)
    if (weatherCode === 2 || weatherCode === 3) {
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[24px] opacity-10">
          <div className="absolute top-1 animate-float-clouds flex gap-20">
            <Cloud className="w-16 h-16" fill="currentColor" />
            <Cloud className="w-10 h-10 mt-3" fill="currentColor" />
            <Cloud className="w-14 h-14 mt-1" fill="currentColor" />
          </div>
        </div>
      );
    }

    // Sunny/Clear Glow pulse
    if (weatherCode === 0 || weatherCode === 1) {
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[24px]">
          <div 
            className={cn(
              "absolute -top-16 -right-16 w-36 h-36 rounded-full blur-3xl animate-pulse-glow",
              isDay ? "bg-amber-300/30" : "bg-indigo-400/10"
            )}
          />
        </div>
      );
    }

    return null;
  };

  // Render Widget Preview Card
  const renderWidgetBody = () => {
    if (!weather) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 py-6">
          <div className="w-8 h-8 rounded-full border-2 border-app-text/30 border-t-app-text animate-spin" />
          <span className="text-[12px] text-app-text-dim">Loading weather data...</span>
        </div>
      );
    }

    const currentTemp = formatTemp(weather.current.temperature, settings.unitTemp);
    const condName = translateWmoCode(weatherCode, settings.language || 'en');

    if (layout === 'mini') {
      // --- 2x1 Layout ---
      return (
        <div className="flex items-center justify-between p-5 h-full relative z-10 select-none">
          <div className="flex flex-col text-left gap-0.5 max-w-[50%]">
            <span className="text-[14px] font-bold truncate tracking-tight">{activeLocation.name}</span>
            <span className="text-[11px] opacity-75 font-medium truncate">{activeLocation.country}</span>
            <span className="text-[11px] opacity-60 font-semibold truncate uppercase tracking-wider mt-1">{condName}</span>
          </div>
          <div className="flex items-center gap-3">
            <WeatherIcon name={info.icon as any} style={settings.iconStyle} className="w-[36px] h-[36px] shrink-0" strokeWidth={1.6} />
            <span className="text-[34px] font-light leading-none tracking-tighter">{currentTemp}°</span>
          </div>
        </div>
      );
    }

    if (layout === 'detailed') {
      // --- 2x2 Layout ---
      return (
        <div className="flex flex-col justify-between p-4 h-full relative z-10 text-left select-none gap-3">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-[14px] font-extrabold tracking-tight truncate">{activeLocation.name}</span>
              <span className="text-[10px] opacity-75 font-medium truncate">{activeLocation.country}</span>
            </div>
            <span className="text-[9px] opacity-55 font-bold uppercase tracking-wider mt-0.5 shrink-0">
              {new Intl.DateTimeFormat(settings.language || 'en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}
            </span>
          </div>

          <div className="flex items-center gap-3 py-1">
            <WeatherIcon name={info.icon as any} style={settings.iconStyle} className="w-[42px] h-[42px] shrink-0" strokeWidth={1.6} />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[34px] font-light leading-none tracking-tighter">{currentTemp}°</span>
              <span className="text-[10px] opacity-75 font-semibold uppercase tracking-wider mt-0.5 truncate">{condName}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 border-t border-current/10 pt-2 text-[9.5px] opacity-80">
            <div className="flex items-center gap-1 shrink-0">
              <Droplet className="w-3 h-3 opacity-60 shrink-0" />
              <span className="font-semibold">{Math.round(weather.current.relativeHumidity)}%</span>
            </div>
            <div className="flex items-center gap-1 justify-center shrink-0 min-w-0">
              <Wind className="w-3 h-3 opacity-60 shrink-0" />
              <span className="font-semibold truncate">{formatWind(weather.current.windSpeed, settings.unitWind)}</span>
            </div>
            <div className="flex items-center gap-1 justify-end shrink-0">
              <Sun className="w-3 h-3 opacity-60 shrink-0" />
              <span className="font-semibold">UV{Math.round(weather.current.uvIndex)}</span>
            </div>
          </div>
        </div>
      );
    }

    // --- 4x2 Forecast Layout ---
    const hourlySlice = (weather.hourly.time || []).slice(0, 3).map((timeStr, idx) => {
      const parsedTime = parseISO(timeStr);
      const isNow = idx === 0;
      const tStr = isNow ? t('now', settings.language) : new Intl.DateTimeFormat(settings.language || 'en', { hour: 'numeric', hour12: true }).format(parsedTime).replace(/\s*(?:AM|PM|am|pm)/gi, '');
      const itemIcon = getWeatherInfo(weather.hourly.weatherCode?.[idx] ?? 0, true).icon;
      const itemTemp = formatTemp(weather.hourly.temperature?.[idx] ?? 0, settings.unitTemp);
      return { tStr, itemIcon, itemTemp };
    });

    const dailySlice = (weather.daily.time || []).slice(1, 4).map((timeStr, idx) => {
      const parsedTime = parseISO(timeStr);
      const dayName = new Intl.DateTimeFormat(settings.language || 'en', { weekday: 'short' }).format(parsedTime);
      const itemIcon = getWeatherInfo(weather.daily.weatherCode?.[idx + 1] ?? 0, true).icon;
      const minVal = formatTemp(weather.daily.temperatureMin?.[idx + 1] ?? 0, settings.unitTemp);
      const maxVal = formatTemp(weather.daily.temperatureMax?.[idx + 1] ?? 0, settings.unitTemp);
      return { dayName, itemIcon, minVal, maxVal };
    });

    return (
      <div className="grid grid-cols-12 h-full relative z-10 select-none divide-x divide-current/10">
        {/* Left Side: Current Weather Info */}
        <div className="col-span-5 flex flex-col justify-between p-4 text-left">
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] font-extrabold tracking-tight truncate">{activeLocation.name}</span>
            <span className="text-[10px] opacity-75 truncate">{activeLocation.country}</span>
          </div>

          <div className="my-auto flex flex-col">
            <div className="flex items-center gap-1.5">
              <WeatherIcon name={info.icon as any} style={settings.iconStyle} className="w-[30px] h-[30px] shrink-0" strokeWidth={1.6} />
              <span className="text-[28px] font-light leading-none tracking-tight">{currentTemp}°</span>
            </div>
            <span className="text-[9px] opacity-75 font-bold uppercase tracking-wider mt-1 truncate">{condName}</span>
          </div>

          <span className="text-[8px] opacity-40">Updated {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date())}</span>
        </div>

        {/* Right Side: Hourly & Daily mini preview */}
        <div className="col-span-7 flex flex-col justify-between p-3.5 gap-2.5">
          {/* Hourly columns */}
          <div className="flex items-center justify-around text-center">
            {hourlySlice.map((item, idx) => (
              <div key={idx} className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] opacity-60 font-semibold">{item.tStr}</span>
                <WeatherIcon name={item.itemIcon as any} style={settings.iconStyle} className="w-5 h-5" strokeWidth={1.5} />
                <span className="text-[11px] font-bold">{item.itemTemp}°</span>
              </div>
            ))}
          </div>

          {/* Daily rows */}
          <div className="flex flex-col gap-1 border-t border-current/10 pt-2 text-[10px]">
            {dailySlice.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="font-semibold opacity-75 text-[9px] w-[26px] text-left">{item.dayName}</span>
                <WeatherIcon name={item.itemIcon as any} style={settings.iconStyle} className="w-4 h-4" strokeWidth={1.5} />
                <span className="font-bold">
                  <span className="opacity-45 text-[9px]">{item.minVal}°</span>
                  <span className="opacity-20 mx-0.5">/</span>
                  <span>{item.maxVal}°</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Embed Mode: Full-screen widget view (opened via home screen shortcut)
  if (isEmbed) {
    return (
      <div className={cn("w-screen h-screen flex flex-col items-center justify-center font-sans relative overflow-hidden", bgStyles, "widget-theme-override")}>
        {/* Full-screen weather animation */}
        {renderWeatherAnimation()}

        {/* Centered Weather Card */}
        <div className="w-full flex-1 flex flex-col items-center justify-center gap-5 px-6 z-10 select-none">
          <div
            style={{
              width: layout === 'mini' ? '300px' : layout === 'detailed' ? '240px' : '320px',
              height: layout === 'mini' ? '80px' : layout === 'detailed' ? '240px' : '180px',
            }}
            className={cn(
              "relative overflow-hidden shadow-2xl transition-all duration-300 widget-theme-override",
              bgStyles,
              layout === 'mini' ? 'rounded-[20px]' : layout === 'detailed' ? 'rounded-[24px]' : 'rounded-[28px]'
            )}
          >
            {renderWidgetBody()}
          </div>

          {/* Last updated text */}
          <p className="text-[11px] opacity-50 font-medium">
            {activeLocation?.name} · Tap below to open app
          </p>
        </div>

        {/* Open App Button at bottom */}
        <div className="z-10 pb-10 pt-4">
          <button
            onClick={() => { window.location.href = window.location.origin + '/'; }}
            className="flex items-center gap-2 px-6 py-3 bg-white/20 backdrop-blur-xl border border-white/30 rounded-full text-[13px] font-bold shadow-xl active:scale-95 transition-all"
          >
            <span>Open Overcast</span>
          </button>
        </div>
      </div>
    );
  }

  // Widget Customizer / Studio Mode
  return (
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col font-sans relative overflow-y-auto">
      {/* Background ambient light matching weather */}
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-app-text/[0.04] to-transparent pointer-events-none" />

      {/* Top Navbar */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 pb-4 pt-[calc(env(safe-area-inset-top,36px)+2.2rem)] bg-app-bg/85 backdrop-blur-xl border-b border-b-app-border/40">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-app-text/5 rounded-full transition active:scale-95"
            aria-label="Back to App"
          >
            <ArrowLeft className="w-5 h-5 text-app-text" />
          </button>
          <div className="flex flex-col text-left">
            <h1 className="text-[17px] font-black tracking-tight uppercase">Widget Center</h1>
            <span className="text-[11px] text-app-text-dim font-bold tracking-wider uppercase">Customise & Pin widgets</span>
          </div>
        </div>
        
        {/* ML Self-Learning Status indicator */}
        <div 
          onClick={() => setUseMLCorrection(!useMLCorrection)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all",
            useMLCorrection 
              ? "bg-amber-500/10 text-amber-500 border border-amber-500/30" 
              : "bg-app-text/5 text-app-text-dim border border-transparent"
          )}
        >
          <Sparkles className={cn("w-3.5 h-3.5", useMLCorrection && "animate-pulse")} />
          <span>ML {useMLCorrection ? "ON" : "OFF"}</span>
        </div>
      </header>

      {/* Studio Grid Panel */}
      <main className="flex-1 w-full max-w-[800px] mx-auto px-6 py-8 flex flex-col gap-8 md:gap-10">
        
        {/* WIDGET PREVIEW SECTION */}
        <section className="flex flex-col items-center gap-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-app-text-dim">Live Preview</h2>
          
          <div className="w-full flex items-center justify-center p-8 bg-app-surface border border-app-border rounded-[36px] relative overflow-hidden shadow-sm">
            <div className="absolute inset-0 bg-grid-pattern opacity-5" />
            
            {/* Resizing constraint simulation for home-screen widgets */}
            <div 
              style={{
                width: layout === 'mini' ? '300px' : layout === 'detailed' ? '190px' : '320px',
                height: layout === 'mini' ? '80px' : layout === 'detailed' ? '190px' : '160px'
              }}
              className="relative transition-all duration-300"
            >
              <div 
                className={cn(
                  "w-full h-full absolute overflow-hidden transition-all duration-300 font-sans shadow-2xl widget-theme-override",
                  bgStyles,
                  layout === 'mini' ? 'rounded-[20px]' : layout === 'detailed' ? 'rounded-[24px]' : 'rounded-[28px]'
                )}
              >
                {renderWeatherAnimation()}
                {renderWidgetBody()}
              </div>
            </div>
          </div>
          
          {layout === 'mini' && <span className="text-[10px] text-app-text-dim font-bold uppercase tracking-wider">Simulated 2x1 Widget Size</span>}
          {layout === 'detailed' && <span className="text-[10px] text-app-text-dim font-bold uppercase tracking-wider">Simulated 2x2 Widget Size</span>}
          {layout === 'forecast' && <span className="text-[10px] text-app-text-dim font-bold uppercase tracking-wider">Simulated 4x2 Forecast Widget Size</span>}
        </section>

        {/* CUSTOMISATION CONTROLS */}
        <section className="flex flex-col gap-6">
          <h2 className="text-xs font-black uppercase tracking-widest text-app-text-dim text-left">Customise Settings</h2>
          
          <div className="bg-app-surface border border-app-border rounded-[32px] p-5 flex flex-col gap-6">
            
            {/* Choose City Location */}
            <div className="flex flex-col gap-2.5 text-left">
              <label className="text-[11px] font-black uppercase tracking-widest text-app-text-dim flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" /> Widget City
              </label>
              <div className="flex flex-wrap gap-2">
                {locations.map((loc, idx) => (
                  <button
                    key={loc.id || idx}
                    onClick={() => setSelectedLocIndex(idx)}
                    className={cn(
                      "px-4 py-2.5 rounded-full text-xs font-bold transition-all border",
                      selectedLocIndex === idx 
                        ? "bg-app-text text-app-bg border-app-text shadow-sm" 
                        : "bg-app-bg border-app-border text-app-text-dim hover:text-app-text"
                    )}
                  >
                    {loc.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Choose Size Layout */}
            <div className="flex flex-col gap-2.5 text-left">
              <label className="text-[11px] font-black uppercase tracking-wide text-app-text-dim flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Widget Layout
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(['mini', 'detailed', 'forecast'] as const).map(l => (
                  <button
                    key={l}
                    onClick={() => setLayout(l)}
                    className={cn(
                      "py-3 px-1.5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-tight transition-all border",
                      layout === l
                        ? "bg-app-text text-app-bg border-app-text shadow-sm"
                        : "bg-app-bg border-app-border text-app-text-dim hover:text-app-text"
                    )}
                  >
                    {l === 'mini' ? '2x1 Mini' : l === 'detailed' ? '2x2 Info' : '4x2 Forecast'}
                  </button>
                ))}
              </div>
            </div>

            {/* Choose Style Theme */}
            <div className="flex flex-col gap-2.5 text-left">
              <label className="text-[11px] font-black uppercase tracking-wide text-app-text-dim flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" /> Theme Style
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(['glass', 'black', 'gradient'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={cn(
                      "py-3 px-1.5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-tight transition-all border",
                      theme === t
                        ? "bg-app-text text-app-bg border-app-text shadow-sm"
                        : "bg-app-bg border-app-border text-app-text-dim hover:text-app-text"
                    )}
                  >
                    {t === 'glass' ? 'Glass' : t === 'black' ? 'AMOLED Black' : 'Gradient'}
                  </button>
                ))}
              </div>
            </div>

            {/* Animations Toggle */}
            <div className="flex items-center justify-between border-t border-app-border pt-4 text-left select-none">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-bold text-app-text">Live Weather Animations</span>
                <span className="text-[11px] text-app-text-dim leading-normal">Simulate moving clouds, falling rain or snow on the widget</span>
              </div>
              <button
                onClick={() => setAnimations(!animations)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-normal transition-all border",
                  animations 
                    ? "bg-emerald-600 text-white border-transparent shadow-sm" 
                    : "bg-app-bg border-app-border text-app-text-dim"
                )}
              >
                {animations ? 'ON' : 'OFF'}
              </button>
            </div>

          </div>
        </section>

        {/* INSTALL SECTION */}
        <section className="flex flex-col gap-4 text-left">
          <button
            type="button"
            onClick={() => { setShowToast(true); setTimeout(() => setShowToast(false), 3500); }}
            className="w-full py-4.5 px-6 bg-emerald-600 text-white rounded-[24px] text-[13px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md opacity-70 cursor-not-allowed select-none"
          >
            <Sparkles className="w-4.5 h-4.5" /> Add Shortcut to Home Screen
          </button>
        </section>

      </main>

      {/* Floating Glassmorphic Notification Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[99999] px-6 py-4 bg-app-text/90 text-app-bg backdrop-blur-2xl rounded-2xl text-[12px] font-bold shadow-2xl pointer-events-none text-center"
          >
            This feature will be available in future updates. Stay tuned! 🚀
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
