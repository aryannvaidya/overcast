import { WeatherData } from '../types';

export interface MLHistoryRecord {
  timestamp: number;
  predicted: number;
  actual: number;
  isNight?: boolean; // segmented model flag
}

export interface MLModelParams {
  slope: number;
  intercept: number;
  samples: number;
}

export interface MLModelStats {
  samples: number;
  slope: number; // overall
  intercept: number; // overall
  dayModel: MLModelParams;
  nightModel: MLModelParams;
  r2: number;
  rawMae: number;
  correctedMae: number;
  improvementPct: number;
}

const HISTORY_KEY_PREFIX = 'app_ml_history_';
const MODEL_KEY_PREFIX = 'app_ml_model_';
const MAX_HISTORY_RECORDS = 200;

function getHistoryKey(locationKey: string): string {
  return `${HISTORY_KEY_PREFIX}${locationKey}`;
}

function getModelKey(locationKey: string): string {
  return `${MODEL_KEY_PREFIX}${locationKey}`;
}

/**
 * Record a prediction-actual pair for temperature calibration
 */
export function recordMLObservation(locationKey: string, predicted: number, actual: number, isNight: boolean = false) {
  try {
    const key = getHistoryKey(locationKey);
    const raw = localStorage.getItem(key);
    const history: MLHistoryRecord[] = raw ? JSON.parse(raw) : [];

    const nowHour = Math.floor(Date.now() / (1000 * 60 * 60)) * (1000 * 60 * 60);
    
    // Check if we already logged in the last 45 minutes to prevent spamming
    const lastRecord = history[history.length - 1];
    if (lastRecord && Math.abs(lastRecord.timestamp - nowHour) < (45 * 60 * 1000)) {
      lastRecord.actual = actual;
      lastRecord.predicted = predicted;
      lastRecord.isNight = isNight;
    } else {
      history.push({
        timestamp: Date.now(),
        predicted,
        actual,
        isNight
      });
    }

    if (history.length > MAX_HISTORY_RECORDS) {
      history.shift();
    }

    localStorage.setItem(key, JSON.stringify(history));
    trainLocalModel(locationKey);
  } catch (err) {
    console.warn('[MLService] Failed to record observation:', err);
  }
}

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
 * Solve Weighted Least Squares (WLS) for a given subset of history records
 * Weight decays exponentially with age: weight = exp(-daysAgo / 7)
 */
function solveWeightedLeastSquares(records: MLHistoryRecord[]): MLModelParams {
  const n = records.length;
  if (n < 3) {
    return { slope: 1.0, intercept: 0.0, samples: n };
  }

  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;
  let sumWXX = 0;
  let sumWXY = 0;

  const now = Date.now();

  for (const r of records) {
    const ageDays = (now - r.timestamp) / (1000 * 60 * 60 * 24);
    const w = Math.exp(-ageDays / 7.0); // 7-day half-decay weight

    const x = r.predicted;
    const y = r.actual;

    sumW += w;
    sumWX += w * x;
    sumWY += w * y;
    sumWXX += w * x * x;
    sumWXY += w * x * y;
  }

  const meanX = sumWX / sumW;
  const meanY = sumWY / sumW;

  let num = 0;
  let den = 0;

  for (const r of records) {
    const ageDays = (now - r.timestamp) / (1000 * 60 * 60 * 24);
    const w = Math.exp(-ageDays / 7.0);

    const x = r.predicted;
    const y = r.actual;

    num += w * (x - meanX) * (y - meanY);
    den += w * (x - meanX) * (x - meanX);
  }

  let slope = 1.0;
  let intercept = 0.0;

  if (Math.abs(den) > 0.00001) {
    slope = num / den;
    intercept = meanY - slope * meanX;
  }

  // Bound slope/intercept to prevent distortions
  if (slope < 0.6) slope = 0.6;
  if (slope > 1.4) slope = 1.4;
  if (intercept < -8) intercept = -8;
  if (intercept > 8) intercept = 8;

  return { slope, intercept, samples: n };
}

/**
 * Train both segmented models (day, night) and overall model using WLS
 */
