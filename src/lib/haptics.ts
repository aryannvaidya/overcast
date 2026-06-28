/**
 * Robust Haptic Feedback Implementation
 * Unlocks vibration on any authentic user activation (click, touch, tap)
 * and keeps listeners active until the browser successfully allows vibration.
 */

let unlocked = false;

// List of interactive events that can serve as reliable user activation gestures
const JESTURE_EVENTS = [
  'click',
  'touchend',
  'pointerup',
  'pointerdown',
  'touchstart',
  'mousedown',
  'mouseup',
  'keydown'
];

if (typeof window !== 'undefined') {
  const tryUnlock = (e?: Event) => {
    if (unlocked) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        // Use a 10ms pulse instead of 1ms, as 1ms is below the minimum duration threshold of many device actuators and fails
        const success = navigator.vibrate(10);
        if (success) {
          unlocked = true;
          removeListeners();
        }
      } catch (err) {
        // Silently catch and retry on next event
      }
    }
  };

  const removeListeners = () => {
    JESTURE_EVENTS.forEach(evt => {
      window.removeEventListener(evt, tryUnlock, { capture: true });
    });
  };

  // Register capture-phase listeners to run as early as possible on any user gesture
  JESTURE_EVENTS.forEach(evt => {
    window.addEventListener(evt, tryUnlock, { passive: true, capture: true });
  });

  // Also try once immediately, just in case
  setTimeout(() => tryUnlock(), 50);
}

export const Haptic = {
  light: (enabled: boolean = true) => {
    if (!enabled || typeof navigator === 'undefined') return;
    try {
      const success = navigator.vibrate?.([10]);
      if (success && !unlocked) {
        unlocked = true;
      }
    } catch (e) {
      // Ignore
    }
  },
  medium: (enabled: boolean = true) => {
    if (!enabled || typeof navigator === 'undefined') return;
    try {
      const success = navigator.vibrate?.([30]);
      if (success && !unlocked) {
        unlocked = true;
      }
    } catch (e) {
      // Ignore
    }
  },
  heavy: (enabled: boolean = true) => {
    if (!enabled || typeof navigator === 'undefined') return;
    try {
      const success = navigator.vibrate?.([60]);
      if (success && !unlocked) {
        unlocked = true;
      }
    } catch (e) {
      // Ignore
    }
  },
  success: (enabled: boolean = true) => {
    if (!enabled || typeof navigator === 'undefined') return;
    try {
      const success = navigator.vibrate?.([10, 50, 10]);
      if (success && !unlocked) {
        unlocked = true;
      }
    } catch (e) {
      // Ignore
    }
  },
  error: (enabled: boolean = true) => {
    if (!enabled || typeof navigator === 'undefined') return;
    try {
      const success = navigator.vibrate?.([60, 50, 60]);
      if (success && !unlocked) {
        unlocked = true;
      }
    } catch (e) {
      // Ignore
    }
  },
  warning: (enabled: boolean = true) => {
    if (!enabled || typeof navigator === 'undefined') return;
    try {
      const success = navigator.vibrate?.([30, 50, 30]);
      if (success && !unlocked) {
        unlocked = true;
      }
    } catch (e) {
      // Ignore
    }
  },
};
