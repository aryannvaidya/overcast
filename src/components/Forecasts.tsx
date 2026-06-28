import React from 'react';
import { WeatherData, Settings } from '../types';
import { WeatherIcon } from './WeatherIcons';
import { getWeatherInfo, getHourlyIcon, shouldShowPrecip, getCurrentHourIndex, parseTimeToAbsoluteDate, getWeatherThemeColor, getCurrentWeatherState } from '../services/weatherService';
import { t, translateWmoCode, Translate } from '../lib/translations';
import { formatTemp, formatWind, formatPrecipitation } from '../lib/units';
import { motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';

import { Haptic } from '../lib/haptics';

const getWindDirectionStr = (deg: number): string => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((deg % 360) / 45)) % 8;
  return directions[index];
};

const getColorForTemp = (temp: number): string => {
  const keyframes = [
    { t: -10, r: 59,  g: 130, b: 246 }, // Nice blue
    { t: 0,   r: 14,  g: 165, b: 233 }, // Sky blue
    { t: 10,  r: 45,  g: 212, b: 191 }, // Teal
    { t: 20,  r: 234, g: 179, b: 8   }, // Amber/Yellow
    { t: 30,  r: 249, g: 115, b: 22  }, // Orange
    { t: 40,  r: 244, g: 63,  b: 94  }, // Rose/Red
  ];

  if (temp <= keyframes[0].t) {
    return `rgb(${keyframes[0].r}, ${keyframes[0].g}, ${keyframes[0].b})`;
  }
  if (temp >= keyframes[keyframes.length - 1].t) {
    return `rgb(${keyframes[keyframes.length - 1].r}, ${keyframes[keyframes.length - 1].g}, ${keyframes[keyframes.length - 1].b})`;
  }

  for (let idx = 0; idx < keyframes.length - 1; idx++) {
    const k1 = keyframes[idx];
    const k2 = keyframes[idx + 1];
    if (temp >= k1.t && temp <= k2.t) {
      const fraction = (temp - k1.t) / (k2.t - k1.t);
      const r = Math.round(k1.r + (k2.r - k1.r) * fraction);
      const g = Math.round(k1.g + (k2.g - k1.g) * fraction);
      const b = Math.round(k1.b + (k2.b - k1.b) * fraction);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  return 'rgb(234, 179, 8)';
};

const getGlowColorForTemp = (temp: number): string => {
  if (temp < 10) return "rgba(14, 165, 233, 0.3)";
  if (temp < 20) return "rgba(45, 212, 191, 0.3)";
  if (temp < 30) return "rgba(234, 179, 8, 0.3)";
  return "rgba(244, 63, 94, 0.3)";
};

interface ForecastProps {
  weather: WeatherData;
  settings: Settings;
}

function formatLocalTime(date: Date, timeZone: string, type: 'hour' | 'time', timeFormat?: '12h' | '24h'): string {
  const is24h = timeFormat === '24h';
  try {
    const options: Intl.DateTimeFormatOptions = type === 'hour'
      ? (is24h ? { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' } : { hour: 'numeric', hour12: true })
      : (is24h ? { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' } : { hour: 'numeric', minute: '2-digit', hour12: true });
    const formatted = new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: timeZone === 'auto' ? undefined : timeZone
    }).format(date);
    return formatted.replace(/\u202f/g, ' ').trim();
  } catch (err) {
    console.warn("formatLocalTime failed for timezone", timeZone, err);
    if (is24h) return format(date, 'HH:mm');
    return format(date, type === 'hour' ? 'h a' : 'h:mm a');
  }
}

function getLocalDateString(date: Date, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone === 'auto' ? undefined : timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const getVal = (type: string) => {
      const p = parts.find(item => item.type === type);
      return p ? p.value : '';
    };
    const yr = getVal('year');
    const mo = getVal('month');
    const dy = getVal('day');
    if (!yr || !mo || !dy) {
      throw new Error("Missing date parts");
    }
    return `${yr}-${mo}-${dy}`;
  } catch {
    return date.toISOString().split('T')[0];
  }
}

function formatHourlyTimeFromISO(timeVal: string | Date, timeZone: string, timeFormat?: '12h' | '24h'): string {
  try {
    const parsedDate = typeof timeVal === 'string' ? parseTimeToAbsoluteDate(timeVal, timeZone) : timeVal;
    const is24h = timeFormat === '24h';
    const options: Intl.DateTimeFormatOptions = is24h
      ? { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' }
      : { hour: 'numeric', hour12: true };
    const formatted = new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: timeZone === 'auto' ? undefined : timeZone
    }).format(parsedDate);
    return formatted.replace(/\u202f/g, ' ').trim();
  } catch {
    return typeof timeVal === 'string' ? timeVal : timeVal.toLocaleTimeString();
  }
}

export function HourlyForecast({ weather, settings }: ForecastProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const lastScrollPos = React.useRef(0);
  const scrollTimeoutRef = React.useRef<any>(null);
  const [showDetailInfo, setShowDetailInfo] = React.useState(false);

  React.useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (typeof window !== 'undefined') {
        (window as any).isScrollingHourly = false;
        (window as any).isInteractingWithHourly = false;
      }
    };
  }, []);

  if (!weather || !weather.hourly || !weather.daily) return null;

  const handleScroll = () => {
    if (typeof window !== 'undefined') {
      (window as any).isScrollingHourly = true;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        (window as any).isScrollingHourly = false;
      }, 300);
    }

    if (!scrollRef.current) return;
    const current = scrollRef.current.scrollLeft;
    // Trigger haptic every 64px (width of one card)
    if (Math.abs(current - lastScrollPos.current) > 64) {
      Haptic.light(settings.hapticEnabled);
      lastScrollPos.current = current;
    }
  };

  // Get the city's current local time robustly using its timezone
  const hourIndex = getCurrentHourIndex(weather.timezone, weather.hourly.time);
  
  const times = weather.hourly.time || [];
  const temps_2m = weather.hourly.temperature_2m || weather.hourly.temperature || [];
  const wcodes = weather.hourly.weathercode || weather.hourly.weatherCode || [];

  const rawHourly = times
    .map((time, i) => {
      if (!time) return null;
      const itemTime = parseTimeToAbsoluteDate(time, weather.timezone);
      
      // Determine if it's day or night for this specific hour in target timezone
      const localDateStr = getLocalDateString(itemTime, weather.timezone);
      const dayIdx = weather.daily.time.indexOf(localDateStr);
      let isDay = true;
      
      if (dayIdx !== -1) {
        const sunriseStr = weather.daily.sunrise?.[dayIdx];
        const sunsetStr = weather.daily.sunset?.[dayIdx];
        
        if (sunriseStr && sunsetStr) {
          const sunrise = parseTimeToAbsoluteDate(sunriseStr, weather.timezone);
          const sunset = parseTimeToAbsoluteDate(sunsetStr, weather.timezone);
          isDay = itemTime >= sunrise && itemTime < sunset;
        }
      }

      return {
        type: 'weather' as const,
        time: itemTime,
        rawTimeStr: time,
        temp: temps_2m[i] ?? 0,
        pop: weather.hourly.precipitationProbability?.[i] ?? 0,
        weatherCode: wcodes[i] ?? 0,
        isDay,
        windSpeed: weather.hourly.windSpeed?.[i] ?? 0,
        windDirection: weather.hourly.windDirection?.[i] ?? 0,
        precipitation: weather.hourly.precipitation?.[i] ?? 0,
        uvIndex: weather.hourly.uvIndex?.[i] ?? 0
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(hourIndex, hourIndex + 24);

  // Inject sunrise and sunset (removed per user request)
  const hourlyData: any[] = [...rawHourly];

  // Sort strictly chronologically by UNIX timestamps
  hourlyData.sort((a, b) => a.time.getTime() - b.time.getTime());

  const currentInfo = getCurrentWeatherState(weather);
  const themeObj = getWeatherThemeColor(currentInfo.weatherCode, currentInfo.isDay);
  // Theme color for the line and gradient backdrop
  const strokeColor = themeObj?.color || '#22c55e';

  const isDetailed = settings.layoutHourlyForecast !== 'compact';

  if (isDetailed) {
    const temps = hourlyData.map(item => item.temp);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    const tempRange = maxTemp - minTemp;

    // Center each node at half-column width offset
    const columnWidth = 64;
    const points = hourlyData.map((item, i) => {
      const x = i * columnWidth + (columnWidth / 2);
      // Bound the y coordinate nicely between 10px and 45px inside the 65px tall SVG container
      const y = tempRange === 0 ? 32.5 : 10 + (1 - (item.temp - minTemp) / tempRange) * 35;
      return { x, y, temp: item.temp };
    });

    // Generate smooth bezier path connecting data points
    let pathD = '';
    if (points.length > 0) {
      pathD = `M ${points[0].x} ${points[0].y}`;
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const cp1x = p0.x + (columnWidth / 2);
        const cp1y = p0.y;
        const cp2x = p1.x - (columnWidth / 2);
        const cp2y = p1.y;
        pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
      }
    }

    const fillPathD = points.length > 0
      ? `${pathD} L ${points[points.length - 1].x} 65 L ${points[0].x} 65 Z`
      : '';

    return (
      <div className="flex flex-col px-0 -mx-[1rem] sm:-mx-[1.3125rem] hourly-forecast" data-no-swipe>
        <div className="w-[calc(100%-2rem)] max-w-[21.875rem] mx-auto bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[2rem] py-[1.25rem] px-[1rem] sm:px-[1.375rem] flex flex-col gap-[1rem] overflow-hidden shadow-2xl relative">
          
          {/* Header row exactly matching other cards */}
          <div className="flex items-center justify-between select-none">
            <div className="flex items-center gap-1.5">
              <Icons.Clock className="w-5 h-5 text-app-text/75" strokeWidth={1.4} />
              <span className="text-[15px] font-normal tracking-wide text-app-text/75">
                {t('hourly_forecast', settings.language)}
              </span>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowDetailInfo(!showDetailInfo);
              }}
              className="p-1 -m-1 hover:bg-white/5 rounded-full transition relative z-50"
              aria-label="More hourly info"
            >
              <Icons.ChevronRight className="w-4 h-4 text-app-text-dim/50" />
            </button>
          </div>

          {showDetailInfo && (
            <>
              <div 
                className="fixed inset-0 z-35 bg-transparent" 
                onClick={() => setShowDetailInfo(false)} 
              />
              <div 
                style={{ backgroundColor: 'var(--popup-bg)' }}
                className="absolute top-[48px] left-[12px] right-[12px] z-40 border border-app-border rounded-[28px] rounded-tr-[10px] p-4 shadow-2xl backdrop-blur-xl animate-fade-in transition-all duration-300 w-[calc(100%-24px)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div 
                  style={{ backgroundColor: 'var(--popup-bg)' }}
                  className="absolute -top-[6px] right-[6px] w-3 h-3 border-l border-t border-app-border rotate-45 rounded-tl-[4px]" 
                />
                
                <div className="flex items-center justify-between border-b border-app-text/10 pb-2 mb-2">
                  <span className="text-[13px] font-bold text-app-text tracking-wide uppercase">
                    {t('hourly_forecast', settings.language)} Details
                  </span>
                  <button 
                    onClick={() => setShowDetailInfo(false)}
                    className="p-1 hover:bg-white/10 rounded-full transition"
                    aria-label="Close"
                  >
                    <Icons.X className="w-4 h-4 text-app-text/70" />
                  </button>
                </div>

                <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto no-scrollbar pr-1 select-none">
                  {hourlyData.map((item, i) => {
                    const isNow = i === 0;
                    const info = getWeatherInfo(item.weatherCode, item.isDay);
                    const wCodeText = translateWmoCode(item.weatherCode, settings.language || 'en');
                    const timeStr = isNow ? t('now', settings.language) : formatHourlyTimeFromISO(item.rawTimeStr, weather.timezone, settings.timeFormat);
                    
                    return (
                      <div key={item.rawTimeStr || i} className="flex flex-col gap-1 py-2 border-b border-app-text/5 last:border-none">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-app-text">{timeStr}</span>
                            <WeatherIcon name={info.icon as any} style={settings.iconStyle} className="w-5 h-5 shrink-0" strokeWidth={1.8} />
                            <span className="text-[12px] text-app-text-dim/90 font-medium truncate max-w-[125px]">{wCodeText}</span>
                          </div>
                          <span className="text-[14px] font-semibold text-app-text">{formatTemp(item.temp, settings.unitTemp)}°</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-[11px] text-app-text-dim/75 pl-1">
                          <div className="flex items-center gap-1">
                            <Icons.Wind className="w-3.5 h-3.5 text-app-text-dim/50 shrink-0" />
                            <span>{formatWind(item.windSpeed, settings.unitWind)} {settings.unitWind} {getWindDirectionStr(item.windDirection)}</span>
                          </div>
                          <div className="flex items-center gap-1 justify-center">
                            <Icons.Droplet className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span>{item.pop}% ({formatPrecipitation(item.precipitation, settings.unitPrecipitation === 'inches' ? 'in' : 'mm')}{settings.unitPrecipitation === 'inches' ? 'in' : 'mm'})</span>
                          </div>
                          <div className="flex items-center gap-1 justify-end">
                            <Icons.Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span>UV {Math.round(item.uvIndex)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Horizontally Scrollable content with bleed and scroll suppression */}
          <div 
            ref={scrollRef}
            onScroll={handleScroll}
            onTouchStart={() => { if (typeof window !== 'undefined') (window as any).isInteractingWithHourly = true; }}
            onTouchEnd={() => { 
              if (typeof window !== 'undefined') {
                setTimeout(() => { (window as any).isInteractingWithHourly = false; }, 200);
              }
            }}
            onTouchCancel={() => { 
              if (typeof window !== 'undefined') {
                setTimeout(() => { (window as any).isInteractingWithHourly = false; }, 200);
              }
            }}
            onPointerDown={() => { if (typeof window !== 'undefined') (window as any).isInteractingWithHourly = true; }}
            onPointerUp={() => { 
              if (typeof window !== 'undefined') {
                setTimeout(() => { (window as any).isInteractingWithHourly = false; }, 200);
              }
            }}
            onPointerCancel={() => { 
              if (typeof window !== 'undefined') {
                setTimeout(() => { (window as any).isInteractingWithHourly = false; }, 200);
              }
            }}
            className="flex gap-0 overflow-x-auto no-scrollbar pb-1 -mx-6 px-6 snap-x snap-mandatory scroll-smooth will-change-transform relative z-10"
            data-no-swipe
          >
            {hourlyData.length > 0 ? (
              <div 
                className="relative flex select-none"
                style={{ width: `${hourlyData.length * columnWidth}px` }}
              >
                {/* SVG Graph Backdrop overlay */}
                <svg 
                  className="absolute left-0 pointer-events-none z-0"
                  style={{ 
                    width: `${hourlyData.length * columnWidth}px`, 
                    height: '65px',
                    top: '64px' // Aligned precisely below: Hour spacing (21px Time label) + Weather Icon (36px flex height/gap)
                  }}
                >
                  <defs>
                    <linearGradient id="hourlyChartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
                      <stop offset="100%" stopColor={strokeColor} stopOpacity="0.00" />
                    </linearGradient>
                  </defs>

                  {/* Gradient area */}
                  <path d={fillPathD} fill="url(#hourlyChartGradient)" />

                  {/* Subtle outer stroke blur glow */}
                  <path 
                    d={pathD} 
                    fill="none" 
                    stroke={strokeColor} 
                    strokeWidth={4} 
                    strokeLinecap="round" 
                    className="opacity-20 blur-[1px]" 
                  />

                  {/* Main stroke line */}
                  <path 
                    d={pathD} 
                    fill="none" 
                    stroke={strokeColor} 
                    strokeWidth={2.2} 
                    strokeLinecap="round" 
                  />

                  {/* High quality node markers */}
                  {points.map((pt, idx) => (
                    <g key={idx}>
                      <circle 
                        cx={pt.x} 
                        cy={pt.y} 
                        r={4.5} 
                        fill={strokeColor} 
                        className="opacity-40 blur-[0.5px]" 
                      />
                      <circle 
                        cx={pt.x} 
                        cy={pt.y} 
                        r={3} 
                        fill="#ffffff" 
                      />
                    </g>
                  ))}
                </svg>

                {/* Column Labels */}
                <div className="flex gap-0 w-full relative z-10">
                  {hourlyData.map((item, i) => {
                    const isNow = i === 0;
                    const info = getWeatherInfo(item.weatherCode, item.isDay);
                    
                    return (
                      <div 
                        key={`weather-${item.rawTimeStr || i}`}
                        className="flex flex-col items-center w-[64px] flex-shrink-0 select-none snap-center"
                      >
                        {/* Time Label */}
                        <span className={cn(
                          "text-[12px] font-medium tracking-tight whitespace-nowrap mb-2.5",
                          isNow ? "text-app-text font-semibold" : "text-app-text-dim"
                        )}>
                          {isNow ? t('now', settings.language) : formatHourlyTimeFromISO(item.rawTimeStr, weather.timezone, settings.timeFormat)}
                        </span>

                        {/* Weather Icon */}
                        <div className="h-7 mb-3.5 flex items-center justify-center">
                          <WeatherIcon 
                            name={info.icon as any} 
                            style={settings.iconStyle} 
                            className="w-[25px] h-[25px]"
                            strokeWidth={1.8}
                          />
                        </div>

                        {/* Spacer where the SVG line connects */}
                        <div className="h-[65px] w-full" />

                        {/* Temperature Label */}
                        <span className={cn(
                          "text-[15px] font-medium tracking-tight mt-1.5",
                          isNow ? "text-app-text font-semibold" : "text-app-text-dim"
                        )}>
                          {formatTemp(item.temp, settings.unitTemp)}°
                        </span>
                      </div>
                    );
                  })}
                </div>

              </div>
            ) : (
              <div className="w-full py-8 text-center bg-app-surface border border-app-border rounded-[30px] opacity-40">
                <span className="text-[10px] font-bold uppercase tracking-widest italic">
                  <Translate text="No upcoming hourly data" lang={settings.language || 'en'} />
                </span>
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // COMPACT LAYOUT FOR COMPACT OPTION
  // -------------------------------------------------------------
  return (
    <div className="relative -mx-6 hourly-forecast" data-no-swipe>
      <div className="h-2" />
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={() => { if (typeof window !== 'undefined') (window as any).isInteractingWithHourly = true; }}
        onTouchEnd={() => { 
          if (typeof window !== 'undefined') {
            setTimeout(() => { (window as any).isInteractingWithHourly = false; }, 200);
          }
        }}
        onTouchCancel={() => { 
          if (typeof window !== 'undefined') {
            setTimeout(() => { (window as any).isInteractingWithHourly = false; }, 200);
          }
        }}
        onPointerDown={() => { if (typeof window !== 'undefined') (window as any).isInteractingWithHourly = true; }}
        onPointerUp={() => { 
          if (typeof window !== 'undefined') {
            setTimeout(() => { (window as any).isInteractingWithHourly = false; }, 200);
          }
        }}
        onPointerCancel={() => { 
          if (typeof window !== 'undefined') {
            setTimeout(() => { (window as any).isInteractingWithHourly = false; }, 200);
          }
        }}
        className="flex gap-3 overflow-x-auto no-scrollbar pb-4 px-6 snap-x snap-mandatory scroll-smooth will-change-transform"
        data-no-swipe
      >
        {hourlyData.length > 0 ? hourlyData.map((item, i) => {
          if (item.type === 'sunrise' || item.type === 'sunset') {
            const isSunrise = item.type === 'sunrise';
            return (
              <motion.div
                key={`astro-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03, duration: 0.4 }}
                className={cn(
                  "flex flex-col items-center min-w-[64px] h-[130px] py-4 px-1 snap-center gpu",
                  "rounded-[30px] border border-app-border bg-amber-500/5 backdrop-blur-3xl"
                )}
              >
                <span className="text-[10px] font-medium tracking-tight text-app-text-dim">
                  {formatLocalTime(item.time, weather.timezone, 'time', settings.timeFormat).replace(/\s*(?:AM|PM|am|pm)/gi, '').trim()}
                </span>
                
                <div className="flex-1 flex items-center justify-center my-0.5">
                  <WeatherIcon 
                    name={isSunrise ? "Sunrise" : "Sunset"} 
                    style={settings.iconStyle} 
                    className="w-[28px] h-[28px]"
                    forceColoured={true}
                    strokeWidth={1.4}
                  />
                </div>

                 <span className="text-[9px] font-bold text-app-text uppercase tracking-wider">
                  {isSunrise ? t('sunrise', settings.language) : t('sunset', settings.language)}
                </span>
              </motion.div>
            );
          }

          const isNow = i === 0 && item.type === 'weather';
          const info = getWeatherInfo(item.weatherCode, item.isDay);
          
          return (
            <motion.div
              key={`weather-${item.rawTimeStr || i}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03, duration: 0.4 }}
              className={cn(
                "flex flex-col items-center min-w-[64px] h-[130px] py-4 px-1 transition-all duration-300 snap-center gpu relative overflow-hidden",
                "rounded-[30px] border border-app-border backdrop-blur-3xl",
                isNow ? "bg-app-surface border-app-text/20 shadow-lg" : "bg-app-surface"
              )}
            >
              {isNow && (
                <div className="absolute inset-0 bg-gradient-to-br from-app-text/[0.08] to-transparent pointer-events-none rounded-[30px]" />
              )}
              <span className={cn(
                "text-[11px] font-medium tracking-tight whitespace-nowrap relative z-10",
                isNow ? "text-app-text font-semibold" : "text-app-text-dim"
              )}>
                {isNow ? t('now', settings.language) : formatHourlyTimeFromISO(item.rawTimeStr, weather.timezone, settings.timeFormat)}
              </span>
              
              <div className="flex-1 flex items-center justify-center my-0.5 relative z-10">
                <WeatherIcon 
                  name={info.icon as any} 
                  style={settings.iconStyle} 
                  className="w-[28px] h-[28px]"
                  strokeWidth={1.8}
                />
              </div>

              <span className={cn(
                "text-[16px] font-light relative z-10",
                isNow ? "font-medium text-app-text" : "text-app-text"
              )}>
                {formatTemp(item.temp, settings.unitTemp)}°
              </span>
            </motion.div>
          );
        }) : (
          <div className="w-full py-8 text-center bg-app-surface border border-app-border rounded-[30px] opacity-40">
            <span className="text-[10px] font-bold uppercase tracking-widest italic">
              <Translate text="No upcoming hourly data" lang={settings.language || 'en'} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function DailyForecast({ weather, settings }: ForecastProps) {
  if (!weather || !weather.daily) return null;

  const [showDetailInfo, setShowDetailInfo] = React.useState(false);

  const minTemps = (weather?.daily?.temperatureMin || []).slice(0, 7);
  const maxTemps = (weather?.daily?.temperatureMax || []).slice(0, 7);
  const globalMin = minTemps.length > 0 ? Math.min(...minTemps) : 0;
  const globalMax = maxTemps.length > 0 ? Math.max(...maxTemps) : 100;
  const globalRange = globalMax - globalMin || 1;

  return (
    <div className="flex flex-col px-0 -mx-[1rem] sm:-mx-[1.3125rem] daily-forecast">
      <div className="w-[calc(100%-2rem)] max-w-[21.875rem] mx-auto bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[2rem] py-[1.25rem] px-[1rem] sm:px-[1.375rem] flex flex-col gap-[1rem] overflow-hidden shadow-2xl relative">
        <div className="flex items-center justify-between select-none">
          <div className="flex items-center gap-1.5">
            <Icons.Calendar className="w-5 h-5 text-app-text/75" strokeWidth={1.4} />
            <span className="text-[15px] font-normal tracking-wide text-app-text/75">
              {t('seven_day_forecast', settings.language)}
            </span>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowDetailInfo(!showDetailInfo);
            }}
            className="p-1 -m-1 hover:bg-white/5 rounded-full transition relative z-50 animate-fade-in"
            aria-label="More daily info"
          >
            <Icons.ChevronRight className="w-4 h-4 text-app-text-dim/50" />
          </button>
        </div>

        {showDetailInfo && (
          <>
            <div 
              className="fixed inset-0 z-35 bg-transparent" 
              onClick={() => setShowDetailInfo(false)} 
            />
            <div 
              style={{ backgroundColor: 'var(--popup-bg)' }}
              className="absolute top-[48px] left-[12px] right-[12px] z-40 border border-app-border rounded-[28px] rounded-tr-[10px] p-4 shadow-2xl backdrop-blur-xl animate-fade-in transition-all duration-300 w-[calc(100%-24px)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div 
                style={{ backgroundColor: 'var(--popup-bg)' }}
                className="absolute -top-[6px] right-[6px] w-3 h-3 border-l border-t border-app-border rotate-45 rounded-tl-[4px]" 
              />
              
              <div className="flex items-center justify-between border-b border-app-text/10 pb-2 mb-2">
                <span className="text-[13px] font-bold text-app-text tracking-wide uppercase">
                  {t('seven_day_forecast', settings.language)} Details
                </span>
                <button 
                  onClick={() => setShowDetailInfo(false)}
                  className="p-1 hover:bg-white/10 rounded-full transition"
                  aria-label="Close"
                >
                  <Icons.X className="w-4 h-4 text-app-text/70" />
                </button>
              </div>

              <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto no-scrollbar pr-1 select-none">
                {(weather?.daily?.time || []).slice(0, 7).map((time, i) => {
                  const info = getWeatherInfo(weather.daily.weatherCode?.[i] ?? 0);
                  const date = parseISO(time);
                  const localDayName = isNaN(date.getTime()) 
                    ? '---' 
                    : new Intl.DateTimeFormat(settings.language || 'en', { weekday: 'short' }).format(date);
                  const cleanedDayName = localDayName.replace(/\./g, '');
                  const capitalizedDayName = cleanedDayName.charAt(0).toUpperCase() + cleanedDayName.slice(1);
                  
                  const dayMin = weather.daily.temperatureMin?.[i] ?? 0;
                  const dayMax = weather.daily.temperatureMax?.[i] ?? 0;
                  
                  const sunriseStr = formatHourlyTimeFromISO(weather.daily.sunrise?.[i] || "", weather.timezone, settings.timeFormat);
                  const sunsetStr = formatHourlyTimeFromISO(weather.daily.sunset?.[i] || "", weather.timezone, settings.timeFormat);

                  return (
                    <div key={time} className="flex flex-col gap-1 py-2 border-b border-app-text/5 last:border-none">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold text-app-text w-[60px] text-left">
                            {i === 0 ? t('today', settings.language) : capitalizedDayName}
                          </span>
                          <WeatherIcon name={info.icon as any} style={settings.iconStyle} className="w-5 h-5 shrink-0" strokeWidth={1.8} />
                          <span className="text-[12px] text-app-text-dim/90 font-medium truncate max-w-[125px]">
                            {translateWmoCode(weather.daily.weatherCode?.[i] ?? 0, settings.language || 'en')}
                          </span>
                        </div>
                        <span className="text-[13px] font-semibold text-app-text shrink-0">
                          <span className="text-app-text-dim">{formatTemp(dayMin, settings.unitTemp)}°</span>
                          {" / "}
                          <span>{formatTemp(dayMax, settings.unitTemp)}°</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[11px] text-app-text-dim/75 pl-1">
                        <div className="flex items-center gap-0.5">
                          <span className="opacity-70">🌅</span>
                          <span>{sunriseStr}</span>
                        </div>
                        <div className="flex items-center gap-0.5 justify-center">
                          <span className="opacity-70">🌇</span>
                          <span>{sunsetStr}</span>
                        </div>
                        <div className="flex items-center gap-1 justify-end">
                          <Icons.Droplet className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>{formatPrecipitation(weather.daily.precipitationSum?.[i] ?? 0, settings.unitPrecipitation === 'inches' ? 'in' : 'mm')}{settings.unitPrecipitation === 'inches' ? 'in' : 'mm'}</span>
                          <Icons.Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>{Math.round(weather.daily.uvIndex?.[i] ?? 0)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="flex flex-col gap-1 w-full mt-1">
          {(weather?.daily?.time || []).slice(0, 7).map((time, i) => {
            const info = getWeatherInfo(weather.daily.weatherCode?.[i] ?? 0);
            const date = parseISO(time);
            const isDailyCompact = settings.layoutDailyForecast === 'compact';
            const localDayName = isNaN(date.getTime()) 
              ? '---' 
              : new Intl.DateTimeFormat(settings.language || 'en', { weekday: isDailyCompact ? 'long' : 'short' }).format(date);
            const cleanedDayName = localDayName.replace(/\./g, '');
            const capitalizedDayName = cleanedDayName.charAt(0).toUpperCase() + cleanedDayName.slice(1);
            
            const dayMin = weather.daily.temperatureMin?.[i] ?? 0;
            const dayMax = weather.daily.temperatureMax?.[i] ?? 0;
            
            const leftPct = ((dayMin - globalMin) / globalRange) * 100;
            const widthPct = ((dayMax - dayMin) / globalRange) * 100;
            
            const currentTemp = weather.current?.temperature ?? dayMin;
            const currentPct = ((currentTemp - globalMin) / globalRange) * 100;
            const indicatorPct = Math.max(leftPct, Math.min(leftPct + widthPct, currentPct));

            if (isDailyCompact) {
              return (
                <div key={time} className="flex items-center justify-between py-3 border-b border-app-text/10 last:border-none gap-2">
                  <span className="text-[14px] font-semibold text-app-text w-[90px] shrink-0 text-left">
                    {i === 0 ? t('today', settings.language) : capitalizedDayName}
                  </span>
                  
                  <div className="flex-1 flex justify-center">
                    <WeatherIcon 
                      name={info.icon as any} 
                      style={settings.iconStyle} 
                      className="w-6 h-6" 
                      strokeWidth={1.8}
                    />
                  </div>

                  <div className="flex items-center gap-4 w-20 justify-end shrink-0">
                    <span className="text-[14px] font-semibold text-app-text-dim text-right">
                      {formatTemp(dayMin, settings.unitTemp)}°
                    </span>
                    <span className="text-[14px] font-semibold text-app-text text-right">
                      {formatTemp(dayMax, settings.unitTemp)}°
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div key={time} className="flex items-center justify-between py-3 border-b border-app-text/10 last:border-none gap-2">
                <span className="text-[14px] font-semibold w-[58px] text-app-text shrink-0 text-left">
                  {i === 0 ? t('today', settings.language) : capitalizedDayName}
                </span>
                
                <div className="w-8 flex justify-center shrink-0">
                  <WeatherIcon 
                    name={info.icon as any} 
                    style={settings.iconStyle} 
                    className="w-6 h-6" 
                    strokeWidth={1.8}
                  />
                </div>

                <span className="text-[14px] font-semibold text-app-text-dim w-8 text-right shrink-0">
                  {formatTemp(dayMin, settings.unitTemp)}°
                </span>

                <div className="flex-1 max-w-[80px] px-2 flex items-center justify-center min-w-[60px]">
                  <div className="w-full h-[6px] rounded-full bg-app-text/[0.08] relative overflow-visible">
                    <div 
                      className="absolute h-[6px] rounded-full" 
                      style={{ 
                        left: `${leftPct}%`, 
                        width: `${widthPct}%`,
                        background: `linear-gradient(90deg, ${getColorForTemp(dayMin)}, ${getColorForTemp(dayMax)})`,
                        boxShadow: `0 0 4px ${getGlowColorForTemp((dayMin + dayMax) / 2)}`
                      }} 
                    />
                    {i === 0 && (
                      <div 
                        className="absolute w-2.5 h-2.5 rounded-full bg-white -translate-y-1/2 top-1/2 -ml-1.25 border border-black/30 shadow-[0_0_5px_rgba(255,255,255,1)]"
                        style={{ left: `${indicatorPct}%` }}
                      />
                    )}
                  </div>
                </div>

                <span className="text-[14px] font-semibold text-app-text w-8 text-left shrink-0">
                  {formatTemp(dayMax, settings.unitTemp)}°
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const Icons = {
  ChevronRight: (props: any) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth || "2"} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-right" {...props}><path d="m9 18 6-6-6-6"/></svg>,
  Calendar: (props: any) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth || "1.4"} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-calendar" {...props}><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>,
  Clock: (props: any) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth || "1.4"} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-clock" {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Wind: (props: any) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth || "1.4"} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-wind" {...props}><path d="M12.8 19.6a8.8 8.8 0 1 1 .2-2.2"/><path d="M2 12h11.8"/><path d="M11.3 8.3A5.4 5.4 0 1 1 12 6"/><path d="M2 6h9.8"/><path d="M17.4 12.1a5.4 5.4 0 1 1-.9 3.2"/><path d="M2 18h15.2"/></svg>,
  Droplet: (props: any) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth || "1.4"} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-droplet" {...props}><path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z"/></svg>,
  Sun: (props: any) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth || "1.4"} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sun" {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>,
  X: (props: any) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth || "2"} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x" {...props}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
};