export function trainLocalModel(locationKey: string): MLModelStats | null {
  try {
    const history = getMLHistory(locationKey);
    const n = history.length;

    // Overall model
    const overall = solveWeightedLeastSquares(history);

    // Segmented Day/Night models
    const dayRecords = history.filter(r => !r.isNight);
    const nightRecords = history.filter(r => r.isNight);

    const dayModel = solveWeightedLeastSquares(dayRecords);
    const nightModel = solveWeightedLeastSquares(nightRecords);

    // Default stats if not enough data
    if (n < 3) {
      return {
        samples: n,
        slope: 1.0,
        intercept: 0.0,
        dayModel,
        nightModel,
        r2: 0.0,
        rawMae: 0.0,
        correctedMae: 0.0,
        improvementPct: 0.0
      };
    }

    // Evaluate accuracy improvements
    let totalRawError = 0;
    let totalCorrectedError = 0;
    let meanY = 0;
    let sumY = 0;

    history.forEach(r => sumY += r.actual);
    meanY = sumY / n;

    let totalSumSquares = 0;
    let residualSumSquares = 0;

    for (const r of history) {
      const rawPred = r.predicted;
      const act = r.actual;
      
      // Use segmented model if applicable, else overall
      let corrPred = rawPred;
      const model = r.isNight ? nightModel : dayModel;
      if (model.samples >= 3) {
        corrPred = model.slope * rawPred + model.intercept;
      } else {
        corrPred = overall.slope * rawPred + overall.intercept;
      }

      totalRawError += Math.abs(rawPred - act);
      totalCorrectedError += Math.abs(corrPred - act);

      totalSumSquares += (act - meanY) * (act - meanY);
      residualSumSquares += (act - corrPred) * (act - corrPred);
    }

    const rawMae = totalRawError / n;
    const correctedMae = totalCorrectedError / n;

    let r2 = totalSumSquares > 0 ? 1 - (residualSumSquares / totalSumSquares) : 1;
    if (r2 < 0) r2 = 0;

    const improvementPct = rawMae > 0 ? Math.max(0, ((rawMae - correctedMae) / rawMae) * 100) : 0;

    const stats: MLModelStats = {
      samples: n,
      slope: overall.slope,
      intercept: overall.intercept,
      dayModel,
      nightModel,
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

export function getMLModelStats(locationKey: string): MLModelStats {
  try {
    const raw = localStorage.getItem(getModelKey(locationKey));
    if (raw) return JSON.parse(raw);
  } catch {}

  const history = getMLHistory(locationKey);
  const dummyModel = { slope: 1.0, intercept: 0.0, samples: 0 };
  return {
    samples: history.length,
    slope: 1.0,
    intercept: 0.0,
    dayModel: dummyModel,
    nightModel: dummyModel,
    r2: 0.0,
    rawMae: 0.0,
    correctedMae: 0.0,
    improvementPct: 0.0
  };
}

/**
 * Apply the ML correction using segmented day/night models
 */
export function calibrateTemperature(locationKey: string, rawTemp: number, isNight: boolean = false): number {
  const stats = getMLModelStats(locationKey);
  
  // Use day/night specific model if it has enough samples
  const model = isNight ? stats.nightModel : stats.dayModel;
  if (model && model.samples >= 3) {
    return model.slope * rawTemp + model.intercept;
  }

  // Fallback to overall model
  if (stats.samples >= 3) {
    return stats.slope * rawTemp + stats.intercept;
  }

  // Fallback to raw temperature
  return rawTemp;
}

export function runSelfLearningBatch(locationKey: string, weather: WeatherData) {
  if (!weather || !weather.current || !weather.hourly) return;

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

  if (closestIdx !== -1 && minDiff < 45 * 60 * 1000) {
    const predicted = temps[closestIdx];
    const actual = weather.current.temperature;
    const isNight = !weather.current.isDay; // Determine day/night flag
    if (predicted !== undefined && actual !== undefined) {
      recordMLObservation(locationKey, predicted, actual, isNight);
    }
  }
}

export function resetMLHistory(locationKey: string) {
  try {
    localStorage.removeItem(getHistoryKey(locationKey));
    localStorage.removeItem(getModelKey(locationKey));
  } catch (err) {
    console.warn('[MLService] Reset failed:', err);
  }
}
