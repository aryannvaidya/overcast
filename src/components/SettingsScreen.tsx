import React, { useState, useEffect, useRef } from 'react';
import { mapWMOLabel, getCurrentWeatherState, getWeatherThemeColor } from '../services/weatherService';
import { convertTemp, formatTemp, formatWind, formatVisibility, formatPrecipitation } from '../lib/units';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { Icons, WeatherIcon } from './WeatherIcons';
import { Settings, WeatherData, Location } from '../types';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';
import { Haptic } from '../lib/haptics';
import { useTranslatedText, Translate, useTranslation } from '../lib/translations';
import { termsPrivacyTranslations } from '../lib/termsPrivacyTranslations';
import { 
  initializeOneSignal, 
  requestNotificationPermission, 
  syncUserSettingsToFirebase, 
  fetchUserSettingsFromFirebase,
  wirePushToggle,
  wireMorningToggle,
  wireNightToggle,
  wireThresholdToggle,
  applyNotifToggleStates,
  sendSmartWelcomeNotification
} from '../services/oneSignalService';
import { Package, Cloud, FileText, Shield, ArrowUpRight, Info, Bell, Sliders, Activity, ShieldCheck, HelpCircle, LogOut, Check, Bug, Heart, Star, ArrowUp, ArrowDown, TrendingUp, Calendar, Sun, Moon, Eye, Wind, Compass, GripVertical, LayoutGrid } from 'lucide-react';

export const TERMS_CONTENT = `Last Updated: June 2026

By using Overcast, you agree to the following terms.

## Informational Use Only

Weather information, forecasts, alerts, radar imagery, and environmental data are provided for informational purposes only.

Forecasting is inherently uncertain and conditions may change rapidly.

## No Guarantee of Accuracy

Overcast and its data providers do not guarantee the accuracy, completeness, availability, or timeliness of any information displayed within the application.

## Not for Critical Safety Decisions

The application should not be relied upon for:
• Aviation operations
• Maritime navigation
• Emergency management
• Disaster response
• Life-safety decisions
• Any activity where inaccurate weather information could result in injury, damage, or loss

Always consult official government meteorological agencies when safety-critical decisions are involved.

## Service Availability

The application depends on third-party data providers and internet connectivity.

Features, services, data sources, and availability may change without notice.

Temporary outages may occur due to maintenance, infrastructure issues, or provider interruptions.

## Open Source Software

Overcast is provided as open-source software and may be modified, forked, or redistributed according to the project's license.

## Disclaimer of Warranties

The application is provided "as is" and "as available" without warranties of any kind, express or implied.

## Limitation of Liability

To the maximum extent permitted by applicable law, Overcast and its contributors shall not be liable for any direct, indirect, incidental, consequential, or special damages arising from the use of, or inability to use, the application.

## Acceptance of Terms

By using Overcast, you acknowledge that you have read and agree to these Terms of Use.`;

export const PRIVACY_CONTENT = `Last Updated: June 2026

Overcast is designed with a privacy-first approach. The application does not require user accounts, subscriptions, or personal information to function.

## What Data Is Used

To provide weather forecasts, radar imagery, alerts, and environmental information, the application may access:
• Your selected locations
• Device location (only when permission is granted)
• Application preferences and settings

This information is used solely to provide weather-related functionality.

## Local-First Storage

Your preferences, saved locations, units, themes, and alert settings are stored locally on your device using browser storage.

Overcast does not operate user accounts and does not maintain a database of user profiles.

## Third-Party Weather Services

Weather forecasts, alerts, and environmental data are obtained from third-party providers such as Open-Meteo and related meteorological data sources.

When weather information is requested, certain data such as your approximate IP address or requested coordinates may be processed by these providers according to their own privacy policies.

Overcast does not control how third-party providers process data.

## Analytics and Tracking

• No user accounts
• No advertising networks
• No behavioral profiling
• No sale of personal data
• No third-party tracking libraries

The application does not intentionally collect personal information for marketing or advertising purposes.

## Your Data

You remain in control of your data.

Removing saved locations, clearing browser storage, uninstalling the PWA, or clearing site data will remove locally stored application information.

## Open Source

Overcast is an open-source project. The source code is publicly available for inspection, review, and contribution under the project's license.

## Changes

This Privacy Policy may be updated occasionally to reflect changes in functionality or service providers. Continued use of the application constitutes acceptance of the updated policy.`;

interface SettingsScreenProps {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
  onClose: () => void;
  activeWeather?: WeatherData;
  activeLocation?: Location;
  panelStackRef: React.MutableRefObject<(() => void)[]>;
  handleBack: () => void;
  pushPanel: (closeFn: () => void, name: string) => void;
}

const Section = ({ title, children, lang = 'en' }: { title: string; children: React.ReactNode; lang?: string }) => {
  const transTitle = useTranslatedText(title, lang);
  return (
    <div className="mb-8">
      <h3 className="text-[11px] font-semibold tracking-[0.1em] text-white/45 uppercase mb-3 px-1">{transTitle}</h3>
      <div className={cn("overflow-hidden divide-y divide-white/[0.06]", "bg-white/[0.04] border border-white/[0.08] backdrop-blur-md rounded-[24px]")}>
        {children}
      </div>
    </div>
  );
};

const ToggleRow = ({ label, description, value, onToggle, hapticEnabled, lang = 'en' }: { label: string; description?: string; value: boolean; onToggle: () => void; hapticEnabled: boolean; lang?: string }) => {
  const transLabel = useTranslatedText(label, lang);
  const transDesc = useTranslatedText(description || "", lang);
  
  // Detect theme at runtime via active colorTheme
  const colorTheme = typeof document !== 'undefined' ? (document.documentElement.getAttribute('data-color-theme') || 'green') : 'green';
  const isBlackTheme = colorTheme === 'midnight' || colorTheme === 'pink';
  const isBlackOrMonochrome = colorTheme === 'monochrome' || isBlackTheme;

  return (
    <div className="p-4 flex items-center justify-between">
      <div className="flex-1 pr-4">
        <p className="text-[16px] font-medium text-app-text tracking-tight font-sans">{transLabel}</p>
        {description && <p className="text-[13px] text-app-text-dim mt-0.5 leading-tight opacity-70 font-sans">{transDesc}</p>}
      </div>
      <button 
        type="button"
        onClick={() => {
          Haptic.light(hapticEnabled);
          onToggle();
        }}
        className={cn(
          "toggle w-[51px] h-[31px] rounded-full transition-all duration-300 relative focus:outline-none focus:ring-0",
          isBlackTheme
            ? (value ? "bg-white" : "bg-white/20")
            : isBlackOrMonochrome
            ? (value ? "bg-black" : "bg-black/10")
            : (value ? "bg-white" : "bg-white/10")
        )}
      >
        <div 
          className={cn(
            "absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full shadow-md transition-all duration-250 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] will-change-transform",
            value 
              ? (isBlackTheme
                ? "translate-x-[20px] bg-black"
                : isBlackOrMonochrome 
                ? "translate-x-[20px] bg-white" 
                : "translate-x-[20px] bg-black"
                ) 
              : "translate-x-0 bg-white"
          )} 
        />
      </button>
    </div>
  );
};

const SegmentedControl = ({ value, options, onChange, hapticEnabled, lang = 'en' }: { value: string; options: { label: any; value: string }[], onChange: (val: any) => void; hapticEnabled: boolean; layoutId?: string; lang?: string }) => {
  const colorTheme = typeof document !== 'undefined' ? (document.documentElement.getAttribute('data-color-theme') || 'green') : 'green';
  
  return (
    <div className="flex gap-2 w-full">
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              if (!isSelected) {
                Haptic.light(hapticEnabled);
                onChange(opt.value);
              }
            }}
            className={cn(
              "flex-1 py-1.5 flex items-center justify-center rounded-full transition-all duration-200 relative select-none font-sans active:scale-[0.97] min-h-[44px]",
              colorTheme === 'midnight'
                ? (isSelected 
                  ? "bg-neutral-900 border border-neutral-800 text-white shadow-md font-sans font-medium" 
                  : "bg-black/[0.3] border border-white/[0.04] text-white/50 hover:bg-neutral-900/50 hover:text-white"
                  )
                : colorTheme === 'monochrome'
                ? (isSelected 
                  ? "bg-black text-white shadow-md border border-black font-sans font-medium" 
                  : "bg-black/[0.05] border border-black/[0.02] text-neutral-500 hover:bg-black/[0.1] hover:text-black"
                  )
                : (isSelected 
                  ? "bg-white text-black shadow-md font-sans font-medium" 
                  : "bg-white/[0.06] border border-white/[0.04] text-white/50 hover:bg-white/[0.1] hover:text-white"
                  )
            )}
          >
            {typeof opt.label === 'string' ? (
              <Translate text={opt.label} lang={lang} />
            ) : (
              opt.label
            )}
          </button>
        );
      })}
    </div>
  );
};

const SelectRow = ({ label, value, options, onChange, hapticEnabled, lang = 'en' }: { label: string; value: string; options: { label: any; value: string }[], onChange: (val: any) => void; hapticEnabled: boolean; lang?: string }) => {
  const transLabel = useTranslatedText(label, lang);
  return (
    <div className="px-5 py-4 pb-5 flex flex-col gap-3">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[14px] font-medium text-white tracking-tight font-sans">{transLabel}</p>
      </div>
      <SegmentedControl 
        value={value} 
        options={options} 
        onChange={onChange} 
        hapticEnabled={hapticEnabled} 
        lang={lang}
      />
    </div>
  );
};

const LinkRow = ({ label, value, onClick, hapticEnabled, lang = 'en' }: { label: string; value?: string; onClick?: () => void; hapticEnabled?: boolean; lang?: string }) => {
  const transLabel = useTranslatedText(label, lang);
  return (
    <button 
      onClick={() => {
        if (hapticEnabled !== undefined) Haptic.medium(hapticEnabled);
        onClick?.();
      }} 
      className="w-full p-4 flex items-center justify-between text-left active:bg-app-text/5 transition-colors"
    >
      <p className="text-[15px] text-app-text">{transLabel}</p>
      <div className="flex items-center gap-2">
        {value && <p className="text-[14px] text-app-text-dim"><Translate text={value} lang={lang} /></p>}
        <Icons.ChevronRight className="w-4 h-4 text-app-text-dim/20" />
      </div>
    </button>
  );
};

