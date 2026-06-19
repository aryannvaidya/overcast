import React, { useEffect } from 'react';
import { motion, useInView, animate, useMotionValue, useTransform } from 'motion/react';
import { WeatherData, Settings } from '../types';
import { parseISO } from 'date-fns';
import { cn } from '../lib/utils';
import { Translate } from '../lib/translations';

interface SunPathProps {
  weather: WeatherData;
  settings: Settings;
}

const SunriseIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.8" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={cn("text-amber-500", className)}
  >
    {/* Horizon line */}
    <line x1="3" y1="18" x2="21" y2="18" />
    {/* Archer Arrow pointing up */}
    <line x1="12" y1="13" x2="12" y2="4" />
    <polyline points="9,7 12,4 15,7" />
    {/* Dome representing rising sun */}
    <path d="M 8,18 A 4,4 0 0,1 16,18" fill="rgba(245, 158, 11, 0.12)" />
  </svg>
);

const SunsetIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.8" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={cn("text-amber-500", className)}
  >
    {/* Horizon line */}
    <line x1="3" y1="18" x2="21" y2="18" />
    {/* Archer Arrow pointing down */}
    <line x1="12" y1="4" x2="12" y2="13" />
    <polyline points="9,10 12,13 15,10" />
    {/* Dome representing sinking sun */}
    <path d="M 8,18 A 4,4 0 0,1 16,18" fill="rgba(245, 158, 11, 0.12)" />
  </svg>
);

const splitTimeAndAmPm = (timeStr: string) => {
  if (!timeStr) return { val: "--:--", ampm: "" };
  const cleaned = timeStr.trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    if (/^(AM|PM|am|pm)$/i.test(lastPart)) {
      return { val: parts.slice(0, -1).join(" "), ampm: lastPart };
    }
  }
  // Try matching directly
  const match = cleaned.match(/^([\d:]+)\s*(AM|PM|am|pm)?$/i);
  if (match) {
    return { val: match[1], ampm: match[2] || "" };
  }
  return { val: cleaned, ampm: "" };
};

