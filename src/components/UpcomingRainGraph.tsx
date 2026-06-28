import React from 'react';
import { CloudRain } from 'lucide-react';
import { WeatherData, Settings } from '../types';
import { getCurrentHourIndex } from '../services/weatherService';
import { Translate } from '../lib/translations';

interface UpcomingRainGraphProps {
  weather: WeatherData;
  settings: Settings;
}

export function UpcomingRainGraph({ weather, settings }: UpcomingRainGraphProps) {
  if (!weather || !weather.hourly) return null;

  const hourIndex = getCurrentHourIndex(weather.timezone, weather.hourly.time);
  const pops = weather.hourly.precipitationProbability || [];

  // Hide the graph entirely if rain probabilities in the next 3 hours do not exceed 30%
  const next3HoursPops = [0, 1, 2, 3].map(offset => pops[hourIndex + offset] ?? 0);
  const maxPopNext3Hours = Math.max(...next3HoursPops);
  if (maxPopNext3Hours <= 30) {
    return null;
  }

  const barsCount = 31; // 31 bars to map 0 to 180 minutes beautifully
  const interpolatedData = Array.from({ length: barsCount }).map((_, i) => {
    // Interpolate across 3 hours of timeline (one step is 6 minutes)
    const tVal = (i / (barsCount - 1)) * 3; // 0 to 3 hours
    const hourOffset = Math.floor(tVal);
    const fraction = tVal - hourOffset;
    
    const idx = hourIndex + hourOffset;
    const pop1 = pops[idx] ?? 0;
    const pop2 = pops[idx + 1] ?? pop1;
    
    // Smooth cosine interpolation for organic undulating waves matching premium weather design fidelity
    const mu = (1 - Math.cos(fraction * Math.PI)) / 2;
    let probability = pop1 * (1 - mu) + pop2 * mu;
    
    if (probability > 10) {
      const wave = Math.sin(i * 0.45) * 6;
      probability = Math.max(8, Math.min(100, probability + wave));
    } else if (probability > 0) {
      probability = Math.max(3, probability);
    }
    
    return {
      index: i,
      probability,
    };
  });

  const maxPop = Math.max(...interpolatedData.map(d => d.probability));

  // Determine intensity classification & descriptive label
  let intensityClass: 'Dry' | 'Light' | 'Moderate' | 'Heavy' = 'Dry';
  let dynamicSubtitle = 'Dry conditions expected for the next 3 hours';

  if (maxPop > 75) {
    intensityClass = 'Heavy';
  } else if (maxPop > 45) {
    intensityClass = 'Moderate';
  } else if (maxPop > 15) {
    intensityClass = 'Light';
  }

  // Calculate peak minutes and subtitle
  if (intensityClass !== 'Dry') {
    const maxItem = interpolatedData.reduce((prev, curr) => (curr.probability > prev.probability) ? curr : prev, interpolatedData[0]);
    const peakIndex = maxItem.index;
    const peakTimeMinutes = Math.round((peakIndex / (barsCount - 1)) * 180);

    if (peakTimeMinutes === 0) {
      dynamicSubtitle = `${intensityClass} rain starting now, peaking now`;
    } else if (peakTimeMinutes < 60) {
      dynamicSubtitle = `${intensityClass} rain, peaking in ${peakTimeMinutes} min`;
    } else {
      const hours = Math.floor(peakTimeMinutes / 60);
      const mins = peakTimeMinutes % 60;
      const timeStr = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
      dynamicSubtitle = `${intensityClass} rain, peaking in ${timeStr}`;
    }
  }

  return (
    <div className="flex flex-col px-0 -mx-[1rem] sm:-mx-[1.3125rem] animate-fade-in">
      <div className="w-[calc(100%-2rem)] max-w-[21.875rem] mx-auto bg-app-surface backdrop-blur-[32px] border border-app-border rounded-[2rem] py-[1.25rem] px-[1rem] sm:px-[1.375rem] flex flex-col gap-[1rem] overflow-hidden shadow-2xl relative select-none">
        
        {/* Top Header Section matched structurally with the AQI style */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 select-none">
            <CloudRain className="w-5 h-5 text-app-text/75" strokeWidth={1.4} />
            <span className="text-[15px] font-normal tracking-wide text-app-text/75 uppercase font-sans">
              <Translate text="Rain Next 3 Hours" lang={settings.language || 'en'} />
            </span>
          </div>
        </div>

        {/* Supporting Subtitle / Description text block matching general card typography */}
        <div className="text-left -mt-2">
          <p className="text-[13px] font-normal text-app-text-dim leading-snug font-sans">
            <Translate text={dynamicSubtitle} lang={settings.language || 'en'} />
          </p>
        </div>

        {/* Graph Area */}
        <div className="flex items-end justify-between h-[100px] relative w-full mt-1.5 select-none">
          {/* Left indicators side (Heavy, Moderate, Light) aligned perfectly without uppercase */}
          <div className="flex flex-col justify-between h-full text-[10px] font-medium text-app-text/50 w-11 text-left shrink-0 pb-1.5 pt-1 pr-1 font-sans">
            <span>Heavy</span>
            <span>Moderate</span>
            <span>Light</span>
          </div>
          
          {/* Graph Bars Area */}
          <div className="flex-1 h-full relative flex items-end justify-between px-1">
            {/* Grid dotted helper lines behind the bars */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-1.5 pt-1.5">
              <div className="border-b border-dashed border-white/[0.06] w-full" />
              <div className="border-b border-dashed border-white/[0.06] w-full" />
              <div className="border-b border-solid border-white/[0.08] w-full" />
            </div>

            {/* Render 31 individual smooth columns matching iOS design pattern */}
            {interpolatedData.map((dp) => {
              const heightPercent = dp.probability > 0 ? `${Math.max(3, dp.probability)}%` : "3px";
              return (
                <div
                  key={dp.index}
                  style={{ 
                    height: heightPercent,
                    background: `linear-gradient(to top, rgba(var(--theme-accent-rgb), 0.15), var(--accent-color))`
                  }}
                  className="w-[4px] xs:w-[5px] sm:w-[5px] shrink-0 rounded-full select-none transition-all duration-300 relative group"
                >
                  {/* Micro hover tooltips for precision detail */}
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-neutral-900 border border-white/10 text-white rounded px-1.5 py-0.5 text-[9px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-30 whitespace-nowrap shadow-md">
                    {Math.round(dp.probability)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline Footer Axis */}
        <div className="flex justify-between w-full mt-1 pl-[44px] pr-1.5 text-[11px] font-medium text-white/45 font-sans leading-none">
          <span>Now</span>
          <span>30m</span>
          <span>1h</span>
          <span>1.5h</span>
          <span>2h</span>
          <span>2.5h</span>
          <span>3h</span>
        </div>
      </div>
    </div>
  );
}
