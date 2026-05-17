import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RawIcons } from './WeatherIcons';
import { cn, GLASS_STYLE_SUBTLE } from '../lib/utils';

interface WeatherAlert {
  id: string;
  type: 'rain' | 'snow' | 'storm' | 'severe';
  title: string;
  message: string;
}

interface AlertsDisplayProps {
  alerts: WeatherAlert[];
  onDismiss: (id: string) => void;
}

export default function AlertsDisplay({ alerts, onDismiss }: AlertsDisplayProps) {
  return (
    <div className="w-full px-6 mb-8 mt-2 space-y-3">
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn(
              "p-4 rounded-[20px] flex gap-4 items-start relative overflow-hidden group transition-all duration-300",
              GLASS_STYLE_SUBTLE,
              "bg-app-text/[0.05] border-app-border"
            )}
          >
            {/* Glow background */}
            <div className="absolute inset-0 bg-gradient-to-br from-app-text/[0.03] to-transparent pointer-events-none" />
            
            <div className="mt-1">
              {alert.type === 'rain' && <RawIcons.CloudRain className="w-5 h-5 text-blue-500" />}
              {alert.type === 'snow' && <RawIcons.Snowflake className="w-5 h-5 text-app-text" />}
              {alert.type === 'storm' && <RawIcons.CloudLightning className="w-5 h-5 text-amber-500" />}
              {alert.type === 'severe' && <RawIcons.ShieldAlert className="w-5 h-5 text-rose-500" />}
            </div>

            <div className="flex-1">
              <h4 className="text-[14px] font-bold text-app-text mb-0.5 tracking-tight uppercase">
                {alert.title}
              </h4>
              <p className="text-[13px] text-app-text-dim leading-tight">
                {alert.message}
              </p>
            </div>

            <button 
              onClick={() => onDismiss(alert.id)}
              className="p-1 opacity-40 group-hover:opacity-100 transition-opacity"
            >
              <RawIcons.X className="w-4 h-4 text-app-text" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
