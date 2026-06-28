import React from 'react';
import { Moon } from 'lucide-react';
import { WeatherData, Location, Settings } from '../types';
import { WeatherIcon, Icons } from './WeatherIcons';
import { getCurrentWeatherState, getMoonPhaseInfo, getWeatherThemeColor } from '../services/weatherService';
import { formatTemp } from '../lib/units';
import { motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { RawIcons } from './WeatherIcons';
import { cn } from '../lib/utils';
import { Haptic } from '../lib/haptics';
import { t, translateWmoCode, Translate } from '../lib/translations';

interface WeatherHeroProps {
  weather: WeatherData;
  location: Location;
  settings: Settings;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  slideDirection?: 'left' | 'right' | null;
  onOpenSettings?: () => void;
  onOpenCityManager?: () => void;
  onOpenRadarMap?: () => void;
}

export default function WeatherHero({ 
  weather, 
  location, 
  settings, 
  onRefresh, 
  isRefreshing, 
  slideDirection,
  onOpenSettings,
  onOpenCityManager,
  onOpenRadarMap
}: WeatherHeroProps) {
  if (!weather || !weather.current) return null;
  const info = getCurrentWeatherState(weather);
  const moonPhase = getMoonPhaseInfo(weather.daily.moonPhase?.[0] ?? 0);

  const formatDate = (dateStr: string) => {
    try {
      const d = parseISO(dateStr.includes('Z') ? dateStr : `${dateStr}:00Z`);
      return d.toLocaleDateString("en-US", {
        timeZone: "UTC",
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
    } catch {
      return 'Today';
    }
  };

  const formatLastUpdated = (ts: number) => {
    const minutes = Math.floor((Date.now() - ts) / 60000);
    if (minutes < 1) return 'Now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const slideTransition = {
    type: "tween",
    ease: [0.16, 1, 0.3, 1], // Buttery smooth ease-out-quint matching native high-end platforms
    duration: 0.55
  };

  const theme = getWeatherThemeColor(info.weatherCode, info.isDay);

  if (settings.layoutWeatherDetail === 'compact') {
    return (
      <div className="flex flex-col w-full py-4 mb-0 font-sans select-none overflow-hidden relative">
        {/* Top Header Row within the Hero Card */}
        <div className="flex items-center justify-between w-full mb-20 relative z-40">
          {/* Location Trigger */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              Haptic.medium(settings.hapticEnabled);
              onOpenCityManager?.();
            }}
            className="flex items-center gap-1.5 focus:outline-none cursor-pointer group active:scale-[0.97] transition-all duration-150 relative z-50 pointer-events-auto"
            style={{ touchAction: 'manipulation' }}
          >
            {location?.isCurrentLocation && (
              <Icons.MapPin className="w-5 h-5 text-app-text shrink-0" strokeWidth={2.5} />
            )}
            <span className="text-[16px] font-black text-app-text group-hover:text-app-text/80 transition-colors tracking-tight">
              <Translate text={location.name} lang={settings.language || 'en'} />
            </span>
            <Icons.ChevronDown className="w-4 h-4 text-app-text/60 group-hover:text-app-text transition-colors shrink-0" strokeWidth={2.5} />
          </button>

          {/* Actions Row */}
          <div className="flex items-center gap-2 relative z-50">
            {/* Radar Trigger */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                Haptic.medium(settings.hapticEnabled);
                onOpenRadarMap?.();
              }}
              className="w-11 h-11 relative pointer-events-auto bg-app-surface border border-app-border flex items-center justify-center rounded-full active:scale-[0.95] hover:bg-app-surface/80 hover:border-app-border/80 transition-all select-none cursor-pointer"
              style={{ touchAction: 'manipulation' }}
            >
              <Icons.Map className="w-5 h-5 text-app-text" strokeWidth={2} />
            </button>

            {/* Settings Trigger */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                Haptic.medium(settings.hapticEnabled);
                onOpenSettings?.();
              }}
              className="w-11 h-11 relative pointer-events-auto bg-app-surface border border-app-border flex items-center justify-center rounded-full active:scale-[0.95] hover:bg-app-surface/80 hover:border-app-border/80 transition-all select-none cursor-pointer"
              style={{ touchAction: 'manipulation' }}
            >
              <Icons.Settings2 className="w-5 h-5 text-app-text" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Temperature, Icon, and Feels Like Side-by-Side Row */}
        <div className="flex flex-col items-start gap-1 mb-1.5 relative z-10 w-full">
          <div className="flex items-end justify-start gap-5">
            <div className="flex items-baseline relative">
              <span className="text-[92px] leading-none font-[200] tracking-tighter text-app-text">
                {formatTemp(weather.current.temperature, settings.unitTemp)}
              </span>
              <span className="text-5xl font-[300] text-app-text leading-none select-none -translate-y-6">°</span>
            </div>

            <div className="flex items-center justify-center pb-2.5">
              <WeatherIcon 
                name={info.icon as any} 
                style={settings.iconStyle}
                className="w-[58px] h-[58px] text-app-text main-weather-svg-icon" 
                strokeWidth={1.5} 
              />
            </div>
          </div>

          {/* Feels like detail just below the current temp */}
          <div className="text-[14px] font-black text-app-text select-none mt-0.5 uppercase tracking-[0.08em] flex items-center gap-1.5">
            <span><Translate text="Feels like" lang={settings.language || 'en'} />:</span>
            <span>{formatTemp(weather.current.apparentTemperature, settings.unitTemp)}°</span>
          </div>
        </div>

        {/* High/Low temperatures styled as Max/Min */}
        <div className="flex flex-col items-start gap-1 relative z-10">
          <div className="flex items-center gap-2.5 text-[13px] font-black uppercase tracking-[0.08em] text-app-text-dim">
            <span><Translate text="Max" lang={settings.language || 'en'} />: {formatTemp(weather.daily.temperatureMax?.[0] ?? 0, settings.unitTemp)}°</span>
            <span className="w-1.5 h-1.5 bg-app-text-dim/25 rounded-full" />
            <span><Translate text="Min" lang={settings.language || 'en'} />: {formatTemp(weather.daily.temperatureMin?.[0] ?? 0, settings.unitTemp)}°</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center pt-1 pb-6 overflow-visible">
      {/* Status Bar - Moon Phase & Last Updated */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={slideTransition}
        className="flex items-center gap-2 mb-4"
        style={{ willChange: 'transform, opacity' }}
      >
        <div className="flex items-center gap-2 bg-app-surface py-1.5 px-3 rounded-full border border-app-border">
          <Moon className="w-3 h-3 text-app-text-dim/80 shrink-0" strokeWidth={1.5} />
          <span className="text-[10px] uppercase font-bold tracking-widest text-app-text-dim whitespace-nowrap">
            <Translate text={moonPhase.label} lang={settings.language || 'en'} /> • {moonPhase.illumination}%
          </span>
        </div>

        {weather.fetchedAt && (
          <div className="flex items-center">
            {onRefresh ? (
              <motion.button
                id="refresh-label-btn"
                onClick={() => {
                  Haptic.medium(settings.hapticEnabled);
                  onRefresh();
                }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 bg-app-surface py-1.5 px-3 rounded-full border border-app-border hover:border-app-border/80 transition-colors duration-200 select-none text-app-text-dim cursor-pointer"
              >
                <Icons.Clock className={cn("w-3 h-3 text-app-text-dim/70", isRefreshing && "animate-pulse")} />
                <span className="text-[10px] uppercase font-bold tracking-widest">
                  <Translate text={formatLastUpdated(weather.fetchedAt)} lang={settings.language || 'en'} />
                </span>
              </motion.button>
            ) : (
              <div className="flex items-center gap-2 bg-app-surface py-1.5 px-3 rounded-full border border-app-border select-none">
                <Icons.Clock className="w-3 h-3 text-app-text-dim/60" />
                <span className="text-[10px] uppercase font-bold tracking-widest text-app-text-dim/60">
                  <Translate text={formatLastUpdated(weather.fetchedAt)} lang={settings.language || 'en'} />
                </span>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Core weather statistics container */}
      <div
        className="flex flex-col items-center overflow-visible w-full"
      >
        <motion.div 
          initial={{ y: 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={slideTransition}
          className="mb-4 flex flex-col items-center overflow-visible"
          style={{ willChange: 'transform, opacity' }}
        >
          <WeatherIcon 
            name={info.icon as any} 
            style={settings.iconStyle}
            className="w-[120px] h-[120px] text-app-text main-weather-svg-icon" 
            strokeWidth={1.2} 
          />
        </motion.div>
        
        <motion.div 
          initial={{ y: 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={slideTransition}
          className="relative flex justify-center -mr-6"
          style={{ willChange: 'transform, opacity' }}
        >
          <span className="text-[140px] leading-none font-[100] tracking-tighter text-app-text">
            {formatTemp(weather.current.temperature, settings.unitTemp)}
          </span>
          <span className="text-6xl font-[400] text-app-text mt-4 ml-1">°</span>
        </motion.div>

        <motion.div
          initial={{ y: 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={slideTransition}
          className="text-xl font-bold text-app-text/90 mt-1 mb-1"
          style={{ willChange: 'transform, opacity' }}
        >
          <Translate text="Feels like" lang={settings.language || 'en'} />: {formatTemp(weather.current.apparentTemperature, settings.unitTemp)}°
        </motion.div>

        <motion.div 
          initial={{ y: 15, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={slideTransition}
          className="flex flex-col items-center gap-2 mt-3"
          style={{ willChange: 'transform, opacity' }}
        >
          <span className="text-xl font-medium text-app-text/90">{translateWmoCode(weather.current.weatherCode, settings.language || 'en')}</span>
          <div className="flex items-center gap-3 text-app-text-dim text-[14px] font-medium tracking-wide">
            <span>{t('max', settings.language)}: {formatTemp(weather.daily.temperatureMax?.[0] ?? 0, settings.unitTemp)}°</span>
            <span className="w-1 h-1 bg-app-border rounded-full" />
            <span>{t('min', settings.language)}: {formatTemp(weather.daily.temperatureMin?.[0] ?? 0, settings.unitTemp)}°</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
