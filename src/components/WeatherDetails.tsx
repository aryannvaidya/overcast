import React, { useState } from 'react';
import { WeatherData, Settings, Location } from '../types';
import { RawIcons, WeatherIcon } from './WeatherIcons';
import { Flower, Trees, Sprout, Leaf, ShieldCheck, MoreHorizontal, ChevronRight, Wind, Sun, Glasses, Shirt, Umbrella, Droplet, Eye, Info, TreeDeciduous, Orbit, Percent } from 'lucide-react';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';
import { formatTemp, formatWind, formatVisibility, formatPrecipitation, convertVisibility, formatGlobalTime } from '../lib/units';
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { getCurrentHourIndex } from '../services/weatherService';
import { useTranslatedText, Translate } from '../lib/translations';

const PARTICLE_DOTS = [
  { x: 38, y: 30, r: 1.4, opacity: 0.85, delay: 0 },
  { x: 62, y: 26, r: 2.2, opacity: 0.7, delay: 0.5 },
  { x: 44, y: 52, r: 1.8, opacity: 0.9, delay: 0.2 },
  { x: 28, y: 58, r: 2.5, opacity: 0.75, delay: 0.8 },
  { x: 74, y: 44, r: 1.5, opacity: 0.6, delay: 0.3 },
  { x: 50, y: 38, r: 2.3, opacity: 0.9, delay: 0.1 },
  { x: 38, y: 68, r: 2.0, opacity: 0.8, delay: 0.4 },
  { x: 65, y: 64, r: 1.7, opacity: 0.7, delay: 0.7 },
  { x: 52, y: 20, r: 2.4, opacity: 0.9, delay: 0.6 },
  { x: 22, y: 42, r: 1.4, opacity: 0.6, delay: 0.9 },
  { x: 78, y: 32, r: 1.8, opacity: 0.85, delay: 0.15 },
  { x: 42, y: 15, r: 1.5, opacity: 0.45, delay: 0.45 },
  { x: 30, y: 22, r: 2.1, opacity: 0.65, delay: 0.75 },
  { x: 70, y: 20, r: 1.3, opacity: 0.55, delay: 0.25 },
  { x: 82, y: 54, r: 2.4, opacity: 0.85, delay: 0.35 },
  { x: 48, y: 78, r: 1.8, opacity: 0.75, delay: 0.55 },
  { x: 60, y: 76, r: 1.6, opacity: 0.65, delay: 0.65 },
  { x: 25, y: 72, r: 2.0, opacity: 0.55, delay: 0.85 },
  { x: 18, y: 32, r: 1.7, opacity: 0.5, delay: 0.95 },
  { x: 85, y: 40, r: 1.5, opacity: 0.6, delay: 0.05 }
];

const GOLDEN_RING_PARTICLES = Array.from({ length: 90 }).map((_, i) => {
  const angle = (i / 90) * 2 * Math.PI;
  // Make a thicker circle with random offset to look like beautiful golden dust
  const rOffset = (Math.sin(i * 1.8) * 3) + (Math.cos(i * 4.7) * 2);
  const r = 39 + rOffset;
  const x = 50 + r * Math.cos(angle);
  const y = 50 + r * Math.sin(angle);
  const size = 0.5 + Math.abs(Math.sin(i * 3.14)) * 1.3;
  const opacity = 0.4 + Math.abs(Math.cos(i * 2.1)) * 0.55;
  const pulseSpeed = 2 + (i % 4);
  return { x, y, size, opacity, pulseSpeed };
});

const POLLUTANT_DETAILS: Record<string, { name: string; desc: string; hazard: string }> = {
  'PM2.5': {
    name: 'Fine Particulates (PM2.5)',
    desc: 'Fine inhalable particles from combustion, smoke, and industrial emissions. They can go deep into lungs and bloodstreams.',
    hazard: 'High risk of respiratory and cardiovascular issues upon long-term exposure.'
  },
  'PM10': {
    name: 'Coarse Particulates (PM10)',
    desc: 'Coarser dust, pollen, and mold particles that affect nasal and airway passageways.',
    hazard: 'Can cause cough, respiratory irritation, and worsen asthma or lung infections.'
  },
  'CO': {
    name: 'Carbon Monoxide (CO)',
    desc: 'Colorless, odorless gas primarily from heating and vehicle exhaust. Reduces oxygen delivery in body tissues.',
    hazard: 'May trigger headaches, fatigue, dizziness, and compromised cardio-pulmonary transport.'
  },
  'NO₂': {
    name: 'Nitrogen Dioxide (NO₂)',
    desc: 'Highly reactive gas from traffic exhaust. Strongly correlated to lower lung defenses and airway inflammation.',
    hazard: 'Aggravates asthma, decreases infection vulnerability, and impairs lung function.'
  },
  'O₃': {
    name: 'Ground-Level Ozone (O₃)',
    desc: 'Formed through reactions of pollutants under hot sunlight. Strong gaseous irritant to eye/throat linings.',
    hazard: 'Inhaling ozone triggers immediate chest tightness, throat irritation, and breathing discomfort.'
  }
};

function getSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

interface AQISparklineProps {
  trend?: { time: string; aqi: number }[];
  color: string;
  currentAqi?: number;
  lang?: string;
}

export function AQISparkline({ trend, color, currentAqi, lang = 'en' }: AQISparklineProps) {
  if (!trend || trend.length < 2) return null;
  
  let cleanTrend = trend.map(t => t.aqi);
  
  if (currentAqi !== undefined && cleanTrend.length > 0) {
    const originalLastVal = cleanTrend[cleanTrend.length - 1];
    if (originalLastVal !== currentAqi) {
      const scaleRatio = originalLastVal > 0 ? (currentAqi / originalLastVal) : 1;
      cleanTrend = cleanTrend.map((v, idx) => {
        if (idx === cleanTrend.length - 1) return currentAqi;
        return Math.max(0, Math.round(v * scaleRatio));
      });
    }
  }

  const minVal = Math.min(...cleanTrend);
  const maxVal = Math.max(...cleanTrend);
  const valRange = maxVal - minVal;
  const divisor = valRange === 0 ? 1 : valRange;

  const points = trend.map((item, i) => {
    const x = 6 + (i / (trend.length - 1)) * 488;
    const y = 70 - ((cleanTrend[i] - minVal) / divisor) * 55;
    return { x, y, aqi: cleanTrend[i], time: item.time };
  });

  const linePath = getSmoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} 80 L ${points[0].x.toFixed(1)} 80 Z`;

  const currentVal = points[points.length - 1];
  
  // Use a unique ID based on values to prevent multiple sparklines on same page from colliding
  const gradId = `spark-grad-${Math.round(points[0]?.y || 0)}-${points.length}`;

  return (
    <div className="flex flex-col gap-2 mt-2 pt-4 border-t border-app-border/30">
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.1em] text-app-text-dim/60">
        <span><Translate text="24-Hour Trend" lang={lang} /></span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-app-text-dim/30" />
            <Translate text="Min" lang={lang} />: <strong className="text-app-text font-bold">{minVal}</strong>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
            <Translate text="Max" lang={lang} />: <strong className="text-app-text font-semibold" style={{ color: color }}>{maxVal}</strong>
          </span>
        </div>
      </div>

      <div className="w-full mt-1">
        <div className="relative w-full h-14 overflow-visible">
          <svg 
            width="100%" 
            height="100%" 
            viewBox="0 0 500 80" 
            preserveAspectRatio="none" 
            className="overflow-visible"
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Sparkline Area Fill */}
            <path 
              d={areaPath} 
              fill={`url(#${gradId})`} 
              className="transition-all duration-500"
            />

            {/* Sparkline Line */}
            <path 
              d={linePath} 
              fill="none" 
              stroke={color} 
              strokeWidth="3" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="transition-all duration-500"
            />
          </svg>

          {/* Current / Now node point as perfect circle */}
          {currentVal && (
            <div 
              className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-125 duration-300"
              style={{
                left: `${(currentVal.x / 500) * 100}%`,
                top: `${(currentVal.y / 80) * 100}%`,
                width: '13px',
                height: '13px'
              }}
            >
              <div 
                className="w-full h-full rounded-full bg-white border-[3.5px]" 
                style={{ borderColor: color }} 
              />
            </div>
          )}
        </div>

        {/* Axis labels */}
        <div className="flex justify-between text-[8.5px] font-black uppercase tracking-[0.1em] text-app-text-dim/40 pt-2 mt-1">
          <span><Translate text="24h Ago" lang={lang} /></span>
          <span><Translate text="Now" lang={lang} /></span>
        </div>
      </div>
    </div>
  );
}

interface WeatherDetailsProps {
  weather: WeatherData;
  settings: Settings;
  location?: Location;
  focusKey?: string;
}

