import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RawIcons } from './WeatherIcons';
import { cn } from '../lib/utils';
import { Haptic } from '../lib/haptics';
import { useTranslatedText, Translate } from '../lib/translations';

interface WeatherAlert {
  id: string;
  type: 'rain' | 'snow' | 'storm' | 'severe' | 'severe_storm';
  title: string;
  message: string;
}

interface AlertsDisplayProps {
  alerts: WeatherAlert[];
  hapticEnabled?: boolean;
  onDismiss: (id: string) => void;
  lang?: string;
}

interface AlertCardProps {
  key?: string;
  alert: WeatherAlert;
  index: number;
  alertsCount: number;
  isExpanded: boolean;
  onDismiss: (id: string) => void;
  lang: string;
}

function AlertCard({ alert, index, alertsCount, isExpanded, onDismiss, lang }: AlertCardProps) {
  const [blurReady, setBlurReady] = useState(false);
  useEffect(() => {
    let active = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (active) {
          setBlurReady(true);
        }
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const isStacked = !isExpanded && alertsCount > 1;
  const stackIndex = index;
  
  let opacityVal = 0;
  let yVal = 0;
  let scaleXVal = 1;
  let zIndexVal = alertsCount - index;
  let marginTopVal = 0;

  if (blurReady) {
    if (isStacked) {
      if (stackIndex === 0) {
        opacityVal = 1;
        yVal = 0;
        scaleXVal = 1.0;
        zIndexVal = 30;
        marginTopVal = 0;
      } else if (stackIndex === 1) {
        opacityVal = 0.8;
        yVal = 12;
        scaleXVal = 0.8;
        zIndexVal = 20;
        marginTopVal = -100;
      } else if (stackIndex === 2) {
        opacityVal = 0.5;
        yVal = 24;
        scaleXVal = 0.7;
        zIndexVal = 10;
        marginTopVal = -100;
      } else {
        opacityVal = 0;
        yVal = 36;
        scaleXVal = 0.4;
        zIndexVal = 0;
        marginTopVal = -100;
      }
    } else {
      opacityVal = 1;
    }
  }

  // Strip any leading weather/warning emoji from title dynamically
  const cleanTitle = alert.title.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim();

  // Call hooks for translations
  const translatedTitle = useTranslatedText(cleanTitle, lang);

  const translatedMessage = (() => {
    // If it matches like "80% chance of rain in the forecast."
    const rainMatch = alert.message.match(/^(\d+)%\s+chance of rain in the forecast\.$/i);
    if (rainMatch) {
       return `${rainMatch[1]}% ` + useTranslatedText("chance of rain in the forecast.", lang);
    }
    const snowMatch = alert.message.match(/^(\d+)%\s+chance of snow in the forecast\.$/i);
    if (snowMatch) {
       return `${snowMatch[1]}% ` + useTranslatedText("chance of snow in the forecast.", lang);
    }
    const aqiMatch = alert.message.match(/^Air quality is\s+(.+?)\s+\((\d+)\)\.$/i);
    if (aqiMatch) {
       const desc = useTranslatedText(aqiMatch[1], lang);
       const label = useTranslatedText("Air quality is", lang);
       return `${label} ${desc} (${aqiMatch[2]}).`;
    }
    return useTranslatedText(alert.message, lang);
  })();

  return (
    <motion.div
      key={alert.id}
      initial={false}
      animate={{
        opacity: opacityVal,
        y: yVal,
        scaleX: scaleXVal,
        scaleY: 1,
        zIndex: zIndexVal,
        marginTop: marginTopVal,
        position: 'relative',
        top: 0,
        left: 0,
        right: 0,
        height: isStacked ? 100 : 'auto',
      }}
      style={{ transformOrigin: 'top center' }}
      exit={{ opacity: 0, scaleX: 0.9, y: 10 }}
      transition={{
        type: "tween",
        ease: [0.16, 1, 0.3, 1],
        duration: 0.18,
        scaleX: { duration: 0 }
      }}
      className={cn(
        "alert-card p-4 rounded-[24px] flex gap-4 items-start relative overflow-hidden group transition-all",
        "bg-app-surface border border-app-border backdrop-blur-xl",
        !isExpanded && index > 0 && "pointer-events-none",
        blurReady && "blur-ready"
      )}
    >
      {/* Glow background */}
      <div className="absolute inset-0 bg-gradient-to-br from-app-text/[0.03] to-transparent pointer-events-none" />

      {/* Inner content wrapper which transitions its opacity seamlessly instead of mounting/unmounting */}
      <div 
        className={cn(
          "flex gap-4 items-start w-full relative z-10 transition-opacity duration-200",
          isStacked && stackIndex > 0 ? "opacity-0 pointer-events-none" : "opacity-100"
        )}
      >
        <div className="mt-1 flex-shrink-0">
          {alert.type === 'rain' && <RawIcons.CloudRain className="w-5 h-5 text-blue-500" />}
          {alert.type === 'snow' && <RawIcons.Snowflake className="w-5 h-5 text-app-text" />}
          {alert.type === 'storm' && <RawIcons.CloudLightning className="w-5 h-5 text-amber-500" />}
          {alert.type === 'severe' && <RawIcons.ShieldAlert className="w-5 h-5 text-rose-500" />}
          {alert.type === 'severe_storm' && <RawIcons.CloudLightning className="w-5 h-5 text-amber-500 animate-pulse" />}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className={cn(
            "text-[14px] font-bold mb-0.5 tracking-tight uppercase line-clamp-1 truncate",
            alert.type === 'severe_storm' ? "text-amber-500" : "text-app-text"
          )}>
            {translatedTitle}
          </h4>
          <p 
            className="text-[13px] text-app-text-dim leading-snug line-clamp-2"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {translatedMessage}
          </p>
        </div>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(alert.id);
          }}
          className="p-1 opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
        >
          <RawIcons.X className="w-4 h-4 text-app-text" />
        </button>
      </div>
    </motion.div>
  );
}

export default function AlertsDisplay({ alerts, hapticEnabled = true, onDismiss, lang = 'en' }: AlertsDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (alerts.length > 0) {
      Haptic.medium(hapticEnabled);
    }
  }, [alerts.length, hapticEnabled]);

  if (alerts.length === 0) return null;

  const handleToggle = (e: React.MouseEvent) => {
    // Don't toggle if clicking the dismiss button
    if ((e.target as HTMLElement).closest('button')) return;
    if (alerts.length > 1) {
      setIsExpanded(!isExpanded);
    }
  };

  const containerHeight = isExpanded 
    ? 'auto' 
    : (alerts.length === 1 
        ? 'auto' 
        : (alerts.length === 2 ? '112px' : '124px')
      );

  return (
    <div 
      className={cn(
        "w-full px-6 transition-all duration-300 ease-in-out cursor-pointer",
        isExpanded ? "space-y-3 mb-2" : "relative mb-2"
      )}
      onClick={handleToggle}
      style={{ 
        height: containerHeight,
        minHeight: containerHeight 
      }}
    >
      <AnimatePresence mode="popLayout">
        {alerts.map((alert, index) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            index={index}
            alertsCount={alerts.length}
            isExpanded={isExpanded}
            onDismiss={onDismiss}
            lang={lang}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
