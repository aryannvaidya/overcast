import React, { useState, useEffect, useRef } from 'react';
import { formatTemp } from './lib/units';
import { Location, WeatherData, WeatherState, Settings } from './types';
import { fetchWeather, fetchWeatherBulk, getMoonPhaseInfo, getCurrentHourIndex, reverseGeocode, getCurrentWeatherState, getAQIDataWithFallback, getDataAgeHours, getAQIFromCacheOrLive, fetchIPLocation, getPrefetchUrls, getWeatherThemeColor } from './services/weatherService';
import { getCachedWeatherData, saveWeatherData, STORAGE_KEYS, getCityKey, CACHE_EXPIRY } from './lib/storage';
import { initGestures } from './lib/gestures';
import WeatherSkeleton from './components/WeatherSkeleton';
import SearchBar from './components/SearchBar';
import WeatherHero from './components/WeatherHero';
import { HourlyForecast, DailyForecast } from './components/Forecasts';
import WeatherDetails from './components/WeatherDetails';
import { UpcomingRainGraph } from './components/UpcomingRainGraph';
import SunPath from './components/SunPath';
import { Icons } from './components/WeatherIcons';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'motion/react';
import { cn } from './lib/utils';
import SettingsScreen, { TERMS_CONTENT, PRIVACY_CONTENT } from './components/SettingsScreen';
import CityManager from './components/CityManager';
import WeatherRadarMap from './components/WeatherRadarMap';
import AlertsDisplay from './components/AlertsDisplay';
import AtmosphereCanvas from './components/AtmosphereCanvas';
import { calibrateTemperature } from './services/mlService';
import { Haptic } from './lib/haptics';
import { format } from 'date-fns';
import { Translate, fetchDynamicTranslation } from './lib/translations';
import { 
  NotifSettings, 
  scheduleMorningSummary, 
  scheduleNightSummary, 
  checkWeatherAlerts, 
  applyNotifToggleStates,
  SafeNotif,
  safeOneSignal,
  tagDeviceLocation
} from './services/oneSignalService';

const DEFAULT_LOCATION: Location | null = null;

const INITIAL_SETTINGS: Settings = {
  unitTemp: 'C',
  unitWind: 'km/h',
  unitPressure: 'mmHg',
  unitVisibility: 'km',
  unitPrecipitation: 'mm',
  iconStyle: 'animated_outline',
  theme: 'light',
  hapticEnabled: true,
  notificationTime: '08:00',
  rainThreshold: 30,
  snowThreshold: 30,
  stormThreshold: true,
  alertRain: true,
  alertSevere: true,
  alertTrip: true,
  alertDaily: false,
  alertRealtime: false,
  timeFormat: '12h',
  pushEnabled: false,
  alertMorningSummary: false,
  alertNightSummary: false,
  backgroundGlow: 'on',
  layoutWeatherDetail: 'detailed',
  layoutHourlyForecast: 'detailed',
  layoutDailyForecast: 'detailed',
  enabledTiles: {
    aqi: true,
    uv: true,
    humidity: true,
    visibility: true,
    precipitation: true,
    wind: true,
    forecast: true,
    sunMoon: true,
    aqiGraph: true,
    aqiPollutant: true,
    uvGraph: true,
    rainGraph: true
  },
  tileOrder: [
    'rainGraph',
    'forecast',
    'aqi',
    'uv',
    'sunMoon',
    'humidityVisibility',
    'precipitationWind',
    'pollen'
  ]
};

const LocationState = {
  hasLocation:     false,
  isLoading:       false,
  lat:             null as number | null,
  lon:             null as number | null,
  cityName:        null as string | null,
  lastUpdated:     null as number | null,
  permissionState: null as string | null, // "granted"|"denied"|"prompt"

  save() {
    localStorage.setItem("location_state", JSON.stringify({
      hasLocation: this.hasLocation,
      lat:         this.lat,
      lon:         this.lon,
      cityName:    this.cityName,
      lastUpdated: this.lastUpdated,
    }));
  },

  load() {
    const saved = localStorage.getItem("location_state");
    if (!saved) return false;
    try {
      const s = JSON.parse(saved);
      this.hasLocation = s.hasLocation;
      this.lat         = s.lat;
      this.lon         = s.lon;
      this.cityName    = s.cityName;
      this.lastUpdated = s.lastUpdated;
      return this.hasLocation;
    } catch { return false; }
  },

  clear() {
    this.hasLocation = false;
    this.lat         = null;
    this.lon         = null;
    this.cityName    = null;
    this.lastUpdated = null;
    localStorage.removeItem("location_state");
  }
};

// Background AQI refresh tracking variables
let aqiRefreshInterval: any = null;
const lastAQIFetch: Record<string, number> = {};

// Fast switching & tap helpers
const pauseAnimationsOnCard = (cardEl: HTMLElement) => {
  cardEl.querySelectorAll(
    "[class*='animate'], " +
    "[class*='particle'], " +
    "[class*='atmosphere'], " +
    "[class*='weather-fx']"
  ).forEach(el => {
    (el as HTMLElement).style.animationPlayState = "paused";
    (el as HTMLElement).style.willChange = "auto";
  });
};

const resumeAnimationsOnCard = (cardEl: HTMLElement) => {
  cardEl.querySelectorAll(
    "[class*='animate'], " +
    "[class*='particle'], " +
    "[class*='atmosphere'], " +
    "[class*='weather-fx']"
  ).forEach(el => {
    (el as HTMLElement).style.animationPlayState = "running";
    (el as HTMLElement).style.willChange = "transform, opacity";
  });
};

// Single source of truth for animation state
let animationsEnabled = false;

const killAnimations = () => {
  animationsEnabled = false;
  if (typeof window !== 'undefined') {
    document.documentElement.style.setProperty("--animation-state", "paused");
    document.body.setAttribute("data-animations", "off");
    document.body.classList.add("no-animations");
    document.querySelectorAll(".city-card, .atmosphere").forEach(card => {
      pauseAnimationsOnCard(card as HTMLElement);
    });
  }
};

const enableAnimations = () => {
  animationsEnabled = true;
  if (typeof window !== 'undefined') {
    document.documentElement.style.setProperty("--animation-state", "running");
    document.body.setAttribute("data-animations", "on");
    document.body.classList.remove("no-animations");
    document.querySelectorAll(
      "[class*='animate'], " +
      "[class*='particle'], " +
      "[class*='atmosphere']"
    ).forEach(el => {
      (el as HTMLElement).style.animationPlayState = "running";
    });
    // Resume only active card after render
    const activeCard = document.querySelector("#swipe-layer") as HTMLElement;
    if (activeCard) {
      resumeAnimationsOnCard(activeCard);
    }
    const atmosphere = document.querySelector(".atmosphere") as HTMLElement;
    if (atmosphere) {
      resumeAnimationsOnCard(atmosphere);
    }
  }
};

const disableAllAnimations = killAnimations;
const enableAllAnimations = enableAnimations;

// Step 4: Throttled rAF loop for lightweight animation coordination
if (typeof window !== 'undefined') {
  let lastFrame = 0;
  const FPS_LIMIT = 30;
  const FRAME_MIN_TIME = 1000 / FPS_LIMIT;

  const updateParticles = () => {
    // Coordinate/sync particles at 30fps
  };

  const updateWeatherFX = () => {
    // Coordinate/sync weatherFX at 30fps
  };

  const animationLoop = (timestamp: number) => {
    if (timestamp - lastFrame < FRAME_MIN_TIME) {
      requestAnimationFrame(animationLoop);
      return;
    }
    lastFrame = timestamp;

    updateParticles();
    updateWeatherFX();

    requestAnimationFrame(animationLoop);
  };

  requestAnimationFrame(animationLoop);
}

// Step 6: Power savings / reduced motion animation check
if (typeof window !== 'undefined') {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const checkBattery = async () => {
    const nav = navigator as any;
    if (!nav.getBattery) return false;
    try {
      const battery = await nav.getBattery();
      return battery.level < 0.2; // below 20%
    } catch {
      return false;
    }
  };

  const shouldReduceAnimations = async () => {
    const lowBattery = await checkBattery();
    return prefersReducedMotion || lowBattery;
  };

  shouldReduceAnimations().then(reduce => {
    if (reduce) {
      document.body.classList.add("reduced-animations");
    }
  }).catch(() => {});
}

const showCitySkeleton = () => {
  if (typeof window !== 'undefined') {
    const skeleton = document.getElementById("city-skeleton");
    if (skeleton) {
      skeleton.style.display = "flex";
      skeleton.style.opacity = "1";
    }
  }
};

const hideCitySkeleton = () => {
  if (typeof window !== 'undefined') {
    const skeleton = document.getElementById("city-skeleton");
    if (!skeleton) return;
    skeleton.style.opacity = "0";
    setTimeout(() => {
      const currentSkeleton = document.getElementById("city-skeleton");
      if (currentSkeleton) {
        currentSkeleton.style.display = "none";
      }
    }, 200);
  }
};

const addInstantTap = (selector: string, handler: (e: any) => void, hapticEnabled = true) => {
  if (typeof window === 'undefined') return;
  const elements = document.querySelectorAll(selector);
  elements.forEach(el => {
    let tapped = false;

    el.addEventListener("touchstart", (e) => {
      tapped = true;
      handler(e);
      Haptic.light(hapticEnabled);
    }, { passive: true });

    // Fallback for non-touch
    el.addEventListener("click", (e) => {
      if (!tapped) handler(e);
      tapped = false;
    });
  });
};

const getTimezoneCity = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz.includes('/')) {
      const parts = tz.split('/');
      const cityWithUnderscores = parts[parts.length - 1];
      return cityWithUnderscores.replace(/_/g, ' ');
    }
  } catch (err) {
    console.warn("Timezone resolution failed:", err);
  }
  return "Local Area";
};