export default function WeatherDetails({ weather, settings, location, focusKey }: WeatherDetailsProps) {
  if (!weather || !weather.current) return null;

  const getThemeColors = (colorTheme: string = 'green') => {
    const themes: Record<string, { 
      text: string; 
      textDark: string; 
      fromBg: string; 
      toBg: string; 
      fill1: string; 
      fill2: string;
      windAccent: string;
      windTrack: string;
    }> = {
      green: {
        text: 'text-emerald-500',
        textDark: 'dark:text-emerald-400',
        fromBg: 'rgba(5, 150, 105, 0.1)',
        toBg: 'rgba(16, 185, 129, 0.25)',
        fill1: '#10b981',
        fill2: '#34d399',
        windAccent: '#10b981',
        windTrack: 'rgba(16, 185, 129, 0.12)',
      },
      blue: {
        text: 'text-blue-500',
        textDark: 'dark:text-blue-400',
        fromBg: 'rgba(37, 99, 235, 0.1)',
        toBg: 'rgba(59, 130, 246, 0.25)',
        fill1: '#3b82f6',
        fill2: '#60a5fa',
        windAccent: '#3b82f6',
        windTrack: 'rgba(59, 130, 246, 0.12)',
      },
      pink: {
        text: 'text-pink-500',
        textDark: 'dark:text-pink-400',
        fromBg: 'rgba(219, 39, 119, 0.1)',
        toBg: 'rgba(236, 72, 153, 0.25)',
        fill1: '#ec4899',
        fill2: '#f472b6',
        windAccent: '#ec4899',
        windTrack: 'rgba(236, 72, 153, 0.12)',
      },
      purple: {
        text: 'text-purple-500',
        textDark: 'dark:text-purple-400',
        fromBg: 'rgba(124, 58, 237, 0.1)',
        toBg: 'rgba(139, 92, 246, 0.25)',
        fill1: '#8b5cf6',
        fill2: '#a78bfa',
        windAccent: '#8b5cf6',
        windTrack: 'rgba(139, 92, 246, 0.12)',
      },
      teal: {
        text: 'text-teal-500',
        textDark: 'dark:text-teal-400',
        fromBg: 'rgba(13, 148, 136, 0.1)',
        toBg: 'rgba(20, 184, 166, 0.25)',
        fill1: '#14b8a6',
        fill2: '#2dd4bf',
        windAccent: '#14b8a6',
        windTrack: 'rgba(20, 184, 166, 0.12)',
      },
      amber: {
        text: 'text-amber-500',
        textDark: 'dark:text-amber-400',
        fromBg: 'rgba(217, 119, 6, 0.1)',
        toBg: 'rgba(245, 158, 11, 0.25)',
        fill1: '#f59e0b',
        fill2: '#fbbf24',
        windAccent: '#f59e0b',
        windTrack: 'rgba(245, 158, 11, 0.12)',
      },
      monochrome: {
        text: 'text-neutral-900',
        textDark: 'dark:text-neutral-100',
        fromBg: 'rgba(38, 38, 38, 0.1)',
        toBg: 'rgba(23, 23, 23, 0.25)',
        fill1: '#171717',
        fill2: '#404040',
        windAccent: '#171717',
        windTrack: 'rgba(23, 23, 23, 0.12)',
      },
      midnight: {
        text: 'text-white',
        textDark: 'dark:text-white',
        fromBg: 'rgba(255, 255, 255, 0.08)',
        toBg: 'rgba(255, 255, 255, 0.22)',
        fill1: '#ffffff',
        fill2: '#a3a3a3',
        windAccent: '#ffffff',
        windTrack: 'rgba(255, 255, 255, 0.1)',
      },
    };

    return themes[colorTheme] || themes.green;
  };

  const activeTheme = getThemeColors(settings.colorTheme);

  const aqi = weather.airQuality;
  const [selectedPollutantIndex, setSelectedPollutantIndex] = useState<number | null>(null);
  const [selectedPollenIndex, setSelectedPollenIndex] = useState<number | null>(null);
  
  const [showAqiInfo, setShowAqiInfo] = useState(false);
  const [showUvInfo, setShowUvInfo] = useState(false);
  const [showPollenInfo, setShowPollenInfo] = useState(false);

  const toggleAqiInfo = () => {
    setShowAqiInfo(!showAqiInfo);
    setShowUvInfo(false);
    setShowPollenInfo(false);
  };

  const toggleUvInfo = () => {
    setShowUvInfo(!showUvInfo);
    setShowAqiInfo(false);
    setShowPollenInfo(false);
  };

  const togglePollenInfo = () => {
    setShowPollenInfo(!showPollenInfo);
    setShowAqiInfo(false);
    setShowUvInfo(false);
  };
  
  const currentIdx = getCurrentHourIndex(weather.timezone, weather.hourly?.time || []);
  const rainChance = weather.hourly.precipitationProbability?.[currentIdx] ?? 0;

  const details = [
    {
      label: 'Humidity',
      value: Math.round(weather.current.relativeHumidity || 0),
      unit: '%',
      icon: 'Droplets'
    },
    {
      label: 'Visibility',
      value: formatVisibility(weather.current.visibility || 0, settings.unitVisibility),
      unit: settings.unitVisibility === 'miles' ? 'mi' : 'km',
      icon: 'Eye'
    },
    {
      label: 'Precipitation',
      value: formatPrecipitation(weather?.daily?.precipitationSum?.[0] || 0, settings.unitPrecipitation as any),
      unit: settings.unitPrecipitation === 'inches' ? 'in' : 'mm',
      icon: 'CloudRain',
      desc: `Chance: ${rainChance}%`,
      isPrecip: true
    },
    {
      label: 'Wind Speed',
      value: formatWind(weather.current.windSpeed || 0, settings.unitWind),
      unit: settings.unitWind,
      icon: 'Wind',
      desc: getWindDir(weather.current.windDirection || 0),
      isWind: true
    }
  ];

  // AQI Live Label calculations
  let liveLabelText = "LIVE";
  let liveLabelColor = "#4ade80";
  if (aqi && aqi.lastUpdated && !aqi.isUnavailable) {
    try {
      const cleanTime = aqi.lastUpdated.includes(' ') && !aqi.lastUpdated.includes('T') ? aqi.lastUpdated.replace(' ', 'T') : aqi.lastUpdated;
      const updated = new Date(cleanTime);
      const ageHours = (Date.now() - updated.getTime()) / (1000 * 60 * 60);
      if (ageHours > 1) {
        liveLabelText = `${Math.round(ageHours)}H AGO`;
        if (ageHours > 6) {
          liveLabelColor = "#f59e0b";
        } else {
          liveLabelColor = "#94a3b8";
        }
      } else {
        liveLabelText = "LIVE";
      }
    } catch {
      liveLabelText = "LIVE";
    }
  }

   // UV Index Calculations (past 6 hours, current, and upcoming 6 hours - 13 points total)
  const currentUv = Math.round(weather.current.uvIndex ?? 0);
  const uvHourly = weather.hourly.uvIndex || [];
  const uvTrendData: { time: string; uv: number }[] = [];
  
  for (let offset = -6; offset <= 6; offset++) {
    const targetIdx = currentIdx + offset;
    let indexToUse = targetIdx;
    if (indexToUse < 0) indexToUse = 0;
    if (indexToUse >= weather.hourly.time.length) {
      indexToUse = weather.hourly.time.length - 1;
    }
    uvTrendData.push({
      time: weather.hourly.time[indexToUse] || new Date().toISOString(),
      uv: offset === 0 ? (weather.current.uvIndex ?? uvHourly[indexToUse] ?? 0) : (uvHourly[indexToUse] ?? 0)
    });
  }

  const uvDesc = getUVDesc(currentUv);
  const uvColor = getUVColor(currentUv);

  // Dynamic UV recommendations
  let umbrellaRec = "Not Needed";
  let glassesRec = "Optional";
  let sunscreenRec = "Not Needed";

  if (currentUv >= 8) {
    umbrellaRec = "Essential";
    glassesRec = "Essential";
    sunscreenRec = "SPF 50+";
  } else if (currentUv >= 6) {
    umbrellaRec = "Recommended";
    glassesRec = "Required";
    sunscreenRec = "SPF 30+";
  } else if (currentUv >= 3) {
    umbrellaRec = "Optional";
    glassesRec = "Recommended";
    sunscreenRec = "SPF 15+";
  } else {
    umbrellaRec = "Not Needed";
    glassesRec = "Optional";
    sunscreenRec = "Not Needed";
  }

  // Dynamic UV Peak times
  const dayStartIdx = Math.floor(currentIdx / 24) * 24;
  const dayEndIdx = Math.min(dayStartIdx + 24, weather.hourly.time.length);
  const todayUvs = (weather.hourly.uvIndex || []).slice(dayStartIdx, dayEndIdx);

  let peakStartHour = -1;
  let peakEndHour = -1;
  let maxTodayUv = 0;

  for (let i = 0; i < todayUvs.length; i++) {
    const uvVal = todayUvs[i] ?? 0;
    if (uvVal > maxTodayUv) {
      maxTodayUv = uvVal;
    }
  }

  const uvThreshold = Math.max(3, Math.round(maxTodayUv * 0.5));
  for (let i = 0; i < todayUvs.length; i++) {
    const uvVal = todayUvs[i] ?? 0;
    if (uvVal >= uvThreshold) {
      if (peakStartHour === -1) {
        peakStartHour = i;
      }
      peakEndHour = i;
    }
  }

  const formatUvHourString = (h: number): string => {
    if (h === 0) return "12 AM";
    if (h === 12) return "12 PM";
    if (h < 12) return `${h} AM`;
    return `${h - 12} PM`;
  };

  let peakUvTimesText = "No Peak UV Today";
  if (peakStartHour !== -1 && peakEndHour !== -1 && maxTodayUv >= 3) {
    peakUvTimesText = `Peak: ${formatUvHourString(peakStartHour)} – ${formatUvHourString(peakEndHour)}`;
  } else {
    peakUvTimesText = "Minimal UV Protection Needed";
  }

  const tiles = settings.enabledTiles || {
    aqi: true,
    uv: true,
    humidity: true,
    visibility: true,
    precipitation: true,
    wind: true,
    pollen: true
  };

  const showPollen = tiles.pollen !== false;

  const activeDetails = details.filter(detail => {
    if (detail.label === 'Humidity' && !tiles.humidity) return false;
    if (detail.label === 'Visibility' && !tiles.visibility) return false;
    if (detail.label === 'Precipitation' && !tiles.precipitation) return false;
    if (detail.label === 'Wind Speed' && !tiles.wind) return false;
    return true;
  });

  const getAqiPercent = (val: number) => {
    if (val <= 0) return 0;
    if (val <= 50) return (val / 50) * 16.67;
    if (val <= 100) return 16.67 + ((val - 50) / 50) * 16.67;
    if (val <= 150) return 33.33 + ((val - 100) / 50) * 16.67;
    if (val <= 200) return 50.0 + ((val - 150) / 50) * 16.67;
    if (val <= 300) return 66.67 + ((val - 200) / 100) * 16.67;
    if (val <= 500) return 83.33 + ((val - 300) / 200) * 16.67;
    return 100;
  };

  const defaultWidgetsOrder = [
    'rainGraph',
    'forecast',
    'aqi',
    'uv',
    'sunMoon',
    'humidityVisibility',
    'precipitationWind',
    'pollen'
  ];
  const order = settings.tileOrder || defaultWidgetsOrder;
  const detailsKeys = order.filter(key => 
    ['aqi', 'uv', 'pollen', 'humidityVisibility', 'precipitationWind'].includes(key) &&
    (!focusKey || focusKey === key)
  );

  // 1. Humidity Calculations
  const humidity = Math.round(weather.current.relativeHumidity || 0);
  let humRating = 'Comfortable';
  let humDesc = 'Comfortable humidity levels.';
  if (humidity < 35) {
    humRating = 'Dry';
    humDesc = 'Moisture levels are low. Air is dry.';
  } else if (humidity <= 65) {
    humRating = 'Moderate';
    humDesc = 'Comfortable humidity levels.';
  } else if (humidity <= 80) {
    humRating = 'High';
    humDesc = 'Humid atmosphere. Air feels slightly heavy.';
  } else {
    humRating = 'Very High';
    humDesc = 'Very sticky. Damp air; ventilation helpful.';
  }
  const dewPointC = weather.current.temperature - ((100 - humidity) / 5);
  const dewPointFormatted = formatTemp(dewPointC, settings.unitTemp);
  const humAdvice = `The dew point is ${dewPointFormatted}° right now.`;

  // 2. Visibility Calculations
  const visVal = formatVisibility(weather.current.visibility || 0, settings.unitVisibility);
  const visUnit = settings.unitVisibility === 'miles' ? 'mi' : 'km';
  const numericVis = convertVisibility(weather.current.visibility || 0, settings.unitVisibility);
  const visRating = numericVis >= 10 ? 'Excellent' : numericVis >= 5 ? 'Good' : numericVis >= 2 ? 'Moderate' : 'Low';

  // 3. Precipitation Calculations (Next 5 Hours)
  const precipTrend: { time: string; prob: number; precip: number; isNow?: boolean; formattedTime: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const idx = currentIdx + i;
    if (idx >= 0 && idx < weather.hourly.time.length) {
      const isNow = i === 0;
      const tStr = weather.hourly.time[idx];
      let formatted = '';
      try {
        formatted = formatGlobalTime(tStr, { hourOnly: true, timeFormat: settings.timeFormat || '12h' });
      } catch {
        formatted = `${new Date(tStr).getHours()}:00`;
      }
      precipTrend.push({
        time: tStr,
        prob: weather.hourly.precipitationProbability?.[idx] ?? 0,
        precip: weather.hourly.precipitation?.[idx] ?? 0,
        isNow,
        formattedTime: formatted
      });
    }
  }

  let peakIdx = 0;
  let maxProb = -1;
  precipTrend.forEach((p, idx) => {
    if (p.prob > maxProb) {
      maxProb = p.prob;
      peakIdx = idx;
    }
  });
  if (maxProb <= 0) {
    const nowIdx = precipTrend.findIndex(p => p.isNow);
    peakIdx = nowIdx !== -1 ? nowIdx : 0;
  }
  const peakItem = precipTrend[peakIdx];

  // 4. Wind Speed Calculations (Enlarged Gauge)
  const windVal = formatWind(weather.current.windSpeed || 0, settings.unitWind);
  const unitWind = settings.unitWind;
  const maxWindLimit = unitWind === 'm/s' ? 15 : unitWind === 'mph' ? 35 : 50;

  const startAng = -115;
  const endAng = 115;
  const radius = 58;
  const cxVal = 80;
  const cyVal = 64;

  const windPrc = Math.min(1.0, Math.max(0, windVal / maxWindLimit));
  const targetAngle = startAng + windPrc * (endAng - startAng);
  const tip = polarToCartesian(cxVal, cyVal, radius, targetAngle);

  const bgPath = getArcPath(cxVal, cyVal, radius, startAng, endAng);
  const activePath = getArcPath(cxVal, cyVal, radius, startAng, targetAngle);

  const startPt = polarToCartesian(cxVal, cyVal, radius, startAng);
  const endPt = polarToCartesian(cxVal, cyVal, radius, endAng);

  const getDirectionPhrase = (deg: number) => {
    const directions = [
      'from the north',
      'from the northeast',
      'from the east',
      'from the southeast',
      'from the south',
      'from the southwest',
      'from the west',
      'from the northwest'
    ];
    return directions[Math.round(deg / 45) % 8];
  };

  const getCardinalDirection = (deg: number) => {
    const directions = [
      'North',
      'North-East',
      'East',
      'South-East',
      'South',
      'South-West',
      'West',
      'North-West'
    ];
    return directions[Math.round(deg / 45) % 8];
  };

  const getWindSeverityRating = (ms: number) => {
    if (ms < 3.4) return 'Low';
    if (ms < 8.0) return 'Moderate';
    if (ms < 13.9) return 'High';
    return 'Very High';
  };
  const windSeverityRating = getWindSeverityRating(weather.current.windSpeed || 0);

  return (
    <div className="flex flex-col gap-[1rem] px-0 -mx-[1rem] sm:-mx-[1.3125rem]">
      {detailsKeys.map(key => {
        if (key === 'aqi') {
          if (!tiles.aqi) return null;
          return (
        <div key={key} id="aqi-glass-card" className="w-[calc(100%-2rem)] max-w-[21.875rem] mx-auto bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[2rem] py-[1.25rem] px-[1rem] sm:px-[1.375rem] flex flex-col gap-[1rem] overflow-hidden shadow-2xl relative group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 select-none">
              <Leaf className="w-5 h-5 text-app-text/75" strokeWidth={1.4} />
              <span className="text-[15px] font-normal tracking-wide text-app-text/75 uppercase">
                <Translate text="AQI" lang={settings.language || 'en'} />
              </span>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                toggleAqiInfo();
              }}
              className="p-1 -m-1 hover:bg-white/5 rounded-full transition relative z-50"
              aria-label="More AQI info"
            >
              <Info className="w-4.5 h-4.5 text-app-text/60" strokeWidth={1.5} />
            </button>
          </div>

          {showAqiInfo && (
            <>
              <div 
                className="fixed inset-0 z-35 bg-transparent" 
                onClick={() => setShowAqiInfo(false)} 
              />
              <div 
                style={{ backgroundColor: 'var(--popup-bg)' }}
                className="absolute top-[48px] left-[12px] right-[12px] z-40 border border-app-border rounded-[28px] rounded-tr-[10px] p-4 shadow-2xl backdrop-blur-xl animate-fade-in transition-all duration-300"
                onClick={(e) => e.stopPropagation()}
              >
                <div 
                  style={{ backgroundColor: 'var(--popup-bg)' }}
                  className="absolute -top-[6px] right-[6px] w-3 h-3 border-l border-t border-app-border rotate-45 rounded-tl-[4px]" 
                />
                <div className="flex flex-col gap-2.5">
                  <p className="text-[13px] leading-relaxed text-app-text font-normal font-sans text-left">
                    <Translate 
                      text="AQI is the Air Quality Index. It measures how clean or polluted the air is and what associated health effects might be a concern. A lower value is healthier." 
                      lang={settings.language || 'en'} 
                    />
                  </p>
                </div>
              </div>
            </>
          )}

          {!aqi ? (
            <div className="py-12 flex flex-col items-center gap-4 text-center">
               <div className="w-12 h-12 rounded-full border-2 border-dashed border-app-border animate-spin-slow flex items-center justify-center">
                  <WeatherIcon name="Info" className="w-5 h-5 text-app-text-dim/40" />
               </div>
               <div className="flex flex-col gap-1">
                  <span className="text-app-text font-bold text-base tracking-tight">
                    <Translate text="AQI Data Unavailable" lang={settings.language || 'en'} />
                  </span>
                  <p className="text-app-text-dim text-xs max-w-[200px] leading-relaxed">
                    <Translate text="We couldn't reach the air quality station for this location right now." lang={settings.language || 'en'} />
                  </p>
               </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {/* Row with AQI Value and status description next to it aligned beautifully at the base */}
              <div className="flex items-end gap-3 leading-none">
                <span className="text-[48px] font-[200] tracking-tighter text-app-text leading-[0.95] shrink-0 select-none">
                  {aqi.isUnavailable ? "--" : aqi.usAqi}
                </span>
                {aqi.isUnavailable ? (
                  <span className="text-[19px] font-[300] tracking-tight leading-[1.1] pb-[3px]">
                    <Translate text="Limited Data" lang={settings.language || 'en'} />
                  </span>
                ) : aqi.description === "Unhealthy for Sensitive Groups" ? (
                  <span className="flex flex-col leading-[1.15] pb-[1px]" style={{ color: aqi.color }}>
                    <span className="text-[16px] font-[400] tracking-normal">
                      <Translate text="Unhealthy for" lang={settings.language || 'en'} />
                    </span>
                    <span className="text-[17px] font-[400] tracking-normal">
                      <Translate text="Sensitive Groups" lang={settings.language || 'en'} />
                    </span>
                  </span>
                ) : (
                  <span className="text-[19px] font-[300] tracking-tight leading-[1.1] pb-[3px]" style={{ color: aqi.color }}>
                    <Translate text={aqi.description} lang={settings.language || 'en'} />
                  </span>
                )}
              </div>

              {/* Exact Premium Horizontal Slider Graph exactly matching prompt */}
              <div className="flex flex-col gap-1.5 mt-6">
                <div className="w-full h-[6px] rounded-full relative overflow-visible" style={{
                  background: 'linear-gradient(to right, #32d74b 0%, #32d74b 16.67%, #FED60A 16.67%, #FED60A 33.33%, #ff9f0a 33.33%, #ff9f0a 50%, #ff453a 50%, #ff453a 66.67%, #bf5af2 66.67%, #bf5af2 83.33%, #8e3020 83.33%, #8e3020 100%)'
                }}>
                  {/* Indicator Thumb / Knob */}
                  {!aqi.isUnavailable && (
                    <motion.div 
                       className="absolute top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full border-[2.5px] border-white shadow-[0_1.5px_4px_rgba(0,0,0,0.2)] z-10"
                       style={{ 
                         backgroundColor: aqi.color,
                        }}
                       initial={{ left: '0%' }}
                       animate={{ 
                         left: `${getAqiPercent(aqi.usAqi)}%`,
                         x: '-50%'
                       }}
                       transition={{ duration: 1.8, ease: [0.34, 1.56, 0.64, 1] }}
                    />
                  )}
                </div>

                {/* Sub-ticks labels (0 to 500) under the track slider */}
                <div className="relative w-full h-[14px] select-none">
                  {[
                    { val: "0", pct: 0 },
                    { val: "50", pct: 16.67 },
                    { val: "100", pct: 33.33 },
                    { val: "150", pct: 50 },
                    { val: "200", pct: 66.67 },
                    { val: "300", pct: 83.33 },
                    { val: "500", pct: 100 }
                  ].map((tick, i, arr) => {
                    let translateClass = "-translate-x-1/2";
                    if (i === 0) translateClass = "translate-x-0";
                    if (i === arr.length - 1) translateClass = "-translate-x-full";
                    return (
                      <span 
                        key={tick.val} 
                        className={`absolute leading-none text-app-text/75 font-semibold text-[11px] ${translateClass}`}
                        style={{ left: `${tick.pct}%` }}
                      >
                        {tick.val}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Recommendation text display beneath value. Increased spacing (mt-1.5) */}
              <div className="text-[14.5px] text-app-text-dim/80 font-light leading-relaxed mt-1.5">
                <Translate text={aqi.recommendation} lang={settings.language || 'en'} />
              </div>

              {/* Fine subtle horizontal divider line */}
              <div className="border-t border-app-text/20 my-0.5" />

              {/* Bottom footer metrics: Left x/500, Right AQI (US) */}
              <div className="flex items-center justify-between text-[13px] text-app-text/65 font-light">
                <span>{aqi.isUnavailable ? "--" : `${aqi.usAqi} / 500`}</span>
                <span>
                  <Translate text="AQI (US)" lang={settings.language || 'en'} />
                </span>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (key === 'uv') {
      if (!tiles.uv) return null;
      return (
        <div key={key} className="w-[calc(100%-2rem)] max-w-[21.875rem] mx-auto bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[2rem] py-[1.25rem] px-[1rem] sm:px-[1.375rem] flex flex-col gap-[1rem] overflow-hidden shadow-2xl relative group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 select-none font-sans">
              <Sun className="w-5 h-5 text-app-text/75" strokeWidth={1.4} />
              <span className="text-[15px] font-normal tracking-wide text-app-text/75">
                <Translate text="UV Index" lang={settings.language || 'en'} />
              </span>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                toggleUvInfo();
              }}
              className="p-1 -m-1 hover:bg-white/5 rounded-full transition relative z-50"
              aria-label="More UV info"
            >
              <Info className="w-4.5 h-4.5 text-app-text/60" strokeWidth={1.5} />
            </button>
          </div>

          {showUvInfo && (
            <>
              <div 
                className="fixed inset-0 z-35 bg-transparent" 
                onClick={() => setShowUvInfo(false)} 
              />
              <div 
                style={{ backgroundColor: 'var(--popup-bg)' }}
                className="absolute top-[48px] left-[12px] right-[12px] z-40 border border-app-border rounded-[28px] rounded-tr-[10px] p-4 shadow-2xl backdrop-blur-xl animate-fade-in transition-all duration-300"
                onClick={(e) => e.stopPropagation()}
              >
                <div 
                  style={{ backgroundColor: 'var(--popup-bg)' }}
                  className="absolute -top-[6px] right-[6px] w-3 h-3 border-l border-t border-app-border rotate-45 rounded-tl-[4px]" 
                />
                <div className="flex flex-col gap-2.5">
                  <p className="text-[13px] leading-relaxed text-app-text font-normal font-sans text-left">
                    <Translate 
                      text="UV Index is the Ultraviolet Index. It measures the strength of sunburn-producing ultraviolet radiation. Higher values reflect higher risk of skin damage." 
                      lang={settings.language || 'en'} 
                    />
                  </p>
                </div>
              </div>
            </>
          )}

          <div className="flex items-baseline gap-3.5 leading-none">
            <span className="text-[56px] font-[200] tracking-tighter text-app-text leading-none shrink-0 select-none">
              {currentUv}
            </span>
            <span 
              className="text-[22px] font-[300] tracking-tight leading-none"
              style={{ color: uvColor }}
            >
              <Translate text={uvDesc} lang={settings.language || 'en'} />
            </span>
          </div>

          {/* Dynamic Advice Statement */}
          <div className="text-[14.5px] text-app-text-dim/80 font-light leading-relaxed">
            <Translate text={getUVRecommendation(currentUv)} lang={settings.language || 'en'} />
          </div>

          {/* Fine horizontal divider line */}
          <div className="border-t border-app-text/20 my-0.5" />

          {/* 3-Column Protective Recommendations Grid exact to mockup */}
          <div className="grid grid-cols-3 select-none text-center divide-x divide-app-text/20">
            {/* 1. Umbrella */}
            <div className="flex flex-col items-center justify-between py-1.5 px-0.5 h-[88px] min-w-0">
              <div className="flex-1 flex items-center justify-center">
                <Umbrella className="w-6.5 h-6.5 transition-all duration-300 group-hover:scale-110" strokeWidth={1.4} style={{ color: uvColor }} />
              </div>
              <div className="flex flex-col items-center justify-center w-full mt-1.5">
                <span className="text-[12px] font-medium text-app-text tracking-tight leading-none block w-full truncate">
                  <Translate text="Umbrella" lang={settings.language || 'en'} />
                </span>
                <span className="text-[10px] font-normal text-app-text-dim/60 leading-none block w-full pt-1.5">
                  <Translate text={umbrellaRec} lang={settings.language || 'en'} />
                </span>
              </div>
            </div>

            {/* 2. Sunglasses */}
            <div className="flex flex-col items-center justify-between py-1.5 px-0.5 h-[88px] min-w-0">
              <div className="flex-1 flex items-center justify-center">
                <Glasses className="w-6.5 h-6.5 transition-all duration-300 group-hover:scale-110" strokeWidth={1.4} style={{ color: uvColor }} />
              </div>
              <div className="flex flex-col items-center justify-center w-full mt-1.5">
                <span className="text-[12px] font-medium text-app-text tracking-tight leading-none block w-full truncate">
                  <Translate text="Glasses" lang={settings.language || 'en'} />
                </span>
                <span className="text-[10px] font-normal text-app-text-dim/60 leading-none block w-full pt-1.5">
                  <Translate text={glassesRec} lang={settings.language || 'en'} />
                </span>
              </div>
            </div>

            {/* 3. Sunscreen */}
            <div className="flex flex-col items-center justify-between py-1.5 px-0.5 h-[88px] min-w-0">
              <div className="flex-1 flex items-center justify-center">
                <Droplet className="w-6.5 h-6.5 transition-all duration-300 group-hover:scale-110" strokeWidth={1.4} style={{ color: uvColor }} />
              </div>
              <div className="flex flex-col items-center justify-center w-full mt-1.5">
                <span className="text-[12px] font-medium text-app-text tracking-tight leading-none block w-full truncate">
                  <Translate text="Sunscreen" lang={settings.language || 'en'} />
                </span>
                <span className="text-[10px] font-normal text-app-text-dim/60 leading-none block w-full pt-1.5">
                  <Translate text={sunscreenRec} lang={settings.language || 'en'} />
                </span>
              </div>
            </div>
          </div>

          {/* Fine horizontal divider line */}
          <div className="border-t border-app-text/20 my-0.5" />

          {/* Peak UV times */}
          <div className="text-[13px] text-app-text/65 font-light">
            <Translate text={peakUvTimesText} lang={settings.language || 'en'} />
          </div>
        </div>
      );
    }

    if (key === 'pollen') {
      if (!showPollen) return null;
      const pollen = estimatePollen(weather, location);

      // Dynamic Pollen Peak Text
      let peakText = 'Peak: Apr – Jul';
      if (pollen.categories.Tree.isActiveSeason) {
        peakText = `Peak: ${pollen.categories.Tree.season}`;
      } else if (pollen.categories.Grass.isActiveSeason) {
        peakText = `Peak: ${pollen.categories.Grass.season}`;
      } else if (pollen.categories.Weed.isActiveSeason) {
        peakText = `Peak: ${pollen.categories.Weed.season}`;
      } else {
        const cats = [pollen.categories.Tree, pollen.categories.Grass, pollen.categories.Weed];
        const dominant = cats.reduce((prev, curr) => (curr.value > prev.value) ? curr : prev, cats[0]);
        peakText = `Peak: ${dominant.season}`;
      }

      return (
        <div key={key} className="w-[calc(100%-2rem)] max-w-[21.875rem] mx-auto bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[2rem] py-[1.25rem] px-[1rem] sm:px-[1.375rem] flex flex-col gap-[1rem] overflow-hidden shadow-2xl relative group select-none animate-fade-in animate-duration-500">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 select-none">
              <Leaf className="w-5 h-5 text-app-text/75" strokeWidth={1.4} />
              <span className="text-[15px] font-normal tracking-wide text-app-text/75">
                <Translate text="Pollen" lang={settings.language || 'en'} />
              </span>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                togglePollenInfo();
              }}
              className="p-1 -m-1 hover:bg-white/5 rounded-full transition relative z-50"
              aria-label="More Pollen info"
            >
              <Info className="w-4.5 h-4.5 text-app-text/60" strokeWidth={1.5} />
            </button>
          </div>

          {showPollenInfo && (
            <>
              <div 
                className="fixed inset-0 z-35 bg-transparent" 
                onClick={() => setShowPollenInfo(false)} 
              />
              <div 
                style={{ backgroundColor: 'var(--popup-bg)' }}
                className="absolute top-[48px] left-[12px] right-[12px] z-40 border border-app-border rounded-[28px] rounded-tr-[10px] p-4 shadow-2xl backdrop-blur-xl animate-fade-in transition-all duration-300"
                onClick={(e) => e.stopPropagation()}
              >
                <div 
                  style={{ backgroundColor: 'var(--popup-bg)' }}
                  className="absolute -top-[6px] right-[6px] w-3 h-3 border-l border-t border-app-border rotate-45 rounded-tl-[4px]" 
                />
                <div className="flex flex-col gap-2.5">
                  <p className="text-[13px] leading-relaxed text-app-text font-normal font-sans text-left">
                    <Translate 
                      text="Pollen indicates the density of airborne allergens from trees, grass, and weeds. High levels can trigger allergic reactions and respiratory symptoms." 
                      lang={settings.language || 'en'} 
                    />
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Overall Rating Text */}
          <div className="flex flex-col select-none">
            <span 
              className="text-[26px] font-[300] tracking-tight leading-none"
              style={{ color: pollen.overallColor }}
            >
              <Translate text={pollen.overallLevel} lang={settings.language || 'en'} />
            </span>
            <p className="text-[14.5px] text-app-text-dim/80 mt-1.5 leading-relaxed font-light">
              <Translate text={getPollenRecommendation(pollen.overallLevel)} lang={settings.language || 'en'} />
            </p>
          </div>

          {/* Fine horizontal divider line */}
          <div className="border-t border-app-text/20 my-0.5" />

          {/* 3-Column Protective Recommendations Grid exact to mockup */}
          <div className="grid grid-cols-3 select-none text-center divide-x divide-app-text/20 mt-1">
            {/* 1. Trees */}
            {(() => {
              const cat = pollen.categories.Tree;
              return (
                <div className="flex flex-col items-center justify-center p-1 px-0.5 min-w-0">
                  <div className="h-7 flex items-center justify-center">
                    <TreeDeciduous className="w-6.5 h-6.5 transition-all duration-300 group-hover:scale-110" strokeWidth={1.4} style={{ color: cat.color }} />
                  </div>
                  <span className="text-[12px] font-medium text-app-text tracking-tight leading-none mt-2.5 truncate w-full block">
                    <Translate text="Trees" lang={settings.language || 'en'} />
                  </span>
                  <span className="text-[10px] font-normal text-app-text-dim/60 leading-none mt-1 truncate w-full block">
                    <Translate text={cat.level} lang={settings.language || 'en'} />
                  </span>
                  <div className="w-1.5 h-1.5 rounded-full mt-2.5" style={{ backgroundColor: cat.color }} />
                </div>
              );
            })()}

            {/* 2. Grass */}
            {(() => {
              const cat = pollen.categories.Grass;
              return (
                <div className="flex flex-col items-center justify-center p-1 px-0.5 min-w-0">
                  <div className="h-7 flex items-center justify-center">
                    <Sprout className="w-6.5 h-6.5 transition-all duration-300 group-hover:scale-110" strokeWidth={1.4} style={{ color: cat.color }} />
                  </div>
                  <span className="text-[12px] font-medium text-app-text tracking-tight leading-none mt-2.5 truncate w-full block">
                    <Translate text="Grass" lang={settings.language || 'en'} />
                  </span>
                  <span className="text-[10px] font-normal text-app-text-dim/60 leading-none mt-1 truncate w-full block">
                    <Translate text={cat.level} lang={settings.language || 'en'} />
                  </span>
                  <div className="w-1.5 h-1.5 rounded-full mt-2.5" style={{ backgroundColor: cat.color }} />
                </div>
              );
            })()}

            {/* 3. Weeds */}
            {(() => {
              const cat = pollen.categories.Weed;
              return (
                <div className="flex flex-col items-center justify-center p-1 px-0.5 min-w-0">
                  <div className="h-7 flex items-center justify-center">
                    <Flower className="w-6.5 h-6.5 transition-all duration-300 group-hover:scale-110" strokeWidth={1.4} style={{ color: cat.color }} />
                  </div>
                  <span className="text-[12px] font-medium text-app-text tracking-tight leading-none mt-2.5 truncate w-full block">
                    <Translate text="Weeds" lang={settings.language || 'en'} />
                  </span>
                  <span className="text-[10px] font-normal text-app-text-dim/60 leading-none mt-1 truncate w-full block">
                    <Translate text={cat.level} lang={settings.language || 'en'} />
                  </span>
                  <div className="w-1.5 h-1.5 rounded-full mt-2.5" style={{ backgroundColor: cat.color }} />
                </div>
              );
            })()}
          </div>

          {/* Fine horizontal divider line */}
          <div className="border-t border-app-text/20 my-0.5" />

          {/* Dynamic Peak Active Season */}
          <div className="text-[13px] text-app-text/65 font-light">
            <Translate text={peakText} lang={settings.language || 'en'} />
          </div>
        </div>
      );
    }

    if (key === 'humidityVisibility') {
      if (tiles.humidity === false && tiles.visibility === false) return null;
      return (
        <div key={key} className="grid grid-cols-[repeat(auto-fit,minmax(8.125rem,1fr))] gap-[0.625rem] w-[calc(100%-2rem)] max-w-[21.875rem] mx-auto">
          {/* A. Humidity Card */}
          {tiles.humidity !== false && (
            <div className="bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[2rem] py-[1.125rem] px-[1rem] sm:p-[1.25rem] flex flex-col justify-between h-[13.625rem] select-none relative overflow-hidden group shadow-xl">
              {/* Header with circular monochrome icon */}
              <div className="flex items-center justify-between z-10 w-full">
                <div className="flex items-center gap-2 min-w-0">
                  <Droplet className="w-5 h-5 text-app-text/75 shrink-0" strokeWidth={1.4} />
                  <span className="text-[14px] font-sans font-medium text-app-text/75 leading-none truncate">
                    <Translate text="Humidity" lang={settings.language || 'en'} />
                  </span>
                </div>
              </div>

              {/* Value block - aligned matching other cards */}
              <div className="flex flex-col gap-0.5 z-10 mt-5">
                <div className="flex items-baseline">
                  <span className="text-[42px] font-[200] text-app-text leading-none block">
                    {humidity}
                  </span>
                  <span className="text-xl font-[200] text-app-text-dim/75 ml-0.5 inline-block translate-y-[-1px]">%</span>
                </div>
                <span className="text-[13px] font-semibold text-emerald-500 dark:text-emerald-400 tracking-tight leading-none mt-1">
                  <Translate text={humRating} lang={settings.language || 'en'} />
                </span>
              </div>

              {/* Static moisture water flow level graphic proportional to percentage */}
              <div 
                className="absolute inset-x-0 bottom-0 pointer-events-none overflow-hidden rounded-b-[32px] transition-all duration-1000 ease-out"
                style={{ height: `${humidity}%` }}
              >
                {/* The water body */}
                <div 
                  className="absolute inset-x-0 bottom-0 top-[12px]" 
                  style={{ background: `linear-gradient(to top, rgba(var(--theme-accent-rgb), 0.08), rgba(var(--theme-accent-rgb), 0.22))` }}
                />
                {/* The wave top */}
                <svg className="absolute top-0 w-[200%] left-[-50%] h-[14px]" viewBox="0 0 240 14" preserveAspectRatio="none">
                  <path 
                    d="M0,7 C30,11 60,3 90,7 C120,11 150,3 180,7 C210,11 225,5 240,7 L240,14 L0,14 Z" 
                    fill="var(--accent-color)"
                    className="opacity-20 animate-wave1"
                  />
                  <path 
                    d="M0,9 C45,5 90,12 135,8 C180,4 210,10 240,8 L240,14 L0,14 Z" 
                    fill="var(--accent-color)"
                    className="opacity-30 animate-wave2"
                  />
                </svg>
              </div>

              {/* Footer Dew Point advice */}
              <div className="flex items-center gap-1.5 z-10 w-full mt-auto pb-1 pt-1 shrink-0">
                <span className="text-[11px] text-app-text-dim leading-tight text-ellipsis line-clamp-2">
                  <Translate text={humAdvice} lang={settings.language || 'en'} />
                </span>
              </div>
            </div>
          )}

          {/* B. Visibility Card (Perfect iOS alignment redesign matching mockup image) */}
          {tiles.visibility !== false && (
            <div className="bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[2rem] py-[1.125rem] px-[1rem] sm:p-[1.25rem] flex flex-col justify-between h-[13.625rem] select-none relative overflow-hidden group shadow-xl">
              {/* Header row with circular background eye icon */}
              <div className="flex items-center justify-between z-10 w-full">
                <div className="flex items-center gap-2 min-w-0">
                  <Eye className="w-5 h-5 text-app-text/75 shrink-0" strokeWidth={1.4} />
                  <span className="text-[14px] font-sans font-medium text-app-text/75 leading-none truncate">
                    <Translate text="Visibility" lang={settings.language || 'en'} />
                  </span>
                </div>
              </div>

              {/* Value block - aligned matching other cards */}
              <div className="flex flex-col gap-0.5 z-10 mt-5">
                <div className="flex items-baseline">
                  <span className="text-[42px] font-[200] text-app-text leading-none block">
                    {visVal}
                  </span>
                  <span className="text-xl font-[200] text-app-text-dim/75 ml-0.5">
                    <Translate text={visUnit} lang={settings.language || 'en'} />
                  </span>
                </div>
                <span className="text-[13px] font-semibold text-emerald-500 dark:text-emerald-400 tracking-tight leading-none mt-1">
                  <Translate text={visRating} lang={settings.language || 'en'} />
                </span>
              </div>

              {/* Continuous slider track with ticks matching mockup image */}
              <div className="w-full flex flex-col mt-auto pb-1">
                {/* Compact continuous track */}
                <div className="relative w-full h-[5px] bg-neutral-200 dark:bg-neutral-800 rounded-full">
                  <div 
                    className="absolute top-0 bottom-0 left-0 bg-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, (numericVis / 20) * 100)}%` }}
                  />
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[15px] h-[15px] bg-white dark:bg-neutral-100 rounded-full shadow-[0_1.5px_4px_rgba(0,0,0,0.25)] border-[1.5px] border-neutral-300 dark:border-neutral-600 transition-all duration-300"
                    style={{ left: `${Math.min(100, (numericVis / 20) * 100)}%` }}
                  />
                </div>
                
                {/* Tick marks and labels exact to image */}
                <div className="relative w-full h-[22px] mt-2">
                  {[
                    { val: '0', pct: 0 },
                    { val: '5', pct: 25 },
                    { val: '10', pct: 50 },
                    { val: '15', pct: 75 },
                    { val: '20', pct: 100 }
                  ].map((tick, idx) => {
                    return (
                      <div 
                        key={tick.val} 
                        className="absolute top-0 flex flex-col items-center"
                        style={{ 
                          left: `${tick.pct}%`,
                          transform: tick.pct === 0 ? 'translateX(0%)' : tick.pct === 100 ? 'translateX(-100%)' : 'translateX(-50%)'
                        }}
                      >
                        <div className="w-[1px] h-[4px] bg-app-text/15 mb-0.5" />
                        <span className="text-[10px] text-app-text-dim/60 font-medium leading-none">
                          {tick.val}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (key === 'precipitationWind') {
      if (tiles.precipitation === false && tiles.wind === false) return null;
      return (
        <div key={key} className="grid grid-cols-[repeat(auto-fit,minmax(8.125rem,1fr))] gap-[0.625rem] w-[calc(100%-2rem)] max-w-[21.875rem] mx-auto">
          {/* C. Precipitation Card (5-Hour, Rounded Rectangle Bars) */}
          {tiles.precipitation !== false && (() => {
              const hourlyPrecips = weather.hourly?.precipitation || [];
              const todayPrecips = hourlyPrecips.slice(0, 24);
              const avgPrecipVal = todayPrecips.length > 0 
                ? todayPrecips.reduce((sum: number, val: number) => sum + val, 0) / todayPrecips.length
                : 0;
              const avgPrecipFormatted = formatPrecipitation(avgPrecipVal, settings.unitPrecipitation as any);
              const displayPrecipUnit = settings.unitPrecipitation || 'mm';
              return (
                <div className="bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[2rem] py-[1.125rem] px-[1rem] sm:p-[1.25rem] flex flex-col justify-between h-[13.625rem] select-none relative overflow-hidden group shadow-xl">
                  {/* Header row with rain icon */}
                  <div className="flex items-center justify-between z-10 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <Umbrella className="w-5 h-5 text-app-text/75 shrink-0" strokeWidth={1.4} />
                      <span className="text-[14px] font-sans font-medium text-app-text/75 leading-none truncate">
                        <Translate text="Precipitation" lang={settings.language || 'en'} />
                      </span>
                    </div>
                  </div>

                  {/* Value block - aligned matching other cards */}
                  <div className="flex flex-col gap-0.5 z-10 mt-5">
                    <div className="flex items-baseline">
                      <span className="text-[42px] font-[200] text-app-text leading-none block">
                        {avgPrecipFormatted}
                      </span>
                      <span className="text-xl font-[200] text-app-text-dim/75 ml-0.5">
                        <Translate text={displayPrecipUnit} lang={settings.language || 'en'} />
                      </span>
                    </div>
                  </div>

                  {/* 5-column flexible hourly bar block */}
                  <div className="flex flex-col flex-1 justify-end mt-4">
                    <div className="flex items-end justify-between relative h-[56px] w-full pl-1.5 pr-4.5 pb-0.5 pt-6 gap-2.5">

                      {precipTrend.map((item, idx) => {
                        const pct = item.prob;
                        const barHeight = pct > 0 ? `${Math.max(6, pct)}%` : '0%';
                        return (
                          <div key={idx} className="flex flex-col items-center flex-1 h-full relative group">
                            {/* Value labels matching image design exactly, centered without % symbol. Hide if zero. */}
                            {pct > 0 && (
                              <div 
                                className="absolute flex flex-col items-center transition-all duration-300 pointer-events-none w-full"
                                style={{ bottom: `calc(${barHeight} + 4px)` }}
                              >
                                <span className="text-[10.5px] font-bold text-emerald-500 dark:text-emerald-400 leading-none font-sans">
                                  {pct}
                                </span>
                              </div>
                            )}
                            
                            <div className="w-[14px] md:w-[16px] h-full flex items-end justify-center pointer-events-auto cursor-pointer">
                              <div 
                                className={cn(
                                  "w-full rounded-[4px] transition-all duration-500 ease-out",
                                  pct > 0
                                    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" 
                                    : "bg-white/12 group-hover:bg-white/25"
                                )}
                                style={{ height: barHeight }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* bottom labels for 5 columns */}
                    <div className="flex justify-between text-[8px] text-app-text-dim/60 font-semibold uppercase tracking-[0.08em] pl-1.5 pr-4.5 mt-2 border-t border-app-text/15 pt-1.5 shrink-0">
                      {precipTrend.map((item, idx) => {
                        const showLabel = idx === 0 || idx === 2 || idx === 4;
                        return (
                          <span 
                            key={idx} 
                            className={cn(
                              "flex-1 text-center font-sans whitespace-nowrap overflow-visible",
                              !showLabel && "opacity-0 select-none pointer-events-none"
                            )}
                          >
                            {showLabel ? (item?.formattedTime || '') : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* D. Wind Speed Card (Enlarged and optimized with circular wind icon) */}
            {tiles.wind !== false && (
              <div className="bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[2rem] py-[1.125rem] px-[1rem] sm:p-[1.25rem] flex flex-col justify-between h-[13.625rem] select-none relative overflow-hidden group shadow-xl">
                {/* Header row with wind icon */}
                <div className="flex items-center justify-between z-10 w-full">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wind className="w-5 h-5 text-app-text/75 shrink-0" strokeWidth={1.4} />
                    <span className="text-[14px] font-sans font-medium text-app-text/75 leading-none truncate">
                      <Translate text="Wind Speed" lang={settings.language || 'en'} />
                    </span>
                  </div>
                </div>

                {/* SVG Gauge block centered & shifted down (removed relative -mt-7) */}
                <div className="flex flex-col items-center justify-center relative mt-[0.75rem] translate-y-2 w-full">
                  <div className="relative w-full max-w-[10.5rem] aspect-[160/115] mx-auto flex items-center justify-center">
                    <svg viewBox="0 0 160 115" className="w-full h-full overflow-visible">
                      <defs>
                        {/* Elegant fade-to-opaque gradient targeting pointer end */}
                        <linearGradient id="wind-gradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="var(--accent-color)" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="var(--accent-color)" stopOpacity={1.0} />
                        </linearGradient>
                      </defs>
                      <path 
                        d={bgPath}
                        fill="none"
                        stroke="currentColor"
                        className="text-app-text/10"
                        strokeWidth="7"
                        strokeLinecap="round"
                      />

                      {windVal > 0 && (
                        <path 
                          d={activePath}
                          fill="none"
                          stroke="var(--accent-color)"
                          strokeWidth="7"
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-out"
                        />
                      )}
                      
                      {/* Solider indicator circular dot on the arc */}
                      <circle 
                        cx={tip.x}
                        cy={tip.y}
                        r="7"
                        fill="#ffffff"
                        stroke="#525252"
                        strokeWidth="1.5"
                        className="transition-all duration-1000 ease-out stroke-neutral-300 dark:stroke-neutral-600 shadow-[0_1.5px_4px_rgba(0,0,0,0.25)]"
                      />

                      {/* Precise SVG centered text: Font-weight 500 to look bold and clear */}
                      <text 
                        x={cxVal} 
                        y={cyVal + 11} 
                        textAnchor="middle" 
                        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro", system-ui, sans-serif', fontWeight: 500 }} 
                        fill="currentColor" 
                        className="text-app-text text-[55px] tracking-tight"
                      >
                        {windVal}
                      </text>

                      {/* Unit exact inside/under the number */}
                      <text 
                        x={cxVal} 
                        y={cyVal + 34} 
                        textAnchor="middle" 
                        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro", system-ui, sans-serif', fontWeight: 500 }} 
                        fill="currentColor" 
                        className="text-app-text-dim/80 text-[13px] tracking-normal uppercase"
                      >
                        {unitWind}
                      </text>

                      {/* 0 and Limit markers directly below endpoints */}
                      <text 
                        x={startPt.x} 
                        y={startPt.y + 13} 
                        textAnchor="middle" 
                        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro", system-ui, sans-serif', fontWeight: 700 }} 
                        fill="currentColor"
                        className="text-app-text-dim/80 text-[11px]"
                      >
                        0
                      </text>

                      <text 
                        x={endPt.x} 
                        y={endPt.y + 13} 
                        textAnchor="middle" 
                        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro", system-ui, sans-serif', fontWeight: 700 }} 
                        fill="currentColor"
                        className="text-app-text-dim/80 text-[11px]"
                      >
                        {maxWindLimit}
                      </text>
                    </svg>
                  </div>
                </div>

                {/* Severity Rating and direction label centered at the bottom of the card */}
                <div className="text-center w-full flex flex-col items-center gap-0.5 mt-auto">
                  <p className="text-[13px] font-bold tracking-normal text-app-text-dim" style={{ color: 'var(--accent-color)' }}>
                    <Translate text={windSeverityRating} lang={settings.language || 'en'} />
                  </p>
                  <p className="text-[12px] font-semibold text-app-text tracking-wide uppercase">
                    <Translate text={getCardinalDirection(weather.current.windDirection || 0)} lang={settings.language || 'en'} />
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      }

    return null;
  })}
</div>
);
}

function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians),
  };
}

function getArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function getAQIRecommendation(aqi: number) {
  if (aqi <= 50) return 'Ideal for outdoor activities and fresh air.';
  if (aqi <= 100) return 'Acceptable quality; sensitive groups should limit exertion.';
  if (aqi <= 150) return 'Reduce prolonged outdoor exertion; masks recommended.';
  if (aqi <= 200) return 'Avoid outdoor activities; everyone may experience health effects.';
  return 'Health warning: serious risks. Stay indoors with air filtration.';
}

function getUVDesc(index: number) {
  if (index <= 2) return 'Low';
  if (index <= 5) return 'Moderate';
  if (index <= 7) return 'High';
  if (index <= 10) return 'Very High';
  return 'Extreme';
}

function getUVRecommendation(index: number) {
  if (index <= 2) return 'Sun protection is generally not needed.';
  if (index <= 5) return 'Sun protection is recommended.';
  if (index <= 7) return 'Sun protection is recommended.';
  if (index <= 10) return 'Extra sun protection is required.';
  return 'Avoid sun exposure at peak hours.';
}

function getUVColor(index: number) {
  if (index <= 2) return '#32d74b';
  if (index <= 5) return '#eab308';
  if (index <= 7) return '#ff9f0a';
  if (index <= 10) return '#ff453a';
  return '#bf5af2';
}

function getWindBeaufort(speed: number) {
  // speed in m/s
  if (speed < 0.3) return 'Calm';
  if (speed < 1.6) return 'Light Air';
  if (speed < 3.4) return 'Light Breeze';
  if (speed < 5.5) return 'Gentle Breeze';
  if (speed < 8.0) return 'Mod Breeze';
  if (speed < 10.8) return 'Fresh Breeze';
  if (speed < 13.9) return 'Strong Breeze';
  if (speed < 17.2) return 'Near Gale';
  return 'Gale';
}

function getWindDir(item: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(item / 45) % 8];
}

interface PollenCategoryData {
  value: number;
  level: 'Low' | 'Moderate' | 'High' | 'Very High';
  color: string;
  score10: number;
  season: string;
  desc: string;
  advice: string;
  isActiveSeason?: boolean;
}

interface PollenEstimation {
  overallLevel: 'Low' | 'Moderate' | 'High' | 'Very High';
  overallColor: string;
  overallValue: number;
  categories: {
    Tree: PollenCategoryData;
    Grass: PollenCategoryData;
    Weed: PollenCategoryData;
    Mold: PollenCategoryData;
  };
}

function getPollenLevel(category: 'Tree' | 'Grass' | 'Weed', val: number): { level: 'Low' | 'Moderate' | 'High' | 'Very High'; color: string } {
  if (category === 'Tree') {
    if (val < 15) return { level: 'Low', color: '#32d74b' };
    if (val < 90) return { level: 'Moderate', color: '#eab308' };
    if (val < 1500) return { level: 'High', color: '#ff9f0a' };
    return { level: 'Very High', color: '#ff453a' };
  } else if (category === 'Grass') {
    if (val < 5) return { level: 'Low', color: '#32d74b' };
    if (val < 20) return { level: 'Moderate', color: '#eab308' };
    if (val < 200) return { level: 'High', color: '#ff9f0a' };
    return { level: 'Very High', color: '#ff453a' };
  } else {
    if (val < 10) return { level: 'Low', color: '#32d74b' };
    if (val < 50) return { level: 'Moderate', color: '#eab308' };
    if (val < 500) return { level: 'High', color: '#ff9f0a' };
    return { level: 'Very High', color: '#ff453a' };
  }
}

function getPollenRecommendation(level: 'Low' | 'Moderate' | 'High' | 'Very High') {
  if (level === 'Low') return 'Airborne pollen is minimal. Perfect day for outdoor recreation.';
  if (level === 'Moderate') return 'Moderate counts. Individuals with high sensitivity should take local precautions.';
  if (level === 'High') return 'High pollen count. Wear sunglasses, keep house windows shut, and consider anti-histamines.';
  return 'Extreme botanical exposure. Restrict outdoor duration, wash face/hair immediately after return, and run HEPA cleaners.';
}

function estimatePollen(weather: WeatherData, location?: Location): PollenEstimation {
  let month = new Date().getMonth();
  let hour = new Date().getHours();
  
  if (weather?.current?.time) {
    try {
      const d = new Date(weather.current.time);
      if (!isNaN(d.getTime())) {
        month = d.getMonth();
        hour = d.getHours();
      }
    } catch {
      // fallback
    }
  }

  // Determine latitude (default: 40 for Northern Hemisphere if location is missing)
  const lat = location?.latitude ?? 40;
  
  // Classify Hemisphere & Climate Zone
  const isNorthern = lat > 15;
  const isSouthern = lat < -15;
  const isEquatorial = lat >= -15 && lat <= 15;

  let treeBase = 0;
  let grassBase = 0;
  let weedBase = 0;

  // 1. Calculate base values based on monthly seasons depending on Hemisphere/Zone
  if (isEquatorial) {
    // Equatorial/Tropical: less seasonal, active mostly in drier breezy months (June-Oct)
    if (month >= 5 && month <= 9) { // June - Oct
      treeBase = 150;
      grassBase = 50;
      weedBase = 45;
    } else {
      treeBase = 60;
      grassBase = 35;
      weedBase = 20;
    }
  } else if (isSouthern) {
    // Southern Hemisphere Seasons (Reversed)
    // Tree Spring peak: Sep (8) – Nov (10)
    // Grass Summer peak: Nov (10) – Jan (0)
    // Weed Autumn peak: Feb (1) – Apr (3)
    if (month === 8) treeBase = 120; // September
    else if (month === 9) treeBase = 450; // October (peak tree)
    else if (month === 10) treeBase = 180; // November
    else if (month === 7) treeBase = 35; // August
    else if (month === 11) treeBase = 25; // December
    else treeBase = 2;

    if (month === 10) grassBase = 15; // November
    else if (month === 11) grassBase = 75; // December (peak grass)
    else if (month === 0) grassBase = 40; // January
    else if (month === 9) grassBase = 4; // October
    else if (month === 1) grassBase = 8; // February
    else grassBase = 1;

    if (month === 1) weedBase = 25; // February
    else if (month === 2) weedBase = 140; // March (peak weed)
    else if (month === 3) weedBase = 60; // April
    else if (month === 0) weedBase = 10; // January
    else if (month === 4) weedBase = 5; // May
    else weedBase = 1;
  } else {
    // Northern Hemisphere Seasons (Default)
    // Tree Spring peak: Mar (2) – May (4)
    // Grass Summer peak: May (4) – July (6)
    // Weed Autumn peak: Aug (7) – Oct (9)
    if (month === 2) treeBase = 120; // March
    else if (month === 3) treeBase = 450; // April (peak tree)
    else if (month === 4) treeBase = 180; // May
    else if (month === 1) treeBase = 35; // Feb
    else if (month === 5) treeBase = 25; // June
    else treeBase = 2;

    if (month === 4) grassBase = 15; // May
    else if (month === 5) grassBase = 75; // June (peak grass)
    else if (month === 6) grassBase = 40; // July
    else if (month === 3) grassBase = 4; // April
    else if (month === 7) grassBase = 8; // August
    else grassBase = 1;

    if (month === 7) weedBase = 25; // August
    else if (month === 8) weedBase = 140; // Sept (ragweed peak)
    else if (month === 9) weedBase = 60; // Oct
    else if (month === 6) weedBase = 10; // July
    else if (month === 10) weedBase = 5; // Nov
    else weedBase = 1;
  }

  let tempFactor = 1.0;
  const temp = weather.current?.temperature ?? 20;
  if (temp < 10) tempFactor = 0.15;
  else if (temp < 15) tempFactor = 0.6;
  else if (temp < 25) tempFactor = 1.25;
  else if (temp < 32) tempFactor = 1.0;
  else tempFactor = 0.6;

  let humidityFactor = 1.0;
  const humidity = weather.current?.relativeHumidity ?? 50;
  if (humidity > 80) humidityFactor = 0.15;
  else if (humidity > 65) humidityFactor = 0.5;
  else if (humidity < 40) humidityFactor = 1.3;
  else humidityFactor = 1.0;

  let windFactor = 1.0;
  const wind = weather.current?.windSpeed ?? 10;
  if (wind < 4) windFactor = 0.45;
  else if (wind < 15) windFactor = 1.25;
  else if (wind < 26) windFactor = 0.9;
  else windFactor = 0.5;

  let rainFactor = 1.0;
  const weatherCode = weather.current?.weatherCode ?? 0;
  const isRaining = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(weatherCode);
  if (isRaining || (weather.current?.precipitation && weather.current.precipitation > 0)) {
    rainFactor = 0.1;
  }

  let todFactor = 1.0;
  if (hour >= 6 && hour < 12) todFactor = 1.35;
  else if (hour >= 12 && hour < 17) todFactor = 1.1; 
  else if (hour >= 17 && hour < 21) todFactor = 0.8;
  else todFactor = 0.3;

  const totalMultiplier = tempFactor * humidityFactor * windFactor * rainFactor * todFactor;

  const treeVal = Math.round(treeBase * totalMultiplier);
  const grassVal = Math.round(grassBase * totalMultiplier);
  const weedVal = Math.round(weedBase * totalMultiplier);

  const treeLevel = getPollenLevel('Tree', treeVal);
  const grassLevel = getPollenLevel('Grass', grassVal);
  const weedLevel = getPollenLevel('Weed', weedVal);

  // Tree score10
  let treeScore10 = 1.0;
  if (treeVal < 15) treeScore10 = 0.5 + (treeVal / 15) * 2.0;
  else if (treeVal < 90) treeScore10 = 2.5 + ((treeVal - 15) / 75) * 2.5;
  else if (treeVal < 1500) treeScore10 = 5.0 + ((treeVal - 90) / 1410) * 3.0;
  else treeScore10 = 8.0 + Math.min(2.0, ((treeVal - 1500) / 1000) * 2.0);
  treeScore10 = Math.round(treeScore10 * 10) / 10;

  // Grass score10
  let grassScore10 = 1.0;
  if (grassVal < 5) grassScore10 = 0.5 + (grassVal / 5) * 2.0;
  else if (grassVal < 20) grassScore10 = 2.5 + ((grassVal - 5) / 15) * 2.5;
  else if (grassVal < 200) grassScore10 = 5.0 + ((grassVal - 20) / 180) * 3.0;
  else grassScore10 = 8.0 + Math.min(2.0, ((grassVal - 200) / 200) * 2.0);
  grassScore10 = Math.round(grassScore10 * 10) / 10;

  // Weed score10
  let weedScore10 = 1.0;
  if (weedVal < 10) weedScore10 = 0.5 + (weedVal / 10) * 2.0;
  else if (weedVal < 50) weedScore10 = 2.5 + ((weedVal - 10) / 40) * 2.5;
  else if (weedVal < 500) weedScore10 = 5.0 + ((weedVal - 50) / 450) * 3.0;
  else weedScore10 = 8.0 + Math.min(2.0, ((weedVal - 500) / 500) * 2.0);
  weedScore10 = Math.round(weedScore10 * 10) / 10;

  // Mold calculations:
  let moldBase = 0;
  if (isEquatorial) {
    if (month >= 5 && month <= 9) { // June - Oct
      moldBase = 180;
    } else {
      moldBase = 80;
    }
  } else if (isSouthern) {
    if (month === 1) moldBase = 90; // Feb
    else if (month === 2) moldBase = 240; // Mar
    else if (month === 3) moldBase = 180; // Apr
    else if (month === 4) moldBase = 110; // May
    else if (month === 11) moldBase = 35; // Dec
    else if (month === 0) moldBase = 50; // Jan
    else moldBase = 5;
  } else {
    // Northern: Late summer/early autumn peaks (July - Oct)
    if (month === 6) moldBase = 90; // July
    else if (month === 7) moldBase = 240; // Aug
    else if (month === 8) moldBase = 180; // Sept
    else if (month === 9) moldBase = 110; // Oct
    else if (month === 5) moldBase = 35; // June
    else if (month === 10) moldBase = 50; // Nov
    else moldBase = 5;
  }

  const moldVal = Math.round(moldBase * tempFactor * (humidity > 60 ? 1.4 : 0.8) * todFactor);
  const moldLevelStr = moldVal < 50 ? 'Low' : moldVal < 250 ? 'Moderate' : moldVal < 1000 ? 'High' : 'Very High';
  const moldColor = moldVal < 50 ? '#32d74b' : moldVal < 250 ? '#eab308' : moldVal < 1000 ? '#ff9f0a' : '#ff453a';

  let moldScore10 = 1.0;
  if (moldVal < 50) moldScore10 = 0.5 + (moldVal / 50) * 2.0;
  else if (moldVal < 250) moldScore10 = 2.5 + ((moldVal - 50) / 200) * 2.5;
  else if (moldVal < 1000) moldScore10 = 5.0 + ((moldVal - 250) / 750) * 3.0;
  else moldScore10 = 8.0 + Math.min(2.0, ((moldVal - 1000) / 1000) * 2.0);
  moldScore10 = Math.round(moldScore10 * 10) / 10;

  const moldLevel = { level: moldLevelStr as 'Low' | 'Moderate' | 'High' | 'Very High', color: moldColor };

  let severityScore = 1;
  let overallLevel: 'Low' | 'Moderate' | 'High' | 'Very High' = 'Low';
  let overallColor = '#32d74b';

  const levels = [treeLevel, grassLevel, weedLevel, moldLevel];
  if (levels.some(l => l.level === 'Very High')) {
    overallLevel = 'Very High';
    overallColor = '#ff453a';
    severityScore = 8.8;
  } else if (levels.some(l => l.level === 'High')) {
    overallLevel = 'High';
    overallColor = '#ff9f0a';
    severityScore = 6.2;
  } else if (levels.some(l => l.level === 'Moderate')) {
    overallLevel = 'Moderate';
    overallColor = '#eab308';
    severityScore = 3.6;
  } else {
    overallLevel = 'Low';
    overallColor = '#32d74b';
    severityScore = 1.2;
  }

  const rawScore = severityScore + (temp > 24 ? 0.8 : -0.4) + (humidity < 45 ? 0.6 : -0.3);
  const overallValue = Math.max(0.5, Math.min(10, parseFloat(rawScore.toFixed(1))));

  // Dynamic regional info
  let treeSeason = 'Spring (March – May)';
  let treeDesc = 'Birch, Oak, Alder, Pine, Maple, Ash, Willow, Hickory tree pollen grains.';
  let treeActive = month >= 2 && month <= 4;

  let grassSeason = 'Summer (May – July)';
  let grassDesc = 'Sweet Vernal, Orchard, Timothy, Ryegrass, Kentucky Bluegrass allergen particles.';
  let grassActive = month >= 4 && month <= 6;

  let weedSeason = 'Autumn (August – October)';
  let weedDesc = 'Ragweed, Nettle, Sagebrush, Pigweed, Mugwort weed pollen grains.';
  let weedActive = month >= 7 && month <= 9;

  if (isEquatorial) {
    treeSeason = 'Dry Season (June – September)';
    treeDesc = 'Tropical Acacia, Palm, Casuarina, Melaleuca, and Eucalyptus tree pollens.';
    treeActive = month >= 5 && month <= 8;

    grassSeason = 'Year-Round (Peaks in Dry transition)';
    grassDesc = 'Tropical Bermuda, Guinea, Elephant, Bahia, and Cogongrass grasses.';
    grassActive = month >= 4 && month <= 9;

    weedSeason = 'Dry Season (June – September)';
    weedDesc = 'Ambler, Parthenium, Castor Bean, Mugwort, and Pigweed weed allergens.';
    weedActive = month >= 5 && month <= 8;
  } else if (isSouthern) {
    treeSeason = 'Spring (September – November)';
    treeDesc = 'Southern Eucalyptus, Wattles (Acacia), Cedar, Pine, Oak, and Birch trees.';
    treeActive = month >= 8 && month <= 10;

    grassSeason = 'Summer (November – January)';
    grassDesc = 'Ryegrass, Timothy, Orchard Grass, Canary, and Bermuda grass pollen.';
    grassActive = month >= 10 || month <= 0;

    weedSeason = 'Autumn (February – April)';
    weedDesc = 'Plantain, Sorrel, Ragweed, Goosefoot, and local weed pollen grains.';
    weedActive = month >= 1 && month <= 3;
  } else {
    // Specific regional adaptations (e.g. Japan cedar peak)
    const cntry = location?.country?.toLowerCase() || '';
    if (cntry === 'japan' || cntry === 'jp' || location?.name?.toLowerCase().includes('tokyo') || location?.name?.toLowerCase().includes('osaka')) {
      treeSeason = 'Early Spring (February – April)';
      treeDesc = 'Japanese Cedar (Sugi) and Cypress (Hinoki) tree pollen grains.';
      treeActive = month >= 1 && month <= 3;
    }
  }

  return {
    overallLevel,
    overallColor,
    overallValue,
    categories: {
      Tree: {
        value: treeVal,
        ...treeLevel,
        score10: treeScore10,
        season: treeSeason,
        desc: treeDesc,
        advice: 'Pollen counts are highest early morning of hot dry days. Keep indoor vents closed.',
        isActiveSeason: treeActive
      },
      Grass: {
        value: grassVal,
        ...grassLevel,
        score10: grassScore10,
        season: grassSeason,
        desc: grassDesc,
        advice: 'Avoid cut lawns and tall meadows in summer afternoons. Shower after outdoor stays.',
        isActiveSeason: grassActive
      },
      Weed: {
        value: weedVal,
        ...weedLevel,
        score10: weedScore10,
        season: weedSeason,
        desc: weedDesc,
        advice: 'Weed pollen concentrations typically rise on warm windy days. Utilize HEPA dry filters.',
        isActiveSeason: weedActive
      },
      Mold: {
        value: moldVal,
        ...moldLevel,
        score10: moldScore10,
        season: isEquatorial ? 'Year-Round (Peaks in Wet season)' : isSouthern ? 'Late Summer – Autumn (Feb – May)' : 'Late Summer – Autumn (Jul – Oct)',
        desc: 'Alternaria, Cladosporium, and other common outdoor mold spores.',
        advice: 'Outdoor mold spikes in warm, humid conditions. Avoid decaying vegetation.',
        isActiveSeason: isEquatorial ? (month >= 5 && month <= 9) : isSouthern ? (month >= 1 && month <= 4) : (month >= 6 && month <= 9)
      }
    }
  };
}
