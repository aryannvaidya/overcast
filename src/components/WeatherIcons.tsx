import { 
  Sun, 
  Cloud, 
  CloudSun, 
  CloudMoon, 
  CloudFog, 
  CloudDrizzle, 
  CloudRain, 
  CloudLightning, 
  CloudSnow,
  CloudRainWind,
  CloudSunRain,
  CloudMoonRain,
  Snowflake, 
  Moon,
  MoonStar,
  Wind,
  Droplets,
  Thermometer,
  Sunrise,
  Sunset,
  Eye,
  Navigation,
  Search,
  MapPin,
  Settings2,
  ChevronRight,
  ChevronLeft,
  X,
  Bell,
  Info,
  ChevronDown,
  Plus,
  Minus,
  ShieldAlert,
  Trash2,
  GripVertical,
  LayoutGrid,
  Loader2,
  ArrowDown,
  Clock,
  CloudOff,
  RotateCcw,
  ShieldCheck,
  Mountain,
  Plane,
  Map,
  Zap,
  ArrowLeft,
  Pencil
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { STATIC_SVGS, ANIMATED_SVGS } from './WeatherSvgData';

export const RawIcons = {
  Sun,
  Cloud,
  CloudSun,
  CloudMoon,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudLightning,
  CloudSnow,
  CloudRainWind,
  CloudSunRain,
  CloudMoonRain,
  Snowflake,
  Moon,
  MoonStar,
  Wind,
  Droplets,
  Thermometer,
  Sunrise,
  Sunset,
  Eye,
  Navigation,
  Search,
  MapPin,
  Settings2,
  ChevronRight,
  ChevronLeft,
  X,
  Bell,
  Info,
  ChevronDown,
  Plus,
  Minus,
  ShieldAlert,
  Trash2,
  GripVertical,
  LayoutGrid,
  Loader2,
  ArrowDown,
  Clock,
  CloudOff,
  RotateCcw,
  ShieldCheck,
  Mountain,
  Plane,
  Map,
  Zap,
  ArrowLeft,
  Pencil
};

export type IconType = keyof typeof RawIcons;

interface WeatherIconProps {
  name: IconType;
  style?: 'outline' | 'coloured' | '3d' | 'static' | 'animated' | 'animated_outline';
  className?: string;
  strokeWidth?: number;
  forceColoured?: boolean;
}

const WEATHER_ICONS_SET = new Set([
  'Sun', 'Moon', 'MoonStar', 'Cloud', 'CloudSun', 'CloudMoon', 'CloudFog', 
  'CloudDrizzle', 'CloudRain', 'CloudLightning', 'CloudSnow', 'CloudRainWind', 
  'CloudSunRain', 'CloudMoonRain', 'Snowflake', 'Droplets', 'Wind', 'Sunrise', 'Sunset'
]);

const svgCache: Record<string, string> = {};

export const EmbeddedSvg = ({ 
  src, 
  alt, 
  className, 
  style 
}: { 
  src: string; 
  alt?: string; 
  className?: string; 
  style?: React.CSSProperties; 
}) => {
  const [svgContent, setSvgContent] = useState<string | null>(svgCache[src] || null);

  useEffect(() => {
    if (svgCache[src]) {
      setSvgContent(svgCache[src]);
      return;
    }

    let active = true;
    fetch(src, { referrerPolicy: 'no-referrer' })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.text();
      })
      .then((text) => {
        if (active) {
          svgCache[src] = text;
          setSvgContent(text);
        }
      })
      .catch(() => {
        // quiet fallback
      });

    return () => {
      active = false;
    };
  }, [src]);

  if (!svgContent) {
    return <span className={className} style={{ ...style, opacity: 0 }} />;
  }

  return (
    <span
      className={cn("select-none inline-flex items-center justify-center [&_svg]:w-full [&_svg]:h-full [&_svg]:block", className)}
      style={style}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
};

