import React, { useEffect, useRef } from 'react';
import { Settings } from '../types';

interface AtmosphereCanvasProps {
  weatherCode: number;
  isNight: boolean;
  settings: Settings;
  sunriseISO?: string;
  sunsetISO?: string;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  extra?: number; // wobble phase or random variance
}

// Convert Hex colors to RGB structure
const hexToRgb = (hex: string): RGB => {
  const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return res ? {
    r: parseInt(res[1], 16),
    g: parseInt(res[2], 16),
    b: parseInt(res[3], 16)
  } : { r: 0, g: 0, b: 0 };
};



// Map condition variables to specific 5-stop color palettes
const getTargetGradientColors = (weatherCode: number, isNight: boolean, sunriseISO?: string, sunsetISO?: string): RGB[] => {
  let hexes: string[];

  // Custom Morning/Evening check (strictly 1 hour after sunrise or 1 hour before sunset, and ONLY if clear/mostly clear)
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
      console.warn("Error parsing sunrise/sunset inside getTargetGradientColors", e);
    }
  }

  if (specialAtmosphere === 'morning') {
    // morning (orange with reddish on bottom)
    hexes = ["#ff8c00", "#ff5200", "#b22222", "#5c0606", "#000000"];
  } else if (specialAtmosphere === 'evening') {
    // evening (mostly reddish and little much violet)
    hexes = ["#e52d27", "#b31217", "#7a0055", "#3f005c", "#000000"];
  } else if (isNight) {
    if (weatherCode === 0 || weatherCode === 1) { // Clear
      hexes = ["#0a1122", "#070c18", "#040810", "#020408", "#000000"];
    } else if (weatherCode === 2 || weatherCode === 3) { // Cloudy
      hexes = ["#10141b", "#0c0f14", "#080a0e", "#040507", "#000000"];
    } else if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) { // Rain
      hexes = ["#0f1726", "#0b111c", "#070b13", "#030509", "#000000"];
    } else if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) { // Snow
      hexes = ["#192841", "#131e31", "#0d1421", "#060a10", "#000000"];
    } else if (weatherCode >= 95 && weatherCode <= 99) { // Storm
      hexes = ["#140f1e", "#0f0b17", "#0a0710", "#050308", "#000000"];
    } else { // Fog/other night
      hexes = ["#080b13", "#05070d", "#030409", "#010204", "#000000"];
    }
  } else {
    if (weatherCode === 0 || weatherCode === 1) { // Clear Day
      hexes = ["#142456", "#0f1c44", "#0b1433", "#060b1e", "#000000"];
    } else if (weatherCode === 2 || weatherCode === 3) { // Cloudy Day
      hexes = ["#20293c", "#171e2c", "#10151f", "#080a10", "#000000"];
    } else if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) { // Rain Day
      hexes = ["#1c273e", "#141c2c", "#0e1320", "#070a11", "#000000"];
    } else if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) { // Snow Day
      hexes = ["#223c6c", "#182b4f", "#111e38", "#09101f", "#000000"];
    } else if (weatherCode >= 95 && weatherCode <= 99) { // Storm Day
      hexes = ["#1a2032", "#121825", "#0c101a", "#06080d", "#000000"];
    } else { // Other day
      hexes = ["#0e1830", "#0a1122", "#070c18", "#03060c", "#000000"];
    }
  }
  return hexes.map(hexToRgb);
};

export default function AtmosphereCanvas({ weatherCode, isNight, settings, sunriseISO, sunsetISO }: AtmosphereCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);

  // Maintain actual color states for smooth transition lerping
  const currentColors = useRef<RGB[]>([]);
  const targetColors = useRef<RGB[]>([]);

  // Sound particle/lightning tracking objects
  const particles = useRef<Particle[]>([]);
  const lastWeatherState = useRef<{ code: number; night: boolean } | null>(null);
  const lightningFlash = useRef<number>(0); // opacity offset of lightning

  useEffect(() => {
    // Prime values
    const tG = getTargetGradientColors(weatherCode, isNight, sunriseISO, sunsetISO);
    targetColors.current = tG;
    if (currentColors.current.length === 0) {
      currentColors.current = tG.map(c => ({ ...c }));
    }
  }, [weatherCode, isNight, sunriseISO, sunsetISO]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Fast resize handling using high-DPI scaling
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset
        ctx.scale(dpr, dpr);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Weather particles creator (disabled to ensure zero CPU overhead and lag-free transitions)
    const initParticles = (code: number, night: boolean) => {
      particles.current = [];
    };

    // Main animation ticking loop
    const tick = () => {
      const gC = canvas.getBoundingClientRect();
      const w = gC.width;
      const h = gC.height;

      if (w === 0 || h === 0) {
        animationFrameId.current = requestAnimationFrame(tick);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameId.current = requestAnimationFrame(tick);
        return;
      }

      // 1. Smoothly interpolate (lerp) color stopped values
      let needLerp = false;
      const step = 0.055; // buttery lerp rate, extremely responsive but smooth

      for (let i = 0; i < targetColors.current.length; i++) {
        const cur = currentColors.current[i];
        const tar = targetColors.current[i];
        if (!cur || !tar) continue;

        const rd = tar.r - cur.r;
        const gd = tar.g - cur.g;
        const bd = tar.b - cur.b;

        if (Math.abs(rd) > 0.1 || Math.abs(gd) > 0.1 || Math.abs(bd) > 0.1) {
          cur.r += rd * step;
          cur.g += gd * step;
          cur.b += bd * step;
          needLerp = true;
        } else {
          cur.r = tar.r;
          cur.g = tar.g;
          cur.b = tar.b;
        }
      }

      // Check if code has changed to rebuild particle structures
      const stateKey = lastWeatherState.current;
      if (!stateKey || stateKey.code !== weatherCode || stateKey.night !== isNight) {
        lastWeatherState.current = { code: weatherCode, night: isNight };
        initParticles(weatherCode, isNight);
      }

      // Manage random lightning flash in severe thunderstorms - disabled to avoid screen blinking
      lightningFlash.current = 0;

      // 2. Clear & paint the custom hardware accelerated gradient
      ctx.clearRect(0, 0, w, h);

      // Create beautiful atmospheric radial gradient mimicking high end weather backdrops
      // Centered at (50% of screen, 220px from top) with radius 550px
      const cx = w / 2;
      const cy = 220;
      const rad = 550;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      currentColors.current.forEach((color, idx) => {
        const stop = idx * 0.25; // 0, 0.25, 0.50, 0.75, 1.0
        
        grad.addColorStop(stop, `rgb(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)})`);
      });

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // 3. Update & render particles (Particle rendering disabled for maximum performance)

      animationFrameId.current = requestAnimationFrame(tick);
    };

    animationFrameId.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [weatherCode, isNight, settings]);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full pointer-events-none select-none z-0"
      style={{ 
        display: settings.backgroundGlow === 'off' ? 'none' : 'block',
        willChange: 'transform',
        imageRendering: 'auto'
      }} 
    />
  );
}
