import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react';
import { cn } from '../lib/utils';

interface AtmosphereFXProps {
  weatherCode: number;
  isDay: boolean;
  moonPhase: number;
  locationName: string;
}

export default function AtmosphereFX({ weatherCode, isDay, moonPhase, locationName }: AtmosphereFXProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { scrollY } = useScroll();
  
  // Parallax offsets: layers move slower than foreground content
  // Positive values move down less than the content (or up relative to viewport)
  const y1 = useTransform(scrollY, [0, 500], [0, 150]); // Ambient layer: 30% parallax
  const y2 = useTransform(scrollY, [0, 500], [0, 250]); // Core layer: 50% parallax
  const yStars = useTransform(scrollY, [0, 500], [0, 100]); // Stars layer: 20% parallax

  useEffect(() => {
    setIsVisible(true);
    const timer = setTimeout(() => setIsVisible(false), 7500); 
    return () => clearTimeout(timer);
  }, [locationName, weatherCode]);

  const getConfig = () => {
    // 1. Thunderstorm: Deep Dramatic Aura
    if (weatherCode >= 95) {
      return {
        colors: ['rgba(30, 41, 59, 0.6)', 'rgba(51, 65, 85, 0.3)'],
        hasFlashes: true,
      };
    }
    // 2. Overcast: Boundless Grey White Gradient
    if (weatherCode === 3) {
      return {
        colors: isDay ? ['rgba(209, 213, 219, 0.35)', 'rgba(243, 244, 246, 0.2)'] : ['rgba(75, 85, 99, 0.3)', 'rgba(156, 163, 175, 0.15)'],
        hasClouds: false,
      };
    }
    // 2.1 Fog: Misty Drift
    if (weatherCode === 45 || weatherCode === 48) {
      return {
        colors: isDay ? ['rgba(203, 213, 225, 0.3)', 'rgba(241, 245, 249, 0.15)'] : ['rgba(15, 23, 42, 0.4)', 'rgba(30, 41, 59, 0.2)'],
        hasClouds: true,
      };
    }
    // 3. Rain / Drizzle: Deep Indigo Mist
    if (weatherCode >= 51 && weatherCode <= 82) {
      return {
        colors: isDay ? ['rgba(37, 99, 235, 0.25)', 'rgba(96, 165, 250, 0.1)'] : ['rgba(30, 27, 75, 0.5)', 'rgba(49, 46, 129, 0.2)'],
        hasMist: true,
      };
    }
    // 4. Partly Cloudy: Dynamic Skylight
    if (weatherCode === 1 || weatherCode === 2) {
      return {
        colors: isDay ? ['rgba(251, 191, 36, 0.2)', 'rgba(56, 189, 248, 0.15)'] : ['rgba(30, 58, 138, 0.3)', 'rgba(255, 255, 255, 0.05)'],
        hasDrift: true,
      };
    }
    // 5. Clear Day
    if (isDay) {
      return {
        colors: ['rgba(251, 191, 36, 0.3)', 'rgba(255, 255, 255, 0.1)'],
      };
    }
    // 6. Clear Night
    const moonPhaseSafe = Number.isFinite(moonPhase) ? moonPhase : 0.5;
    const phaseLum = Math.max(0, Math.min(1, 1 - Math.abs(0.5 - moonPhaseSafe) * 2));
    const moonOpacity = Math.max(0, Math.min(1, 0.15 + (phaseLum * 0.25)));
    return {
      colors: [`rgba(255, 255, 255, ${moonOpacity || 0.25})`, 'rgba(30, 27, 75, 0.2)'],
      hasStars: true,
    };
  };

  const config = getConfig();

  return (
    <AnimatePresence>
      {isVisible && locationName && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          className="fixed top-0 left-0 right-0 z-[100] h-[30vh] pointer-events-none overflow-hidden gpu"
          style={{ 
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0) 100%)'
          }}
        >
          {/* Depth Layer 1: Massive Ambient Base Glow */}
          <motion.div
            style={{
              y: y1,
              background: `radial-gradient(circle at center, ${config.colors[1] || config.colors[0]}, transparent 80%)`
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ 
              scale: 1.6, 
              opacity: [0, 0.5, 0.5, 0],
            }}
            transition={{ 
              duration: 7.5, 
              ease: "easeInOut",
              times: [0, 0.3, 0.7, 1]
            }}
            className="absolute top-[-40%] left-1/2 -translate-x-1/2 w-[220%] aspect-square rounded-full blur-[140px]"
          />

          {/* Depth Layer 2: Focused Core Atmosphere Animation */}
          <motion.div
            style={{
              y: y2,
              background: `radial-gradient(circle at center, ${config.colors[0]}, transparent 70%)`
            }}
            initial={{ scale: 0.6, opacity: 0, y: -20 }}
            animate={{ 
              scale: 1.3, 
              opacity: [0, 1, 1, 0],
              y: 20 
            }}
            transition={{ 
              duration: 6.5, 
              ease: [0.22, 1, 0.36, 1], 
              times: [0, 0.25, 0.75, 1],
              delay: 0.5
            }}
            className="absolute top-[-50%] left-1/2 -translate-x-1/2 w-[180%] aspect-square rounded-full blur-[100px]"
          />

          {/* Atmospheric Mist/Glow Pulses (No structure, just color) */}
          {(config.hasClouds || config.hasDrift || config.hasMist) && (
            <motion.div style={{ y: yStars }} className="absolute inset-0">
               {Array.from({ length: 2 }).map((_, i) => (
                 <motion.div
                  key={`glow-${i}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ 
                    opacity: [0, 0.25, 0],
                    scale: [1, 1.3, 1]
                  }}
                  transition={{ 
                    duration: 8 + i * 4, 
                    ease: "easeInOut",
                    repeat: Infinity,
                    delay: i * 2
                  }}
                  className="absolute inset-0 bg-app-text/5 blur-[120px] rounded-full"
                  style={{ top: `${10 + i * 20}%` }}
                 />
               ))}
            </motion.div>
          )}

          {/* Realistic Lightning Flashes - Improved Timing */}
          {config.hasFlashes && (
            <motion.div style={{ y: y2 }} className="absolute inset-0">
              <motion.div
                animate={{ 
                  opacity: [0, 0.4, 0, 0.3, 0],
                  scale: [1, 1.1, 1, 1.05, 1],
                }}
                transition={{ 
                  duration: 0.5, 
                  delay: 2.5,
                  repeat: Infinity,
                  repeatDelay: 3.5
                }}
                className="absolute inset-x-0 top-0 h-full bg-app-text/10 blur-[140px]"
              />
            </motion.div>
          )}

          {/* Ethereal Stars - Higher Density & Depth */}
          {config.hasStars && (
            <motion.div style={{ y: yStars }} className="absolute inset-0 opacity-40">
              {Array.from({ length: 24 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.8, 0] }}
                  transition={{ 
                    duration: 4 + Math.random() * 4, 
                    delay: Math.random() * 6,
                    repeat: Infinity
                  }}
                  className="absolute w-[1px] h-[1px] bg-app-text rounded-full"
                  style={{
                    top: `${Math.random() * 90}%`,
                    left: `${Math.random() * 100}%`,
                    boxShadow: '0 0 6px 1px var(--text-secondary)'
                  }}
                />
              ))}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