export function getOutlineAnimatedFilename(name: string): string {
  const lowerName = name.toLowerCase();

  if (lowerName === 'sun') {
    return 'clear-day.svg';
  }
  if (lowerName === 'moon' || lowerName === 'moonstar') {
    return 'clear-night.svg';
  }
  if (lowerName === 'cloudsun') {
    return 'partly-cloudy-day.svg';
  }
  if (lowerName === 'cloudmoon') {
    return 'partly-cloudy-night.svg';
  }
  if (lowerName === 'cloud') {
    return 'cloudy.svg';
  }
  if (lowerName === 'cloudfog') {
    return 'fog.svg';
  }
  if (lowerName === 'clouddrizzle') {
    return 'drizzle.svg';
  }
  if (lowerName === 'cloudrain') {
    return 'rain.svg';
  }
  if (lowerName === 'cloudrainwind') {
    return 'rain.svg';
  }
  if (lowerName === 'cloudsunrain') {
    return 'partly-cloudy-day-rain.svg';
  }
  if (lowerName === 'cloudmoonrain') {
    return 'partly-cloudy-night-rain.svg';
  }
  if (lowerName === 'cloudsnow') {
    return 'snow.svg';
  }
  if (lowerName === 'snowflake') {
    return 'snow.svg';
  }
  if (lowerName === 'cloudlightning' || lowerName === 'zap') {
    return 'thunderstorms.svg';
  }
  if (lowerName === 'sunset' || lowerName === 'sunrise') {
    return 'clear-day.svg';
  }
  if (lowerName === 'wind') {
    return 'mist.svg';
  }
  if (lowerName === 'droplets') {
    return 'drizzle.svg';
  }
  
  return 'cloudy.svg';
}

function getSvgFilename(name: string): string {
  const lowerName = name.toLowerCase();

  if (lowerName === 'sun') {
    return 'day.svg';
  }
  if (lowerName === 'moon' || lowerName === 'moonstar') {
    return 'night.svg';
  }
  if (lowerName === 'cloudsun') {
    return 'cloudy-day-1.svg';
  }
  if (lowerName === 'cloudmoon') {
    return 'cloudy-night-1.svg';
  }
  if (lowerName === 'cloud' || lowerName === 'cloudfog') {
    return 'cloudy.svg';
  }
  if (lowerName === 'clouddrizzle') {
    return 'rainy-1.svg';
  }
  if (lowerName === 'cloudrain') {
    return 'rainy-2.svg';
  }
  if (lowerName === 'cloudrainwind') {
    return 'rainy-4.svg';
  }
  if (lowerName === 'cloudsunrain') {
    return 'rainy-5.svg';
  }
  if (lowerName === 'cloudmoonrain') {
    return 'rainy-6.svg';
  }
  if (lowerName === 'cloudsnow') {
    return 'snowy-1.svg';
  }
  if (lowerName === 'snowflake') {
    return 'snowy-3.svg';
  }
  if (lowerName === 'cloudlightning' || lowerName === 'zap') {
    return 'thunder.svg';
  }
  if (lowerName === 'sunset' || lowerName === 'sunrise') {
    return 'weather_sunset.svg';
  }
  
  return 'weather.svg';
}