const LANGUAGES = [
  { value: 'bn', label: 'Bengali (বাংলা)' },
  { value: 'nl', label: 'Dutch (Nederlands)' },
  { value: 'en', label: 'English (English)' },
  { value: 'fr', label: 'French (Français)' },
  { value: 'de', label: 'German (Deutsch)' },
  { value: 'el', label: 'Greek (Ελληνικά)' },
  { value: 'hi', label: 'Hindi (हिन्दी)' },
  { value: 'hu', label: 'Hungarian (Magyar)' },
  { value: 'id', label: 'Indonesian (Bahasa Indonesia)' },
  { value: 'it', label: 'Italian (Italiano)' },
  { value: 'ja', label: 'Japanese (日本語)' },
  { value: 'ko', label: 'Korean (한국어)' },
  { value: 'zh', label: 'Mandarin (简体中文)' },
  { value: 'pl', label: 'Polish (Polski)' },
  { value: 'pt', label: 'Portuguese (Português)' },
  { value: 'ru', label: 'Russian (Русский)' },
  { value: 'es', label: 'Spanish (Español)' },
  { value: 'th', label: 'Thai (ไทย)' },
  { value: 'tr', label: 'Turkish (Türkçe)' },
  { value: 'ur', label: 'Urdu (اردو)' },
  { value: 'vi', label: 'Vietnamese (Tiếng Việt)' },
];

