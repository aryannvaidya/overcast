import { Location, WeatherData } from '../types';

const STORAGE_KEYS = {
  SETTINGS: 'app_settings',
  LOCATIONS: 'app_locations',
  ACTIVE_INDEX: 'app_active_index',
  WEATHER_CACHE: 'app_weather_cache', // Record<locationId_or_name, { data: WeatherData, ts: number }>
};

export function getCityKey(location: Location): string {
  if (!location) return 'unknown';
  return `${location.name}_${location.latitude.toFixed(2)}_${location.longitude.toFixed(2)}`
    .replace(/\s+/g, "_")
    .toLowerCase();
}

export function saveWeatherData(locationKey: string, data: WeatherData) {
  try {
    const cacheRaw = localStorage.getItem(STORAGE_KEYS.WEATHER_CACHE);
    const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
    cache[locationKey] = { data, ts: Date.now() };
    localStorage.setItem(STORAGE_KEYS.WEATHER_CACHE, JSON.stringify(cache));
  } catch (e) {
    console.error('Failed to save weather data to cache', e);
  }
}

export function getCachedWeatherData(locationKey: string): { data: WeatherData; ts: number } | null {
  try {
    const cacheRaw = localStorage.getItem(STORAGE_KEYS.WEATHER_CACHE);
    if (!cacheRaw) return null;
    const cache = JSON.parse(cacheRaw);
    const cached = cache[locationKey];
    if (!cached || !cached.data) return null;
    return cached;
  } catch {
    return null;
  }
}

export { STORAGE_KEYS };
export const CACHE_EXPIRY = 3 * 60 * 60 * 1000; // 3 hours
