import React, { useState } from 'react';
import { WeatherData, Settings, Location } from '../types';
import { WeatherIcon } from './WeatherIcons';
import { Wind, Droplet, Sun, Umbrella, Clock, ChevronLeft, Sunrise, Sunset } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatTemp, formatWind, formatPrecipitation } from '../lib/units';
import { parseISO } from 'date-fns';
import { motion } from 'motion/react';
import { getWeatherInfo, parseTimeToAbsoluteDate } from '../services/weatherService';
import { t, Translate } from '../lib/translations';
import { Haptic } from '../lib/haptics';

interface DailyForecastDetailProps {
  weather: WeatherData;
  settings: Settings;
  activeLocation: Location;
  onClose: () => void;
  initialIndex?: number;
}

export default function DailyForecastDetail({
  weather,
  settings,
  activeLocation,
  onClose,
  initialIndex = 0
}: DailyForecastDetailProps) {
  const [selectedIdx, setSelectedIdx] = useState<number>(initialIndex);

  if (!weather || !weather.daily) return null;

  const dailyTimes = (weather.daily.time || []).slice(0, 7);
  if (dailyTimes.length === 0) return null;

  const activeDayISO = dailyTimes[selectedIdx];
  const activeDayDate = parseISO(activeDayISO);

  // 1. Core daily weather code and description
  const weatherCode = weather.daily.weatherCode?.[selectedIdx] ?? 0;
  const info = getWeatherInfo(weatherCode);

  const dayMin = weather.daily.temperatureMin?.[selectedIdx] ?? 0;
  const dayMax = weather.daily.temperatureMax?.[selectedIdx] ?? 0;
  
  // 2. Extrapolate hourly average metrics for the selected day from 24h slices
  const startHour = selectedIdx * 24;
  const endHour = startHour + 24;

  const dayHourlyTemps = weather.hourly?.temperature?.slice(startHour, endHour) || [];
  
  // Calculate average humidity for selected day using current humidity and weather code
  const currentHumidity = weather.current?.relativeHumidity ?? 55;
  let avgHumidity = currentHumidity;
  if (weatherCode >= 51 && weatherCode <= 86) {
    avgHumidity = Math.min(95, currentHumidity + 15);
  } else if (weatherCode >= 2 && weatherCode <= 48) {
    avgHumidity = Math.min(85, Math.max(60, currentHumidity + 5));
  } else {
    avgHumidity = Math.max(30, currentHumidity - 10);
  }

  // Wind speed & wind direction (extract for afternoon/noon index 12 of that day)
  const noonIdx = startHour + 12;
  const windSpd = weather.hourly?.windSpeed?.[noonIdx] ?? weather.current?.windSpeed ?? 10;

  // Chance of rain (max precipitation probability for that day)
  const dayRainProbabilities = weather.hourly?.precipitationProbability?.slice(startHour, endHour) || [];
  const maxRainProb = dayRainProbabilities.length > 0 ? Math.max(...dayRainProbabilities) : 0;

  // Precipitation sum
  const precSum = weather.daily.precipitationSum?.[selectedIdx] ?? 0;
  const precUnit = settings.unitPrecipitation === 'inches' ? 'in' : 'mm';
  const formattedPrecip = formatPrecipitation(precSum, precUnit);

  // UV index
  const uvIdx = weather.daily.uvIndex?.[selectedIdx] ?? 0;

  // Sunrise / Sunset
  const sunriseISO = weather.daily.sunrise?.[selectedIdx];
  const sunsetISO = weather.daily.sunset?.[selectedIdx];

  const formatAstroTime = (isoStr?: string) => {
    if (!isoStr) return '--:--';
    try {
      const date = parseTimeToAbsoluteDate(isoStr, weather.timezone);
      const is24h = settings.timeFormat === '24h';
      const resolvedTZ = weather.timezone === 'auto' ? undefined : weather.timezone;
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: !is24h,
        timeZone: resolvedTZ
      }).format(date).replace(/\u202f/g, ' ').trim();
    } catch {
      try {
        const match = isoStr.match(/T(\d{2}):(\d{2})/);
        if (!match) return '--:--';
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const is24h = settings.timeFormat === '24h';
        if (is24h) {
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        } else {
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const displayHours = hours % 12 || 12;
          return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
        }
      } catch {
        return '--:--';
      }
    }
  };

  const formattedSunrise = formatAstroTime(sunriseISO);
  const formattedSunset = formatAstroTime(sunsetISO);

  // Generate SVG points for hourly temperature curve
  const tMin = dayHourlyTemps.length > 0 ? Math.min(...dayHourlyTemps) : 0;
  const tMax = dayHourlyTemps.length > 0 ? Math.max(...dayHourlyTemps) : 30;
  const tRange = tMax - tMin || 1;

  const chartWidth = 320;
  const chartHeight = 70;
  const paddingX = 10;
  const paddingY = 10;

  const points = dayHourlyTemps.map((temp, index) => {
    const x = paddingX + (index / 23) * (chartWidth - 2 * paddingX);
    const y = (chartHeight - paddingY) - ((temp - tMin) / tRange) * (chartHeight - 2 * paddingY);
    return { x, y, temp };
  });

  // Construct smooth bezier spline
  let curvePath = '';
  if (points.length > 0) {
    curvePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const cpX1 = points[i - 1].x + (points[i].x - points[i - 1].x) / 2;
      const cpY1 = points[i - 1].y;
      const cpX2 = points[i - 1].x + (points[i].x - points[i - 1].x) / 2;
      const cpY2 = points[i].y;
      curvePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${points[i].x} ${points[i].y}`;
    }
  }

  // Construct area path for subtle gradient fill
  const areaPath = points.length > 0
    ? `${curvePath} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`
    : '';

  // Specific key indices on graph to highlight with dots (12 AM, 6 AM, 12 PM, 6 PM)
  const highlightIndices = [0, 6, 12, 18];

  // Determine next astronomical event for display based on selected index
  const isToday = selectedIdx === 0;
  const displaySunset = !isToday || (sunsetISO ? Date.now() < parseTimeToAbsoluteDate(sunsetISO, weather.timezone).getTime() : true);

  const eventLabel = displaySunset ? "Sunset" : "Sunrise";
  const eventTime = displaySunset ? formattedSunset : formattedSunrise;

  const parts = eventTime.split(' ');
  const timeNum = parts[0];
  const timeAmPm = parts[1] || '';

  // Compute current position of sun along the arc (0 to 1)
  let sunT = 0.5; // default center peak
  if (sunriseISO && sunsetISO) {
    try {
      const rise = parseTimeToAbsoluteDate(sunriseISO, weather.timezone).getTime();
      const set = parseTimeToAbsoluteDate(sunsetISO, weather.timezone).getTime();
      const now = isToday ? Date.now() : (rise + set) / 2; // mid-day for other selected days
      if (now <= rise) {
        sunT = 0;
      } else if (now >= set) {
        sunT = 1;
      } else {
        sunT = (now - rise) / (set - rise);
      }
    } catch {
      sunT = 0.5;
    }
  }

  // Evaluate quadratic bezier curve at t: M 55,44 Q 160,-15 265,44
  const p0 = { x: 55, y: 44 };
  const p1 = { x: 160, y: -15 };
  const p2 = { x: 265, y: 44 };

  const mt = 1 - sunT;
  const sunX = mt * mt * p0.x + 2 * mt * sunT * p1.x + sunT * sunT * p2.x;
  const sunY = mt * mt * p0.y + 2 * mt * sunT * p1.y + sunT * sunT * p2.y;

  return (
    <div className="flex flex-col h-full w-full bg-app-bg text-app-text select-none overflow-y-auto no-scrollbar pb-10 transform-gpu">
      {/* Header Bar */}
      <header className="flex items-center justify-between px-6 py-5 shrink-0">
        <div className="flex flex-col text-left">
          <h1 className="text-[20px] font-semibold tracking-tight leading-tight text-app-text">
            <Translate text="Daily Forecast" lang={settings.language || 'en'} />
          </h1>
          <span className="text-[13px] text-app-text-dim font-medium tracking-tight mt-0.5 animate-fade-in">
            {activeLocation.name}
            {activeLocation.admin1 && activeLocation.admin1 !== activeLocation.name ? `, ${activeLocation.admin1}` : ''}
          </span>
        </div>

        {/* Back Button on top right */}
        <button
          onClick={() => {
            Haptic.medium(settings.hapticEnabled);
            onClose();
          }}
          className="w-12 h-12 bg-app-surface border border-app-border flex items-center justify-center rounded-full hover:bg-app-surface/80 transition-all shadow-xl select-none cursor-pointer"
          aria-label="Back to home"
        >
          <ChevronLeft className="w-5.5 h-5.5 text-app-text" strokeWidth={2.5} />
        </button>
      </header>

      {/* Days Horizontal selector list */}
      <section className="px-5 py-2 shrink-0 overflow-x-auto no-scrollbar flex gap-2.5">
        {dailyTimes.map((timeStr, idx) => {
          const dateObj = parseISO(timeStr);
          const isSelected = idx === selectedIdx;
          
          const dayName = new Intl.DateTimeFormat(settings.language || 'en', { weekday: 'short' }).format(dateObj);
          const dayNum = dateObj.getDate();

          return (
            <button
              key={timeStr}
              onClick={() => {
                Haptic.light(settings.hapticEnabled);
                setSelectedIdx(idx);
              }}
              className={cn(
                "flex flex-col items-center justify-center min-w-[54px] py-3.5 rounded-[20px] border transition-all duration-300 relative cursor-pointer",
                isSelected 
                  ? "bg-app-text text-app-bg border-app-text shadow-sm scale-102" 
                  : "bg-app-surface text-app-text-dim border-app-border hover:bg-app-surface/80"
              )}
            >
              <span className={cn(
                "text-[11px] uppercase tracking-wider font-semibold mb-1 opacity-70",
                isSelected ? "text-app-bg/80" : "text-app-text-dim"
              )}>
                {dayName}
              </span>
              <span className={cn(
                "text-[18px] font-semibold tracking-tight",
                isSelected ? "text-app-bg" : "text-app-text"
              )}>
                {dayNum}
              </span>

              {/* iOS dot indicator under selected */}
              {isSelected && (
                <div className="absolute bottom-1.5 w-1 h-1 bg-[var(--accent-color)] rounded-full" />
              )}
            </button>
          );
        })}
      </section>

      {/* 1. Main Weather Condition Row according to Image 1 (Compact Layout) */}
      <section className="flex items-center justify-between px-6 pt-9 pb-3 max-w-[390px] mx-auto w-full select-none shrink-0">
        {/* Left: Compact Weather Icon on extreme left, shifted a bit right */}
        <div className="relative flex items-center justify-start w-[84px] h-[84px] pl-3 animate-fade-in shrink-0">
          <WeatherIcon 
            name={info.icon as any} 
            style={settings.iconStyle} 
            className="w-[80px] h-[80px]"
            strokeWidth={1.2}
          />
        </div>

        {/* Right: Temps and Condition Side-by-Side/Stacked on extreme right */}
        <div className="flex flex-col justify-center text-right select-none animate-fade-in">
          <div className="flex items-baseline justify-end">
            <span className="text-[38px] font-bold text-[#000000] tracking-tighter leading-none">
              {formatTemp(dayMax, settings.unitTemp)}°
            </span>
            <span className="text-[30px] font-thin text-[#a3a3a3] mx-1">
              /
            </span>
            <span className="text-[30px] font-bold text-[#555555] tracking-tighter leading-none">
              {formatTemp(dayMin, settings.unitTemp)}°
            </span>
          </div>
          <span className="text-[18px] font-light text-app-text mt-1.5 leading-tight tracking-tight">
            <Translate text={info.label} lang={settings.language || 'en'} />
          </span>
        </div>
      </section>

      {/* 3. Hourly Temperature curve card spanning full width */}
      <section className="px-6 mb-4 max-w-[390px] mx-auto w-full shrink-0">
        <div className="flex flex-col justify-between select-none relative overflow-visible py-3">
          <div className="relative w-full aspect-[320/100] mx-auto">
            <svg viewBox="0 0 320 100" className="w-full h-full overflow-visible">
              <defs>
                {/* Elegant linear gradient fill for temperature spline */}
                <linearGradient id="chart-glow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-color, #38bdf8)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--accent-color, #38bdf8)" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              {/* Area fill under curve */}
              {areaPath && (
                <path d={areaPath} fill="url(#chart-glow)" className="opacity-70" />
              )}

              {/* Smooth spline curve */}
              {curvePath && (
                <path 
                  d={curvePath} 
                  fill="none" 
                  stroke="var(--accent-color, #38bdf8)" 
                  strokeWidth={2} 
                  strokeLinecap="round" 
                  className="drop-shadow-[0_2px_8px_rgba(56,189,248,0.3)]"
                />
              )}

              {/* Horizontal baseline line underneath curve, above labels */}
              <line 
                x1={paddingX} 
                y1={82} 
                x2={chartWidth - paddingX} 
                y2={82} 
                className="stroke-app-text/10" 
                strokeWidth={1} 
              />

              {/* Little dots highlighted on curve (12AM, 6AM, 12PM, 6PM) */}
              {points.map((p, idx) => {
                if (!highlightIndices.includes(idx)) return null;
                return (
                  <g key={`dot-${idx}`}>
                    <circle 
                      cx={p.x} 
                      cy={p.y} 
                      r={3.5} 
                      className="fill-app-bg stroke-[var(--accent-color,#38bdf8)]" 
                      strokeWidth={1.5}
                    />
                    {/* Tiny temperature text right above the dot */}
                    <text 
                      x={p.x} 
                      y={p.y - 9} 
                      className="fill-app-text font-bold" 
                      fontSize={11.5} 
                      textAnchor="middle" 
                      opacity={1.0}
                    >
                      {formatTemp(p.temp, settings.unitTemp)}°
                    </text>
                  </g>
                );
              })}

              {/* X-Axis labels inside SVG to keep perfect positioning */}
              <text x={paddingX} y={96} className="fill-app-text-dim" fontSize={10} fontWeight={500} textAnchor="start">12 AM</text>
              <text x={paddingX + (6/23)*(chartWidth-2*paddingX)} y={96} className="fill-app-text-dim" fontSize={10} fontWeight={500} textAnchor="middle">6 AM</text>
              <text x={paddingX + (12/23)*(chartWidth-2*paddingX)} y={96} className="fill-app-text-dim" fontSize={10} fontWeight={500} textAnchor="middle">12 PM</text>
              <text x={paddingX + (18/23)*(chartWidth-2*paddingX)} y={96} className="fill-app-text-dim" fontSize={10} fontWeight={500} textAnchor="middle">6 PM</text>
            </svg>
          </div>
        </div>
      </section>

      {/* 4. Grid of 4 cards (Precipitation, Wind, Humidity, UV (Highest)) */}
      <section className="px-6 grid grid-cols-2 gap-3 max-w-[390px] mx-auto w-full shrink-0">
        {/* Precipitation Card */}
        <div className="bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[24px] p-[1.125rem] flex flex-col justify-between h-[115px] select-none shadow-md">
          <div className="flex items-center gap-1.5">
            <Umbrella className="w-4 h-4 text-app-text-dim" strokeWidth={1.6} />
            <span className="text-[13px] font-medium text-app-text-dim">Precipitation</span>
          </div>
          <div className="flex flex-col gap-0.5 mt-auto">
            <span className="text-[25px] font-bold text-app-text leading-none whitespace-nowrap flex items-baseline">
              <span>{formattedPrecip}</span>
              <span className="text-[13px] font-semibold text-app-text-dim ml-0.5">{precUnit}</span>
              <span className="text-[13px] font-semibold text-app-text-dim ml-1.5">({maxRainProb}%)</span>
            </span>
          </div>
        </div>

        {/* Wind Card */}
        <div className="bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[24px] p-[1.125rem] flex flex-col justify-between h-[115px] select-none shadow-md">
          <div className="flex items-center gap-1.5">
            <Wind className="w-4 h-4 text-app-text-dim" strokeWidth={1.6} />
            <span className="text-[13px] font-medium text-app-text-dim">Wind</span>
          </div>
          <div className="flex flex-col gap-0.5 mt-auto">
            <span className="text-[28px] font-bold text-app-text leading-none">
              {formatWind(windSpd, settings.unitWind)}<span className="text-[16px] font-semibold text-app-text-dim">{settings.unitWind}</span>
            </span>
          </div>
        </div>

        {/* Humidity Card */}
        <div className="bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[24px] p-[1.125rem] flex flex-col justify-between h-[115px] select-none shadow-md">
          <div className="flex items-center gap-1.5">
            <Droplet className="w-4 h-4 text-app-text-dim" strokeWidth={1.6} />
            <span className="text-[13px] font-medium text-app-text-dim">Humidity</span>
          </div>
          <div className="flex flex-col gap-0.5 mt-auto">
            <span className="text-[28px] font-bold text-app-text leading-none">
              {avgHumidity}%
            </span>
          </div>
        </div>

        {/* UV (Highest) Card */}
        <div className="bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[24px] p-[1.125rem] flex flex-col justify-between h-[115px] select-none shadow-md">
          <div className="flex items-center gap-1.5">
            <Sun className="w-4 h-4 text-app-text-dim" strokeWidth={1.6} />
            <span className="text-[13px] font-medium text-app-text-dim">UV (Highest)</span>
          </div>
          <div className="flex flex-col gap-0.5 mt-auto">
            <span className="text-[28px] font-bold text-app-text leading-none">
              {uvIdx}
            </span>
          </div>
        </div>
      </section>

      {/* 5. Sunrise & Sunset full-width card with arc */}
      <section className="px-6 mt-4 max-w-[390px] mx-auto w-full shrink-0">
        <div className="bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[24px] p-4 flex flex-col items-center justify-center select-none shadow-lg relative overflow-hidden">
          {/* Time text columns above the arc (Sunrise Left, Sunset Right) */}
          <div className="flex items-center justify-between w-full mb-2.5 px-2">
            <div className="flex flex-col text-left">
              <span className="text-[16px] font-semibold text-app-text tracking-tight leading-none">{formattedSunrise}</span>
              <span className="text-[11px] font-medium text-app-text-dim uppercase tracking-wider mt-1">Sunrise</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[16px] font-semibold text-app-text tracking-tight leading-none">{formattedSunset}</span>
              <span className="text-[11px] font-medium text-app-text-dim uppercase tracking-wider mt-1">Sunset</span>
            </div>
          </div>

          {/* SVG Sun Path Arc containing Sunrise/Sunset icons and the beautiful thick-in-middle curve */}
          <div className="relative w-full aspect-[320/55] mx-auto overflow-visible">
            <svg viewBox="0 0 320 55" className="w-full h-full overflow-visible">
              {/* Curve that is thin on both ends and thick in middle */}
              <path 
                d="M 65,44 Q 160,-15 255,44 Q 160,-11 65,44 Z" 
                fill="currentColor"
                className="text-app-text/30"
              />

              {/* Sunrise icon inside SVG */}
              <g className="text-amber-500 fill-amber-500/10" strokeLinecap="round" strokeLinejoin="round">
                {/* Horizon line */}
                <line x1="20" y1="46" x2="50" y2="46" stroke="currentColor" strokeWidth={2} />
                {/* Sun half-circle */}
                <path d="M 28,46 A 7,7 0 0,1 42,46 Z" fill="currentColor" stroke="currentColor" strokeWidth={1} />
                {/* Up Arrow pointing up from the sun */}
                <line x1="35" y1="38" x2="35" y2="28" stroke="currentColor" strokeWidth={1.5} />
                <polyline points="32,31 35,28 38,31" fill="none" stroke="currentColor" strokeWidth={1.5} />
                {/* Rays */}
                <line x1="28.5" y1="39.5" x2="25.5" y2="36.5" stroke="currentColor" strokeWidth={1.5} />
                <line x1="41.5" y1="39.5" x2="44.5" y2="36.5" stroke="currentColor" strokeWidth={1.5} />
                <line x1="24" y1="44" x2="20" y2="43" stroke="currentColor" strokeWidth={1.5} />
                <line x1="46" y1="44" x2="50" y2="43" stroke="currentColor" strokeWidth={1.5} />
              </g>

              {/* Sunset icon inside SVG */}
              <g className="text-orange-500 fill-orange-500/10" strokeLinecap="round" strokeLinejoin="round">
                {/* Horizon line */}
                <line x1="270" y1="46" x2="300" y2="46" stroke="currentColor" strokeWidth={2} />
                {/* Sun half-circle */}
                <path d="M 278,46 A 7,7 0 0,1 292,46 Z" fill="currentColor" stroke="currentColor" strokeWidth={1} />
                {/* Down Arrow pointing into the sun */}
                <line x1="285" y1="26" x2="285" y2="36" stroke="currentColor" strokeWidth={1.5} />
                <polyline points="282,33 285,36 288,33" fill="none" stroke="currentColor" strokeWidth={1.5} />
                {/* Rays */}
                <line x1="278.5" y1="39.5" x2="275.5" y2="36.5" stroke="currentColor" strokeWidth={1.5} />
                <line x1="291.5" y1="39.5" x2="294.5" y2="36.5" stroke="currentColor" strokeWidth={1.5} />
                <line x1="274" y1="44" x2="270" y2="43" stroke="currentColor" strokeWidth={1.5} />
                <line x1="296" y1="44" x2="300" y2="43" stroke="currentColor" strokeWidth={1.5} />
              </g>
            </svg>
          </div>
        </div>
      </section>
    </div>
  );
}