const SelectLanguageRow = ({ 
  label, 
  value, 
  options, 
  onChange, 
  hapticEnabled 
}: { 
  label: string; 
  value: string; 
  options: { label: string; value: string }[]; 
  onChange: (val: string) => void; 
  hapticEnabled: boolean;
}) => {
  return (
    <div className="p-5 flex items-center justify-between relative">
      <div className="flex-1 pr-4">
        <p className="text-[16px] font-medium text-app-text tracking-tight">{label}</p>
      </div>
      <div className="relative flex items-center bg-white/[0.04] border border-white/[0.08] hover:border-white/15 transition-colors rounded-xl px-4 py-2 cursor-pointer">
        <span className="text-[14px] text-app-text font-medium mr-2 max-w-[120px] truncate font-sans">
          {options.find(o => o.value === value)?.label.split(' (')[0] || 'English'}
        </span>
        <Icons.ChevronRight className="w-4 h-4 text-app-text-dim/40 rotate-90 shrink-0" />
        <select 
          value={value}
          onChange={(e) => {
            Haptic.light(hapticEnabled);
            onChange(e.target.value);
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-black text-white py-2">
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

const ElegantSlider = ({ 
  value, 
  onChange, 
  min = 0, 
  max = 100, 
  hapticEnabled,
  themeColor = '#22c55e'
}: { 
  value: number; 
  onChange: (val: number) => void; 
  min?: number; 
  max?: number; 
  hapticEnabled: boolean;
  themeColor?: string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [localVal, setLocalVal] = useState(() => {
    return Math.max(0, Math.min(100, Math.round(value / 10) * 10));
  });
  const lastHapticValueRef = useRef(localVal);

  useEffect(() => {
    const snapped = Math.max(0, Math.min(100, Math.round(value / 10) * 10));
    setLocalVal(snapped);
    if (snapped !== value) {
      onChange(snapped);
    }
  }, [value, onChange]);

  const tick10s = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  const handleTap = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const rawVal = ratio * 100;
    
    // Determine snap based on proximity to multiples of 10 to assist natural finger taps
    const remainder = rawVal % 10;
    let rounded: number;
    if (remainder < 2) {
      // Very close to the lower tick (e.g., 51.5% -> 50%)
      rounded = Math.floor(rawVal / 10) * 10;
    } else if (remainder > 8) {
      // Very close to the next tick (e.g., 58.5% -> 60%)
      rounded = Math.ceil(rawVal / 10) * 10;
    } else {
      // In between -> snap to the previous number (floor)
      rounded = Math.floor(rawVal / 10) * 10;
    }

    rounded = Math.max(0, Math.min(100, rounded));
    
    if (rounded !== localVal) {
      setLocalVal(rounded);
      onChange(rounded);
      if (rounded !== lastHapticValueRef.current) {
        Haptic.light(hapticEnabled);
        lastHapticValueRef.current = rounded;
      }
    }
  };

  const percentage = ((localVal - min) / (max - min)) * 100;

  return (
    <div className="py-2.5 font-sans select-none w-full">
      <div 
        ref={containerRef}
        onClick={(e) => {
          handleTap(e.clientX);
        }}
        className="group relative flex items-center h-6 w-full cursor-pointer"
      >
        {/* Track Line Cylindrical using active green theme color with opacity */}
        <div 
          className="w-full h-[3px] rounded-full relative overflow-visible flex items-center pointer-events-none select-none"
          style={{ backgroundColor: `${themeColor}40` }}
        >
          
          {/* Active Fill with dynamic green status-theme-color! */}
          <div 
            className="absolute left-0 top-0 h-full rounded-full"
            style={{ 
              width: `${percentage}%`,
              backgroundColor: themeColor
            }}
          />

          {/* Small bars (ticks) at every 10% */}
          {tick10s.map((tickVal) => {
            const isSelected = tickVal === localVal;
            const isFilled = tickVal <= localVal;
            const positionPct = tickVal;
            
            let tickBgColor = '';
            if (isSelected) {
              tickBgColor = themeColor; // selected bar color to green
            } else if (isFilled) {
              tickBgColor = 'rgba(255, 255, 255, 0.45)'; // similar to others
            } else {
              tickBgColor = 'rgba(255, 255, 255, 0.15)'; // similar to others
            }

            return (
              <div
                key={tickVal}
                className="absolute w-[3px] rounded-full -translate-x-1/2 top-1/2 -translate-y-1/2"
                style={{ 
                  left: `${positionPct}%`,
                  height: isSelected ? '20px' : '12px',
                  backgroundColor: tickBgColor,
                  zIndex: isSelected ? 10 : 1,
                  boxShadow: isSelected
                    ? `0 0 10px rgba(0,0,0,0.15)`
                    : 'none'
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

const SliderRow = ({ 
  label, 
  value, 
  onToggle, 
  onValueChange, 
  currentValue,
  hapticEnabled,
  lang = 'en',
  themeColor = '#22c55e'
}: { 
  label: string; 
  value: boolean; 
  onToggle: () => void; 
  onValueChange: (val: number) => void;
  currentValue: number;
  hapticEnabled: boolean;
  lang?: string;
  themeColor?: string;
}) => {
  return (
    <div className="flex flex-col">
      <ToggleRow 
        label={label} 
        description={value ? `${currentValue}%` : undefined}
        value={value} 
        onToggle={onToggle} 
        hapticEnabled={hapticEnabled}
        lang={lang}
      />
      <AnimatePresence>
        {value && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 60, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ willChange: "height, opacity" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1.5">
              <ElegantSlider value={currentValue} onChange={onValueChange} hapticEnabled={hapticEnabled} themeColor={themeColor} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SourceCard = ({ 
  title, 
  subtitle, 
  url, 
  hapticEnabled,
  lang = 'en'
}: { 
  title: string; 
  subtitle: string; 
  url: string; 
  hapticEnabled: boolean;
  lang?: string;
}) => {
  const transTitle = useTranslatedText(title, lang);
  const transSubtitle = useTranslatedText(subtitle, lang);
  return (
    <a 
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        Haptic.light(hapticEnabled);
      }}
      className="flex items-center justify-between gap-4 py-5 px-5 active:bg-app-text/[0.04] hover:bg-app-text/[0.01] transition-all duration-200 text-left w-full cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <h4 className="text-[15.5px] font-semibold text-app-text tracking-tight leading-tight">{transTitle}</h4>
        <p className="text-[13px] text-app-text-dim mt-1.5 leading-snug">{transSubtitle}</p>
      </div>
      <div className="w-8 h-8 rounded-full bg-app-text/[0.04] border border-app-border flex items-center justify-center text-app-text-dim active:scale-95 transition-all flex-shrink-0">
        <ArrowUpRight className="w-4 h-4" strokeWidth={1.8} />
      </div>
    </a>
  );
};

interface AboutRowProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  rightElement?: React.ReactNode;
  onClick?: () => void;
  hapticEnabled: boolean;
  lang?: string;
}

const AboutRow = ({ 
  icon: IconComponent, 
  title, 
  subtitle, 
  rightElement, 
  onClick, 
  hapticEnabled,
  lang = 'en'
}: AboutRowProps) => {
  const transTitle = useTranslatedText(title, lang);
  const transSubtitle = useTranslatedText(subtitle, lang);
  const content = (
    <div className="flex items-center gap-4 w-full">
      <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white flex-shrink-0">
        <IconComponent className="w-5 h-5 text-app-text" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-white tracking-tight leading-tight">{transTitle}</p>
        <p className="text-[13px] text-app-text-dim mt-1 leading-snug">{transSubtitle}</p>
      </div>
      {rightElement && <div className="flex-shrink-0 ml-1">{rightElement}</div>}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => {
          Haptic.light(hapticEnabled);
          onClick();
        }}
        className="w-full p-5 flex items-center justify-between text-left active:bg-white/[0.03] transition-colors hover:bg-white/[0.01]"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="w-full p-5 flex items-center justify-between text-left">
      {content}
    </div>
  );
};

const LoopingWeatherIcon = () => {
  const [index, setIndex] = useState(0);
  const icons = ['Sun', 'Cloud', 'CloudLightning', 'CloudRain', 'Moon'];
  
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % icons.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={icons[index]}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <WeatherIcon 
            name={icons[index] as any} 
            className="w-16 h-16 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" 
            style="coloured" 
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const SettingsScreen = ({ 
  settings: globalSettings, 
  onUpdate, 
  onClose, 
  activeWeather, 
  activeLocation, 
  panelStackRef,
  handleBack,
  pushPanel
}: SettingsScreenProps) => {
  const [localSettings, setLocalSettings] = useState(globalSettings);

  const getColorThemeAccent = (colorTheme?: string) => {
    switch (colorTheme) {
      case 'blue': return '#007aff';
      case 'pink': return '#ff2d55';
      case 'purple': return '#af52de';
      case 'teal': return '#00a294';
      case 'amber': return '#ff9500';
      case 'monochrome': return '#000000';
      case 'midnight': return '#ffffff';
      default: return '#22c55e';
    }
  };

  const weatherState = activeWeather ? getCurrentWeatherState(activeWeather) : null;
  const weatherTheme = weatherState ? getWeatherThemeColor(weatherState.weatherCode, weatherState.isDay) : null;
  const themeColor = getColorThemeAccent(localSettings.colorTheme);

  const onUpdateDebouncedRef = useRef<any>(null);
  const latestLocalSettingsRef = useRef(localSettings);
  latestLocalSettingsRef.current = localSettings;

  const flushUpdates = () => {
    if (onUpdateDebouncedRef.current) {
      clearTimeout(onUpdateDebouncedRef.current);
      onUpdateDebouncedRef.current = null;
    }
    setTimeout(() => {
      onUpdate(latestLocalSettingsRef.current);
    }, 0);
  };

  const submitRatingToBackend = async (ratingVal: number) => {
    try {
      const payload: any = {
        rating: ratingVal,
        condition: 'N/A',
        temp: 'N/A',
        feelsLike: 'N/A',
        humidity: 'N/A',
        windSpeed: 'N/A',
        pressure: 'N/A',
        uvIndex: 'N/A',
        aqi: 'N/A',
        location: activeLocation?.name || 'Unknown',
        appVersion: '1.0.0',
        theme: localSettings.theme || 'black',
        timestamp: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(),
        deviceMetadata: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown Browser'
      };

      if (activeWeather && activeWeather.current) {
        const cur = activeWeather.current;
        payload.condition = mapWMOLabel(cur.weatherCode);
        payload.temp = cur.temperature;
        payload.feelsLike = cur.apparentTemperature;
        payload.humidity = cur.relativeHumidity;
        payload.windSpeed = `${cur.windSpeed} km/h`;
        payload.pressure = cur.surfacePressure;
        payload.uvIndex = cur.uvIndex;
        if (activeWeather.airQuality) {
          payload.aqi = activeWeather.airQuality.usAqi;
        }
      }

      await fetch('/api/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Error submitting rating:', error);
    }
  };

  useEffect(() => {
    const hasDiff = Object.keys(globalSettings).some(
      (k) => globalSettings[k as keyof Settings] !== localSettings[k as keyof Settings]
    );
    if (hasDiff) {
      setLocalSettings(globalSettings);
    }
  }, [globalSettings]);

  useEffect(() => {
    return () => {
      if (onUpdateDebouncedRef.current) {
        clearTimeout(onUpdateDebouncedRef.current);
      }
      setTimeout(() => {
        onUpdate(latestLocalSettingsRef.current);
      }, 0);
    };
  }, []);
  const [showDataSources, setShowDataSources] = useState(false);
  const [showTilesCustomisation, setShowTilesCustomisation] = useState(false);
  const [customTileOrder, setCustomTileOrder] = useState<string[]>([]);
  const tileReorderDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fullOrder = localSettings.tileOrder || [
      'rainGraph',
      'forecast',
      'aqi',
      'uv',
      'sunMoon',
      'humidityVisibility',
      'precipitationWind',
      'pollen'
    ];
    const filtered = fullOrder.filter(k => k !== 'rainGraph' && k !== 'forecast');
    // Simple deep equal check to avoid resetting state while dragging
    setCustomTileOrder(prev => {
      if (JSON.stringify(prev) === JSON.stringify(filtered)) return prev;
      return filtered;
    });
  }, [localSettings.tileOrder]);

  useEffect(() => {
    return () => {
      if (tileReorderDebounceRef.current) {
        clearTimeout(tileReorderDebounceRef.current);
      }
    };
  }, []);
  const [activeSubView, setActiveSubView] = useState<'none' | 'legal'>('none');
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy'>('terms');
  const [showAlertPage, setShowAlertPage] = useState(false);
  const [showUnitPage, setShowUnitPage] = useState(false);
  const [showGeneralPage, setShowGeneralPage] = useState(false);
  const [showLanguagePage, setShowLanguagePage] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'registering' | 'synced' | 'error' | 'denied'>('idle');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const mainScrollRef = React.useRef<HTMLDivElement>(null);
  const savedMainScrollPos = React.useRef<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [showRateDialog, setShowRateDialog] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [githubToast, setGithubToast] = useState(false);

  const GITHUB_REPO_URL = "https://github.com/aryannvaidya/overcast";
  const BUG_REPORT_URL = "https://github.com/aryannvaidya/overcast/issues";

  useEffect(() => {
    if (githubToast) {
      const timer = setTimeout(() => {
        setGithubToast(false);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [githubToast]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Track scroll position of the main panel and restore it when returning from subviews
  useEffect(() => {
    const isSubActive = activeSubView !== 'none' || showDataSources || showTilesCustomisation || showAlertPage || showUnitPage || showGeneralPage || showLanguagePage;
    
    if (isSubActive) {
      // User is exiting the main Settings panel into a subview: save position
      if (mainScrollRef.current) {
        savedMainScrollPos.current = mainScrollRef.current.scrollTop;
      }
    } else {
      // User is returning to the main Settings page: restore scroll position
      if (mainScrollRef.current && savedMainScrollPos.current > 0) {
        const restore = () => {
          if (mainScrollRef.current) {
            mainScrollRef.current.scrollTop = savedMainScrollPos.current;
          }
        };
        // Execute immediately and in multiple sequential microtasks to beat browser rendering cycles
        restore();
        requestAnimationFrame(restore);
        const t1 = setTimeout(restore, 20);
        const t2 = setTimeout(restore, 100);
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
        };
      }
    }
  }, [activeSubView, showDataSources, showTilesCustomisation, showAlertPage, showUnitPage, showGeneralPage, showLanguagePage]);

  useEffect(() => {
    const runInit = async () => {
      try {
        const playerId = await initializeOneSignal(async (newId) => {
          if (newId) {
            setLocalSettings(prev => {
              const updated = { ...prev, oneSignalPlayerId: newId };
              onUpdate(updated);
              // Push local master settings up to Firebase (never block UI)
              syncUserSettingsToFirebase(newId, updated, activeLocation || null)
                .catch(err => console.warn(err));
              return updated;
            });
            setPushStatus('synced');
          }
        });

        if (playerId) {
          setLocalSettings(prev => {
            const updated = { ...prev, oneSignalPlayerId: playerId };
            onUpdate(updated);
            // Push local master settings up to Firebase
            syncUserSettingsToFirebase(playerId, updated, activeLocation || null)
              .catch(err => console.warn(err));
            return updated;
          });
          setPushStatus('synced');
        }
      } catch (err) {
        console.warn('OneSignal initialization failed:', err);
      }
    };
    runInit();
  }, []);

  const handlePushToggle = async () => {
    if (localSettings.pushEnabled) {
      const updated = { ...localSettings, pushEnabled: false };
      setLocalSettings(updated);
      onUpdate(updated);
      setPushStatus('idle');
      await wirePushToggle(false, showToast);

      if (localSettings.oneSignalPlayerId) {
        syncUserSettingsToFirebase(localSettings.oneSignalPlayerId, updated, activeLocation || null)
          .catch(err => console.warn(err));
      }
    } else {
      // Toggle instantly in the UI with synced status to keep transition super snappy
      setPushStatus('synced');
      const updated = { ...localSettings, pushEnabled: true };
      setLocalSettings(updated);
      onUpdate(updated);
      await wirePushToggle(true, showToast);

      // Request permission asynchronously behind the scenes without blocking UI
      try {
        requestNotificationPermission().then((playerId) => {
          if (playerId) {
            const finalUpdated = { ...updated, oneSignalPlayerId: playerId };
            setLocalSettings(finalUpdated);
            onUpdate(finalUpdated);
            syncUserSettingsToFirebase(playerId, finalUpdated, activeLocation || null)
              .catch(err => console.warn(err));

            if (activeLocation) {
              sendSmartWelcomeNotification(activeLocation.name, activeWeather);
            }
          }
        }).catch((e) => {
          console.warn('Silent permission query failed:', e);
        });
      } catch (err) {
        console.warn('Async notification handle error:', err);
      }
    }
  };

  const currentTiles = {
    aqi: true,
    uv: true,
    humidity: true,
    visibility: true,
    precipitation: true,
    wind: true,
    forecast: true,
    sunMoon: true,
    rainGraph: true,
    pollen: true,
    ...(localSettings.enabledTiles || {})
  };

  const handleToggleTile = (key: keyof Required<Settings>['enabledTiles']) => {
    Haptic.medium(localSettings.hapticEnabled);
    const updatedTiles = {
      ...currentTiles,
      [key]: !currentTiles[key]
    };
    updateSetting('enabledTiles', updatedTiles);
  };

  const currentLangCode = (localSettings.language || "en").toLowerCase().slice(0, 2);

  const subViews = {
    legal: {
      title: "Terms & Privacy",
      termsContent: termsPrivacyTranslations[currentLangCode]?.terms || TERMS_CONTENT,
      privacyContent: termsPrivacyTranslations[currentLangCode]?.privacy || PRIVACY_CONTENT
    }
  };

  const { translated: translatedSubViewTitle } = useTranslation(
    activeSubView === 'legal' ? subViews.legal.title : "",
    localSettings.language || "en"
  );

  const { translated: translatedSubViewContent, loading: isTranslating } = useTranslation(
    activeSubView === 'legal' ? (legalTab === 'terms' ? subViews.legal.termsContent : subViews.legal.privacyContent) : "",
    localSettings.language || "en"
  );

  useEffect(() => {
    if (showDataSources || showTilesCustomisation || activeSubView !== 'none' || showAlertPage || showUnitPage || showGeneralPage || showLanguagePage) {
      const resetScroll = () => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = 0;
          scrollRef.current.scrollLeft = 0;
        }
        window.scrollTo(0, 0);
        
        // Direct DOM access to ensure absolute top-alignment
        const pages = ["sources-page", "tiles-page", "subview-page", "alerts-page", "units-page", "general-page", "language-page"];
        pages.forEach(p => {
          const el = document.getElementById(p);
          if (el) {
            el.scrollTop = 0;
            el.scrollLeft = 0;
          }
        });
      };

      // Execute across multiple animation cycles to defeat browsers dynamic scroll restoration
      resetScroll();
      requestAnimationFrame(resetScroll);
      const t1 = setTimeout(resetScroll, 50);
      const t2 = setTimeout(resetScroll, 120);
      const t3 = setTimeout(resetScroll, 280);
      
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [showDataSources, showTilesCustomisation, activeSubView, showAlertPage, showUnitPage, showGeneralPage, showLanguagePage]);

  // pushPanel and handleBack passed down from parent to maintain unified browser state

  useEffect(() => {
    const handleSwipeLeft = () => {
      if (showDataSources || showTilesCustomisation || activeSubView !== 'none' || showAlertPage || showUnitPage || showGeneralPage || showLanguagePage) return;
      // Increase thresholds
      Haptic.medium(localSettings.hapticEnabled);
      const newRain = Math.min(100, localSettings.rainThreshold + 10);
      const newSnow = Math.min(100, localSettings.snowThreshold + 10);
      const updated = { ...localSettings, rainThreshold: newRain, snowThreshold: newSnow };
      setLocalSettings(updated);
      
      if (onUpdateDebouncedRef.current) {
        clearTimeout(onUpdateDebouncedRef.current);
      }
      onUpdateDebouncedRef.current = setTimeout(() => {
        onUpdate(updated);
      }, 200);
    };

    const handleSwipeRight = () => {
      if (showDataSources || showTilesCustomisation || activeSubView !== 'none' || showAlertPage || showUnitPage || showGeneralPage || showLanguagePage) return;
      // Decrease thresholds
      Haptic.medium(localSettings.hapticEnabled);
      const newRain = Math.max(0, localSettings.rainThreshold - 10);
      const newSnow = Math.max(0, localSettings.snowThreshold - 10);
      const updated = { ...localSettings, rainThreshold: newRain, snowThreshold: newSnow };
      setLocalSettings(updated);

      if (onUpdateDebouncedRef.current) {
        clearTimeout(onUpdateDebouncedRef.current);
      }
      onUpdateDebouncedRef.current = setTimeout(() => {
        onUpdate(updated);
      }, 200);
    };

    window.addEventListener('swipe-left', handleSwipeLeft);
    window.addEventListener('swipe-right', handleSwipeRight);
    return () => {
      window.removeEventListener('swipe-left', handleSwipeLeft);
      window.removeEventListener('swipe-right', handleSwipeRight);
    };
  }, [localSettings, showDataSources, showTilesCustomisation, activeSubView, showAlertPage, showUnitPage, showGeneralPage, showLanguagePage, onUpdate]);

  const updateSetting = <T extends keyof Settings>(key: T, value: Settings[T]) => {
    Haptic.light(localSettings.hapticEnabled);
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    
    if (onUpdateDebouncedRef.current) {
      clearTimeout(onUpdateDebouncedRef.current);
    }
    onUpdateDebouncedRef.current = setTimeout(() => {
      onUpdate(newSettings);
    }, 200);

    // Schedule side effects on the next tick so the UI update is fully synchronous & lag-free
    setTimeout(() => {
      const runSideEffects = async () => {
        try {
          if (key === 'pushEnabled') {
            await wirePushToggle(value as boolean, showToast);
          } else if (key === 'alertMorningSummary') {
            await wireMorningToggle(value as boolean, showToast);
          } else if (key === 'alertNightSummary') {
            await wireNightToggle(value as boolean, showToast);
          } else if (key === 'alertRain') {
            wireThresholdToggle('rain', value as boolean, showToast);
          } else if (key === 'alertDaily') {
            wireThresholdToggle('snow', value as boolean, showToast);
          } else if (key === 'stormThreshold') {
            wireThresholdToggle('storm', value as boolean, showToast);
          } else if (key === 'alertSevere') {
            wireThresholdToggle('severe', value as boolean, showToast);
          }

          if (newSettings.pushEnabled && newSettings.oneSignalPlayerId) {
            syncUserSettingsToFirebase(newSettings.oneSignalPlayerId, newSettings, activeLocation || null)
              .catch(err => console.warn("Failed to sync user settings asynchronously:", err));
          }
        } catch (error) {
          console.warn("Error running async setting side-effect:", error);
        }
      };
      runSideEffects();
    }, 0);
  };

  const moveTile = (index: number, direction: 'up' | 'down') => {
    Haptic.medium(localSettings.hapticEnabled);
    const order = localSettings.tileOrder || [
      'rainGraph',
      'forecast',
      'aqi',
      'uv',
      'sunMoon',
      'humidityVisibility',
      'precipitationWind',
      'pollen'
    ];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= order.length) return;
    
    const updated = [...order];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;
    
    updateSetting('tileOrder', updated);
  };



  return (
    <>
      <AnimatePresence mode="sync">
        <motion.div 
          key="settings-main-panel"
          ref={mainScrollRef}
          initial={{ opacity: 1, x: 0 }}
          style={{
            pointerEvents: (activeSubView !== 'none' || showDataSources || showTilesCustomisation || showAlertPage || showUnitPage || showGeneralPage) ? 'none' : 'auto'
          }}
          className={cn(
            "absolute inset-0 z-[1005] bg-transparent overflow-y-auto overscroll-contain gpu settings-panel touch-pan-y",
            (activeSubView !== 'none' || showDataSources || showTilesCustomisation || showAlertPage || showUnitPage || showGeneralPage) ? "pointer-events-none" : "pointer-events-auto"
          )}
          animate={{ 
            opacity: (activeSubView !== 'none' || showDataSources || showTilesCustomisation || showAlertPage || showUnitPage || showGeneralPage) ? 0 : 1,
            x: (activeSubView !== 'none' || showDataSources || showTilesCustomisation || showAlertPage || showUnitPage || showGeneralPage) ? -15 : 0,
          }}
          exit={{ opacity: 1 }}
          transition={{ 
            duration: 0.3, 
            ease: [0.25, 0.46, 0.45, 0.94]
          }}
          data-no-swipe
        >
          <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-[calc(env(safe-area-inset-top,24px)+56px)] pb-24">
            {/* Redesigned Header: Title on left, circular back button on right */}
            <header className="flex items-center justify-between mb-8 px-1 w-full">
              <h1 className="text-[28px] font-bold text-white tracking-tight font-sans">
                <Translate text="Settings" lang={localSettings.language} />
              </h1>
              <button
                onClick={() => {
                  Haptic.light(localSettings.hapticEnabled);
                  flushUpdates();
                  onClose();
                }}
                className="w-12 h-12 bg-app-surface border border-app-border backdrop-blur-md flex items-center justify-center rounded-full hover:bg-app-surface/80 transition-all shadow-xl select-none cursor-pointer"
              >
                <Icons.ChevronLeft className="w-5.5 h-5.5 text-app-text" strokeWidth={2.5} />
              </button>
            </header>

            {/* Group 1: Push Toggle & General subpage */}
            <div className="w-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md rounded-[24px] divide-y divide-white/[0.06] mb-5 overflow-hidden">
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-3.5 pr-4">
                  <Bell className="w-5 h-5 text-white/50 shrink-0" strokeWidth={1.8} />
                  <div>
                    <p className="text-[15px] font-medium text-white tracking-tight font-sans">
                      <Translate text="Push notifications" lang={localSettings.language} />
                    </p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={handlePushToggle}
                  className={cn(
                    "toggle w-[51px] h-[31px] rounded-full transition-all duration-300 relative focus:outline-none focus:ring-0",
                    localSettings.pushEnabled ? "bg-emerald-500" : "bg-white/20"
                  )}
                >
                  <div 
                    className={cn(
                      "absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full shadow-md transition-all duration-250 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] will-change-transform bg-white",
                      localSettings.pushEnabled ? "translate-x-[20px]" : "translate-x-0"
                    )} 
                  />
                </button>
              </div>

              <button 
                onClick={() => {
                  Haptic.medium(localSettings.hapticEnabled);
                  setShowGeneralPage(true);
                  pushPanel(() => setShowGeneralPage(false), 'general_settings');
                }}
                className="w-full p-5 flex items-center justify-between text-left active:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <Eye className="w-5 h-5 text-white/50" strokeWidth={1.8} />
                  <p className="text-[15px] font-medium text-white tracking-tight font-sans">
                    <Translate text="Appearance" lang={localSettings.language} />
                  </p>
                </div>
                <Icons.ChevronRight className="w-4 h-4 text-white/15" />
              </button>

              <button 
                onClick={() => {
                  Haptic.medium(localSettings.hapticEnabled);
                  // Use history.pushState so a single back swipe returns to main page
                  window.history.pushState({ page: 'widget' }, '', '/widget');
                  // Force App re-render by firing a popstate-like event
                  window.dispatchEvent(new PopStateEvent('popstate', { state: { page: 'widget' } }));
                }}
                className="w-full p-5 flex items-center justify-between text-left active:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <LayoutGrid className="w-5 h-5 text-white/50" strokeWidth={1.8} />
                  <p className="text-[15px] font-medium text-white tracking-tight font-sans">
                    <Translate text="Widget Center" lang={localSettings.language} />
                  </p>
                </div>
                <Icons.ChevronRight className="w-4 h-4 text-white/15" />
              </button>
            </div>

            {/* Group 2: Units & Alerts & thresholds subpages */}
            <div className="w-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md rounded-[24px] divide-y divide-white/[0.06] mb-5 overflow-hidden">
              <button 
                onClick={() => {
                  Haptic.medium(localSettings.hapticEnabled);
                  setShowUnitPage(true);
                  pushPanel(() => setShowUnitPage(false), 'unit_settings');
                }}
                className="w-full p-5 flex items-center justify-between text-left active:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <Activity className="w-5 h-5 text-white/50" strokeWidth={1.8} />
                  <p className="text-[15px] font-medium text-white tracking-tight font-sans">
                    <Translate text="Measurement units" lang={localSettings.language} />
                  </p>
                </div>
                <Icons.ChevronRight className="w-4 h-4 text-white/15" />
              </button>

              <button 
                onClick={() => {
                  Haptic.medium(localSettings.hapticEnabled);
                  setShowAlertPage(true);
                  pushPanel(() => setShowAlertPage(false), 'alert_settings');
                }}
                className="w-full p-5 flex items-center justify-between text-left active:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <ShieldCheck className="w-5 h-5 text-white/50" strokeWidth={1.8} />
                  <p className="text-[15px] font-medium text-white tracking-tight font-sans">
                    <Translate text="Alerts & thresholds" lang={localSettings.language} />
                  </p>
                </div>
                <Icons.ChevronRight className="w-4 h-4 text-white/15" />
              </button>
            </div>

            {/* Group 3: Data Source, Rate, T&C, Privacy, Report Bug */}
            <div className="w-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md rounded-[24px] divide-y divide-white/[0.06] mb-6 overflow-hidden">
              <button 
                onClick={() => {
                  Haptic.medium(localSettings.hapticEnabled);
                  setShowDataSources(true);
                  pushPanel(() => setShowDataSources(false), 'data_sources');
                }}
                className="w-full p-5 flex items-center justify-between text-left active:bg-white/[0.03] transition-all hover:bg-white/[0.01]"
              >
                <div className="flex items-center gap-3.5">
                  <HelpCircle className="w-5 h-5 text-white/50" strokeWidth={1.8} />
                  <p className="text-[15px] font-medium text-white tracking-tight font-sans">
                    <Translate text="Sources" lang={localSettings.language} />
                  </p>
                </div>
                <Icons.ChevronRight className="w-4 h-4 text-white/15" />
              </button>

              <button 
                onClick={() => {
                  Haptic.medium(localSettings.hapticEnabled);
                  setShowRateDialog(true);
                }}
                className="w-full p-5 flex items-center justify-between text-left active:bg-white/[0.03] transition-all hover:bg-white/[0.01]"
              >
                <div className="flex items-center gap-3.5">
                  <Star className="w-5 h-5 text-white/50" strokeWidth={1.8} />
                  <p className="text-[15px] font-medium text-white tracking-tight font-sans">
                    <Translate text="Rate this app" lang={localSettings.language} />
                  </p>
                </div>
                <Icons.ChevronRight className="w-4 h-4 text-white/15" />
              </button>

              <button 
                onClick={() => {
                  Haptic.medium(localSettings.hapticEnabled);
                  setLegalTab('terms');
                  setActiveSubView('legal');
                  pushPanel(() => setActiveSubView('none'), 'legal');
                }}
                className="w-full p-5 flex items-center justify-between text-left active:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <FileText className="w-5 h-5 text-white/50" strokeWidth={1.8} />
                  <p className="text-[15px] font-medium text-white tracking-tight font-sans">
                    <Translate text="Terms & Privacy" lang={localSettings.language} />
                  </p>
                </div>
                <Icons.ChevronRight className="w-4 h-4 text-white/15" />
              </button>

              <a 
                href={BUG_REPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  Haptic.medium(localSettings.hapticEnabled);
                }}
                className="w-full p-5 flex items-center justify-between text-left active:bg-white/[0.03] transition-colors"
                style={{ display: 'flex' }}
              >
                <div className="flex items-center gap-3.5">
                  <Bug className="w-5 h-5 text-white/50" strokeWidth={1.8} />
                  <p className="text-[15px] font-medium text-white tracking-tight font-sans">
                    <Translate text="Report Bug" lang={localSettings.language} />
                  </p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-white/15" />
              </a>
            </div>
          </div>
        </motion.div>

        {showDataSources && (
          <motion.div 
            key="settings-data-sources-panel"
            ref={scrollRef}
            id="sources-page"
            data-no-swipe
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ willChange: "transform" }}
            className="fixed inset-0 z-[1010] bg-app-bg/90 backdrop-blur-3xl overflow-y-auto overscroll-contain sources-page touch-pan-y"
          >
            <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-[calc(env(safe-area-inset-top,24px)+56px)] pb-32">
              <header className="flex items-center justify-between mb-8 px-1 h-10 w-full">
                <h1 className="text-[28px] font-bold text-app-text tracking-tight animate-fade-in">
                  <Translate text="Sources" lang={localSettings.language} />
                </h1>
                <motion.button 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  onClick={() => {
                    Haptic.light(localSettings.hapticEnabled);
                    setShowDataSources(false);
                    handleBack();
                  }}
                  className="w-12 h-12 bg-app-surface border border-app-border backdrop-blur-md rounded-full flex items-center justify-center text-app-text hover:bg-app-surface/80 transition-all shadow-xl select-none"
                >
                  <Icons.ChevronLeft className="w-5.5 h-5.5 text-app-text" strokeWidth={2.5} />
                </motion.button>
              </header>

              <div className="flex flex-col items-center px-0 w-full">
                 <div className="w-full bg-app-surface border border-app-border rounded-[24px] divide-y divide-app-border mb-10 overflow-hidden font-sans shadow-2xl">
                    <SourceCard 
                      title="Open-Meteo" 
                      subtitle="High-resolution global weather forecasts, hourly UV Index modeling, and local temperature projections." 
                      url="https://open-meteo.com/" 
                      hapticEnabled={localSettings.hapticEnabled} 
                    />
                    <SourceCard 
                      title="WAQI (AQI)" 
                      subtitle="Real-time, hyper-local PM2.5, PM10, and ozone monitoring from official stations globally." 
                      url="https://waqi.info/" 
                      hapticEnabled={localSettings.hapticEnabled} 
                    />
                    <SourceCard 
                      title="Windy.com" 
                      subtitle="Interactive composite weather radar mapping tiles, wind vectors, and meteorological modeling visualizations." 
                      url="https://www.windy.com/" 
                      hapticEnabled={localSettings.hapticEnabled} 
                    />
                    <SourceCard 
                      title="OpenStreetMap" 
                      subtitle="Precise device reverse coordinate translation to match human-readable city labels." 
                      url="https://www.openstreetmap.org/" 
                      hapticEnabled={localSettings.hapticEnabled} 
                    />
                 </div>
              </div>
              
              {/* Footer */}
              <div className="flex flex-col items-center justify-center pt-8 pb-4 text-center w-full">
                <p className="text-[12px] font-semibold text-app-text-dim opacity-40 tracking-tight">&copy; 2026 Overcast</p>
              </div>
            </div>
          </motion.div>
        )}

        {showTilesCustomisation && (
          <motion.div 
            key="settings-tiles-customisation-panel"
            ref={scrollRef}
            id="tiles-page"
            data-no-swipe
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ willChange: "transform" }}
            className="fixed inset-0 z-[1015] bg-app-bg backdrop-blur-3xl overflow-y-auto overscroll-contain tiles-page touch-pan-y"
          >
            <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-[calc(env(safe-area-inset-top,24px)+56px)] pb-32">
              <header className="flex items-center justify-between mb-8 px-1 w-full font-sans">
                <h1 className="text-[28px] font-bold text-white tracking-tight">
                  <Translate text="Tiles" lang={localSettings.language || 'en'} />
                </h1>
                <button
                  onClick={() => {
                    Haptic.light(localSettings.hapticEnabled);
                    handleBack();
                  }}
                  className="w-12 h-12 bg-app-surface border border-app-border backdrop-blur-md flex items-center justify-center rounded-full hover:bg-app-surface/80 transition-all shadow-xl select-none cursor-pointer"
                >
                  <Icons.ChevronLeft className="w-5.5 h-5.5 text-app-text" strokeWidth={2.5} />
                </button>
              </header>

              <Section title="Active Weather Cards" lang={localSettings.language}>
                <ToggleRow 
                  label="Upcoming Rain Graph" 
                  description="Graph displaying upcoming rain predictions over next 6 hours"
                  value={currentTiles.rainGraph !== false} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => handleToggleTile('rainGraph')} 
                  lang={localSettings.language}
                />
                <ToggleRow 
                  label="Air Quality (AQI)" 
                  description="Air Quality Index & station details"
                  value={!!currentTiles.aqi} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => handleToggleTile('aqi')} 
                  lang={localSettings.language}
                />
                <ToggleRow 
                  label="UV Index" 
                  description="Solar radiation and exposure levels"
                  value={!!currentTiles.uv} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => handleToggleTile('uv')} 
                  lang={localSettings.language}
                />
                <ToggleRow 
                  label="7-Day Forecast" 
                  description="Future meteorological trend projections"
                  value={currentTiles.forecast !== false} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => handleToggleTile('forecast')} 
                  lang={localSettings.language}
                />
                <ToggleRow 
                  label="Sun & Moon Path" 
                  description="Solar & lunar altitude and transit lines"
                  value={currentTiles.sunMoon !== false} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => handleToggleTile('sunMoon')} 
                  lang={localSettings.language}
                />
                <ToggleRow 
                  label="Humidity" 
                  description="Relative humidity percentage"
                  value={!!currentTiles.humidity} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => handleToggleTile('humidity')} 
                  lang={localSettings.language}
                />
                <ToggleRow 
                  label="Visibility" 
                  description="Horizontal visibility distance"
                  value={!!currentTiles.visibility} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => handleToggleTile('visibility')} 
                  lang={localSettings.language}
                />
                <ToggleRow 
                  label="Precipitation" 
                  description="Expected rain/snow accumulation"
                  value={!!currentTiles.precipitation} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => handleToggleTile('precipitation')} 
                  lang={localSettings.language}
                />
                <ToggleRow 
                  label="Wind Speed" 
                  description="Wind speed and direction details"
                  value={!!currentTiles.wind} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => handleToggleTile('wind')} 
                  lang={localSettings.language}
                />
                <ToggleRow 
                  label="Pollen Count" 
                  description="Estimated tree, grass, and weed allergen levels"
                  value={currentTiles.pollen !== false} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => handleToggleTile('pollen')} 
                  lang={localSettings.language}
                />
              </Section>

              {(() => {
                const tileLabels: Record<string, { label: string; desc: string; icon: React.ReactNode }> = {
                  aqi: {
                    label: "Air Quality (AQI)",
                    desc: "AQI & safety health advice",
                    icon: <Activity className="w-4.5 h-4.5 text-white/70" />
                  },
                  uv: {
                    label: "UV Index",
                    desc: "Daily solar UV radiation index",
                    icon: <Sun className="w-4.5 h-4.5 text-white/70" />
                  },
                  sunMoon: {
                    label: "Sun & Moon Path",
                    desc: "Solar  altitude transit lines",
                    icon: <Moon className="w-4.5 h-4.5 text-white/70" />
                  },
                  humidityVisibility: {
                    label: "Humidity & Visibility",
                    desc: "Atmospheric moisture & sight lines",
                    icon: <Eye className="w-4.5 h-4.5 text-white/70" />
                  },
                  precipitationWind: {
                    label: "Precipitation & Wind",
                    desc: "Rain volume & wind speed gauge",
                    icon: <Wind className="w-4.5 h-4.5 text-white/70" />
                  },
                  pollen: {
                    label: "Pollen Count",
                    desc: "Active tree, weed & grass pollen levels",
                    icon: <Compass className="w-4.5 h-4.5 text-white/70" />
                  }
                };

                return (
                  <Section title="Tile Position Adjustment" lang={localSettings.language}>
                    <Reorder.Group
                      axis="y"
                      values={customTileOrder}
                      onReorder={(newOrder) => {
                        setCustomTileOrder(newOrder);
                        Haptic.light(localSettings.hapticEnabled);
                        if (tileReorderDebounceRef.current) {
                          clearTimeout(tileReorderDebounceRef.current);
                        }
                        tileReorderDebounceRef.current = setTimeout(() => {
                          updateSetting('tileOrder', ['rainGraph', 'forecast', ...newOrder]);
                        }, 300);
                      }}
                      className="flex flex-col bg-white/[0.04] backdrop-blur-md border border-white/[0.08] rounded-[24px] overflow-hidden select-none"
                    >
                      {customTileOrder.map((key) => {
                        const tile = tileLabels[key];
                        if (!tile) return null;
                        return (
                          <Reorder.Item
                            key={key}
                            value={key}
                            className="flex items-center justify-between px-5 py-4.5 border-b border-white/[0.06] last:border-b-0 cursor-grab active:cursor-grabbing hover:bg-white/[0.01] active:bg-white/[0.03] transition-colors bg-transparent"
                          >
                            <div className="flex items-center gap-3.5">
                              <div className="w-8.5 h-8.5 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                                {tile.icon}
                              </div>
                              <div className="flex flex-col leading-tight">
                                <span className="text-[15px] font-medium text-white tracking-tight">
                                  <Translate text={tile.label} lang={localSettings.language || 'en'} />
                                </span>
                                <span className="text-[12px] text-white/45 font-light mt-0.5 leading-tight pr-2">
                                  <Translate text={tile.desc} lang={localSettings.language || 'en'} />
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-center w-[30px] h-[30px] shrink-0 text-white/30 hover:text-white/60 transition-colors pointer-events-none">
                              <GripVertical className="w-4.5 h-4.5" strokeWidth={1.5} />
                            </div>
                          </Reorder.Item>
                        );
                      })}
                    </Reorder.Group>
                  </Section>
                );
              })()}
            </div>
          </motion.div>
        )}

        {showAlertPage && (
          <motion.div 
            key="settings-alerts-panel"
            ref={scrollRef}
            id="alerts-page"
            data-no-swipe
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ willChange: "transform" }}
            className="fixed inset-0 z-[1010] bg-app-bg backdrop-blur-3xl overflow-y-auto overscroll-contain alerts-page touch-pan-y"
          >
            <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-[calc(env(safe-area-inset-top,24px)+56px)] pb-32">
              <header className="flex items-center justify-between mb-8 px-1 w-full font-sans">
                <h1 className="text-[28px] font-bold text-white tracking-tight">
                  <Translate text="Alerts" lang={localSettings.language} />
                </h1>
                <button
                  onClick={() => {
                    Haptic.light(localSettings.hapticEnabled);
                    setShowAlertPage(false);
                    handleBack();
                  }}
                  className="w-12 h-12 bg-app-surface border border-app-border backdrop-blur-md flex items-center justify-center rounded-full hover:bg-app-surface/80 transition-all shadow-xl select-none cursor-pointer"
                >
                  <Icons.ChevronLeft className="w-5.5 h-5.5 text-app-text" strokeWidth={2.5} />
                </button>
              </header>

              <Section title="Alert Preferences" lang={localSettings.language}>
                <ToggleRow 
                  label="Morning weather summary" 
                  value={localSettings.alertMorningSummary} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => updateSetting('alertMorningSummary', !localSettings.alertMorningSummary)} 
                  lang={localSettings.language}
                />
                <ToggleRow 
                  label="Night weather summary" 
                  value={localSettings.alertNightSummary} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => updateSetting('alertNightSummary', !localSettings.alertNightSummary)} 
                  lang={localSettings.language}
                />
              </Section>

              <Section title="Threshold Triggers" lang={localSettings.language}>
                <SliderRow 
                  label="Rain threshold" 
                  value={localSettings.alertRain} 
                  currentValue={localSettings.rainThreshold}
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => updateSetting('alertRain', !localSettings.alertRain)} 
                  onValueChange={(val) => updateSetting('rainThreshold', val)}
                  lang={localSettings.language}
                  themeColor={themeColor}
                />
                <SliderRow 
                  label="Snow threshold" 
                  value={localSettings.alertDaily} 
                  currentValue={localSettings.snowThreshold}
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => updateSetting('alertDaily', !localSettings.alertDaily)} 
                  onValueChange={(val) => updateSetting('snowThreshold', val)}
                  lang={localSettings.language}
                  themeColor={themeColor}
                />
                <ToggleRow 
                  label="Thunderstorm alerts" 
                  value={localSettings.stormThreshold} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => updateSetting('stormThreshold', !localSettings.stormThreshold)} 
                  lang={localSettings.language}
                />
                <ToggleRow 
                  label="Severe weather alerts" 
                  value={localSettings.alertSevere} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => updateSetting('alertSevere', !localSettings.alertSevere)} 
                  lang={localSettings.language}
                />
              </Section>
            </div>
          </motion.div>
        )}

        {showUnitPage && (
          <motion.div 
            key="settings-units-panel"
            ref={scrollRef}
            id="units-page"
            data-no-swipe
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ willChange: "transform" }}
            className="fixed inset-0 z-[1010] bg-app-bg backdrop-blur-3xl overflow-y-auto overscroll-contain units-page touch-pan-y"
          >
            <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-[calc(env(safe-area-inset-top,24px)+56px)] pb-32">
              <header className="flex items-center justify-between mb-8 px-1 w-full font-sans">
                <h1 className="text-[28px] font-bold text-white tracking-tight">
                  <Translate text="Units" lang={localSettings.language} />
                </h1>
                <button
                  onClick={() => {
                    Haptic.light(localSettings.hapticEnabled);
                    setShowUnitPage(false);
                    handleBack();
                  }}
                  className="w-12 h-12 bg-app-surface border border-app-border backdrop-blur-md flex items-center justify-center rounded-full hover:bg-app-surface/80 transition-all shadow-xl select-none cursor-pointer"
                >
                  <Icons.ChevronLeft className="w-5.5 h-5.5 text-app-text" strokeWidth={2.5} />
                </button>
              </header>

              <Section title="Selected Units" lang={localSettings.language}>
                <SelectRow 
                  label="Temperature" 
                  value={localSettings.unitTemp} 
                  hapticEnabled={localSettings.hapticEnabled}
                  options={[
                    { label: '°C', value: 'C' },
                    { label: '°F', value: 'F' }
                  ]}
                  onChange={(val) => updateSetting('unitTemp', val)}
                  lang={localSettings.language}
                />
                <SelectRow 
                  label="Wind" 
                  value={localSettings.unitWind} 
                  hapticEnabled={localSettings.hapticEnabled}
                  options={[
                    { label: 'km/h', value: 'km/h' },
                    { label: 'mph', value: 'mph' },
                    { label: 'm/s', value: 'm/s' }
                  ]}
                  onChange={(val) => updateSetting('unitWind', val)}
                  lang={localSettings.language}
                />
                <SelectRow 
                  label="Visibility" 
                  value={localSettings.unitVisibility} 
                  hapticEnabled={localSettings.hapticEnabled}
                  options={[
                    { label: 'km', value: 'km' },
                    { label: 'mi', value: 'miles' }
                  ]}
                  onChange={(val) => updateSetting('unitVisibility', val)}
                  lang={localSettings.language}
                />
                <SelectRow 
                  label="Time Format" 
                  value={localSettings.timeFormat === '24h' ? '24h' : '12h'} 
                  hapticEnabled={localSettings.hapticEnabled}
                  options={[
                    { label: '12-hour', value: '12h' },
                    { label: '24-hour', value: '24h' }
                  ]}
                  onChange={(val) => updateSetting('timeFormat', val)}
                  lang={localSettings.language}
                />
              </Section>
            </div>
          </motion.div>
        )}

        {showGeneralPage && (
          <motion.div 
            key="settings-general-panel"
            ref={scrollRef}
            id="general-page"
            data-no-swipe
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ willChange: "transform" }}
            className="fixed inset-0 z-[1010] bg-app-bg backdrop-blur-3xl overflow-y-auto overscroll-contain general-page touch-pan-y"
          >
            <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-[calc(env(safe-area-inset-top,24px)+56px)] pb-32">
              <header className="flex flex-col mb-8 px-1 w-full font-sans">
                <div className="flex items-center justify-between w-full mb-1">
                  <h1 className="text-[28px] font-bold text-white tracking-tight leading-none">
                    <Translate text="Appearance" lang={localSettings.language} />
                  </h1>
                  <button
                    onClick={() => {
                      Haptic.light(localSettings.hapticEnabled);
                      setShowGeneralPage(false);
                      handleBack();
                    }}
                    className="w-12 h-12 bg-app-surface border border-app-border backdrop-blur-md flex items-center justify-center rounded-full hover:bg-app-surface/80 transition-all shadow-xl select-none cursor-pointer shrink-0"
                  >
                    <Icons.ChevronLeft className="w-5.5 h-5.5 text-app-text" strokeWidth={2.5} />
                  </button>
                </div>
                <p className="text-[14px] text-white/55 font-sans font-medium">
                  <Translate text="Choose the look that fits your vibe." lang={localSettings.language} />
                </p>
              </header>

              {/* Card: Theme Color Preset */}
              <div className="mb-5 font-sans">
                <h3 className="text-[11px] font-semibold tracking-[0.1em] text-white/45 uppercase mb-3 px-1">
                  <Translate text="Appearance" lang={localSettings.language || 'en'} />
                </h3>

                {/* Selection Circle Grid */}
                <div className="p-5 w-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md rounded-[24px] overflow-hidden">
                  <div className="grid grid-cols-4 gap-x-2 gap-y-6 py-2">
                    {[
                      { id: 'monochrome' as const, label: 'White', color: '#ffffff' },
                      { id: 'blue' as const, label: 'Sky Blue', color: '#A6CFFF' },
                      { id: 'midnight' as const, label: 'Midnight', color: '#121C2C' },
                      { id: 'green' as const, label: 'Forest', color: '#2E5A44' },
                      { id: 'purple' as const, label: 'Lavender', color: '#B19FF1' },
                      { id: 'amber' as const, label: 'Sunset', color: '#FEA150' },
                      { id: 'teal' as const, label: 'Sepia', color: '#E1D2BE' },
                      { id: 'pink' as const, label: 'AMOLED', color: '#000000' },
                    ].map((themeOpt) => {
                      const isSelected = (localSettings.colorTheme || 'green') === themeOpt.id;
                      return (
                        <div key={themeOpt.id} className="flex flex-col items-center gap-1.5 focus:outline-none">
                          <div 
                            className={cn(
                              "w-[62px] h-[62px] rounded-full flex items-center justify-center transition-all duration-300",
                              isSelected 
                                ? "border-2 border-[#1E90FF] bg-transparent" 
                                : "border-2 border-transparent"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                Haptic.medium(localSettings.hapticEnabled);
                                updateSetting('colorTheme', themeOpt.id);
                              }}
                              className={cn(
                                "w-12 h-12 rounded-full border transition-transform duration-200 active:scale-90 cursor-pointer select-none",
                                themeOpt.id === 'monochrome' 
                                  ? "border-neutral-200" 
                                  : "border-transparent"
                              )}
                              style={{ backgroundColor: themeOpt.color }}
                              title={themeOpt.label}
                            />
                          </div>
                          <span className="text-[11px] font-sans font-medium text-white/70 text-center tracking-tight truncate max-w-[70px]">
                            <Translate text={themeOpt.label} lang={localSettings.language} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Group 1: Icon Style */}
              <div className="w-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md rounded-[24px] divide-y divide-white/[0.06] mb-5 overflow-hidden">
                <SelectRow 
                  label="Icon Style" 
                  value={localSettings.iconStyle || 'outline'} 
                  hapticEnabled={localSettings.hapticEnabled}
                  options={[
                    { 
                      label: (
                        <div className="flex items-center justify-center w-full h-[36px] overflow-visible">
                          <WeatherIcon 
                            name="Sun" 
                            style="outline" 
                            className={cn(
                              "w-[30px] h-[30px] transition-colors duration-200", 
                              (localSettings.iconStyle || 'outline') === 'outline' ? "text-black animate-none" : "text-white/50 animate-none"
                            )} 
                          />
                        </div>
                      ), 
                      value: 'outline' 
                    },
                    { 
                      label: (
                        <div className="flex items-center justify-center w-full h-[36px] overflow-visible">
                          <WeatherIcon 
                            name="Sun" 
                            style="animated_outline" 
                            className={cn(
                              "w-[30px] h-[30px] transition-all duration-200", 
                              (localSettings.iconStyle || 'outline') === 'animated_outline' ? "scale-110 text-black" : "opacity-50 text-white/50"
                            )} 
                          />
                        </div>
                      ), 
                      value: 'animated_outline' 
                    },
                    { 
                      label: (
                        <div className="flex items-center justify-center w-full h-[36px] overflow-visible">
                          <WeatherIcon 
                            name="Sun" 
                            style="static" 
                            className={cn(
                              "w-[30px] h-[30px] transition-all duration-200", 
                              (localSettings.iconStyle || 'outline') === 'static' ? "scale-110" : "opacity-50"
                            )} 
                          />
                        </div>
                      ), 
                      value: 'static' 
                    },
                    { 
                      label: (
                        <div className="flex items-center justify-center w-full h-[36px] overflow-visible">
                          <WeatherIcon 
                            name="Sun" 
                            style="animated" 
                            className={cn(
                              "w-[30px] h-[30px] transition-all duration-200", 
                              (localSettings.iconStyle || 'outline') === 'animated' ? "scale-110" : "opacity-50"
                            )} 
                          />
                        </div>
                      ), 
                      value: 'animated' 
                    }
                  ]}
                  onChange={(val) => updateSetting('iconStyle', val)}
                  lang={localSettings.language}
                />
              </div>

              {/* Card 2: Layout Configuration */}
              <div className="mb-5 font-sans">
                <h3 className="text-[11px] font-semibold tracking-[0.1em] text-white/45 uppercase mb-3 px-1">
                  <Translate text="Layout Configuration" lang={localSettings.language || 'en'} />
                </h3>
                <div className="flex flex-col gap-3.5 py-5 px-5 w-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md rounded-[24px] overflow-hidden">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-semibold text-white/90">
                          <Translate text="Weather Detail" lang={localSettings.language || 'en'} />
                        </span>
                      </div>
                      <SegmentedControl 
                        value={localSettings.layoutWeatherDetail || 'detailed'} 
                        hapticEnabled={localSettings.hapticEnabled}
                        options={[
                          { label: 'Detailed', value: 'detailed' },
                          { label: 'Compact', value: 'compact' }
                        ]}
                        onChange={(val) => updateSetting('layoutWeatherDetail', val)}
                        lang={localSettings.language || 'en'}
                      />
                    </div>

                    <div className="flex flex-col gap-2.5 border-t border-white/[0.06] pt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-semibold text-white/90">
                          <Translate text="Hourly Forecast" lang={localSettings.language || 'en'} />
                        </span>
                      </div>
                      <SegmentedControl 
                        value={localSettings.layoutHourlyForecast || 'detailed'} 
                        hapticEnabled={localSettings.hapticEnabled}
                        options={[
                          { label: 'Detailed graph', value: 'detailed' },
                          { label: 'Compact tiles', value: 'compact' }
                        ]}
                        onChange={(val) => updateSetting('layoutHourlyForecast', val)}
                        lang={localSettings.language || 'en'}
                      />
                    </div>

                    <div className="flex flex-col gap-2.5 border-t border-white/[0.06] pt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-semibold text-white/90">
                          <Translate text="7-Day Forecast" lang={localSettings.language || 'en'} />
                        </span>
                      </div>
                      <SegmentedControl 
                        value={localSettings.layoutDailyForecast || 'detailed'} 
                        hapticEnabled={localSettings.hapticEnabled}
                        options={[
                          { label: 'Detailed bars', value: 'detailed' },
                          { label: 'Compact list', value: 'compact' }
                        ]}
                        onChange={(val) => updateSetting('layoutDailyForecast', val)}
                        lang={localSettings.language || 'en'}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 2: App Preferences (Consolidated) */}
              <div className="w-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md rounded-[24px] divide-y divide-white/[0.06] mb-5 overflow-hidden font-sans">
                <LinkRow 
                  label="Tiles Customisation" 
                  hapticEnabled={localSettings.hapticEnabled}
                  onClick={() => {
                    setShowTilesCustomisation(true);
                    pushPanel(() => setShowTilesCustomisation(false), 'tiles_customisation');
                  }}
                  lang={localSettings.language}
                />
                
                <ToggleRow 
                  label="Haptic feedback" 
                  value={localSettings.hapticEnabled} 
                  hapticEnabled={localSettings.hapticEnabled}
                  onToggle={() => updateSetting('hapticEnabled', !localSettings.hapticEnabled)} 
                  lang={localSettings.language}
                />
                
                <LinkRow 
                  label="App Language"
                  value={LANGUAGES.find(o => o.value === (localSettings.language || 'en'))?.label.split(' (')[0] || 'English'}
                  hapticEnabled={localSettings.hapticEnabled}
                  onClick={() => {
                    setShowLanguagePage(true);
                    pushPanel(() => setShowLanguagePage(false), 'language_settings');
                  }}
                  lang={localSettings.language}
                />
              </div>

              {/* Language footnote */}
              <div className="px-5 -mt-3 mb-6 flex gap-2.5 text-white/45 text-[11px] leading-normal max-w-[342px] font-sans">
                <Info className="w-3.5 h-3.5 text-white/30 shrink-0 mt-0.5" strokeWidth={2} />
                <p>
                  <Translate text="Complete translation accuracy is not guaranteed as the multi-language localization system is still in active development." lang={localSettings.language} />
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {showLanguagePage && (
          <motion.div 
            key="settings-language-panel"
            ref={scrollRef}
            id="language-page"
            data-no-swipe
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ willChange: "transform" }}
            className="fixed inset-0 z-[1015] bg-app-bg backdrop-blur-3xl overflow-y-auto overscroll-contain language-page touch-pan-y"
          >
            <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-[calc(env(safe-area-inset-top,24px)+56px)] pb-32">
              <header className="flex items-center justify-between mb-8 px-1 w-full font-sans">
                <h1 className="text-[28px] font-bold text-white tracking-tight">
                  <Translate text="Language" lang={localSettings.language} />
                </h1>
                <button
                  onClick={() => {
                    Haptic.light(localSettings.hapticEnabled);
                    setShowLanguagePage(false);
                    handleBack();
                  }}
                  className="w-12 h-12 bg-app-surface border border-app-border backdrop-blur-md flex items-center justify-center rounded-full hover:bg-app-surface/80 transition-all shadow-xl select-none cursor-pointer"
                >
                  <Icons.ChevronLeft className="w-5.5 h-5.5 text-app-text" strokeWidth={2.5} />
                </button>
              </header>

              <div className="w-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md rounded-[24px] divide-y divide-white/[0.06] overflow-hidden font-sans">
                {LANGUAGES.map((lang) => {
                  const isSelected = (localSettings.language || 'en') === lang.value;
                  return (
                    <button
                      key={lang.value}
                      type="button"
                      onClick={() => {
                        Haptic.medium(localSettings.hapticEnabled);
                        updateSetting('language', lang.value);
                      }}
                      className="w-full px-5 py-4.5 flex items-center justify-between transition-colors hover:bg-white/[0.03] text-left active:scale-[0.99] duration-150"
                    >
                      <span className={cn(
                        "text-[15px] transition-colors font-medium",
                        isSelected ? "text-white font-bold" : "text-white/70"
                      )}>
                        {lang.label}
                      </span>
                      {isSelected && (
                        <Check className="w-5 h-5 text-white stroke-[2.5]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* Existing subview */}
        {activeSubView !== 'none' && (
          <motion.div 
            key="settings-subview-panel"
            ref={scrollRef}
            id="subview-page"
            data-no-swipe
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ 
              duration: 0.3, 
              ease: [0.25, 0.46, 0.45, 0.94]
            }}
            style={{ willChange: "transform" }}
            className="fixed inset-0 z-[1020] bg-app-bg/90 backdrop-blur-3xl overflow-y-auto overscroll-contain subview-page touch-pan-y"
          >
            <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-[calc(env(safe-area-inset-top,24px)+56px)] pb-32">
              <header className="flex items-center justify-between mb-6 px-1 w-full">
                <h1 className="text-[28px] font-bold text-app-text tracking-tight">{translatedSubViewTitle}</h1>
                <button 
                  onClick={() => {
                    Haptic.light(localSettings.hapticEnabled);
                    handleBack();
                  }} 
                  className="w-12 h-12 bg-app-surface border border-app-border flex items-center justify-center rounded-full hover:bg-app-surface/80 transition-all select-none cursor-pointer"
                >
                  <Icons.ChevronLeft className="w-5.5 h-5.5 text-app-text" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                </button>
              </header>

              {/* Pill moon-phase-style selector switch for T&C and Privacy */}
              <div className="w-full bg-app-text/[0.04] p-1 rounded-full border border-app-border flex items-center mb-6" id="legal-tab-switch">
                <button
                  type="button"
                  onClick={() => {
                    if (legalTab !== 'terms') {
                      Haptic.light(localSettings.hapticEnabled);
                      setLegalTab('terms');
                      if (scrollRef.current) scrollRef.current.scrollTop = 0;
                    }
                  }}
                  className={cn(
                    "flex-1 py-1.5 px-3 rounded-full text-xs font-bold transition-all duration-200 text-center select-none cursor-pointer",
                    legalTab === 'terms' ? "bg-app-text text-app-bg shadow-md font-extrabold" : "text-app-text-dim hover:text-app-text"
                  )}
                >
                  <Translate text="Terms of Use" lang={localSettings.language} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (legalTab !== 'privacy') {
                      Haptic.light(localSettings.hapticEnabled);
                      setLegalTab('privacy');
                      if (scrollRef.current) scrollRef.current.scrollTop = 0;
                    }
                  }}
                  className={cn(
                    "flex-1 py-1.5 px-3 rounded-full text-xs font-bold transition-all duration-200 text-center select-none cursor-pointer",
                    legalTab === 'privacy' ? "bg-app-text text-app-bg shadow-md font-extrabold" : "text-app-text-dim hover:text-app-text"
                  )}
                >
                  <Translate text="Privacy Policy" lang={localSettings.language} />
                </button>
              </div>

              <div className="text-[14px] p-1 font-normal leading-relaxed text-app-text/75 overflow-hidden">
                <AnimatePresence mode="wait">
                  {isTranslating ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="space-y-6 py-4 animate-pulse-container"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="h-4 bg-app-text/5 border border-app-text/5 rounded-md w-1/4 animate-pulse" />
                        <div className="h-3 bg-app-text/5 border border-app-text/5 rounded-md w-1/3 animate-pulse" />
                      </div>
                      {[1, 2, 3, 4, 5].map((idx) => (
                        <div key={idx} className="space-y-3">
                          <div className="h-5 bg-app-text/5 border border-app-text/5 rounded-md w-1/2 animate-pulse" />
                          <div className="h-3 bg-app-text/5 border border-app-text/5 rounded-md w-full animate-pulse" />
                          <div className="h-3 bg-app-text/5 border border-app-text/5 rounded-md w-11/12 animate-pulse" />
                          <div className="h-3 bg-app-text/5 border border-app-text/5 rounded-md w-4/5 animate-pulse" />
                        </div>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div
                      key={legalTab}
                      initial={{ opacity: 0, scale: 0.98, y: 15 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98, y: -15 }}
                      transition={{ duration: 0.35, ease: "easeInOut" }}
                      className="space-y-5"
                    >
                      {(translatedSubViewContent || "").split('\n\n').map((block, i) => {
                        const trimmed = block.trim();
                        if (trimmed.startsWith('## ')) {
                          return (
                            <h2 key={i} className="text-[15px] font-bold text-app-text tracking-tight pt-3">
                              {trimmed.substring(3)}
                            </h2>
                          );
                        }
                        const isList = trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ');
                        if (isList) {
                          const items = trimmed.split('\n').map(line => line.replace(/^[-•*]\s*/, '').trim());
                          return (
                            <ul key={i} className="list-disc pl-5 space-y-2 text-app-text-dim">
                              {items.map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          );
                        }
                        return (
                          <p key={i} className="whitespace-pre-line leading-relaxed pb-1">
                            {trimmed}
                          </p>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

        {/* Floating Toast notification */}
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            className="fixed bottom-12 left-1/2 z-[50000] px-6 py-2.5 bg-app-text border border-app-border text-app-bg rounded-full text-[12px] font-medium shadow-2xl pointer-events-none select-none text-center whitespace-nowrap min-w-[200px] flex items-center justify-center"
          >
            {toastMessage}
          </motion.div>
        )}

        {/* Rate dialog modal overlay */}
        <AnimatePresence>
          {showRateDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[2020] flex items-center justify-center p-6 bg-app-bg/65 backdrop-blur-md"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 20 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="relative w-full max-w-[340px] bg-app-surface border border-app-border rounded-[32px] p-6 text-center select-none shadow-[0_20px_50px_rgba(0,0,0,0.15)] backdrop-blur-3xl font-sans"
              >
                {/* Central rounded heart badge intersecting the top border */}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 w-14 h-14 bg-app-text text-app-bg rounded-full flex items-center justify-center border border-app-border shadow-lg">
                  <Heart className="w-6 h-6 text-red-500 fill-red-500" />
                </div>

                {/* Title & spacing */}
                <h3 className="text-[19px] font-bold text-app-text mt-7 mb-2 tracking-tight">
                  <Translate text="Rate Overcast" lang={localSettings.language} />
                </h3>

                {/* Emoji bar */}
                <div className="flex justify-center gap-3.5 my-6">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isSelected = selectedRating !== null && star <= selectedRating;
                    const starColor = 
                      star === 1 ? "#f43f5e" : // rose-500
                      star === 2 ? "#fb923c" : // orange-400
                      star === 3 ? "#facc15" : // yellow-400
                      star === 4 ? "#a3e635" : // lime border / parrot-green
                      "#15803d"; // deep green
                    return (
                      <button
                        key={star}
                        onClick={() => {
                          Haptic.medium(localSettings.hapticEnabled);
                          setSelectedRating(star);
                        }}
                        className="w-11 h-11 flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer group"
                      >
                        <Star 
                          className="w-8 h-8 transition-all duration-200"
                          style={{
                            color: isSelected ? starColor : "var(--text-secondary)",
                            fill: isSelected ? starColor : "transparent",
                            transform: isSelected ? "scale(1.15)" : "scale(1)",
                          }}
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Question */}
                <p className="text-[14px] text-app-text-dim mb-6 px-1 tracking-tight font-medium">
                  <Translate text="How do you feel about Overcast?" lang={localSettings.language} />
                </p>

                {/* Separation line & Actions buttons */}
                <div className="border-t border-app-border flex -mx-6 -mb-6 h-[50px] divide-x divide-app-border">
                  <button
                    onClick={() => {
                      Haptic.light(localSettings.hapticEnabled);
                      setShowRateDialog(false);
                      setSelectedRating(null);
                    }}
                    className="flex-1 h-full flex items-center justify-center text-[15px] font-semibold text-app-text-dim active:bg-app-text/[0.03] transition-colors rounded-bl-[32px] cursor-pointer outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]"
                  >
                    <Translate text="Later" lang={localSettings.language} />
                  </button>
                  <button
                    onClick={() => {
                      if (selectedRating) {
                        Haptic.medium(localSettings.hapticEnabled);
                        setShowRateDialog(false);
                        submitRatingToBackend(selectedRating);
                        if (selectedRating >= 4) {
                          setGithubToast(true);
                        } else {
                          showToast("Thank you for your rating!");
                        }
                        setSelectedRating(null);
                      } else {
                        Haptic.light(localSettings.hapticEnabled);
                      }
                    }}
                    disabled={!selectedRating}
                    className={cn(
                      "flex-1 h-full flex items-center justify-center text-[15px] font-bold transition-colors rounded-br-[32px] cursor-pointer outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]",
                      selectedRating ? "active:bg-app-text/[0.03]" : "text-app-text/20 cursor-not-allowed"
                    )}
                    style={{ color: selectedRating ? themeColor : 'inherit' }}
                  >
                    <Translate text="Rate now" lang={localSettings.language} />
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* GitHub Contribution/Star Centered Modal Card */}
        {githubToast && (
          <div className="fixed inset-0 z-[2030] flex items-center justify-center p-6 bg-app-bg/65 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 15 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="relative w-full max-w-[320px] bg-app-surface border border-app-border rounded-[32px] p-6 text-center select-none shadow-[0_20px_50px_rgba(0,0,0,0.15)] backdrop-blur-3xl font-sans"
            >
              <div className="w-12 h-12 bg-app-text/[0.08] rounded-full flex items-center justify-center mx-auto mb-4 border border-app-border">
                <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
              </div>
              <h3 className="text-[18px] font-bold text-app-text mb-2 tracking-tight">
                <Translate text="Thank you for the rating!" lang={localSettings.language} />
              </h3>
              <p className="text-[13px] text-app-text-dim leading-relaxed mb-6 font-medium px-1">
                <Translate text="Please consider starring our repository on GitHub! Your support helps others discover Overcast." lang={localSettings.language} />
              </p>
              
              <div className="flex flex-col gap-2">
                <a 
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    Haptic.medium(localSettings.hapticEnabled);
                    setGithubToast(false);
                  }}
                  className="w-full py-3 bg-app-text text-app-bg font-semibold rounded-full text-[13px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform font-sans"
                  style={{ display: 'flex' }}
                >
                  <span>⭐</span>
                  <span><Translate text="Star on GitHub" lang={localSettings.language} /></span>
                </a>
                <button
                  onClick={() => {
                    Haptic.light(localSettings.hapticEnabled);
                    setGithubToast(false);
                  }}
                  className="w-full py-2.5 bg-transparent text-app-text-dim/60 hover:text-app-text text-[13px] font-semibold rounded-full active:scale-95 transition-colors font-sans cursor-pointer"
                >
                  <Translate text="Dismiss" lang={localSettings.language} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SettingsScreen;
