import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icons } from './WeatherIcons';
import { searchLocations, reverseGeocode } from '../services/weatherService';
import { Location } from '../types';
import { Translate, t } from '../lib/translations';
import debounce from 'lodash.debounce';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Haptic } from '../lib/haptics';
import Fuse from 'fuse.js';

interface SearchBarProps {
  onSelect: (location: Location) => void;
  onClose: () => void;
  hapticEnabled: boolean;
  lang?: string;
}

export default function SearchBar({ onSelect, onClose, hapticEnabled, lang = 'en' }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [rawResults, setRawResults] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Fuse instance for client-side fuzzy refinement
  const fuse = useMemo(() => {
    return new Fuse(rawResults, {
      keys: ['name', 'admin1', 'admin2', 'country', 'type'],
      threshold: 0.4,
      includeScore: true,
      shouldSort: true,
    });
  }, [rawResults]);

  // Derived results using Fuse.js if query is present, otherwise raw
  const results = useMemo(() => {
    if (!query || rawResults.length === 0) return rawResults;
    const fuseResults = fuse.search(query);
    return fuseResults.length > 0 ? fuseResults.map(r => r.item) : rawResults;
  }, [fuse, rawResults, query]);

  const debouncedSearch = useRef(
    debounce(async (q: string) => {
      if (q.length < 2) {
        setRawResults([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const locations = await searchLocations(q);
        setRawResults(locations);
      } catch (error) {
        console.error('Search failed', error);
      } finally {
        setIsLoading(false);
      }
    }, 300)
  ).current;

  useEffect(() => {
    debouncedSearch(query);
  }, [query]);

  return (
    <>
      <div className="max-w-[390px] mx-auto w-full px-4 sm:px-6 flex flex-col h-full">
        <header className="flex items-center w-full mb-6">
          <div className={cn(
            "w-full flex items-center h-[56px] px-4.5 bg-app-surface border border-app-border rounded-full transition-all duration-300 backdrop-blur-md shadow-[0_8px_30px_rgba(22,101,52,0.04)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.25)]",
            "focus-within:bg-app-surface/90 focus-within:ring-1 focus-within:ring-app-text/10"
          )}>
            <Icons.Search className="w-[20px] h-[20px] text-app-text-dim/80 flex-shrink-0 mr-3 stroke-[2.2]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search for a city or location", lang)}
              className="bg-transparent border-none outline-none flex-1 min-w-0 text-app-text placeholder:text-app-text-dim/60 text-[16px] font-normal"
            />
            {query && (
              <button 
                onClick={() => { 
                  Haptic.light(hapticEnabled);
                  setQuery(''); 
                  setRawResults([]); 
                }} 
                className="text-app-text-dim/50 hover:text-app-text flex-shrink-0 mr-2 p-1 rounded-full hover:bg-app-text/5 transition-colors"
                title="Clear"
              >
                <Icons.X className="w-3.5 h-3.5" />
              </button>
            )}
            
            {/* Sleek separator line exactly copying the mockup */}
            <div className="h-6 w-[1px] bg-neutral-600 flex-shrink-0 mx-2" />
            
            {/* Cancel icon replacing the microphone slot */}
            <button 
              onClick={() => {
                Haptic.medium(hapticEnabled);
                onClose();
              }}
              className="p-1.5 text-app-text-dim/70 hover:text-app-text transition-all rounded-full hover:bg-app-text/5 flex-shrink-0 active:scale-95"
              title="Cancel"
              aria-label="Cancel"
            >
              <Icons.X className="w-[20px] h-[20px] stroke-[2]" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto no-scrollbar pb-12">
          {geoError && (
            <motion.div 
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full flex items-center h-[56px] px-4 bg-app-surface border border-red-500/20 rounded-full mb-6 text-[14px] text-red-500 dark:text-red-400 font-medium shadow-[0_4px_20px_rgba(239,68,68,0.03)]"
            >
              <Icons.ShieldAlert className="w-[20px] h-[20px] text-red-500 flex-shrink-0 mr-3 stroke-[2.2]" />
              <span className="flex-1 truncate">
                <Translate text="Location access is denied" lang={lang} />
              </span>
              <button 
                onClick={() => setGeoError(null)}
                className="p-1 text-red-500/50 hover:text-red-500 transition-colors rounded-full hover:bg-red-500/5 ml-2"
                title="Dismiss"
              >
                <Icons.X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}

          {isLoading ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <motion.div 
                animate={{ 
                  y: [0, -6, 0],
                  rotate: 360
                }}
                transition={{ 
                  y: { repeat: Infinity, duration: 1.5, ease: "easeInOut" },
                  rotate: { repeat: Infinity, duration: 1, ease: "linear" }
                }}
                className="w-8 h-8 border-2 border-black/15 border-t-black rounded-full" 
              />
              <motion.p 
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                className="text-[13px] font-medium text-app-text-dim/40 uppercase tracking-widest"
              >
                <Translate text="Searching..." lang={lang} />
              </motion.p>
            </div>
          ) : results.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-[11px] font-semibold text-app-text-dim/40 uppercase tracking-[0.1em] px-2 mb-2">
                <Translate text="Search Results" lang={lang} />
              </h3>
              {results.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => {
                    Haptic.success(hapticEnabled);
                    onSelect(loc);
                  }}
                  className="w-full flex items-center gap-4 p-4 text-left active:bg-app-text/5 bg-app-surface border border-app-border rounded-2xl transition-all group"
                >
                  <div className="p-3 bg-app-text/5 rounded-xl group-active:scale-95 transition-transform">
                    {loc.type === 'Mountain' || loc.type === 'Peak' ? (
                      <Icons.Mountain className="w-5 h-5 text-app-text-dim/40 flex-shrink-0" />
                    ) : loc.type === 'Airport' ? (
                      <Icons.Plane className="w-5 h-5 text-app-text-dim/40 flex-shrink-0" />
                    ) : loc.type === 'Region' || loc.type === 'District' ? (
                      <Icons.Map className="w-5 h-5 text-app-text-dim/40 flex-shrink-0" />
                    ) : (
                      <Icons.MapPin className="w-5 h-5 text-app-text-dim/40 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[16px] font-medium text-app-text truncate">
                        <Translate text={loc.name} lang={lang} />
                      </span>
                      {loc.type && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-app-text/10 text-app-text-dim/60 rounded-[4px]">
                          {loc.type}
                        </span>
                      )}
                    </div>
                    <span className="text-[13px] text-app-text-dim truncate">
                      {loc.admin1 ? `${loc.admin1}, ` : ''}{loc.country}
                    </span>
                  </div>
                  <Icons.Plus className="w-5 h-5 text-app-text-dim/20" />
                </button>
              ))}
            </div>
          ) : query.length >= 2 ? (
            <div className="py-20 text-center opacity-40">
              <Icons.Search className="w-12 h-12 mx-auto mb-4 opacity-10" />
              <p className="text-[15px] text-app-text">
                <Translate text="No results found for" lang={lang} /> "{query}"
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h3 className="text-[11px] font-semibold text-app-text-dim/40 uppercase tracking-[0.1em] px-2 mb-2">
                  <Translate text="Nearby" lang={lang} />
                </h3>

                <button 
                  onClick={async () => {
                    Haptic.medium(hapticEnabled);
                    setGeoError(null);
                    setIsLoading(true);

                    // 1. Check if permission has already been explicitly denied
                    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
                      try {
                        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
                        if (result.state === 'denied') {
                          setGeoError("Location access is denied");
                          setIsLoading(false);
                          return;
                        }
                      } catch (err) {
                        console.warn("Permissions query failed in SearchBar:", err);
                      }
                    }

                    if (navigator.geolocation) {
                      let resolvedOrFailed = false;

                      // Backup timer: if GPS takes > 5.5 seconds, timeout and report error
                      const gpsTimerToken = setTimeout(() => {
                        if (!resolvedOrFailed) {
                          resolvedOrFailed = true;
                          setIsLoading(false);
                          setGeoError("Location access is denied");
                        }
                      }, 12000);

                      navigator.geolocation.getCurrentPosition(
                        async (pos) => {
                          if (resolvedOrFailed) return;
                          resolvedOrFailed = true;
                          clearTimeout(gpsTimerToken);

                          try {
                            const lat = pos.coords.latitude;
                            const lon = pos.coords.longitude;
                            
                            // Try to get a real city name
                            const resolvedLocation = await reverseGeocode(lat, lon, lang);
                            
                            const curLoc: Location = {
                              id: Math.floor(Date.now() / 1000), 
                              name: resolvedLocation?.name || "Current Location",
                              latitude: lat,
                              longitude: lon,
                              country: resolvedLocation?.country || "Nearby",
                              admin1: resolvedLocation?.admin1,
                              timezone: resolvedLocation?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
                            };
                            
                            Haptic.success(hapticEnabled);
                            onSelect(curLoc);
                          } catch (err) {
                            console.error("Reverse geocoding error:", err);
                            onSelect({
                              id: Math.floor(Date.now() / 1000),
                              name: "Current Location",
                              latitude: pos.coords.latitude,
                              longitude: pos.coords.longitude,
                              country: "Nearby",
                              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
                            });
                          } finally {
                            setIsLoading(false);
                          }
                        },
                        async (err) => {
                          if (resolvedOrFailed) return;
                          resolvedOrFailed = true;
                          clearTimeout(gpsTimerToken);
                          
                          console.warn("GPS error encountered in search page:", err.message);
                          setIsLoading(false);
                          setGeoError("Location access is denied");
                        },
                        { timeout: 10000, enableHighAccuracy: true }
                      );
                    } else {
                      setIsLoading(false);
                      setGeoError("Location access is denied");
                    }
                  }}
                  className="w-full flex items-center gap-4 p-4 text-left active:bg-app-text/5 bg-app-surface border border-app-border rounded-2xl transition-all"
                >
                  <div className="p-3 bg-app-text/5 rounded-xl">
                    <Icons.Navigation className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[16px] font-medium text-app-text">
                      <Translate text="Current Location" lang={lang} />
                    </span>
                    <span className="text-[13px] text-app-text-dim/60">
                      <Translate text="Use your device's GPS" lang={lang} />
                    </span>
                  </div>
                  <Icons.ChevronRight className="w-5 h-5 text-app-text-dim/20 ml-auto" />
                </button>
              </div>

              <div className="py-10 text-center opacity-20">
                <Icons.MapPin className="w-16 h-16 mx-auto mb-6 opacity-10" />
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-app-text">
                  <Translate text="Global Database" lang={lang} />
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
