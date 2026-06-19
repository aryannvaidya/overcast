import React from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import { Icons, WeatherIcon } from './WeatherIcons';
import { Location, WeatherData } from '../types';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';
import { Haptic } from '../lib/haptics';
import { getWeatherInfo, getCountryCode } from '../services/weatherService';
import { Translate } from '../lib/translations';

interface CityManagerProps {
  locations: Location[];
  activeLocationIndex: number;
  weatherData: Record<number, WeatherData>;
  hapticEnabled: boolean;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onReorder: (newLocations: Location[]) => void;
  onClose: () => void;
  panelStackRef: React.MutableRefObject<(() => void)[]>;
  lang?: string;
}

interface CityListItemProps {
  key?: string;
  loc: Location;
  index: number;
  weather: WeatherData | undefined;
  hapticEnabled: boolean;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onRemove: (e: React.MouseEvent, index: number) => void;
  onDragEnd?: () => void;
  lang?: string;
  canRemove: boolean;
}

const CityListItem = React.memo(({
  loc,
  index,
  weather,
  hapticEnabled,
  isSelected,
  onSelect,
  onRemove,
  onDragEnd,
  lang = 'en',
  canRemove
}: CityListItemProps) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const dragControls = useDragControls();
  const info = weather ? getWeatherInfo(weather.current.weatherCode, weather.current.isDay) : null;

  return (
    <Reorder.Item 
      key={`${loc.latitude}-${loc.longitude}-${loc.name}-${loc.isCurrentLocation ? "current" : (loc.id || "manual")}`} 
      value={loc}
      className="relative select-none rounded-[28px] overflow-hidden"
      style={{ 
        borderRadius: '28px',
        overflow: 'hidden'
      }}
      drag={!loc.isCurrentLocation}
      dragListener={false}
      dragControls={dragControls}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => {
        setIsDragging(false);
        Haptic.light(hapticEnabled);
        onDragEnd?.();
      }}
      animate={{
        scale: isDragging ? 1.03 : 1,
        zIndex: isDragging ? 9999 : 1,
        boxShadow: isDragging ? "0 12px 30px rgba(0,0,0,0.5)" : "0 0 0px rgba(0,0,0,0)"
      }}
      transition={{ 
        type: "spring", 
        stiffness: 420, 
        damping: 32 
      }}
    >
      <motion.div
        onClick={() => {
          Haptic.light(hapticEnabled);
          onSelect(index);
        }}
        className={cn(
          "p-5 flex items-center justify-between rounded-[28px] border transition-all duration-300 cursor-pointer outline-none focus:outline-none [-webkit-tap-highlight-color:transparent] select-none",
          isSelected 
            ? "bg-white/[0.08] border-white/[0.12] shadow-[0_0_25px_rgba(255,255,255,0.02)]" 
            : "bg-app-surface/60 border-app-border hover:bg-app-surface/80"
        )}
      >
        <div className="flex items-center gap-4">
          {!loc.isCurrentLocation ? (
            <div 
              onPointerDown={(e) => {
                Haptic.light(hapticEnabled);
                dragControls.start(e);
              }}
              className="flex flex-col gap-1 items-center opacity-40 cursor-grab active:cursor-grabbing p-1.5 -m-1.5 touch-none text-app-text outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]"
            >
              <Icons.GripVertical className="w-4 h-4" />
            </div>
          ) : (
            <div className="flex items-center justify-center shrink-0 w-4 h-4 text-app-text/90">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7zm0 10c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" />
              </svg>
            </div>
          )}
          
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[17px] font-semibold text-app-text">
                <Translate text={loc.name} lang={lang} />
              </span>
            </div>
            <span className="text-[13px] text-app-text-dim">
              {getCountryCode(loc.country)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {weather ? (
            <div className="flex items-center gap-3">
               <span className="text-2xl font-semibold tracking-tight text-app-text">
                 {Math.round(weather.current.temperature)}°
               </span>
               {info && (
                 <WeatherIcon 
                   name={info.icon as any} 
                   className="w-7 h-7 text-app-text" 
                   style="outline" 
                 />
               )}
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full border border-app-border border-t-app-text animate-spin opacity-40" />
          )}

          {canRemove ? (
            <button 
              onClick={(e) => onRemove(e, index)}
              className="p-2 text-app-text/30 hover:text-red-500 transition-colors"
            >
              <Icons.Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-8" />
          )}
        </div>
      </motion.div>
    </Reorder.Item>
  );
});
CityListItem.displayName = 'CityListItem';