export const WeatherIcon = ({ name, style: propStyle = 'outline', className, strokeWidth = 1.4, forceColoured = false }: WeatherIconProps) => {
  const Icon = RawIcons[name] || Cloud;
  let style: any = forceColoured ? 'coloured' : propStyle;

  // We are replacing 'coloured' icon style in the app with the new beautiful animated outline style!
  if (style === 'coloured') {
    style = 'animated_outline';
  }

  // Handle new animated outline SVGs with high-performance embedding + cache
  if (style === 'animated_outline') {
    // Elegant line styling + framer motion for flawless rendering
    if (name === 'Sun') {
      return (
        <motion.div
          className={cn("select-none", className)}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
        >
          <Sun className="w-full h-full text-amber-500" strokeWidth={strokeWidth} />
        </motion.div>
      );
    }
    if (name === 'Moon' || name === 'MoonStar') {
      return (
        <motion.div
          className={cn("select-none", className)}
          animate={{ rotate: [0, 8, -8, 0] }}
          transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
        >
          {name === 'Moon' ? (
            <Moon className="w-full h-full text-sky-400" strokeWidth={strokeWidth} />
          ) : (
            <MoonStar className="w-full h-full text-sky-400" strokeWidth={strokeWidth} />
          )}
        </motion.div>
      );
    }
    if (name === 'Cloud') {
      return (
        <motion.div
          className={cn("select-none", className)}
          animate={{ y: [0, -3, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        >
          <Cloud className="w-full h-full text-neutral-500" strokeWidth={strokeWidth} />
        </motion.div>
      );
    }
    if (name === 'CloudSun') {
      return (
        <div className={cn("relative inline-block overflow-visible select-none", className)}>
          <motion.div
            className="absolute top-0 right-0 w-[55%] h-[55%] opacity-90 animate-none"
            style={{ transformOrigin: 'center' }}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
          >
            <Sun className="w-full h-full text-amber-500" strokeWidth={strokeWidth} />
          </motion.div>
          <motion.div
            className="absolute bottom-0 left-0 w-[78%] h-[78%]"
            animate={{ y: [0, -2, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          >
            <Cloud className="w-full h-full text-neutral-500 fill-app-bg" strokeWidth={strokeWidth} />
          </motion.div>
        </div>
      );
    }
    if (name === 'CloudMoon') {
      return (
        <div className={cn("relative inline-block overflow-visible select-none", className)}>
          <motion.div
            className="absolute top-0 right-0 w-[55%] h-[55%] opacity-90"
            style={{ transformOrigin: 'center' }}
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
          >
            <Moon className="w-full h-full text-sky-400" strokeWidth={strokeWidth} />
          </motion.div>
          <motion.div
            className="absolute bottom-0 left-0 w-[78%] h-[78%]"
            animate={{ y: [0, -2, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          >
            <Cloud className="w-full h-full text-neutral-500 fill-app-bg" strokeWidth={strokeWidth} />
          </motion.div>
        </div>
      );
    }
    if (name === 'CloudFog') {
      return (
        <motion.div
          className={cn("select-none", className)}
          animate={{ y: [0, -1.5, 0] }}
          transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
        >
          <CloudFog className="w-full h-full text-neutral-500" strokeWidth={strokeWidth} />
        </motion.div>
      );
    }
    if (name === 'CloudDrizzle' || name === 'Droplets') {
      return (
        <motion.div
          className={cn("select-none", className)}
          animate={{ y: [0, -1.5, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        >
          {name === 'Droplets' ? (
            <Droplets className="w-full h-full text-blue-400" strokeWidth={strokeWidth} />
          ) : (
            <CloudDrizzle className="w-full h-full text-blue-400" strokeWidth={strokeWidth} />
          )}
        </motion.div>
      );
    }
    if (name === 'CloudRain' || name === 'CloudRainWind' || name === 'CloudSunRain' || name === 'CloudMoonRain') {
      return (
        <motion.div
          className={cn("select-none", className)}
          animate={{ y: [0, -2, 0] }}
          transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }}
        >
          {name === 'CloudSunRain' ? (
            <CloudSunRain className="w-full h-full text-sky-400" strokeWidth={strokeWidth} />
          ) : name === 'CloudMoonRain' ? (
            <CloudMoonRain className="w-full h-full text-sky-400" strokeWidth={strokeWidth} />
          ) : name === 'CloudRainWind' ? (
            <CloudRainWind className="w-full h-full text-blue-400" strokeWidth={strokeWidth} />
          ) : (
            <CloudRain className="w-full h-full text-blue-400" strokeWidth={strokeWidth} />
          )}
        </motion.div>
      );
    }
    if (name === 'CloudLightning' || name === 'Zap') {
      return (
        <motion.div
          className={cn("select-none", className)}
          animate={{ 
            y: [0, -1.5, 0],
            opacity: [1, 0.6, 1, 1, 0.5, 1, 1] 
          }}
          transition={{ 
            y: { repeat: Infinity, duration: 4, ease: "easeInOut" },
            opacity: { repeat: Infinity, duration: 3, times: [0, 0.1, 0.2, 0.5, 0.6, 0.7, 1] }
          }}
        >
          {name === 'Zap' ? (
            <Zap className="w-full h-full text-orange-400" strokeWidth={strokeWidth} />
          ) : (
            <CloudLightning className="w-full h-full text-orange-500" strokeWidth={strokeWidth} />
          )}
        </motion.div>
      );
    }
    if (name === 'CloudSnow' || name === 'Snowflake') {
      return (
        <motion.div
          className={cn("select-none", className)}
          animate={{ 
            y: [0, -2, 0],
            rotate: [0, 4, -4, 0]
          }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        >
          {name === 'Snowflake' ? (
            <Snowflake className="w-full h-full text-sky-200" strokeWidth={strokeWidth} />
          ) : (
            <CloudSnow className="w-full h-full text-sky-300" strokeWidth={strokeWidth} />
          )}
        </motion.div>
      );
    }
    if (name === 'Wind') {
      return (
        <motion.div
          className={cn("select-none", className)}
          animate={{ x: [-2, 2, -2] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        >
          <Wind className="w-full h-full text-teal-400" strokeWidth={strokeWidth} />
        </motion.div>
      );
    }
    if (name === 'Sunrise' || name === 'Sunset') {
      return (
        <motion.div
          className={cn("select-none", className)}
          animate={{ y: [1, -2, 1] }}
          transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
        >
          {name === 'Sunrise' ? (
            <Sunrise className="w-full h-full text-amber-500" strokeWidth={strokeWidth} />
          ) : (
            <Sunset className="w-full h-full text-amber-600" strokeWidth={strokeWidth} />
          )}
        </motion.div>
      );
    }

    // Default Fallback mapping
    return <Icon className={cn("select-none", className)} strokeWidth={strokeWidth} />;
  }

  // Handle static & animated SVGs inline
  if ((style === 'static' || style === 'animated') && WEATHER_ICONS_SET.has(name)) {
    const filename = getSvgFilename(name);
    const isSunOrMoon = name.toLowerCase() === 'sun' || name.toLowerCase() === 'moon' || name.toLowerCase() === 'moonstar';
    const scale = isSunOrMoon ? 2.025 : 1.35;
    const svgMap = style === 'static' ? STATIC_SVGS : ANIMATED_SVGS;
    const svgContent = svgMap[filename];

    if (svgContent) {
      return (
        <span
          className={cn("select-none inline-flex items-center justify-center [&_svg]:w-full [&_svg]:h-full [&_svg]:block", className)}
          style={{ 
            transform: `scale(${scale})`, 
            transformOrigin: 'center'
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      );
    }

    const folder = style === 'static' ? 'static' : 'animated';
    return (
      <img
        src={`/assest/${folder}/${filename}`}
        alt={name}
        className={cn("select-none object-contain", className)}
        referrerPolicy="no-referrer"
        style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
      />
    );
  }

  // Define colors for 'coloured' and '3d'
  const getColor = () => {
    // Default to app text for outline unless explicitly asked to be coloured
    if (style === 'outline' && !forceColoured) {
      return 'text-app-text';
    }

    switch (name) {
      case 'Sun': case 'Sunrise': case 'Sunset': return 'text-amber-500';
      case 'Moon': return 'text-indigo-600';
      case 'MoonStar': return 'text-indigo-700';
      case 'CloudSunRain': return 'text-blue-500';
      case 'CloudMoonRain': return 'text-indigo-500';
      case 'CloudRainWind': return 'text-blue-600';
      case 'CloudSnow': return 'text-sky-500';
      case 'CloudSun': return 'text-amber-600';
      case 'CloudMoon': return 'text-indigo-600';
      case 'CloudRain': case 'CloudDrizzle': return 'text-blue-500';
      case 'CloudLightning': return 'text-orange-500';
      case 'Zap': return 'text-orange-400';
      case 'Snowflake': return 'text-sky-500';
      case 'Wind': return 'text-teal-600';
      case 'Droplets': return 'text-blue-500';
      case 'Eye': return 'text-indigo-600';
      case 'Cloud': case 'CloudFog': return 'text-neutral-500';
      default: return 'text-app-text';
    }
  };

  if (style === 'outline') {
    return <Icon className={cn(getColor(), className)} strokeWidth={strokeWidth} />;
  }

  if (style === 'coloured') {
    return (
      <div className="relative isolate">
        <Icon 
          className={cn(className, getColor())} 
          strokeWidth={strokeWidth || 2} 
        />
        {/* Subtle backing for visibility on light themes */}
        <Icon 
          className={cn(className, "absolute inset-0 -z-10 blur-[1px] opacity-20 text-black")} 
          strokeWidth={(strokeWidth || 2) + 0.5} 
        />
      </div>
    );
  }

  if (style === '3d') {
    return (
      <div className="relative group isolate">
        <Icon 
          className={cn(className, getColor(), "drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)]")} 
          strokeWidth={(strokeWidth || 1.6) + 0.2} 
        />
        {/* Secondary shadow layer */}
        <Icon 
          className={cn(className, "absolute inset-0 -z-10 blur-[4px] opacity-10 text-black")} 
          strokeWidth={(strokeWidth || 1.6) + 1} 
        />
      </div>
    );
  }

  return <Icon className={className} strokeWidth={strokeWidth} />;
};

export const Icons = RawIcons;