const AnimatedWeatherLoader = () => {
  const [index, setIndex] = useState(0);
  const icons = [Icons.Sun, Icons.Moon, Icons.Cloud, Icons.CloudLightning, Icons.CloudRain];
  const IconComponent = icons[index];

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(prev => (prev + 1) % icons.length);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ position: 'relative', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 0.6, rotate: -30 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.6, rotate: 30 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}
        >
          <IconComponent className="w-12 h-12 text-white" strokeWidth={1.5} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [state, setState] = useState<WeatherState>(() => {
    let cachedSettings = null;
    let cachedLocations = null;
    let cachedIndex = null;
    
    try {
      const s = localStorage.getItem('app_settings');
      if (s) {
        const parsed = JSON.parse(s);
        // Migration: Force light theme only
        parsed.theme = 'light';
        if (!parsed.unitPrecipitation) parsed.unitPrecipitation = 'mm';
        if (parsed.iconStyle === '3d') parsed.iconStyle = 'outline';
        if (parsed.iconStyle === 'coloured') parsed.iconStyle = 'animated_outline';
        if (parsed.alertRain === undefined) parsed.alertRain = true;
        if (parsed.backgroundGlow === undefined) parsed.backgroundGlow = 'on';
        if (parsed.layoutWeatherDetail === undefined) parsed.layoutWeatherDetail = 'detailed';
        if (parsed.layoutHourlyForecast === undefined) parsed.layoutHourlyForecast = 'detailed';
        if (parsed.layoutDailyForecast === undefined) parsed.layoutDailyForecast = 'detailed';
        if (!parsed.enabledTiles) {
          parsed.enabledTiles = {
            aqi: true,
            uv: true,
            humidity: true,
            visibility: true,
            precipitation: true,
            wind: true,
            forecast: true,
            sunMoon: true,
            aqiGraph: true,
            aqiPollutant: true,
            uvGraph: true,
            rainGraph: true
          };
        } else {
          if (parsed.enabledTiles.forecast === undefined) parsed.enabledTiles.forecast = true;
          if (parsed.enabledTiles.sunMoon === undefined) parsed.enabledTiles.sunMoon = true;
          if (parsed.enabledTiles.aqiGraph === undefined) parsed.enabledTiles.aqiGraph = true;
          if (parsed.enabledTiles.aqiPollutant === undefined) parsed.enabledTiles.aqiPollutant = true;
          if (parsed.enabledTiles.uvGraph === undefined) parsed.enabledTiles.uvGraph = true;
          if (parsed.enabledTiles.rainGraph === undefined) parsed.enabledTiles.rainGraph = true;
        }
        if (!parsed.tileOrder) {
          parsed.tileOrder = [
            'rainGraph',
            'forecast',
            'aqi',
            'uv',
            'sunMoon',
            'humidityVisibility',
            'precipitationWind',
            'pollen'
          ];
        }
        cachedSettings = parsed;
      }
      
      const l = localStorage.getItem('app_locations');
      if (l) cachedLocations = JSON.parse(l);
      
      const idx = localStorage.getItem('app_active_index');
      if (idx) cachedIndex = parseInt(idx);
    } catch (e) {
      console.warn('Failed to parse cached weather data', e);
    }
    
    // Load state from LocationState cache
    const hasSaved = LocationState.load();
    let currentLoc: Location | null = null;
    if (hasSaved && LocationState.lat !== null && LocationState.lon !== null && LocationState.cityName && LocationState.cityName !== "Current Location") {
      currentLoc = {
        id: 0,
        name: LocationState.cityName,
        latitude: LocationState.lat,
        longitude: LocationState.lon,
        country: "Nearby",
        timezone: "auto",
        isCurrentLocation: true,
        isGeolocated: true,
        icon: "📍"
      };
    }

    const initialLocations: Location[] = [];
    const seen = new Set<string>();
    
    if (currentLoc) {
      initialLocations.push(currentLoc);
      seen.add(`${currentLoc.latitude.toFixed(2)}-${currentLoc.longitude.toFixed(2)}`);
      seen.add(currentLoc.name.toLowerCase());
    }
    
    (cachedLocations || []).forEach((loc: Location) => {
      if (loc.isCurrentLocation) return;
      const coordKey = `${loc.latitude.toFixed(2)}-${loc.longitude.toFixed(2)}`;
      const nameKey = loc.name.toLowerCase();
      if (!seen.has(coordKey) && !seen.has(nameKey)) {
        initialLocations.push(loc);
        seen.add(coordKey);
        seen.add(nameKey);
      }
    });

    // Do not add any default city - let the user decide.

    const initialIndex = cachedIndex !== null ? Math.max(0, Math.min(cachedIndex, initialLocations.length - 1)) : 0;
    const initialWeatherData: Record<number, WeatherData> = {};
    
    // Attempt absolute zero-lag hydration of weather data from cache
    if (initialLocations.length > 0) {
      try {
        initialLocations.forEach((loc, idx) => {
          const cached = getCachedWeatherData(getCityKey(loc));
          if (cached && cached.data) {
            initialWeatherData[idx] = cached.data;
          }
        });
      } catch (e) {
        console.warn('Failed to hydrate weather data from cache', e);
      }
    }

    return {
      locations: initialLocations,
      activeLocationIndex: initialIndex,
      weatherData: initialWeatherData,
      loading: initialLocations.length > 0 && !initialWeatherData[initialIndex],
      error: null,
      showSettings: false,
      settings: cachedSettings || INITIAL_SETTINGS
    };
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const refreshAQIForIndex = async (index: number) => {
    const locations = stateRef.current.locations;
    const city = locations[index];
    if (!city) return;

    const cityKey = getCityKey(city);

    // Prioritize rendering cached AQI data immediately if available
    const cachedAqi = getAQIFromCacheOrLive(cityKey);
    if (cachedAqi) {
      console.log(`Pristine cache hit for AQI in ${city.name} — rendering immediately`);
      setState(prev => {
        if (prev.locations.length <= index || prev.locations[index]?.name !== city.name) {
          return prev;
        }
        const currentWeatherData = prev.weatherData[index];
        if (!currentWeatherData) {
          return prev;
        }
        // Save rendering frames if they are identical
        if (currentWeatherData.airQuality?.usAqi === cachedAqi.usAqi) {
          return prev;
        }
        return {
          ...prev,
          weatherData: {
            ...prev.weatherData,
            [index]: {
              ...currentWeatherData,
              airQuality: cachedAqi
            }
          }
        };
      });
    }

    console.log("Fetching AQI for:", city.name);

    try {
      const parsedAQI = await getAQIDataWithFallback(city.latitude, city.longitude, city.name, city.country);
      if (!parsedAQI) {
        console.warn("AQI fetch returned null for:", city.name);
        return;
      }

      const ageHours = getDataAgeHours(parsedAQI.lastUpdated);
      console.log(`AQI age for ${city.name}:`, ageHours.toFixed(1), "hours");

      // Update timestamp
      lastAQIFetch[cityKey] = Date.now();

      // Update React State
      setState(prev => {
        if (prev.locations.length <= index || prev.locations[index]?.name !== city.name) {
          return prev;
        }
        const currentWeatherData = prev.weatherData[index];
        if (!currentWeatherData) {
          return prev;
        }
        const updatedWeatherData = {
          ...currentWeatherData,
          airQuality: parsedAQI,
        };
        // Persist the updated AQI data in localStorage cache
        try {
          saveWeatherData(cityKey, updatedWeatherData);
        } catch (e) {
          console.warn("Failed to persist updated AQI in localStorage", e);
        }
        return {
          ...prev,
          weatherData: {
            ...prev.weatherData,
            [index]: updatedWeatherData
          }
        };
      });

      console.log("AQI refreshed:", {
        city: city.name,
        aqi: parsedAQI.usAqi,
        updated: parsedAQI.lastUpdated
      });
    } catch (err) {
      console.warn("Independent AQI background refresh failed:", err);
    }
  };

  // Start independent AQI background refresh system on load (every 30 minutes)
  useEffect(() => {
    const startAQIRefresh = () => {
      if (aqiRefreshInterval) {
        clearInterval(aqiRefreshInterval);
      }

      aqiRefreshInterval = setInterval(async () => {
        console.log("AQI background refresh firing...");
        const activeIdx = stateRef.current.activeLocationIndex;
        await refreshAQIForIndex(activeIdx);
      }, 30 * 60 * 1000);

      console.log("AQI background refresh started — every 30 min");
    };

    const stopAQIRefresh = () => {
      if (aqiRefreshInterval) {
        clearInterval(aqiRefreshInterval);
        aqiRefreshInterval = null;
        console.log("AQI background refresh stopped");
      }
    };

    startAQIRefresh();

    const onVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        const locations = stateRef.current.locations;
        const activeIndex = stateRef.current.activeLocationIndex;
        const city = locations[activeIndex];
        if (!city) return;

        const cityKey = getCityKey(city);
        const lastFetch = lastAQIFetch[cityKey] || 0;
        const age = Date.now() - lastFetch;

        if (age > 30 * 60 * 1000) {
          console.log("AQI stale on return — refreshing");
          await refreshAQIForIndex(activeIndex);
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopAQIRefresh();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // ALSO REFRESH AQI ON CITY SWITCH (if older than 30 min OR never fetched)
  useEffect(() => {
    const index = state.activeLocationIndex;
    const city = state.locations[index];
    if (!city) return;

    const cityKey = getCityKey(city);
    
    if (!lastAQIFetch[cityKey]) {
      const activeWeather = state.weatherData[index];
      if (activeWeather?.fetchedAt) {
        const age = Date.now() - activeWeather.fetchedAt;
        if (age < 30 * 60 * 1000) {
          lastAQIFetch[cityKey] = activeWeather.fetchedAt;
        }
      }
    }

    const lastFetch = lastAQIFetch[cityKey] || 0;
    const age = Date.now() - lastFetch;

    if (age > 30 * 60 * 1000 || !lastAQIFetch[cityKey]) {
      console.log(`AQI stale or missing for switched city: ${city.name} — fetching now`);
      refreshAQIForIndex(index);
    }
  }, [state.activeLocationIndex, state.locations, state.weatherData]);

  // Silent background weather update on city change if cache is older than 10 mins
  useEffect(() => {
    const index = state.activeLocationIndex;
    const city = state.locations[index];
    if (!city) return;

    const runSilentWeatherActiveSync = async () => {
      const cityKey = getCityKey(city);
      const cached = getCachedWeatherData(cityKey);
      
      let isStale = true;
      if (cached) {
        const cacheAge = Date.now() - cached.ts;
        isStale = cacheAge > 10 * 60 * 1000;
      }

      if (isStale && navigator.onLine) {
        console.log(`Silent background weather sync triggered for active city: ${city.name}`);
        try {
          const data = await fetchWeather(city.latitude, city.longitude, city.timezone, city.name, city.country);
          saveWeatherData(cityKey, data);
          setState(prev => {
            if (prev.activeLocationIndex === index && prev.locations[index]?.name === city.name) {
              return {
                ...prev,
                weatherData: { ...prev.weatherData, [index]: data }
              };
            }
            return prev;
          });
        } catch (e) {
          console.warn(`Active city silent sync failed for ${city.name}:`, e);
        }
      }
    };

    runSilentWeatherActiveSync();
  }, [state.activeLocationIndex]);

  // Step 5: Switch-to-city pausing handler to ensure no CPU waste and silky-smooth transitions
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Pause all cards & atmosphere immediately when transitioning index changes
    document.querySelectorAll(".city-card, .atmosphere").forEach(card => {
      pauseAnimationsOnCard(card as HTMLElement);
    });

    // Resume animations on ONLY the active elements after DOM updates are processed
    const frameId = requestAnimationFrame(() => {
      const activeCard = document.querySelector("#swipe-layer") as HTMLElement;
      if (activeCard) {
        resumeAnimationsOnCard(activeCard);
      }
      const atmosphere = document.querySelector(".atmosphere") as HTMLElement;
      if (atmosphere) {
        resumeAnimationsOnCard(atmosphere);
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [state.activeLocationIndex]);

  const showRefreshSpinner = () => {
    const el = document.getElementById("refresh-indicator");
    if (el) el.style.display = "block";
  };

  const hideRefreshSpinner = () => {
    const el = document.getElementById("refresh-indicator");
    if (el) el.style.display = "none";
  };

  const showLocationLoading = () => {
    if (stateRef.current.locations.length === 0) {
      setIsLocatingOnboarding(true);
    } else {
      const el = document.getElementById("location-loading-card");
      if (el) el.style.display = "block";
    }
  };

  const hideLocationLoading = () => {
    setIsLocatingOnboarding(false);
    const el = document.getElementById("location-loading-card");
    if (el) el.style.display = "none";
  };

  const refreshWeather = async () => {
    showRefreshSpinner();
    try {
      const locations = stateRef.current.locations;
      await loadWeatherBatch(locations, 0, true);
      localStorage.setItem("last_refresh", Date.now().toString());
    } catch (e) {
      console.warn("Auto refresh failed:", e);
    } finally {
      hideRefreshSpinner();
    }
  };

  const locationRefreshIntervalRef = useRef<any>(null);

  const showLocationIndicator = (stateStr: "getting" | "updated") => {
    if (stateStr === "getting") {
      showLocationLoading();
    }
  };

  const hideLocationIndicator = () => {
    hideLocationLoading();
  };

  const showMinimalIndicator = (text: string) => {
    const bar = document.getElementById("location-status-bar");
    const spinner = document.getElementById("location-status-spinner");
    const label = document.getElementById("location-status-text");

    if (!bar || !label) return;

    label.textContent = text;

    if (text === "GETTING LOCATION") {
      if (spinner) spinner.style.display = "block";
      label.style.color = "#94a3b8";
      bar.style.background = "#1e293b";
    } else if (text === "LOCATION UPDATED") {
      if (spinner) spinner.style.display = "none";
      label.style.color = "#4ade80";
      bar.style.background = "#14532d40";
    }

    bar.style.height = "28px";
    const overlay = document.getElementById("ui-overlay");
    if (overlay) overlay.style.paddingTop = "36px";
  };

  const hideMinimalIndicator = () => {
    const bar = document.getElementById("location-status-bar");
    if (bar) bar.style.height = "0";
    const overlay = document.getElementById("ui-overlay");
    if (overlay) overlay.style.paddingTop = "";
  };

  const showPermissionDeniedNotice = () => {
    // No-op: Removed floating toast from the main screen as requested
    // Instead, this sits elegantly below the search bar when geolocation access is disabled.
  };

  const checkLocationPermission = async () => {
    try {
      if (navigator.permissions) {
        const result = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        LocationState.permissionState = result.state;

        // Watch for permission changes
        result.onchange = () => {
          LocationState.permissionState = result.state;
          handlePermissionChange(result.state);
        };

        return result.state; // "granted"|"denied"|"prompt"
      }
    } catch (e) {
      console.warn("Permissions API unavailable");
    }

    // Fallback — assume prompt if API not available
    return "prompt";
  };

  const handlePermissionChange = (stateStr: string) => {
    if (stateStr === "denied") {
      // Permission revoked — stop everything
      stopLocationRefresh();
      removeCurrentLocationPage();
      showPermissionDeniedNotice();
    } else if (stateStr === "granted") {
      // Permission granted — start fetching
      startLocationSystem();
    }
  };

  const hasLocationChanged = (newLat: number, newLon: number) => {
    if (LocationState.lat === null || LocationState.lon === null) 
      return true;

    // Calculate distance (roughly ~1km threshold)
    const dx = newLat - LocationState.lat;
    const dy = newLon - LocationState.lon;
    const dist = Math.sqrt(dx * dx + dy * dy);

    return dist > 0.01; // ~1km
  };

  const addCurrentLocationPage = async (cityName: string, lat: number, lon: number) => {
    const newLocation: Location = {
      id: 0,
      name: cityName,
      latitude: lat,
      longitude: lon,
      timezone: "auto",
      country: "Nearby",
      isCurrentLocation: true,
      isGeolocated: true,
      icon: "📍"
    };

    setState(prev => {
      const filtered = prev.locations.filter(loc => {
        if (loc.isCurrentLocation) return false;
        const sameCoords = Math.abs(loc.latitude - lat) < 0.01 && 
                           Math.abs(loc.longitude - lon) < 0.01;
        const sameName = loc.name.toLowerCase() === cityName.toLowerCase();
        return !(sameCoords || sameName);
      });
      const newLocations = [newLocation, ...filtered];
      return {
        ...prev,
        locations: newLocations,
        activeLocationIndex: 0,
        loading: true
      };
    });

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const data = await fetchWeather(lat, lon, timezone, cityName, "Nearby");
      saveWeatherData(getCityKey(newLocation), data);
      setState(prev => {
        const newWeatherData = { ...prev.weatherData };
        // Shift existing weather data maps to right by 1
        const keys = Object.keys(newWeatherData).map(Number).sort((a,b) => b - a);
        keys.forEach(k => {
          newWeatherData[k+1] = newWeatherData[k];
        });
        newWeatherData[0] = data;

        return {
          ...prev,
          weatherData: newWeatherData,
          loading: false,
          error: null
        };
      });
    } catch (err) {
      console.warn("fetchWeather failed when adding current location page:", err);
      setState(prev => ({ ...prev, loading: false }));
    }

    hideLocationIndicator();
    console.log("Current location page added:", cityName);
    tagDeviceLocation(cityName, lat, lon);
  };

  const addCurrentLocationPageFromCache = () => {
    if (!LocationState.hasLocation || LocationState.lat === null || LocationState.lon === null) return;
    const cachedLoc: Location = {
      id: 0,
      name: LocationState.cityName || "Current Location",
      latitude: LocationState.lat,
      longitude: LocationState.lon,
      timezone: "auto",
      country: "Nearby",
      isCurrentLocation: true,
      isGeolocated: true,
      icon: "📍"
    };

    setState(prev => {
      const filtered = prev.locations.filter(loc => {
        if (loc.isCurrentLocation) return false;
        const sameCoords = Math.abs(loc.latitude - cachedLoc.latitude) < 0.01 && 
                           Math.abs(loc.longitude - cachedLoc.longitude) < 0.01;
        const sameName = loc.name.toLowerCase() === cachedLoc.name.toLowerCase();
        return !(sameCoords || sameName);
      });
      const newLocations = [cachedLoc, ...filtered];
      return {
        ...prev,
        locations: newLocations
      };
    });
  };

  const replaceCurrentLocationPage = async (cityName: string, lat: number, lon: number, country: string = "Nearby") => {
    try {
      const updatedLocation: Location = {
        id: 0,
        name: cityName,
        latitude: lat,
        longitude: lon,
        timezone: "auto",
        country: country,
        isCurrentLocation: true,
        isGeolocated: true,
        icon: "📍"
      };

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      // Fetch weather first BEFORE modifying UI
      const data = await fetchWeather(lat, lon, timezone, cityName, country);
      
      // If weather fetch succeeds, write to storage cache and update React state
      saveWeatherData(getCityKey(updatedLocation), data);
      
      setState(prev => {
        const filtered = prev.locations.filter((loc, idx) => {
          if (idx === 0) return false;
          const sameCoords = Math.abs(loc.latitude - lat) < 0.01 && 
                             Math.abs(loc.longitude - lon) < 0.01;
          const sameName = loc.name.toLowerCase() === cityName.toLowerCase();
          return !(sameCoords || sameName);
        });
        const newLocs = [updatedLocation, ...filtered];
        return {
          ...prev,
          locations: newLocs,
          weatherData: { ...prev.weatherData, [0]: data }
        };
      });
      
      console.log("Current location replaced successfully:", cityName);
      tagDeviceLocation(cityName, lat, lon);
      return true;
    } catch (err) {
      console.warn("fetchWeather failed when replacing current location page, keeping previous city:", err);
      return false; // return false indicating failure so we don't update other location state variables
    }
  };

  const removeCurrentLocationPage = () => {
    if (stateRef.current.locations.length > 0 && stateRef.current.locations[0].isCurrentLocation) {
      setState(prev => {
        const newLocations = prev.locations.filter(loc => !loc.isCurrentLocation);
        
        // Do not add any default city - let the user decide.

        const newIndex = Math.max(0, prev.activeLocationIndex - 1);
        
        // Clean and shift weather data map
        const newWeatherData: Record<number, WeatherData> = {};
        newLocations.forEach((_, i) => {
          if (prev.weatherData[i + 1]) {
            newWeatherData[i] = prev.weatherData[i + 1];
          }
        });

        return {
          ...prev,
          locations: newLocations,
          activeLocationIndex: newIndex,
          weatherData: newWeatherData
        };
      });

      LocationState.clear();
      console.log("Current location page removed");
    }
  };

  const fetchCurrentLocation = async (isBackground = false) => {
    // Show loading indicator
    if (!isBackground) {
      showLocationIndicator("getting");
    } else {
      showMinimalIndicator("GETTING LOCATION");
    }

    LocationState.isLoading = true;

    // Check if permission is already explicitly denied
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (result.state === 'denied') {
          console.warn("[fetchCurrentLocation] Geolocation permission is denied. Not adding any city.");
          LocationState.isLoading = false;
          hideLocationIndicator();
          hideMinimalIndicator();
          if (!isBackground) {
            setLocationPermissionError(true);
          }
          return null;
        }
      } catch (err) {
        console.warn("Permissions API check failed:", err);
      }
    }

    // We will try GPS, but if it fails, is denied, or takes too long, we will use IP-based geolocation ONLY if GPS is not disabled/denied!
    const runIpFallback = async () => {
      console.log("[fetchCurrentLocation] Running IP Location Fallback...");
      try {
        const ipLoc = await fetchIPLocation();
        if (ipLoc) {
          const { lat, lon, cityName, country, timezone } = ipLoc;
          const moved = hasLocationChanged(lat, lon);

          if (!moved && LocationState.hasLocation && LocationState.cityName === cityName) {
            hideLocationIndicator();
            hideMinimalIndicator();
            LocationState.isLoading = false;
            return { lat, lon, cityName };
          }

          const wasFirstTime = !stateRef.current.locations.some(loc => loc.isCurrentLocation);

          if (wasFirstTime) {
            LocationState.hasLocation = true;
            LocationState.lat         = lat;
            LocationState.lon         = lon;
            LocationState.cityName    = cityName;
            LocationState.lastUpdated = Date.now();
            LocationState.save();
            LocationState.isLoading   = false;

            await addCurrentLocationPage(cityName, lat, lon);
          } else {
            const success = await replaceCurrentLocationPage(cityName, lat, lon, country);
            LocationState.isLoading = false;
            hideLocationIndicator();
            hideMinimalIndicator();

            if (success) {
              LocationState.hasLocation = true;
              LocationState.lat         = lat;
              LocationState.lon         = lon;
              LocationState.cityName    = cityName;
              LocationState.lastUpdated = Date.now();
              LocationState.save();

              showMinimalIndicator("LOCATION UPDATED");
              setTimeout(hideMinimalIndicator, 2500);
            }
          }

          return { lat, lon, cityName };
        }
      } catch (err) {
        console.warn("IP Location Fallback failed:", err);
      }
      
      LocationState.isLoading = false;
      hideLocationIndicator();
      hideMinimalIndicator();
      return null;
    };

    if (!navigator.geolocation) {
      console.warn("Geolocation not supported by device, falling back to IP Geolocation.");
      return await runIpFallback();
    }

    return new Promise<{ lat: number; lon: number; cityName: string } | null>((resolve) => {
      let resolvedOrFailed = false;

      // Set a backup timeout: if standard GPS takes > 4 seconds, fallback to IP Geolocation immediately!
      const gpsTimeoutToken = setTimeout(async () => {
        if (!resolvedOrFailed) {
          resolvedOrFailed = true;
          console.warn("GPS request taking too long (>4s). Falling back to IP Geolocation.");
          const res = await runIpFallback();
          resolve(res);
        }
      }, 4000);

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (resolvedOrFailed) return;
          resolvedOrFailed = true;
          clearTimeout(gpsTimeoutToken);

          if (!isBackground) {
            setLocationPermissionError(false);
          }

          const { latitude, longitude } = pos.coords;
          const moved = hasLocationChanged(latitude, longitude);

          const resolved = await reverseGeocode(latitude, longitude, stateRef.current.settings.language);
          let cityName = resolved?.name;
          if (!cityName || cityName === "Current Location") {
            cityName = getTimezoneCity();
          }

          if (!moved && LocationState.hasLocation && LocationState.cityName === cityName) {
            hideLocationIndicator();
            hideMinimalIndicator();
            LocationState.isLoading = false;
            resolve({ lat: latitude, lon: longitude, cityName });
            return;
          }

          const wasFirstTime = !stateRef.current.locations.some(loc => loc.isCurrentLocation);

          if (wasFirstTime) {
            LocationState.hasLocation = true;
            LocationState.lat         = latitude;
            LocationState.lon         = longitude;
            LocationState.cityName    = cityName;
            LocationState.lastUpdated = Date.now();
            LocationState.save();
            LocationState.isLoading   = false;

            await addCurrentLocationPage(cityName, latitude, longitude);
          } else {
            const success = await replaceCurrentLocationPage(cityName, latitude, longitude, resolved?.country || "Nearby");
            LocationState.isLoading = false;
            hideLocationIndicator();
            hideMinimalIndicator();

            if (success) {
              LocationState.hasLocation = true;
              LocationState.lat         = latitude;
              LocationState.lon         = longitude;
              LocationState.cityName    = cityName;
              LocationState.lastUpdated = Date.now();
              LocationState.save();

              showMinimalIndicator("LOCATION UPDATED");
              setTimeout(hideMinimalIndicator, 2500);
            }
          }

          resolve({ 
            lat: latitude, 
            lon: longitude, 
            cityName 
          });
        },
        async (err) => {
          if (resolvedOrFailed) return;
          resolvedOrFailed = true;
          clearTimeout(gpsTimeoutToken);
          
          console.warn("GPS error encountered:", err.message);
          
          // If permission is denied or location is off, DO NOT fall back to IP-based location!
          if (err.code === err.PERMISSION_DENIED) {
            console.warn("Location permission was explicitly denied. Not adding any city.");
            if (!isBackground) {
              setLocationPermissionError(true);
            }
            LocationState.isLoading = false;
            hideLocationIndicator();
            hideMinimalIndicator();
            resolve(null);
            return;
          }

          // For other general errors (e.g., timeout, position unavailable) during manual setup, we also block IP fallback to avoid adding arbitrary wrong location
          if (!isBackground) {
            console.warn("Location signals unavailable. Not saving any arbitrary city.");
            setLocationPermissionError(true);
            LocationState.isLoading = false;
            hideLocationIndicator();
            hideMinimalIndicator();
            resolve(null);
          } else {
            // Background update can try IP fallback as safety
            const res = await runIpFallback();
            resolve(res);
          }
        },
        {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 300000
        }
      );
    });
  };

  const isLocationPermissionOn = async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return result.state === 'granted';
      } catch (err) {
        console.warn("Permissions API query failed:", err);
        return false;
      }
    }
    return false;
  };

  const startLocationRefresh = () => {
    // Clear any existing interval
    stopLocationRefresh();

    // Refresh every 10 minutes
    locationRefreshIntervalRef.current = setInterval(async () => {
      if (LocationState.hasLocation) {
        console.log("Background location refresh...");
        const isGranted = await isLocationPermissionOn();
        if (isGranted) {
          await fetchCurrentLocation(true);
        } else {
          console.log("Location permission is off, skipping background refresh update.");
        }
      }
    }, 10 * 60 * 1000);

    console.log("Location refresh started");
  };

  const stopLocationRefresh = () => {
    if (locationRefreshIntervalRef.current) {
      clearInterval(locationRefreshIntervalRef.current);
      locationRefreshIntervalRef.current = null;
      console.log("Location refresh stopped");
    }
  };

  const startLocationSystem = async () => {
    const isFirstTime = !localStorage.getItem('location_first_prompt_done');
    const hasSaved = LocationState.load();

    if (isFirstTime) {
      // First time downloading/launching the app: prompt user
      localStorage.setItem('location_first_prompt_done', 'true');
      
      if (hasSaved && LocationState.cityName && LocationState.cityName !== "Current Location") {
        addCurrentLocationPageFromCache();
        setTimeout(async () => {
          const isGranted = await isLocationPermissionOn();
          if (isGranted) {
            await fetchCurrentLocation(true);
          }
        }, 2000);
        startLocationRefresh();
      } else {
        // Do not query geolocation on startup; wait until user clicks the button on Welcome page.
        console.log("Onboarding: waiting for user to click Enable Location on Welcome page.");
      }
    } else {
      // Subsequent openings: Just scan if the location is on/off
      const isGranted = await isLocationPermissionOn();

      if (isGranted) {
        if (hasSaved && LocationState.cityName && LocationState.cityName !== "Current Location") {
          addCurrentLocationPageFromCache();
          setTimeout(async () => {
            await fetchCurrentLocation(true);
          }, 2000);
          startLocationRefresh();
        } else {
          await fetchCurrentLocation(true);
          if (LocationState.hasLocation) {
            startLocationRefresh();
          }
        }
      } else {
        // "If off do not update the location and do not ask for the location access too."
        console.log("Location permission is currently off. Skipping update and prompt.");
        if (hasSaved && LocationState.cityName && LocationState.cityName !== "Current Location") {
          addCurrentLocationPageFromCache();
        }
      }
    }
  };

  useEffect(() => {
    startLocationSystem();

    return () => {
      stopLocationRefresh();
    };
  }, []);

  useEffect(() => {
    const initialRefresh = async () => {
      const locations = stateRef.current.locations;
      const initialIndex = stateRef.current.activeLocationIndex;
      const activeHasCache = !!stateRef.current.weatherData[initialIndex];

      if (activeHasCache) {
        // Cached data is available! Refresh in the background
        setIsRefreshing(true);
        if (locations.length > 0) {
          try {
            await loadWeatherBatch(locations, 0, true);
          } catch (e) {
            console.warn("Initial active weather refresh failed:", e);
          }
        }
        setIsRefreshing(false);
      } else {
        // No cache available! Show blocking skeleton
        setState(prev => ({ ...prev, loading: true }));
        showCitySkeleton();
        if (locations.length > 0) {
          try {
            await loadWeatherBatch(locations, 0, true);
          } catch (e) {
            console.warn("Initial active weather refresh failed:", e);
          }
        }
        setState(prev => ({ ...prev, loading: false }));
        hideCitySkeleton();
      }
    };

    initialRefresh();

    // 2. Continuous background refresh every 5 minutes
    const intervalId = setInterval(async () => {
      if (!navigator.onLine) return;
      console.log("Background weather refresh firing...");
      const locations = stateRef.current.locations;
      if (locations.length > 0) {
        try {
          // Silent background refresh (no loader since forceRefresh is false)
          await loadWeatherBatch(locations, 0, false);
        } catch (e) {
          console.warn("Background weather refresh failed:", e);
        }
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  // Midnight auto-update mechanism
  useEffect(() => {
    const checkMidnightUpdate = async () => {
      const now = new Date();
      const currentHour = now.getHours();
      
      // Check if current hour is midnight (00:00 to 00:59)
      if (currentHour === 0) {
        const todayDateString = now.toDateString(); // e.g., "Thu Jun 11 2026"
        const lastUpdateDateString = localStorage.getItem('last_midnight_update_date');
        
        // If we haven't performed the update today, trigger it
        if (lastUpdateDateString !== todayDateString) {
          console.log("[Midnight Auto-Update] Triggering auto-update to fetch latest Vercel version...");
          
          // Set key immediately so we do not trigger multiple updates in parallel
          localStorage.setItem('last_midnight_update_date', todayDateString);
          
          // Ensure all local states are explicitly saved to localStorage 
          try {
            localStorage.setItem('app_locations', JSON.stringify(stateRef.current.locations));
            localStorage.setItem('app_active_index', String(stateRef.current.activeLocationIndex));
            localStorage.setItem('app_settings', JSON.stringify(stateRef.current.settings));
            LocationState.save();
          } catch (err) {
            console.error("Error saving state before reload:", err);
          }

          // Trigger Service Worker updates to fetch the latest assets from Vercel
          if ('serviceWorker' in navigator) {
            try {
              const registrations = await navigator.serviceWorker.getRegistrations();
              for (const registration of registrations) {
                await registration.update();
              }
            } catch (swErr) {
              console.warn("ServiceWorker update failed:", swErr);
            }
          }

          // Fetch front-end index.html with a cache-buster query parameter to force CDN/Vercel update
          try {
            await fetch('/index.html?cb=' + Date.now(), { cache: 'no-store' });
          } catch (fetchErr) {
            console.warn("Cache-buster fetch failed:", fetchErr);
          }

          // Force fresh page reload to load the latest fetched js/css assets
          console.log("[Midnight Auto-Update] Reloading application now...");
          window.location.reload();
        }
      }
    };

    // Run custom check on mount
    checkMidnightUpdate();

    // Check every 5 minutes
    const midnightInterval = setInterval(checkMidnightUpdate, 5 * 60 * 1000);
    return () => clearInterval(midnightInterval);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (LocationState.hasLocation) {
          const age = Date.now() - (LocationState.lastUpdated || 0);
          // If older than 5 minutes — check location if permission is granted
          if (age > 5 * 60 * 1000) {
            isLocationPermissionOn().then(isGranted => {
              if (isGranted) {
                fetchCurrentLocation(true).catch(e => console.warn("fetchCurrentLocation failed on visibility change:", e));
              }
            }).catch(e => console.warn("isLocationPermissionOn check failed on visibility change:", e));
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, number>>(() => {
    try {
      const d = localStorage.getItem('app_dismissed_alerts');
      return d ? JSON.parse(d) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('app_dismissed_alerts', JSON.stringify(dismissedAlerts));
  }, [dismissedAlerts]);

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isWeakNetwork, setIsWeakNetwork] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isSwipeCommitted, setIsSwipeCommitted] = useState(false);
  const [locationPermissionError, setLocationPermissionError] = useState<boolean>(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [isLocatingOnboarding, setIsLocatingOnboarding] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showCityManager, setShowCityManager] = useState(false);
  const [showRadarMap, setShowRadarMap] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [bgGradients, setBgGradients] = useState({
    current: "linear-gradient(to bottom, #000000, #000000)",
    prev: "linear-gradient(to bottom, #000000, #000000)"
  });
  const [glowActive, setGlowActive] = useState(true);
  const [showAlertsWithDelay, setShowAlertsWithDelay] = useState(false);

  useEffect(() => {
    setActiveAlerts([]); // Clear instantly when city changes or is loading
    setShowAlertsWithDelay(false);
    if (state.loading) {
      return;
    }
    const timer = setTimeout(() => {
      setShowAlertsWithDelay(true);
    }, 2000); // 2 second delayed appearance
    return () => clearTimeout(timer);
  }, [state.activeLocationIndex, state.loading]);

  useEffect(() => {
    setGlowActive(true);
    if (state.settings.backgroundGlow === 'on') {
      const timer = setTimeout(() => {
        setGlowActive(false);
      }, 6500); // 6.5 seconds dynamic glow time
      return () => clearTimeout(timer);
    }
  }, [bgGradients.current, state.settings.backgroundGlow]);
  
  const mainRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('data-color-theme', state.settings.colorTheme || 'green');
  }, [state.settings.colorTheme]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setIsWeakNetwork(false);
      checkConnectionQuality();
      // Trigger refresh for all locations when back online using staggered approach
      loadWeatherBatch(state.locations);
    };
    
    const handleOffline = () => {
      setIsOffline(true);
      setIsWeakNetwork(false);
    };

    const checkConnectionQuality = () => {
      const conn = (navigator as any).connection;
      if (conn) {
        setIsWeakNetwork(conn.effectiveType === '2g' || conn.effectiveType === '3g' || conn.saveData);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const conn = (navigator as any).connection;
    if (conn) {
      conn.addEventListener('change', checkConnectionQuality);
      checkConnectionQuality();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (conn) {
        conn.removeEventListener('change', checkConnectionQuality);
      }
    };
  }, [state.locations]);

  const loadWeather = async (location: Location, index: number, forceRefresh = false) => {
    if (!location) return;

    // STEP 1 — Kill animations immediately
    disableAllAnimations();

    const cityKey = getCityKey(location);
    const cacheResult = getCachedWeatherData(cityKey);

    if (cacheResult && !forceRefresh) {
      const { data: cachedData, ts } = cacheResult;
      
      // Update state with cached data instantly.
      setState(prev => ({
        ...prev,
        weatherData: { ...prev.weatherData, [index]: cachedData },
        loading: false,
        error: null
      }));

      // Hide skeleton and restore animations instantly
      hideCitySkeleton();
      enableAllAnimations();

      // Fetch fresh silently in the background if the cache is older than 10 minutes
      const cacheAge = Date.now() - ts;
      const isStale = cacheAge > 10 * 60 * 1000;
      
      if (!navigator.onLine || !isStale) return;
    } else if (!cacheResult) {
      // No cache — show skeleton instantly
      showCitySkeleton();
      setState(prev => ({ ...prev, loading: true }));
    }

    try {
      const data = await fetchWeather(location.latitude, location.longitude, location.timezone, location.name, location.country);
      saveWeatherData(cityKey, data);
      
      // Check weather alerts with OneSignal on every refresh/fetch
      checkWeatherAlerts(data, location.name);
      
      setState(prev => {
        if (prev.locations.length <= index || prev.locations[index]?.name !== location.name) {
          return prev;
        }
        return {
          ...prev,
          weatherData: { ...prev.weatherData, [index]: data },
          loading: false,
          error: null,
        };
      });

      // Render fresh data, hide skeleton, and enable animations smoothly
      hideCitySkeleton();
      enableAllAnimations();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`Weather fetch failed for ${location?.name || 'Unknown'}:`, errorMsg);
      
      let message = 'Weather service unavailable';
      const isNetErr = errorMsg.toLowerCase().includes('failed to fetch') || 
                        errorMsg.toLowerCase().includes('fetch') || 
                        errorMsg.toLowerCase().includes('network') || 
                        errorMsg.toLowerCase().includes('timeout');
      
      if (isNetErr) {
        setIsWeakNetwork(true);
      }

      if (err instanceof Error) {
        message = err.message;
        if (isNetErr) {
          message = 'Could not connect to the weather server. Your internet connection is weak, you are offline, or an ad-blocker is blocking the transfer.';
        }
        if (message === 'Script error.') {
          message = 'A weak network or connection interface error occurred. Please check your signal and try again.';
        }
      }

      // If we already have cache but fetch failed (likely offline/timeout), keep the cache
      if (state.weatherData[index] || cacheResult) {
        setState(prev => ({ ...prev, loading: false }));
        hideCitySkeleton();
        enableAllAnimations();
        return;
      }

      setState(prev => ({
        ...prev,
        loading: false,
        error: prev.activeLocationIndex === index ? message : prev.error,
      }));

      hideCitySkeleton();
      enableAllAnimations();
    }
  };

  const isNightHour = (now: number | Date, sunriseISO?: string, sunsetISO?: string): boolean => {
    if (!sunriseISO || !sunsetISO) {
      const hr = new Date(now).getHours();
      return hr < 6 || hr >= 19;
    }
    try {
      const nowTime = new Date(now).getTime();
      const riseTime = new Date(sunriseISO).getTime();
      const setTime = new Date(sunsetISO).getTime();
      return nowTime < riseTime || nowTime > setTime;
    } catch {
      const hr = new Date(now).getHours();
      return hr < 6 || hr >= 19;
    }
  };

  const applyWeatherGradient = (weatherCode: number, isNight: boolean, sunriseISO?: string, sunsetISO?: string) => {
    let newGrad = "radial-gradient(circle 550px at 50% 220px, #000000 0%, #000000 100%)";
    
    // Custom Morning/Evening check
    let specialAtmosphere: 'none' | 'morning' | 'evening' = 'none';
    if ((weatherCode === 0 || weatherCode === 1) && sunriseISO && sunsetISO) {
      try {
        const nowMs = Date.now();
        const riseTime = new Date(sunriseISO).getTime();
        const setTime = new Date(sunsetISO).getTime();
        
        if (nowMs >= riseTime && nowMs <= riseTime + 1.5 * 60 * 60 * 1000) {
          specialAtmosphere = 'morning';
        } else if (nowMs >= setTime - 1.5 * 60 * 60 * 1000 && nowMs <= setTime) {
          specialAtmosphere = 'evening';
        }
      } catch (e) {
        console.warn("Error parsing sunrise/sunset inside applyWeatherGradient", e);
      }
    }

    if (specialAtmosphere === 'morning') {
      newGrad = "radial-gradient(circle 550px at 50% 220px, #ff8c00 0%, #ff5200 40%, #b22222 80%, #000000 100%)";
    } else if (specialAtmosphere === 'evening') {
      newGrad = "radial-gradient(circle 550px at 50% 220px, #e52d27 0%, #b31217 40%, #7a0055 80%, #000000 100%)";
    } else if (isNight) {
      if (weatherCode === 0 || weatherCode === 1) {
        newGrad = "radial-gradient(circle 550px at 50% 220px, #0a1122 0%, #070c18 25%, #040810 50%, #020408 75%, #000000 100%)";
      } else if (weatherCode === 2 || weatherCode === 3) {
        newGrad = "radial-gradient(circle 550px at 50% 220px, #10141b 0%, #0c0f14 25%, #080a0e 50%, #040507 75%, #000000 100%)";
      } else if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) {
        newGrad = "radial-gradient(circle 550px at 50% 220px, #0f1726 0%, #0b111c 25%, #070b13 50%, #030509 75%, #000000 100%)";
      } else if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) {
        newGrad = "radial-gradient(circle 550px at 50% 220px, #192841 0%, #131e31 25%, #0d1421 50%, #060a10 75%, #000000 100%)";
      } else if (weatherCode >= 95 && weatherCode <= 99) {
        newGrad = "radial-gradient(circle 550px at 50% 220px, #140f1e 0%, #0f0b17 25%, #0a0710 50%, #050308 75%, #000000 100%)";
      } else {
        newGrad = "radial-gradient(circle 550px at 50% 220px, #080b13 0%, #05070d 25%, #030409 50%, #010204 75%, #000000 100%)";
      }
    } else {
      if (weatherCode === 0 || weatherCode === 1) {
        newGrad = "radial-gradient(circle 550px at 50% 220px, #142456 0%, #0f1c44 25%, #0b1433 50%, #060b1e 75%, #000000 100%)";
      } else if (weatherCode === 2 || weatherCode === 3) {
        newGrad = "radial-gradient(circle 550px at 50% 220px, #20293c 0%, #171e2c 25%, #10151f 50%, #080a10 75%, #000000 100%)";
      } else if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) {
        newGrad = "radial-gradient(circle 550px at 50% 220px, #1c273e 0%, #141c2c 25%, #0e1320 50%, #070a11 75%, #000000 100%)";
      } else if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) {
        newGrad = "radial-gradient(circle 550px at 50% 220px, #223c6c 0%, #182b4f 25%, #111e38 50%, #09101f 75%, #000000 100%)";
      } else if (weatherCode >= 95 && weatherCode <= 99) {
        newGrad = "radial-gradient(circle 550px at 50% 220px, #1a2032 0%, #121825 25%, #0c101a 50%, #06080d 75%, #000000 100%)";
      } else {
        newGrad = "radial-gradient(circle 550px at 50% 220px, #0e1830 0%, #0a1122 25%, #070c18 50%, #03060c 75%, #000000 100%)";
      }
    }

    setBgGradients(prev => {
      if (prev.current === newGrad) return prev;
      return {
        prev: prev.current,
        current: newGrad
      };
    });
  };

  const restartWeatherAnimations = (weatherCode: number, isNight: boolean) => {
    // Find all weather effect elements
    const effects = document.querySelectorAll(
      "[class*='rain'], [class*='snow'], " +
      "[class*='cloud'], [class*='lightning'], " +
      "[class*='particle'], [class*='atmosphere'], " +
      "[class*='weather-fx'], [class*='fog']"
    );

    effects.forEach(el => {
      // Reset animation by removing and re-adding
      (el as HTMLElement).style.animationPlayState = "paused";
      void (el as HTMLElement).offsetWidth; // force reflow
      (el as HTMLElement).style.animationPlayState = "running";
      (el as HTMLElement).style.willChange = "transform, opacity";
    });

    console.log("Weather animations restarted for:");
  };

  const silentRefreshCity = async (city: Location, index: number) => {
    if (!navigator.onLine) return;
    try {
      const fresh = await fetchWeather(city.latitude, city.longitude, city.timezone, city.name, city.country);
      const cityKey = getCityKey(city);
      saveWeatherData(cityKey, fresh);
      setState(prev => {
        if (prev.activeLocationIndex === index && prev.locations[index]?.name === city.name) {
          return {
            ...prev,
            weatherData: { ...prev.weatherData, [index]: fresh }
          };
        }
        return prev;
      });
    } catch (e) {
      console.warn("Silent refresh failed:", e);
    }
  };

  const switchToCity = async (newIndex: number) => {
    if (newIndex === state.activeLocationIndex) return;

    // Direct performance gain: pause heavy animations during visual transition slide
    killAnimations();
    setHeaderVisible(true);

    const city = state.locations[newIndex];
    if (!city) return;

    // Load Cache
    const cityKey = getCityKey(city);
    const cached = getCachedWeatherData(cityKey);

    if (cached?.data) {
      // Sync React state directly and instantly - No manual DOM hacks or timers!
      setState(prev => ({
        ...prev,
        activeLocationIndex: newIndex,
        weatherData: { ...prev.weatherData, [newIndex]: cached.data },
        loading: false,
        error: null
      }));

      // Apply weather gradient smoothly based on Cache data
      const riseTime = cached.data.daily?.sunrise?.[0];
      const setTime = cached.data.daily?.sunset?.[0];
      const isNight = isNightHour(
        Date.now(),
        riseTime,
        setTime
      );
      applyWeatherGradient(
        cached.data.current?.weatherCode || 0,
        isNight,
        riseTime,
        setTime
      );
    } else {
      // No cache - show modern skeletons
      setState(prev => ({
        ...prev,
        activeLocationIndex: newIndex,
        loading: true
      }));

      try {
        const fresh = await fetchWeather(city.latitude, city.longitude, city.timezone, city.name, city.country);
        saveWeatherData(cityKey, fresh);

        setState(prev => ({
          ...prev,
          weatherData: { ...prev.weatherData, [newIndex]: fresh },
          loading: false,
          error: null
        }));

        const riseTime = fresh.daily?.sunrise?.[0];
        const setTime = fresh.daily?.sunset?.[0];
        const isNight = isNightHour(
          Date.now(),
          riseTime,
          setTime
        );
        applyWeatherGradient(
          fresh.current?.weatherCode || 0,
          isNight,
          riseTime,
          setTime
        );
      } catch (err) {
        console.warn("switchToCity fetch failed:", err);
        setState(prev => ({
          ...prev,
          loading: false,
          error: "Failed to load weather data"
        }));
      }
    }

    // ── BACKGROUND UPDATES ──────
    // Keep AQI loading asynchronous so visual transitions stay extremely responsive
    setTimeout(() => {
      refreshAQIForIndex(newIndex);
    }, 120);

    // Run silent refresh in background if cache is old (>10 mins)
    const cacheAge = cached?.ts 
      ? Date.now() - cached.ts 
      : Infinity;

    if (cacheAge > 10 * 60 * 1000) {
      setTimeout(() => {
        silentRefreshCity(city, newIndex).catch(err => {
          console.warn("silentRefreshCity failed:", err);
        });
      }, 500);
    }
  };

  const addLocation = (location: Location) => {
    // 1. Check if location already exists upfront to avoid async state issues
    const existsIndex = state.locations.findIndex(l => {
      const sameCoords = Math.abs(l.latitude - location.latitude) < 0.01 && 
                         Math.abs(l.longitude - location.longitude) < 0.01;
      const sameId = l.id !== 0 && l.id === location.id;
      const sameName = l.name.toLowerCase() === location.name.toLowerCase() && 
                       l.country === location.country &&
                       l.admin1 === location.admin1;
      
      return sameCoords || sameId || sameName;
    });

    if (existsIndex !== -1) {
      setState(prev => {
        const newWeatherData = { ...prev.weatherData };
        if (!newWeatherData[existsIndex]) {
          const cached = getCachedWeatherData(getCityKey(prev.locations[existsIndex]));
          if (cached) {
            newWeatherData[existsIndex] = cached.data;
          }
        }
        return {
          ...prev,
          activeLocationIndex: existsIndex,
          weatherData: newWeatherData,
          showSettings: false
        };
      });
      return;
    }

    // 2. Prepare new list and index
    const newIndex = state.locations.length;
    const newLocations = [...state.locations, location];

    // 3. Update state with immediate loading for the new index
    setState(prev => {
      const newWeatherData = { ...prev.weatherData };
      const cached = getCachedWeatherData(getCityKey(location));
      if (cached) {
        newWeatherData[newIndex] = cached.data;
      }
      return {
        ...prev,
        locations: newLocations,
        activeLocationIndex: newIndex,
        weatherData: newWeatherData,
        loading: !cached,
        error: null
      };
    });

    // 4. Trigger weather fetch for the new city
    loadWeather(location, newIndex);
  };

  const removeLocation = (index: number) => {
    if (state.locations.length <= 1) {
      console.warn("Cannot remove the last location");
      return;
    }
    const targetLoc = state.locations[index];
    if (targetLoc && targetLoc.isCurrentLocation) {
      LocationState.clear();
      console.log("Current location-based page removed in CityManager");
    }
    setState(prev => {
      const newLocations = prev.locations.filter((_, i) => i !== index);
      const newIndex = Math.max(0, Math.min(newLocations.length - 1, prev.activeLocationIndex));
      
      // Clean up weather data map
      const newWeatherData: Record<number, WeatherData> = {};
      newLocations.forEach((_, i) => {
        const oldIndex = i < index ? i : i + 1;
        if (prev.weatherData[oldIndex]) {
          newWeatherData[i] = prev.weatherData[oldIndex];
        }
      });

      return {
        ...prev,
        locations: newLocations,
        activeLocationIndex: newIndex,
        weatherData: newWeatherData
      };
    });
  };

  const reorderLocations = (newLocations: Location[]) => {
    // Lock the location-based added city (isCurrentLocation = true) strictly as the first page/item
    const currentLoc = newLocations.find(l => l.isCurrentLocation);
    let finalLocations = [...newLocations];
    if (currentLoc) {
      const otherLocs = newLocations.filter(l => !l.isCurrentLocation);
      finalLocations = [currentLoc, ...otherLocs];
    }

    setState(prev => {
      // Rebuild weather data map based on new order
      const newWeatherData: Record<number, WeatherData> = {};
      finalLocations.forEach((loc, i) => {
        const oldIndex = prev.locations.findIndex(l => l.name === loc.name && l.latitude === loc.latitude);
        if (oldIndex !== -1 && prev.weatherData[oldIndex]) {
          newWeatherData[i] = prev.weatherData[oldIndex];
        }
      });

      return {
        ...prev,
        locations: finalLocations,
        weatherData: newWeatherData
      };
    });
  };

  const loadWeatherBatch = async (locations: Location[], startIndex = 0, forceRefresh = false) => {
    if (locations.length === 0) return;

    // Load from cache first for immediate display unless forcing fresh refresh (Offline Support)
    if (!forceRefresh || !navigator.onLine) {
      const initialCachedData: Record<number, WeatherData> = {};
      locations.forEach((loc, idx) => {
        const cached = getCachedWeatherData(getCityKey(loc));
        if (cached) initialCachedData[startIndex + idx] = cached.data;
      });

      if (Object.keys(initialCachedData).length > 0) {
        setState(prev => ({
          ...prev,
          weatherData: { ...prev.weatherData, ...initialCachedData },
          loading: false
        }));
      }
    }

    if (!navigator.onLine) return;

    // Use bulk fetch for significantly improved performance
    try {
      const bulkData = await fetchWeatherBulk(locations);
      
      setState(prev => {
        const newWeatherData = { ...prev.weatherData };
        Object.entries(bulkData).forEach(([index, data]) => {
          const idx = parseInt(index);
          const absoluteIdx = startIndex + idx;
          newWeatherData[absoluteIdx] = data as WeatherData;
          // Save to persistent cache
          saveWeatherData(getCityKey(locations[idx]), data as WeatherData);
          // Check weather alerts with OneSignal on every refresh/fetch
          checkWeatherAlerts(data as WeatherData, locations[idx].name);
        });

        return {
          ...prev,
          weatherData: newWeatherData,
          loading: false,
          error: null
        };
      });
    } catch (err) {
      console.warn('Bulk weather load failed, falling back to staggered:', err);
      // If we are online but bulk fails, try staggered
      if (navigator.onLine) {
        try {
          for (let i = 0; i < locations.length; i++) {
            await loadWeather(locations[i], startIndex + i, forceRefresh);
            // Slight delay to avoid rate limiting
            if (i < locations.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 800));
            }
          }
        } catch (staggerErr) {
          console.error('All fetch attempts failed:', staggerErr);
          setState(prev => ({
            ...prev,
            loading: false,
            error: "Unable to refresh weather data. Please check your connection or try again later."
          }));
        }
      } else {
        setState(prev => ({ ...prev, loading: false }));
      }
    }
  };

  useEffect(() => {
    localStorage.setItem('app_settings', JSON.stringify(state.settings));
    localStorage.setItem('app_locations', JSON.stringify(state.locations));
    localStorage.setItem('app_active_index', state.activeLocationIndex.toString());
  }, [state.settings, state.locations, state.activeLocationIndex]);

  // Proactively pre-translate all city names and all settings keys/descriptions whenever locations or selected language changes
  useEffect(() => {
    const lang = state.settings.language || 'en';
    if (lang === 'en') return;

    // 1. All city names
    state.locations.forEach(loc => {
      if (loc.name) {
        fetchDynamicTranslation(loc.name, lang);
      }
    });

    // 2. All settings titles and static terms
    const settingsStrings = [
      "Settings",
      "Push alerts & summaries",
      "Enable push alerts",
      "Get native reports on your device",
      "Requesting permission...",
      "Active & Synced with Cloud",
      "Permission Denied",
      "Morning weather summary",
      "Get today's dynamic weather report delivered in the morning",
      "Night weather summary",
      "Get tomorrow's weather outlook delivered in the evening",
      "Threshold triggers",
      "Rain threshold",
      "Snow threshold",
      "Thunderstorm alerts",
      "Severe weather alerts",
      "Units",
      "Temperature Unit",
      "Wind Speed Unit",
      "Visibility Unit",
      "Pressure Unit",
      "Precipitation Unit",
      "General",
      "App Language",
      "Haptic feedback",
      "Time Format",
      "Icons & Atmosphere",
      "Atmosphere Glow",
      "Experience minor UI lag on older devices? Try turning off the atmosphere glow for a smoother experience.",
      "Theme & Styling",
      "Icons Style",
      "Outline",
      "Coloured",
      "Active Locations",
      "Manage Locations",
      "Add new city",
      "About",
      "Version",
      "Build",
      "Developer",
      "Open-source license",
      "Privacy Policy",
      "Terms of Service",
      "Terms of Use",
      TERMS_CONTENT,
      PRIVACY_CONTENT
    ];

    settingsStrings.forEach(str => {
      fetchDynamicTranslation(str, lang);
    });
  }, [state.locations, state.settings.language]);

  // Service Worker pre-fetching strategy for adjacent cities in the swipe sequence
  useEffect(() => {
    if ('serviceWorker' in navigator && state.locations.length > 1) {
      const len = state.locations.length;
      const nextIdx = (state.activeLocationIndex + 1) % len;
      const prevIdx = (state.activeLocationIndex - 1 + len) % len;

      const nextCity = state.locations[nextIdx];
      const prevCity = state.locations[prevIdx];

      const urls: string[] = [];
      if (nextCity) {
        urls.push(...getPrefetchUrls(nextCity.latitude, nextCity.longitude, nextCity.name));
      }
      if (prevCity) {
        urls.push(...getPrefetchUrls(prevCity.latitude, prevCity.longitude, prevCity.name));
      }

      if (urls.length > 0) {
        const sendMsg = (worker: ServiceWorker) => {
          worker.postMessage({
            type: "PREFETCH_WEATHER",
            urls: urls
          });
        };

        if (navigator.serviceWorker.controller) {
          sendMsg(navigator.serviceWorker.controller);
        } else {
          navigator.serviceWorker.ready.then(reg => {
            if (reg.active) {
              sendMsg(reg.active);
            }
          }).catch(err => {
            console.warn("SW ready failed:", err);
          });
        }
      }
    }
  }, [state.activeLocationIndex, state.locations]);

  const rawActiveWeather = state.weatherData[state.activeLocationIndex];
  const activeLocation = state.locations[state.activeLocationIndex];

  // Dynamically calibrate activeWeather on-the-fly using our ML model if enabled
  const activeWeather = React.useMemo(() => {
    if (!rawActiveWeather || !state.settings.mlEnabled || !activeLocation) {
      return rawActiveWeather;
    }
    const cityKey = getCityKey(activeLocation);
    return {
      ...rawActiveWeather,
      current: {
        ...rawActiveWeather.current,
        temperature: calibrateTemperature(cityKey, rawActiveWeather.current.temperature),
        apparentTemperature: calibrateTemperature(cityKey, rawActiveWeather.current.apparentTemperature),
      },
      hourly: {
        ...rawActiveWeather.hourly,
        temperature: rawActiveWeather.hourly.temperature.map(t => calibrateTemperature(cityKey, t)),
        temperature_2m: rawActiveWeather.hourly.temperature_2m?.map(t => calibrateTemperature(cityKey, t)) || [],
      },
      daily: {
        ...rawActiveWeather.daily,
        temperatureMax: rawActiveWeather.daily.temperatureMax.map(t => calibrateTemperature(cityKey, t)),
        temperatureMin: rawActiveWeather.daily.temperatureMin.map(t => calibrateTemperature(cityKey, t)),
      }
    };
  }, [rawActiveWeather, state.settings.mlEnabled, activeLocation]);

  // Sync background weather gradient on active location/weather data change
  useEffect(() => {
    if (activeWeather) {
      const riseTime = activeWeather.daily?.sunrise?.[0];
      const setTime = activeWeather.daily?.sunset?.[0];
      const isNight = isNightHour(
        Date.now(),
        riseTime,
        setTime
      );
      applyWeatherGradient(
        activeWeather.current?.weatherCode || 0,
        isNight,
        riseTime,
        setTime
      );
    }
  }, [state.activeLocationIndex, activeWeather]);

  // Update OneSignal device tags on weather load or location updates
  useEffect(() => {
    if (activeLocation && activeWeather) {
      tagDeviceLocation(activeLocation.name, activeLocation.latitude, activeLocation.longitude);
    }
  }, [activeLocation, activeWeather]);

  // Push Notification Helper
  const sendNotification = async (title: string, body: string, icon: string = '/icon-192.png') => {
    if (!state.settings.pushEnabled) return; // Respect push alerts setting
    // Strictly verify if notification permission is explicitly granted
    if (SafeNotif.getPermission() !== "granted") {
      console.log("Notification permission not granted. Skipping notification dispatch.");
      return;
    }

    Haptic.warning(state.settings.hapticEnabled);

    // Try to trigger via OneSignal REST API using the subscription/playerId
    try {
      const playerId = state.settings.oneSignalPlayerId || localStorage.getItem("onesignal_player_id") || (window as any).OneSignal?.User?.PushSubscription?.id;
      if (playerId) {
        fetch("https://onesignal.com/api/v1/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            app_id: "d78d4db3-2898-4f81-8bba-c8b5b719ee1b",
            include_subscription_ids: [playerId],
            headings: { en: title },
            contents: { en: body }
          })
        }).catch(err => console.warn("OneSignal server push failed:", err));
      }
    } catch (err) {
      console.warn("OneSignal endpoint call failed:", err);
    }

    // Always trigger native local/service-worker display so it shows within the device instantly
    await SafeNotif.send(title, body, icon);
  };

  // OneSignal Welcome push / local notification when downloading the app
  useEffect(() => {
    const isWelcomed = localStorage.getItem('nimbus_black_welcomed') === 'true';
    if (!isWelcomed && state.settings.pushEnabled && SafeNotif.getPermission() === "granted") {
      localStorage.setItem('nimbus_black_welcomed', 'true');
      sendNotification(
        "🖤 Welcome to Overcast",
        "Your ultra-minimalist, black weather experience is now active. Enjoy smooth real-time tracking and precise forecasts."
      );
    }
  }, [state.settings.pushEnabled]);

  useEffect(() => {
    if (!activeWeather || !activeWeather.hourly || !activeWeather.current) return;
    const w = activeWeather;
    const s = state.settings;
    const alerts: any[] = [];
    
    // Get the current hour index for the location
    const hourIndex = getCurrentHourIndex(w.timezone || 'UTC', w.hourly.time);
    
    console.log("Current hour index:", hourIndex);
    console.log("Current precip %:", w.hourly.precipitationProbability[hourIndex]);
    console.log("Timezone:", w.timezone);

    // 1. Rain Alerts (Checks if rain is forecast in next 12 hours matching user's custom rainThreshold, inclusive of thunderstorms)
    let hasRainForecast = false;
    let maxRainProb = 0;
    const isSnowCode = (code: number) => [71, 73, 75, 77, 85, 86].includes(code);
    const isRainCode = (code: number) => [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);
    
    // Check if currently raining
    const currentCode = w.current.weatherCode || 0;
    if (isRainCode(currentCode)) {
      hasRainForecast = true;
      maxRainProb = 100;
    }

    for (let i = hourIndex; i < Math.min(hourIndex + 12, w.hourly.time.length); i++) {
      const code = w.hourly.weatherCode?.[i] || w.hourly.weathercode?.[i] || 0;
      const prob = w.hourly.precipitationProbability?.[i] || 0;
      const temp = w.hourly.temperature?.[i] || w.hourly.temperature_2m?.[i] || 15;
      
      const isSnow = isSnowCode(code) || temp <= 2;
      const isRain = isRainCode(code);
      
      if ((prob >= s.rainThreshold || isRain) && !isSnow) {
        hasRainForecast = true;
        const effectiveProb = prob > 0 ? prob : Math.max(80, s.rainThreshold);
        if (effectiveProb > maxRainProb) {
          maxRainProb = effectiveProb;
        }
      }
    }

    if (s.alertRain && hasRainForecast && maxRainProb >= s.rainThreshold) {
      alerts.push({
        id: 'rain-alert',
        type: 'rain',
        title: 'Rain Expected',
        message: `${maxRainProb}% chance of rain in the forecast.`
      });
    }

    // 2. Snow Alerts (Checks if snow is forecast in next 12 hours matching user's custom snowThreshold)
    let hasSnowForecast = false;
    let maxSnowProb = 0;
    
    for (let i = hourIndex; i < Math.min(hourIndex + 12, w.hourly.time.length); i++) {
      const code = w.hourly.weatherCode?.[i] || w.hourly.weathercode?.[i] || 0;
      const snowfall = w.hourly.snowfall?.[i] || 0;
      const prob = w.hourly.precipitationProbability?.[i] || 0;
      
      if (isSnowCode(code) || snowfall > 0) {
        if (prob >= s.snowThreshold) {
          hasSnowForecast = true;
          if (prob > maxSnowProb) {
            maxSnowProb = prob;
          }
        }
      }
    }
    
    if (!hasSnowForecast && s.alertDaily) {
      for (let i = hourIndex; i < Math.min(hourIndex + 12, w.hourly.time.length); i++) {
        const prob = w.hourly.precipitationProbability?.[i] || 0;
        const temp = w.hourly.temperature?.[i] || w.hourly.temperature_2m?.[i] || 0;
        if (prob >= s.snowThreshold && temp <= 2 && prob > 0) {
          hasSnowForecast = true;
          if (prob > maxSnowProb) {
            maxSnowProb = prob;
          }
        }
      }
    }

    if (s.alertDaily && hasSnowForecast && maxSnowProb >= s.snowThreshold) {
      alerts.push({
        id: 'snow-alert',
        type: 'snow',
        title: 'Snowfall Warning',
        message: `${maxSnowProb}% chance of snow in the forecast.`
      });
    }

    // 3. Thunderstorm check (Checks if thunderstorm is active or forecast in next 12 hours)
    const isStormCode = (code: number) => [95, 96, 99].includes(code);
    let hasStormForecast = isStormCode(w.current.weatherCode);
    let stormCode = w.current.weatherCode;
    
    for (let i = hourIndex; i < Math.min(hourIndex + 12, w.hourly.time.length); i++) {
      const code = w.hourly.weatherCode?.[i] || w.hourly.weathercode?.[i] || 0;
      if (isStormCode(code)) {
        hasStormForecast = true;
        if (!isStormCode(stormCode) || code === 99) {
          stormCode = code;
        }
      }
    }

    if (s.stormThreshold && hasStormForecast) {
      const isSevere = stormCode === 99 || w.current.windSpeed > 15;
      if (isSevere) {
        alerts.push({
          id: 'severe-storm-alert',
          type: 'severe_storm',
          title: 'Severe Thunderstorm',
          message: 'Intense thunderstorm with potential for heavy precip or damaging winds.'
        });
      } else {
        alerts.push({
          id: 'storm-alert',
          type: 'storm',
          title: 'Thunderstorm Warning',
          message: 'A thunderstorm is expected or active in your area.'
        });
      }
    }

    // 4. Severe weather (Checks for heavy storms/hail, wind, or extreme temperatures in next 12 hours)
    let hasSevereForecast = [82, 86].includes(w.current.weatherCode) || w.current.windSpeed > 20 || w.current.temperature > 40 || w.current.temperature < -15;
    
    if (!hasSevereForecast) {
      for (let i = hourIndex; i < Math.min(hourIndex + 12, w.hourly.time.length); i++) {
        const code = w.hourly.weatherCode?.[i] || w.hourly.weathercode?.[i] || 0;
        const temp = w.hourly.temperature?.[i] || w.hourly.temperature_2m?.[i] || 0;
        if ([82, 86].includes(code) || temp > 40 || temp < -15) {
          hasSevereForecast = true;
          break;
        }
      }
    }

    if (s.alertSevere && hasSevereForecast) {
      alerts.push({
        id: 'severe-alert',
        type: 'severe',
        title: 'Severe Weather Warning',
        message: 'Extreme precipitation or temperatures detected.'
      });
    }

    // 5. AQI Alert
    if (w.airQuality && w.airQuality.usAqi > 100) {
      alerts.push({
        id: 'aqi-alert',
        type: 'severe',
        title: 'Air Quality Warning',
        message: `Air quality is ${w.airQuality.description} (${w.airQuality.usAqi}).`
      });
    }

    const now = Date.now();
    const active = alerts.filter(alert => {
      const dismissedAt = dismissedAlerts[alert.id];
      if (!dismissedAt) return true;
      const hoursSinceDismissal = (now - dismissedAt) / (1000 * 60 * 60);
      return hoursSinceDismissal > 24;
    });

    // Trigger push notifications for NEW alerts
    active.forEach(alert => {
      if (!activeAlerts.some(a => a.id === alert.id)) {
        sendNotification(alert.title, alert.message);
      }
    });

    setActiveAlerts(active);
  }, [activeWeather, activeLocation, state.settings, dismissedAlerts]);

  // Daily Summary (Time-based)
  useEffect(() => {
    const checkNotification = () => {
      if (!activeWeather || !activeWeather.daily || !activeWeather.daily.temperatureMax || !state.settings.alertDaily) return;
      const now = Date.now();
      const timeStr = format(now, 'HH:mm');
      if (timeStr === state.settings.notificationTime) {
        const summary = `Today: ${formatTemp(activeWeather.daily.temperatureMax[0], state.settings.unitTemp)}°${state.settings.unitTemp}, ${activeWeather.airQuality?.description} Air.`;
        sendNotification("Overcast", summary);
      }
    };

    if (state.locations.length >= 1) {
      SafeNotif.init().catch(() => {});
    }
    const interval = setInterval(checkNotification, 60000); 
    return () => clearInterval(interval);
  }, [activeWeather, state.settings.notificationTime, state.settings.alertDaily, state.settings.unitTemp]);

  const updateSettings = (settings: Settings) => {
    setState(prev => ({ ...prev, settings }));
  };

  const [showExitToast, setShowExitToast] = useState(false);
  
  // Back button handling logic
  const panelStackRef = useRef<(() => void)[]>([]);
  const panelNamesRef = useRef<string[]>([]);
  const lastSwipeTimeRef = useRef<number>(0);

  useEffect(() => {
    // 1. Initialize on app start: Push an initial state so the first back press doesn't immediately exit
    try {
      if (window.history.state?.panel !== 'home') {
        window.history.pushState({ panel: "home" }, "");
      }
    } catch (e) {
      console.warn("history initialization failed:", e);
    }

    // Initialize notification states and startup alert schedulers
    applyNotifToggleStates();
    if (NotifSettings.morningEnabled) {
      scheduleMorningSummary();
    }
    if (NotifSettings.nightEnabled) {
      scheduleNightSummary();
    }

    let backPressCount = 0;
    let toastTimer: any = null;

    // 2. Global popstate listener to handle back button
    const handlePopState = (e: PopStateEvent) => {
      const targetPanel = e.state?.panel || 'home';
      const currentPanel = panelNamesRef.current[panelNamesRef.current.length - 1] || 'home';

      // If already matching, don't double pop
      if (currentPanel === targetPanel) {
        return;
      }

      // If the target panel is not in our track stack and is not 'home',
      // it means this history point was already closed programmatically in the UI.
      // So we should ignore this popstate event to avoid double-dismissing or closing incorrect panels.
      if (panelNamesRef.current.indexOf(targetPanel) === -1 && targetPanel !== 'home') {
        return;
      }

      if (panelNamesRef.current.length > 0) {
        backPressCount = 0;
        setShowExitToast(false);

        // Keep popping until we match the target state or are empty
        while (panelNamesRef.current.length > 0) {
          const topName = panelNamesRef.current[panelNamesRef.current.length - 1];
          if (topName === targetPanel) {
            break;
          }

          panelNamesRef.current.pop();
          const closePanel = panelStackRef.current.pop();
          if (closePanel) {
            closePanel();
          }

          if (targetPanel === 'home' && panelNamesRef.current.length === 0) {
            break;
          }
        }
      } else {
        // Handle exit confirmation on home screen
        backPressCount++;
        
        if (backPressCount === 1) {
          setShowExitToast(true);
          try {
            window.history.pushState({ panel: "home" }, ""); // re-push so we get another popstate
          } catch (e) {
            console.warn("history re-push failed:", e);
          }
          
          if (toastTimer) clearTimeout(toastTimer);
          toastTimer = setTimeout(() => { 
            backPressCount = 0; 
            setShowExitToast(false);
          }, 2000);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (toastTimer) clearTimeout(toastTimer);
    };
  }, []);

  const pushPanel = (closeFn: () => void, name: string) => {
    try {
      window.history.pushState({ panel: name }, "");
    } catch (e) {
      console.warn("pushPanel failed:", e);
    }
    panelStackRef.current.push(closeFn);
    panelNamesRef.current.push(name);
  };

  const handleBack = () => {
    if (panelStackRef.current.length > 0) {
      panelNamesRef.current.pop();
      const closePanel = panelStackRef.current.pop();
      if (closePanel) {
        closePanel();
      }
      setTimeout(() => {
        try {
          window.history.back();
        } catch (e) {
          console.warn("history.back failed:", e);
        }
      }, 0);
    } else {
      setTimeout(() => {
        try {
          window.history.back();
        } catch (e) {
          console.warn("history.back failed:", e);
        }
      }, 0);
    }
  };

  const handleBackMultiple = (count: number) => {
    if (count <= 0) return;
    let actualPopped = 0;
    for (let i = 0; i < count; i++) {
      if (panelStackRef.current.length > 0) {
        panelNamesRef.current.pop();
        const closePanel = panelStackRef.current.pop();
        if (closePanel) {
          closePanel();
        }
        actualPopped++;
      }
    }
    if (actualPopped > 0) {
      setTimeout(() => {
        try {
          window.history.go(-actualPopped);
        } catch (e) {
          console.warn("history.go failed:", e);
        }
      }, 0);
    }
  };

  const toggleSettings = () => {
    if (!state.showSettings) {
      Haptic.medium(state.settings.hapticEnabled);
      setState(prev => ({ ...prev, showSettings: true }));
      pushPanel(() => setState(prev => ({ ...prev, showSettings: false })), 'settings');
    } else {
      setState(prev => ({ ...prev, showSettings: false }));
      const idx = panelNamesRef.current.indexOf('settings');
      if (idx !== -1) {
        const itemsToPop = panelNamesRef.current.length - idx;
        handleBackMultiple(itemsToPop);
      }
    }
  };

  const openSearch = () => {
    Haptic.medium(state.settings.hapticEnabled);
    setShowSearch(true);
    pushPanel(() => setShowSearch(false), 'search');
  };

  // Manual refresh logic
  const handleRefresh = async () => {
    if (isRefreshing || state.locations.length === 0) return;
    setIsRefreshing(true);
    Haptic.medium(state.settings.hapticEnabled);
    
    const startTime = Date.now();
    try {
      await refreshWeather();
      Haptic.success(state.settings.hapticEnabled);
    } catch (e) {
      console.warn("Manual refresh failed:", e);
      Haptic.warning(state.settings.hapticEnabled);
    } finally {
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, 800 - elapsed);
      setTimeout(() => setIsRefreshing(false), remainingTime);
    }
  };

  const handleSwipe = (direction: 'left' | 'right') => {
    const now = Date.now();
    if (now - lastSwipeTimeRef.current < 450) {
      return;
    }
    lastSwipeTimeRef.current = now;

    Haptic.light(state.settings.hapticEnabled);
    setSlideDirection(direction);
    
    const isLeft = direction === 'left';
    let nextIndex;
    if (isLeft) {
      nextIndex = (state.activeLocationIndex + 1) % state.locations.length;
    } else {
      nextIndex = (state.activeLocationIndex - 1 + state.locations.length) % state.locations.length;
    }

    switchToCity(nextIndex);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  useEffect(() => {
    const cleanup = initGestures();

    const onSwipeLeft = () => {
      if (state.showSettings || showSearch || showCityManager || showRadarMap || state.locations.length <= 1) {
        setIsSwiping(false);
        setIsSwipeCommitted(false);
        return;
      }
      setIsSwipeCommitted(true);
      handleSwipe('left');
    };

    const onSwipeRight = () => {
      if (state.showSettings || showSearch || showCityManager || showRadarMap || state.locations.length <= 1) {
        setIsSwiping(false);
        setIsSwipeCommitted(false);
        return;
      }
      setIsSwipeCommitted(true);
      handleSwipe('right');
    };

    const onSwipeStart = () => {
      if (state.showSettings || showSearch || showCityManager || showRadarMap || state.locations.length <= 1) return;
      setIsSwiping(true);
      setIsSwipeCommitted(false);

      // PART 1D — Silent background prefetch of adjacent cities
      const activeIdx = state.activeLocationIndex;
      const len = state.locations.length;
      const nextIdx = (activeIdx + 1) % len;
      const prevIdx = (activeIdx - 1 + len) % len;

      const nextCity = state.locations[nextIdx];
      const prevCity = state.locations[prevIdx];

      // Instant pre-hydrate adjacent cities from cache into state
      setState(prev => {
        const newWeatherData = { ...prev.weatherData };
        let updated = false;

        [nextIdx, prevIdx].forEach(idx => {
          if (!newWeatherData[idx]) {
            const loc = prev.locations[idx];
            if (loc) {
              const cached = getCachedWeatherData(getCityKey(loc));
              if (cached) {
                newWeatherData[idx] = cached.data;
                updated = true;
              }
            }
          }
        });

        if (updated) {
          return { ...prev, weatherData: newWeatherData };
        }
        return prev;
      });

      if (nextCity) {
        const cached = getCachedWeatherData(getCityKey(nextCity));
        const cacheAge = cached ? Date.now() - cached.ts : Infinity;
        if (!cached || cacheAge > 10 * 60 * 1000) {
          loadWeather(nextCity, nextIdx);
        }
      }
      if (prevCity) {
        const cached = getCachedWeatherData(getCityKey(prevCity));
        const cacheAge = cached ? Date.now() - cached.ts : Infinity;
        if (!cached || cacheAge > 10 * 60 * 1000) {
          loadWeather(prevCity, prevIdx);
        }
      }
    };

    const onSwipeCancel = () => {
      setIsSwiping(false);
      setIsSwipeCommitted(false);
    };

    const onScrollStart = () => {
      // If a scroll starts, ensure we aren't stuck in a swipe state
      setIsSwiping(false);
      setIsSwipeCommitted(false);
    };

    const onPullRefresh = () => {
      handleRefresh();
    };

    window.addEventListener('swipe-left', onSwipeLeft);
    window.addEventListener('swipe-right', onSwipeRight);
    window.addEventListener('swipe-start', onSwipeStart);
    window.addEventListener('swipe-cancel', onSwipeCancel);
    window.addEventListener('pull-refresh', onPullRefresh);
    window.addEventListener('scroll', onScrollStart, { passive: true });

    return () => {
      cleanup();
      window.removeEventListener('swipe-left', onSwipeLeft);
      window.removeEventListener('swipe-right', onSwipeRight);
      window.removeEventListener('swipe-start', onSwipeStart);
      window.removeEventListener('swipe-cancel', onSwipeCancel);
      window.removeEventListener('pull-refresh', onPullRefresh);
      window.removeEventListener('scroll', onScrollStart);
    };
  }, [state.locations.length, state.activeLocationIndex]);

  const isAnyModalOpen = state.showSettings || showCityManager || showRadarMap || showSearch;

  const weatherContent = React.useMemo(() => {
    if (!activeWeather || !activeLocation) return null;
    
    // Dynamic offsets for single-paged slide animation - Unified iOS style
    const xOffset = slideDirection === 'left' ? 120 : (slideDirection === 'right' ? -120 : 0);
    const exitXOffset = slideDirection === 'left' ? -120 : (slideDirection === 'right' ? 120 : 0);

    return (
      <motion.div
        id="swipe-layer"
        key={`${activeLocation.id}-${activeLocation.name}`}
        initial={{ opacity: 0, x: slideDirection ? xOffset : 0, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: slideDirection ? exitXOffset : 0, scale: 0.98 }}
        onAnimationComplete={() => {
          setIsSwiping(false);
          setIsSwipeCommitted(false);
          enableAnimations();
          setSlideDirection(null);
        }}
        transition={{
          type: "spring",
          stiffness: 380,
          damping: 34,
          mass: 0.82
        }}
        className="city-card flex flex-col gap-4 gpu weather-content col-start-1 row-start-1 w-full"
        style={{ willChange: 'transform, opacity' }}
      >
        <div id="city-content" className="city-content flex flex-col gap-4">
          <WeatherHero 
            weather={activeWeather} 
            location={activeLocation} 
            settings={state.settings} 
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            slideDirection={slideDirection}
            onOpenSettings={toggleSettings}
            onOpenCityManager={() => {
              Haptic.medium(state.settings.hapticEnabled);
              setShowCityManager(true);
              pushPanel(() => setShowCityManager(false), 'citymanager');
            }}
          />
          
          <div className="flex flex-col gap-4">
            {!isAnyModalOpen && (state.settings.tileOrder || [
              'rainGraph',
              'forecast',
              'aqi',
              'uv',
              'sunMoon',
              'humidityVisibility',
              'precipitationWind',
              'pollen'
            ]).map(id => {
              if (id === 'rainGraph') {
                return (
                  <React.Fragment key="rainGraph">
                    <UpcomingRainGraph 
                      weather={activeWeather} 
                      settings={state.settings} 
                    />
                  </React.Fragment>
                );
              }
              if (id === 'forecast') {
                return (
                  <div key="forecast" className="flex flex-col gap-4">
                    <HourlyForecast 
                      weather={activeWeather} 
                      settings={state.settings} 
                    />
                    {state.settings.enabledTiles?.forecast !== false && (
                      <DailyForecast 
                        weather={activeWeather} 
                        settings={state.settings} 
                      />
                    )}
                  </div>
                );
              }
              if (id === 'sunMoon') {
                return state.settings.enabledTiles?.sunMoon !== false && (
                  <React.Fragment key="sunMoon">
                    <SunPath 
                      weather={activeWeather}
                      settings={state.settings}
                    />
                  </React.Fragment>
                );
              }
              if (['aqi', 'uv', 'pollen', 'humidityVisibility', 'precipitationWind'].includes(id)) {
                return (
                  <React.Fragment key={id}>
                    <WeatherDetails 
                      focusKey={id}
                      weather={activeWeather} 
                      settings={state.settings} 
                      location={activeLocation || undefined}
                    />
                  </React.Fragment>
                );
              }
              return null;
            })}
          </div>

          <div className="h-24" />
        </div>
      </motion.div>
    );
  }, [activeWeather, activeLocation, state.settings, isRefreshing, slideDirection, isAnyModalOpen]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // If user is scrolling the hourly forecast horizontally, keep header visible
      const isHourlyActive = (window as any).isScrollingHourly || (window as any).isInteractingWithHourly;
      if (isHourlyActive) {
        setHeaderVisible(true);
        lastScrollY.current = currentScrollY;
        return;
      }
      
      // Show ONLY at the very top as requested
      if (currentScrollY < 10) {
        setHeaderVisible(true);
      } 
      // Hide once vertical scroll is significant (increased threshold to 150px to reduce sensitivity)
      else if (currentScrollY > 150) {
        setHeaderVisible(false);
      }
      
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Ensure header visible on mount
    setHeaderVisible(true);
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100dvh';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.height = '100dvh';
    } else {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
    };
  }, [isAnyModalOpen]);

  const currentCode = activeWeather?.current?.weatherCode || 0;
  const currentSunrise = activeWeather?.daily?.sunrise?.[0];
  const currentSunset = activeWeather?.daily?.sunset?.[0];
  const currentIsNight = activeWeather ? isNightHour(
    Date.now(),
    currentSunrise,
    currentSunset
  ) : false;

  return (
    <div 
      className="min-h-screen bg-app-bg text-app-text font-sans selection:bg-app-text/20 transition-colors duration-500 relative"
    >
      {/* Background is clean light theme */}
      <div 
        id="ui-overlay" 
        className={cn(
          "fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-[100] pointer-events-none pt-[env(safe-area-inset-top)] transition-all duration-350 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
          isAnyModalOpen ? "opacity-0 pointer-events-none scale-[0.96]" : "opacity-100"
        )}
      >
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
        
        <div id="location-status-bar" style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 0,
          overflow: "hidden",
          background: "#1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          zIndex: 9999,
          transition: "height 0.3s ease",
          fontSize: "11px",
          letterSpacing: "1.5px",
          fontWeight: 600,
          textTransform: "uppercase"
        }}>
          <div id="location-status-spinner" style={{
            width: "12px",
            height: "12px",
            border: "1.5px solid #ffffff30",
            borderTop: "1.5px solid #6366f1",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            display: "none"
          }}></div>
          <span id="location-status-text" style={{ color: "#94a3b8" }}></span>
        </div>

        {state.locations.length > 0 && state.settings.layoutWeatherDetail !== 'compact' && (
          <motion.div 
            className="w-full h-28 relative pointer-events-none"
            initial={false}
            animate={{
              y: headerVisible ? 0 : -30,
              opacity: headerVisible ? 1 : 0,
            }}
            transition={{ 
              duration: 0.35, 
              ease: [0.25, 0.46, 0.45, 0.94]
            }}
          >
            <motion.div className={cn(
              "absolute left-6 top-[calc(env(safe-area-inset-top,24px)+36px)]",
              (state.showSettings || showCityManager || showRadarMap) ? "pointer-events-none" : "pointer-events-auto"
            )}>
              <motion.button 
                id="radar-map-btn"
                onClick={() => {
                   Haptic.medium(state.settings.hapticEnabled);
                   setShowRadarMap(true);
                   pushPanel(() => setShowRadarMap(false), 'radarmap');
                }}
                style={{ 
                  pointerEvents: (state.showSettings || showCityManager || showRadarMap) ? 'none' : 'auto'
                }}
                className={cn(
                  "w-12 h-12 bg-app-surface border border-app-border backdrop-blur-xl rounded-full flex items-center justify-center text-app-text shadow-xl active:scale-97 transition-all lg:hover:scale-105 relative overflow-hidden",
                  (state.showSettings || showCityManager || showRadarMap) ? "pointer-events-none" : "pointer-events-auto"
                )}
                initial={false}
                animate={{
                  opacity: state.showSettings || showCityManager || showRadarMap ? 0 : 1,
                  scale: state.showSettings || showCityManager || showRadarMap ? 0.8 : 1,
                }}
                transition={{ 
                  duration: 0.3,
                  ease: [0.25, 0.46, 0.45, 0.94]
                }}
              >
                {/* Glow background */}
                <div className="absolute inset-0 bg-gradient-to-br from-app-text/[0.04] to-transparent pointer-events-none rounded-full" />
                <Icons.Map className="w-5 h-5 text-app-text-dim hover:text-app-text transition-colors relative z-10" />
              </motion.button>
            </motion.div>

            {/* Settings Button - Top Right */}
            <motion.div className={cn(
              "absolute right-6 top-[calc(env(safe-area-inset-top,24px)+36px)] z-30",
              (state.showSettings || showCityManager || showRadarMap) ? "pointer-events-none" : "pointer-events-auto"
            )}>
              <motion.button 
                id="settings-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSettings();
                }}
                style={{ 
                  touchAction: 'manipulation',
                  pointerEvents: (state.showSettings || showCityManager || showRadarMap) ? 'none' : 'auto'
                }}
                className={cn(
                  "group active:scale-97 transition-all flex items-center justify-center w-12 h-12 relative z-30",
                  (state.showSettings || showCityManager || showRadarMap) ? "pointer-events-none" : "pointer-events-auto"
                )}
                animate={{
                  opacity: state.showSettings || showCityManager || showRadarMap ? 0 : 1,
                  scale: state.showSettings || showCityManager || showRadarMap ? 0.8 : 1,
                }}
                transition={{ 
                  duration: 0.3,
                  ease: [0.25, 0.46, 0.45, 0.94]
                }}
              >
                <div className="w-12 h-12 bg-app-surface border border-app-border backdrop-blur-xl rounded-full flex items-center justify-center text-app-text-dim group-hover:text-app-text transition-colors shadow-xl lg:hover:scale-105 pointer-events-auto relative overflow-hidden">
                  {/* Glow background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-app-text/[0.04] to-transparent pointer-events-none rounded-full" />
                  <Icons.Settings2 className="w-5 h-5 relative z-10" />
                </div>
              </motion.button>
            </motion.div>



            {/* City Name & Pagination - Center */}
            <div className="absolute top-[calc(env(safe-area-inset-top,24px)+36px)] flex flex-col items-center pointer-events-none mt-2" style={{ left: '50%', transform: 'translateX(-50%)' }}>
              <AnimatePresence mode="wait">
                {state.locations.length > 0 && (
                  <motion.div 
                    key={`city-header-${state.activeLocationIndex}`}
                    initial={{ opacity: 0, scale: 0.96, y: 3 }}
                    animate={{ 
                      opacity: (state.showSettings || showCityManager || showRadarMap) ? 0 : 1, 
                      scale: (state.showSettings || showCityManager || showRadarMap) ? 0.96 : 1, 
                      y: (state.showSettings || showCityManager || showRadarMap) ? -3 : 0 
                    }}
                    exit={{ opacity: 0, scale: 0.96, y: -3 }}
                    transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="flex flex-col items-center justify-center"
                  >
                    <div className="flex items-center justify-center relative pointer-events-auto select-none gap-1.5">
                      <div className="flex items-center gap-1.5">
                        {activeLocation?.isCurrentLocation && (
                          <svg viewBox="0 0 24 24" className={cn("w-3.5 h-3.5 shrink-0", state.settings.colorTheme === 'pink' ? "text-white" : "text-app-text")} fill="currentColor">
                            <path fillRule="evenodd" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" clipRule="evenodd" />
                          </svg>
                        )}
                        <span id="city-name" className={cn("text-[17px] font-semibold transition-colors duration-300", state.settings.colorTheme === 'pink' ? "text-white" : "text-app-text")}>
                          {activeLocation?.name ? (
                            <Translate text={activeLocation.name} lang={state.settings.language || 'en'} />
                          ) : (
                            <Translate text="Loading..." lang={state.settings.language || 'en'} />
                          )}
                        </span>
                      </div>
                      <div className="absolute left-full ml-1.5 flex items-center justify-center">
                        <button 
                          onClick={() => {
                            Haptic.medium(state.settings.hapticEnabled);
                            setShowCityManager(true);
                            pushPanel(() => setShowCityManager(false), 'citymanager');
                          }}
                          className="text-app-text-dim hover:text-app-text active:scale-90 transition-all duration-150 cursor-pointer focus:outline-none flex items-center justify-center p-1"
                          title="Edit Cities"
                        >
                          <Icons.ChevronDown className="w-4 h-4" strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                      
                    {isOffline && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full mt-1 bg-orange-500/20 border border-orange-500/30 backdrop-blur-md"
                      >
                        <Icons.CloudOff className="w-2.5 h-2.5 text-orange-500" strokeWidth={2.5} />
                        <span className="text-[9px] font-bold text-orange-500 uppercase tracking-widest">
                          <Translate text="OFFLINE" lang={state.settings.language || 'en'} />
                        </span>
                      </motion.div>
                    )}

                    {isRefreshing && !isOffline && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full mt-1.5 bg-app-surface border border-app-border backdrop-blur-md shadow-lg"
                      >
                        <Icons.RotateCcw className="w-3 h-3 text-app-text animate-spin" strokeWidth={2.5} />
                        <span className="text-[10px] font-semibold text-app-text uppercase tracking-wider">
                          <Translate text="Refreshing..." lang={state.settings.language || 'en'} />
                        </span>
                      </motion.div>
                    )}

                    {state.locations.length > 1 && (
                      <div id="city-dots" className="flex gap-1.5 mt-2">
                        {state.locations.map((_, i) => (
                          <button 
                            key={i} 
                            onClick={() => {
                              if (state.activeLocationIndex !== i) {
                                Haptic.light(state.settings.hapticEnabled);
                                const dir = i > state.activeLocationIndex ? 'left' : 'right';
                                setSlideDirection(dir);
                                switchToCity(i);
                              }
                            }}
                            className={cn(
                              "w-1.5 h-1.5 rounded-full transition-all duration-300 pointer-events-auto outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]",
                              state.activeLocationIndex === i 
                                ? "bg-app-text w-5 shadow-[0_0_8px_rgba(255,255,255,0.15)]" 
                                : "bg-app-text/30 hover:bg-app-text/50"
                            )} 
                          />
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {state.showSettings && (
          <motion.div
            key="settings-screen-root"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ 
              duration: 0.18, 
              ease: [0.25, 0.46, 0.45, 0.94]
            }}
            className="fixed inset-0 z-[99999] bg-app-bg overflow-hidden transform-gpu"
          >
            <SettingsScreen 
              settings={state.settings} 
              onUpdate={updateSettings} 
              onClose={toggleSettings} 
              activeWeather={activeWeather}
              activeLocation={activeLocation}
              panelStackRef={panelStackRef}
              handleBack={handleBack}
              pushPanel={pushPanel}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCityManager && (
          <motion.div 
            key="city-manager-root"
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ 
              duration: 0.18, 
              ease: [0.25, 0.46, 0.45, 0.94]
            }}
            className="fixed inset-0 z-[99990] bg-app-bg overflow-y-auto gpu"
            data-no-swipe
          >
            <CityManager 
              locations={state.locations}
              activeLocationIndex={state.activeLocationIndex}
              weatherData={state.weatherData}
              hapticEnabled={state.settings.hapticEnabled}
              panelStackRef={panelStackRef}
              lang={state.settings.language || 'en'}
              onSelect={(index) => {
                Haptic.light(state.settings.hapticEnabled);
                if (index !== state.activeLocationIndex) {
                  const dir = index > state.activeLocationIndex ? 'left' : 'right';
                  setSlideDirection(dir);
                  switchToCity(index);
                }
                handleBack();
              }}
              onAdd={() => {
                Haptic.medium(state.settings.hapticEnabled);
                // Open search directly on top of the City Manager without closing it first
                setShowSearch(true);
                pushPanel(() => setShowSearch(false), 'search');
              }}
              onRemove={removeLocation}
              onReorder={reorderLocations}
              onClose={() => {
                handleBack();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSearch && (
          <motion.div 
            key="search-bar-root"
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ 
              duration: 0.18, 
              ease: [0.25, 0.46, 0.45, 0.94]
            }}
            className="fixed inset-0 z-[99995] bg-app-bg/90 backdrop-blur-2xl flex flex-col pt-[calc(env(safe-area-inset-top)+24px)]"
            data-no-swipe
          >
            <SearchBar 
              hapticEnabled={state.settings.hapticEnabled}
              lang={state.settings.language || 'en'}
              onSelect={(loc) => {
                Haptic.success(state.settings.hapticEnabled);
                disableAllAnimations();
                addLocation(loc);
                handleBack();
                if (showCityManager) {
                  handleBack();
                }
              }} 
              onClose={() => {
                handleBack();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRadarMap && (
          <motion.div
            key="radar-map-root"
            initial={{ opacity: 0, y: 40, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.99 }}
            transition={{ 
              duration: 0.18, 
              ease: [0.25, 0.46, 0.45, 0.94]
            }}
            className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-2xl gpu settings-panel flex flex-col will-change-transform"
            data-no-swipe
          >
            <WeatherRadarMap 
              activeLocation={activeLocation!}
              hapticEnabled={state.settings.hapticEnabled}
              lang={state.settings.language || 'en'}
              onClose={() => {
                handleBack();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <main 
        className={cn(
          "max-w-[390px] mx-auto px-6 pb-32 min-h-screen relative touch-pan-y bottom-content transition-[opacity,transform,padding-top] duration-250 ease-out",
          state.settings.layoutWeatherDetail === 'compact'
            ? "pt-[calc(env(safe-area-inset-top,24px)+24px)]"
            : "pt-[calc(env(safe-area-inset-top,24px)+116px)]",
          isAnyModalOpen ? "opacity-0 pointer-events-none scale-[0.96]" : "opacity-100 scale-100"
        )}
      >
        {/* City Switching Skeleton overlay */}
        <div id="city-skeleton" style={{
          display: 'none',
          position: 'absolute',
          inset: 0,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          pointerEvents: 'none',
          zIndex: 10,
          transition: 'opacity 0.2s ease',
        }}>
          {/* Icon placeholder */}
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.05)',
            animation: 'shimmer 1.2s infinite',
          }} />

          {/* Temp placeholder */}
          <div style={{
            width: '120px',
            height: '60px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            animation: 'shimmer 1.2s infinite 0.1s',
          }} />

          {/* Label placeholder */}
          <div style={{
            width: '140px',
            height: '20px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            animation: 'shimmer 1.2s infinite 0.2s',
          }} />
        </div>

        <div id="location-loading-card" style={{
          display: 'none',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          zIndex: 500,
        }} className="select-none pointer-events-none">
          <div className="flex flex-col items-center gap-6 justify-center">
            <AnimatedWeatherLoader />
            <div style={{
              fontSize: '15px',
              color: '#ffffff73',
              fontWeight: 500,
              letterSpacing: '0.3px',
            }}>Adding Location</div>
          </div>
        </div>

         {/* Pull to refresh logic handled by gestures.ts */}



        <div className="grid grid-cols-1 grid-rows-1 items-start w-full overflow-visible">
          <AnimatePresence>
            {state.loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="col-start-1 row-start-1 w-full"
              >
                <WeatherSkeleton />
              </motion.div>
            ) : state.locations.length === 0 ? (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="col-start-1 row-start-1 w-full flex flex-col items-center justify-center min-h-[calc(100vh-140px)] py-12 px-4 relative overflow-hidden"
              >
                {!isLocatingOnboarding ? (
                  <>
                    {/* Fixed sky gradient background mimicking the user's image */}
                    <div 
                      className="fixed inset-0 z-0 select-none pointer-events-none"
                      style={{
                        background: 'linear-gradient(180deg, #bfd3fa 0%, #eae6f0 45%, #fdf4eb 100%)',
                      }} 
                    />

                    {/* Exquisite custom location icon (not standard boring map pin) */}
                    <div className="relative flex items-center justify-center w-36 h-36 mb-6 z-10 select-none">
                      {/* Concentric layered glowing circles */}
                      <div className="absolute inset-0 rounded-full bg-white/20 blur-md animate-pulse" />
                      <div className="absolute inset-2 rounded-full bg-gradient-to-b from-white/60 to-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.05)] backdrop-blur-[6px] border border-white/45" />
                      <div className="absolute inset-8 rounded-full bg-white flex items-center justify-center shadow-md">
                        {/* Core sleek compass/navigation arrow */}
                        <svg className="w-10 h-10 text-[#0560fa] filter drop-shadow-[0_2px_8px_rgba(5,96,250,0.25)]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 2L2 22L12 18L22 22L12 2Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div className="absolute -inset-2 rounded-full border border-blue-500/10 animate-[ping_4s_infinite_ease-in-out]" />
                    </div>

                    <div className="flex flex-col items-center z-10 w-full mb-8">
                      <h1 className="text-[36px] font-bold tracking-tight text-[#0c1224] text-center leading-[1.12] max-w-[325px] font-sans">
                        <Translate text="Welcome to Overcast" lang={state.settings.language} />
                      </h1>
                    </div>

                    <div className="w-full flex flex-col items-center max-w-[340px] z-10 px-4 gap-3.5">
                      <motion.button
                        id="permission-allow"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          Haptic.medium(state.settings.hapticEnabled);
                          fetchCurrentLocation(false);
                        }}
                        className="w-full py-4 px-6 bg-[#0560fa] hover:bg-[#0452d7] text-neutral-50 rounded-[22px] text-[17px] font-semibold transition-all duration-200 active:scale-97 flex items-center justify-center gap-3 shadow-[0_12px_24px_rgba(5,96,250,0.18)]"
                      >
                        <Icons.Navigation className="w-5 h-5 fill-current text-neutral-50" style={{ transform: 'rotate(45deg)' }} />
                        <span className="text-neutral-50">
                          <Translate text="Enable Location" lang={state.settings.language} />
                        </span>
                      </motion.button>

                      <motion.button
                        id="add-city-btn"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          Haptic.light(state.settings.hapticEnabled);
                          openSearch();
                        }}
                        className="w-full py-4 px-6 bg-[#f7f2ed]/70 hover:bg-[#eae3db]/80 text-[#0c1224] rounded-[22px] text-[17px] font-semibold transition-all duration-200 active:scale-97 flex items-center justify-center gap-3 border border-white/50 backdrop-blur-md"
                      >
                        <Icons.Search className="w-5 h-5" strokeWidth={2.5} />
                        <Translate text="Search Manually" lang={state.settings.language} />
                      </motion.button>
                    </div>
                  </>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col items-center justify-center flex-1 my-auto gap-6 z-10 w-full"
                  >
                    <AnimatedWeatherLoader />
                    <div className="text-[15px] font-normal tracking-wide text-white/45 mt-2 animate-pulse text-center">
                      Adding Location
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ) : state.error && !activeWeather ? (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-start-1 row-start-1 w-full flex flex-col items-center justify-center py-40 gap-8 text-center px-6"
              >
                <div className="p-8 bg-app-text/5 rounded-full relative">
                  <Icons.ShieldAlert className="w-16 h-16 text-app-text-dim/40" strokeWidth={1} />
                  <div className="absolute inset-0 bg-red-500/5 blur-3xl rounded-full" />
                </div>
                <div className="flex flex-col gap-4 max-w-xs mx-auto">
                  <h2 className="text-xl font-bold tracking-tight">Something went wrong</h2>
                  <div className="flex flex-col gap-2">
                    <p className="text-app-text-dim text-sm font-medium leading-relaxed">
                      {state.error.includes('offline') 
                        ? "It looks like you're offline or the connection is too slow. Please check your network and try again."
                        : state.error}
                    </p>
                    {state.error.includes('ad-blocker') && (
                      <div className="flex flex-col gap-2 mt-2">
                         <p className="text-blue-400 text-[11px] font-bold tracking-wider uppercase bg-blue-500/10 py-2 px-3 rounded-xl">
                            Tip: Try disabling ad-blockers for this domain
                         </p>
                         <p className="text-app-text-dim text-[10px] italic">
                            Regional firewall or VPN settings may also block weather delivery.
                         </p>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      Haptic.light(state.settings.hapticEnabled);
                      setState(prev => ({ ...prev, error: null, loading: true }));
                      if (activeLocation) {
                        loadWeather(activeLocation, state.activeLocationIndex, true);
                      } else {
                        openSearch();
                      }
                    }}
                    className={cn(
                      "mt-4 py-4 px-8 bg-app-text text-app-bg rounded-2xl text-sm font-black tracking-widest uppercase shadow-xl",
                      "transition-all active:scale-95"
                    )}
                  >
                    Reconnect
                  </button>
                </div>
              </motion.div>
            ) : activeWeather ? (
              weatherContent
            ) : (
              <motion.div
                key="nodata"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-start-1 row-start-1 w-full flex flex-col items-center justify-center py-40 gap-4 text-center px-6"
              >
                <Icons.CloudOff className="w-16 h-16 text-app-text-dim/20" />
                <div className="flex flex-col gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-app-text">No Data Available</h2>
                  <p className="text-app-text-dim text-sm max-w-[240px]">
                     We couldn't retrieve weather for this location. Tap below to try again.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    Haptic.light(state.settings.hapticEnabled);
                    if (activeLocation) loadWeather(activeLocation, state.activeLocationIndex, true);
                  } }
                  className="mt-4 py-3 px-8 bg-app-text/10 hover:bg-app-text/15 text-app-text rounded-2xl text-xs font-black tracking-widest uppercase transition-all"
                >
                  Retry
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {showExitToast && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 bg-app-text text-app-bg rounded-2xl text-[13px] font-bold shadow-2xl pointer-events-none"
          >
            Press back again to exit
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  );
}