export default function SunPath({ weather, settings }: SunPathProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.1 });
  
  // Local state to force re-renders for real-time sun movement
  const [, setTick] = React.useState(0);
  
  // Motion setup for smooth, path-aligned animation
  const motionProgress = useMotionValue(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  // BUG 1 FIX: Calculate current time in the target location's timezone
  const getNowInLocation = (timezone: string) => {
    try {
      const now = new Date();
      const resolvedTZ = timezone === 'auto' ? undefined : timezone;
      // Use toLocaleString to get the time in the target timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: resolvedTZ,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
      });
      
      const parts = formatter.formatToParts(now);
      const partValues: Record<string, any> = {};
      parts.forEach(p => partValues[p.type] = p.value);
      
      const yr = parseInt(partValues.year);
      const mo = parseInt(partValues.month);
      const dy = parseInt(partValues.day);
      const hr = parseInt(partValues.hour);
      const mn = parseInt(partValues.minute);
      const sc = parseInt(partValues.second) || 0;
      
      if (isNaN(yr) || isNaN(mo) || isNaN(dy) || isNaN(hr) || isNaN(mn)) {
        throw new Error('Invalid date components');
      }
      // Construct a Date object that represents the local time in that city
      return new Date(yr, mo - 1, dy, hr, mn, sc);
    } catch (e) {
      console.warn('Timezone conversion failed, falling back to naive:', e);
      return new Date();
    }
  };

  const nowInLocation = getNowInLocation(weather?.timezone || "UTC");
  const currentHour = nowInLocation.getHours();
  const currentMinute = nowInLocation.getMinutes();
  const nowMinutes = currentHour * 60 + currentMinute;

  // Helper to get minutes from H:M format
  const getMinutesFromISO = (iso: string) => {
    if (!iso) return null;
    const timePart = iso.split('T')[1] || iso;
    if (!timePart || !timePart.includes(':')) return null;
    const [h, m] = timePart.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // Display formatting for labels using the target timezone
  const formatTime = (iso: string) => {
    if (!iso) return "";
    try {
      const date = parseISO(iso.includes('Z') ? iso : `${iso}:00Z`);
      const is24h = settings.timeFormat === '24h';
      return date.toLocaleTimeString("en-US", {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
        hour12: !is24h,
        ...(is24h ? { hourCycle: 'h23' } : {})
      });
    } catch {
      return iso;
    }
  };

  const sunriseMinutes = getMinutesFromISO(weather?.daily?.sunrise?.[0] || "") || 360;
  const sunsetMinutes = getMinutesFromISO(weather?.daily?.sunset?.[0] || "") || 1080;
  
  // Determine if it is Day or Night for the cycle
  const isNight = nowMinutes < sunriseMinutes || nowMinutes > sunsetMinutes;

  // Calculate active span for the current path (Day or Night)
  let activeStartMinutes: number;
  let activeEndMinutes: number;
  let cycleProgress: number;
  let cycleLabelStart: string;
  let cycleLabelEnd: string;

  if (!isNight) {
    // Day Cycle: Sunrise to Sunset
    activeStartMinutes = sunriseMinutes;
    activeEndMinutes = sunsetMinutes;
    cycleLabelStart = formatTime(weather?.daily?.sunrise?.[0] || "2026-05-19T06:00");
    cycleLabelEnd = formatTime(weather?.daily?.sunset?.[0] || "2026-05-19T18:00");
  } else {
    // Night Cycle: Night is from Sunset to next Sunrise
    if (nowMinutes >= sunsetMinutes) {
      activeStartMinutes = sunsetMinutes;
      const tomorrowSunrise = getMinutesFromISO(weather?.daily?.sunrise?.[1] || "");
      activeEndMinutes = (tomorrowSunrise !== null) ? (tomorrowSunrise + 1440) : (sunriseMinutes + 1440);
      cycleLabelStart = formatTime(weather?.daily?.sunset?.[0] || "2026-05-19T18:00");
      cycleLabelEnd = weather?.daily?.sunrise?.[1] ? formatTime(weather.daily.sunrise[1]) : formatTime(weather?.daily?.sunrise?.[0] || "2026-05-19T06:00");
    } else {
      // After Midnight, before Sunrise
      activeStartMinutes = sunsetMinutes - 1440;
      activeEndMinutes = sunriseMinutes;
      cycleLabelStart = formatTime(weather?.daily?.sunset?.[0] || "2026-05-19T18:00");
      cycleLabelEnd = formatTime(weather?.daily?.sunrise?.[0] || "2026-05-19T06:00");
    }

    if (activeStartMinutes > activeEndMinutes) {
      if (nowMinutes >= activeStartMinutes) {
        activeEndMinutes += 1440;
      } else {
        activeStartMinutes -= 1440;
      }
    }
  }

  const cycleDuration = activeEndMinutes - activeStartMinutes;
  const cycleElapsed = nowMinutes - activeStartMinutes;
  
  cycleProgress = Math.max(0, Math.min(1, cycleElapsed / cycleDuration));

  useEffect(() => {
    if (isInView) {
      motionProgress.set(0);
      const anim = animate(motionProgress, cycleProgress, { 
        duration: 1.8, 
        ease: [0.25, 1, 0.5, 1] 
      });
      return () => anim.stop();
    }
  }, [weather, cycleProgress, isInView, motionProgress]);

  const sunriseSplit = splitTimeAndAmPm(cycleLabelStart);
  const sunsetSplit = splitTimeAndAmPm(cycleLabelEnd);

  // Perfect circular trajectory parameters designed to start at X=130 and end at X=410 (exactly touching the front hill peaks at Y=115)
  const theta0 = Math.acos(140 / 180);
  const iconX = useTransform(motionProgress, (v) => {
    const angle = -Math.PI + theta0 + v * (Math.PI - 2 * theta0);
    return 270 + 180 * Math.cos(angle);
  });
  const iconY = useTransform(motionProgress, (v) => {
    const angle = -Math.PI + theta0 + v * (Math.PI - 2 * theta0);
    return 228.13 + 180 * Math.sin(angle);
  });

  const getHillColors = (colorTheme: string = 'green', isNight: boolean) => {
    return {
      backColor: isNight ? 'rgba(var(--theme-accent-rgb), 0.16)' : 'rgba(var(--theme-accent-rgb), 0.12)',
      frontColor: isNight ? 'rgba(var(--theme-accent-rgb), 0.22)' : 'rgba(var(--theme-accent-rgb), 0.24)',
      activeStroke: 'var(--accent-color)',
      flood: 'var(--accent-color)'
    };
  };

  const hillColors = getHillColors(settings.colorTheme, isNight);

  const daylightArch = "M 130 115 A 180 180 0 0 1 410 115";
  const isIconVisible = cycleProgress > 0 && cycleProgress < 1;

  return (
    <div className="flex flex-col px-0 -mx-[21px] md:-mx-[21px]">
      <div 
        ref={containerRef} 
        className="w-full max-w-[335px] mx-auto bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[32px] pt-4 pb-0 px-5 flex flex-col gap-0 overflow-hidden shadow-2xl relative group select-none"
      >
        <style>{`
          .scenery-canvas {
            position: relative;
            width: calc(100% + 40px);
            margin-left: -20px;
            margin-right: -20px;
            height: 120px;
            overflow: hidden;
            background: transparent;
            border: none;
        }
        .scenery-svg {
            width: 100%;
            height: 100%;
            display: block;
            overflow: visible !important;
        }
      `}</style>

      {/* Top Header Row with cohesive Title */}
      <div className="flex items-center justify-between w-full px-0.5 mb-1">
        <div className="flex items-center gap-1.5 select-none text-app-text-dim font-medium font-sans">
          <SunriseIcon className="w-4 h-4 text-app-text-dim" />
          <span className="text-[11px] uppercase tracking-[0.08em] font-medium text-app-text-dim">
            <Translate text="Sun & Moon" lang={settings.language || 'en'} />
          </span>
        </div>
        
        {/* Sunrise & Sunset Times */}
        <div className="flex items-center gap-3 text-[11px] font-sans font-medium text-app-text/90">
          <div className="flex items-center gap-1">
            <SunriseIcon className="w-3.5 h-3.5 text-amber-400/80" />
            <span>{formatTime(weather?.daily?.sunrise?.[0] || "2026-05-19T06:00")}</span>
          </div>
          <div className="flex items-center gap-1">
            <SunsetIcon className="w-3.5 h-3.5 text-orange-400/80" />
            <span>{formatTime(weather?.daily?.sunset?.[0] || "2026-05-19T18:00")}</span>
          </div>
        </div>
      </div>

      {/* Center Row: Boundless scenery SVG */}
      <div className="scenery-canvas">
        <svg className="scenery-svg" viewBox="0 0 540 200" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <defs>
            {/* Sun Arc Glow Matrix */}
            <linearGradient id="arcGlow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={isNight ? "#E0F2FE" : "#FFF5D9"} stopOpacity={isNight ? "0.4" : "0.85"}/>
              <stop offset="100%" stopColor={isNight ? "#0284C7" : "#FFFFFF"} stopOpacity="0.0"/>
            </linearGradient>

            {/* Hill Gradient Back (Themed) */}
            <linearGradient id="backHillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={hillColors.backColor} />
              <stop offset="100%" stopColor={isNight ? "rgba(var(--theme-accent-rgb), 0.0)" : "rgba(255, 255, 255, 0.0)"} />
            </linearGradient>

            {/* Hill Gradient Front (Themed) */}
            <linearGradient id="frontHillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={hillColors.frontColor} />
              <stop offset="100%" stopColor={isNight ? "rgba(var(--theme-accent-rgb), 0.0)" : "rgba(255, 255, 255, 0.0)"} />
            </linearGradient>

            {/* Drop shadow casting deep valley depth illusion */}
            <filter id="layerShadow" x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="-4" stdDeviation="5" floodColor={isNight ? "#020617" : hillColors.flood} floodOpacity={isNight ? "0.2" : "0.04"}/>
            </filter>

            {/* Sun Orb Effects */}
            <linearGradient id="sunColor" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={isNight ? "#E0F2FE" : "#FFE066"}/>
              <stop offset="100%" stopColor={isNight ? "#38BDF8" : "#FBBF24"}/>
            </linearGradient>
            <filter id="sunGlow" filterUnits="userSpaceOnUse" x="-100" y="-100" width="740" height="400">
              <feDropShadow dx="0" dy="0" stdDeviation="15" floodColor={isNight ? "#38BDF8" : "#FBBF24"} floodOpacity="0.65"/>
            </filter>
          </defs>

          {/* 1. Arc Light Projection removed */}

          {/* 2. Solid Back Hill: Sharp center peak raised for better visibility (Y=90) */}
          <path d="M -50 210 L -50 160 C 150 160, 230 90, 270 90 C 310 90, 390 160, 590 160 L 590 210 Z" fill="url(#backHillGrad)" fillOpacity={1} />

          {/* 3a. Precise Circular Arc Line (Faint guide track) */}
          <path d="M 130 115 A 180 180 0 0 1 410 115" stroke={isNight ? "rgba(56, 189, 248, 0.15)" : "rgba(251, 191, 36, 0.15)"} strokeWidth="1.5" strokeLinecap="round"/>

          {/* 3b. Glowing Active Trajectory Arc portion (progress-driven) */}
          <motion.path 
            d="M 130 115 A 180 180 0 0 1 410 115" 
            stroke={isNight ? "#38BDF8" : "#FBBF24"} 
            strokeWidth="2.5" 
            strokeLinecap="round"
            style={{ pathLength: motionProgress }}
          />

          {/* 4. Sun/Moon Dynamic Node Element (Bound directly via SVG cx/cy parameters for pixel-perfect tracking) */}
          {isIconVisible && (
            <motion.circle 
              cx={iconX} 
              cy={iconY} 
              r="11" 
              fill="url(#sunColor)" 
              filter="url(#sunGlow)"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.15 }}
            />
          )}

          {/* 5. Solid Front Hill: Steep U-Shape Valley raised for larger presence (Y=115, Y=175) */}
          <path d="M -50 210 L -50 150 C 50 150, 110 115, 130 115 C 160 115, 230 175, 270 175 C 310 175, 380 115, 410 115 C 430 115, 490 150, 590 150 L 590 210 Z" fill="url(#frontHillGrad)" fillOpacity={1} filter="url(#layerShadow)" />
        </svg>
      </div>
    </div>
  </div>
  );
}