const CityManager = ({ 
  locations, 
  activeLocationIndex, 
  weatherData, 
  hapticEnabled,
  onSelect, 
  onAdd, 
  onRemove, 
  onReorder,
  onClose,
  panelStackRef,
  lang = 'en'
}: CityManagerProps) => {
  const [localLocations, setLocalLocations] = React.useState<Location[]>(locations);

  React.useEffect(() => {
    setLocalLocations(locations);
  }, [locations]);

  const handleRemove = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    Haptic.warning(hapticEnabled);
    onRemove(index);
  };

  return (
    <>
      <div className="max-w-[390px] mx-auto min-h-screen px-6 pt-24 pb-24">
        <header className="flex items-center justify-between mb-8 px-1">
          <h1 className="text-[28px] font-semibold text-app-text tracking-tight leading-none">
            <Translate text="Manage Locations" lang={lang} />
          </h1>
          <motion.button 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => {
              Haptic.light(hapticEnabled);
              onClose();
            }}
            className="w-12 h-12 bg-app-surface border border-app-border backdrop-blur-md flex items-center justify-center rounded-full text-app-text hover:bg-app-surface/80 transition-all shadow-xl select-none cursor-pointer shrink-0"
          >
            <Icons.ChevronLeft className="w-5.5 h-5.5 text-app-text" strokeWidth={2.5} />
          </motion.button>
        </header>

        <Reorder.Group 
          values={localLocations} 
          onReorder={(newLocs) => {
            // Lock the location-based added city (isCurrentLocation = true) strictly as the first page/item
            const currentLoc = newLocs.find(l => l.isCurrentLocation);
            let finalLocations = [...newLocs];
            if (currentLoc) {
              const otherLocs = newLocs.filter(l => !l.isCurrentLocation);
              finalLocations = [currentLoc, ...otherLocs];
            }
            setLocalLocations(finalLocations);
          }}
          className="flex flex-col gap-3"
        >
          {localLocations.map((loc) => {
            const originalIndex = locations.findIndex(
              l => l.latitude === loc.latitude && l.longitude === loc.longitude
            );
            const useIndex = originalIndex !== -1 ? originalIndex : 0;
            return (
              <CityListItem
                key={`${loc.latitude}-${loc.longitude}-${loc.name}-${loc.isCurrentLocation ? "current" : (loc.id || "manual")}`}
                loc={loc}
                index={useIndex}
                weather={weatherData[useIndex]}
                hapticEnabled={hapticEnabled}
                isSelected={activeLocationIndex === useIndex}
                onSelect={onSelect}
                onRemove={handleRemove}
                onDragEnd={() => {
                  onReorder(localLocations);
                }}
                lang={lang}
                canRemove={locations.length > 1}
              />
            );
          })}
        </Reorder.Group>

        <button 
          onClick={() => {
            Haptic.medium(hapticEnabled);
            onAdd();
          }}
          className="w-full mt-6 py-5 bg-app-surface border border-dashed border-app-border rounded-[28px] flex items-center justify-center gap-3 text-app-text active:scale-95 transition-all text-[15px] font-medium cursor-pointer"
        >
          <Icons.Plus className="w-5 h-5 text-app-text/60" />
          <span>
            <Translate text="Add new city" lang={lang} />
          </span>
        </button>
      </div>
    </>
  );
};

export default CityManager;
