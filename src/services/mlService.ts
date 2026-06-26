import { WeatherData } from '../types';

export interface MLHistoryRecord {
  timestamp: number;
  predicted: number;
  actual: number;
}

export interface MLModelStats {
  samples: number;
  slope: number;
  intercept: number;
  r2: number;
  rawMae: number;
  correctedMae: number;
  improvementPct: number;
}

const HISTORY_KEY_PREFIX = 'app_ml_history_';
const MODEL_KEY_PREFIX = 'app_ml_model_';
const MAX_HISTORY_RECORDS = 150;

/**
 * Get the localStorage key for a city's ML history
 */
function getHistoryKey(locationKey: string): string {
  return `${HISTORY_KEY_PREFIX}${locationKey}`;
}

/**
 * Get the localStorage key for a city's trained model parameters
 */
function getModelKey(locationKey: string): string {
  return `${MODEL_KEY_PREFIX}${locationKey}`;
}

/**
 * Record a prediction-actual pair for temperature calibration
 */
export function recordMLObservation(locationKey: string, predicted: number, actual: number) {
  try {
    const key = getHistoryKey(locationKey);
    const raw = localStorage.getItem(key);
    const history: MLHistoryRecord[] = raw ? JSON.parse(raw) : [];

    // Avoid duplicate records for the same hour/timestamp
    const nowHour = Math.floor(Date.now() / (1000 * 60 * 60)) * (1000 * 60 * 60);
    
    // Check if we already logged in the last 45 minutes to prevent spamming
    const lastRecord = history[history.length - 1];
    if (lastRecord && Math.abs(lastRecord.timestamp - nowHour) < (45 * 60 * 1000)) {
      // Update the actual/predicted for the current hour rather than appending
      lastRecord.actual = actual;
      lastRecord.predicted = predicted;
    } else {
      history.push({
        timestamp: Date.now(),
        predicted,
        actual
      });
    }

    // Keep history bounded
    if (history.length > MAX_HISTORY_RECORDS) {
      history.shift();
    }

    localStorage.setItem(key, JSON.stringify(history));
    
    // Trigger training automatically when a new sample is added
    trainLocalModel(locationKey);
  } catch (err) {
    console.warn('[MLService] Failed to record observation:', err);
  }
}

/**
 * Retrieve observations history
 */
export function getMLHistory(locationKey: string): MLHistoryRecord[] {
  try {
    const key = getHistoryKey(locationKey);
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Train a simple Linear Regression model (Actual = slope * Predicted + intercept)
 * using Least Squares method to calibrate raw forecasts.
 */
export function trainLocalModel(locationKey: string): MLModelStats | null {
  try {
    const history = getMLHistory(locationKey);
    const n = history.length;

    // We need at least 3 points to train a meaningful regression
    if (n < 3) {
      return {
        samples: n,
        slope: 1.0,
        intercept: 0.0,
        r2: 0.0,
        rawMae: 0.0,
        correctedMae: 0.0,
        improvementPct: 0.0
      };
    }

    let sumX = 0; // Predicted
    let sumY = 0; // Actual
    let sumXY = 0;
    let sumXX = 0;
    let sumYY = 0;

    for (const record of history) {
      const x = record.predicted;
      const y = record.actual;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
      sumYY += y * y;
    }

    // Linear regression formula calculations
    const denominator = n * sumXX - sumX * sumX;
    let slope = 1.0;
    let intercept = 0.0;

    if (Math.abs(denominator) > 0.00001) {
      slope = (n * sumXY - sumX * sumY) / denominator;
      intercept = (sumY - slope * sumX) / n;
    }

    // Bound slope to avoid extreme distortions in case of low variance
    if (slope < 0.5) slope = 0.5;
    if (slope > 1.5) slope = 1.5;
    if (intercept < -10) intercept = -10;
    if (intercept > 10) intercept = 10;

    // Calculate MAE (Mean Absolute Error) for both raw and corrected models
    let totalRawError = 0;
    let totalCorrectedError = 0;
    let meanY = sumY / n;
    let totalSumSquares = 0;
    let residualSumSquares = 0;

    for (const record of history) {
      const rawPred = record.predicted;
      const act = record.actual;
      const corrPred = slope * rawPred + intercept;

      totalRawError += Math.abs(rawPred - act);
      totalCorrectedError += Math.abs(corrPred - act);

      totalSumSquares += (act - meanY) * (act - meanY);
      residualSumSquares += (act - corrPred) * (act - corrPred);
    }

    const rawMae = totalRawError / n;
    const correctedMae = totalCorrectedError / n;
    
    // R-squared calculation
    let r2 = totalSumSquares > 0 ? 1 - (residualSumSquares / totalSumSquares) : 1;
    if (r2 < 0) r2 = 0;

    const improvementPct = rawMae > 0 ? Math.max(0, ((rawMae - correctedMae) / rawMae) * 100) : 0;

    const stats: MLModelStats = {
      samples: n,
      slope,
      intercept,
      r2,
      rawMae,
      correctedMae,
      improvementPct
    };

    localStorage.setItem(getModelKey(locationKey), JSON.stringify(stats));
    return stats;
  } catch (err) {
    console.warn('[MLService] Training failed:', err);
    return null;
  }
}

/**
 * Get trained model statistics and parameters
 */
export function getMLModelStats(locationKey: string): MLModelStats {
  try {
    const raw = localStorage.getItem(getModelKey(locationKey));
    if (raw) return JSON.parse(raw);
  } catch {}
  
  // Default fallback stats
  return {
    samples: getMLHistory(locationKey).length,
    slope: 1.0,
    intercept: 0.0,
    r2: 0.0,
    rawMae: 0.0,
    correctedMae: 0.0,
    improvementPct: 0.0
  };
}

/**
 * Apply the ML correction to a temperature value
 */
export function calibrateTemperature(locationKey: string, rawTemp: number): number {
  const stats = getMLModelStats(locationKey);
  if (stats.samples < 3) return rawTemp; // Not enough training samples
  return stats.slope * rawTemp + stats.intercept;
}

/**
 * Add observations from current weather data and history
 * by matching the closest loaded cached data
 */
export function runSelfLearningBatch(locationKey: string, weather: WeatherData) {
  if (!weather || !weather.current || !weather.hourly) return;
  
  // Find current hour forecast prediction
  const times = weather.hourly.time || [];
  const temps = weather.hourly.temperature_2m || weather.hourly.temperature || [];
  const nowMs = Date.now();
  
  let closestIdx = -1;
  let minDiff = Infinity;
  
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    if (isNaN(t)) continue;
    const diff = Math.abs(t - nowMs);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }

  // We only log if we have a forecast prediction for the current hour
  if (closestIdx !== -1 && minDiff < 45 * 60 * 1000) {
    const predicted = temps[closestIdx];
    const actual = weather.current.temperature;
    if (predicted !== undefined && actual !== undefined) {
      recordMLObservation(locationKey, predicted, actual);
    }
  }
}

/**
 * Reset ML training history for a location
 */
export function resetMLHistory(locationKey: string) {
  try {
    localStorage.removeItem(getHistoryKey(locationKey));
    localStorage.removeItem(getModelKey(locationKey));
  } catch (err) {
    console.warn('[MLService] Reset failed:', err);
  }
}
