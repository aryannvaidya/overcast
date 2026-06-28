import dns from 'node:dns';
import firebaseConfig from '../firebase-applet-config.json';

dns.setDefaultResultOrder('ipv4first');

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || "d78d4db3-2898-4f81-8bba-c8b5b719ee1b";

export default async function handler(request: any, response: any) {
  console.log('[CronAlerts] Analyzing user warning triggers');

  const projectId = firebaseConfig.projectId;
  const apiKey = firebaseConfig.apiKey;
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';

  try {
    // 1. Fetch registered sub-items
    const usersUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users?key=${apiKey}`;
    const usersResponse = await fetch(usersUrl);
    
    if (!usersResponse.ok) {
      const errText = await usersResponse.text();
      throw new Error(`Failed to fetch users from Firestore: ${errText}`);
    }

    const usersData = await usersResponse.json();
    const documents = usersData.documents || [];

    let processedCount = 0;
    let alertsSent = 0;

    for (const doc of documents) {
      const fields = doc.fields || {};
      const playerId = fields.playerId?.stringValue;
      const mainPushEnabled = fields.playerId?.stringValue ? true : false;

      if (!playerId || !mainPushEnabled) {
        continue;
      }

      processedCount++;

      const lat = parseFloat(fields.latitude?.doubleValue || '0');
      const lon = parseFloat(fields.longitude?.doubleValue || '0');
      const cityName = fields.cityName?.stringValue || 'your location';

      if (lat === 0 && lon === 0) {
        continue;
      }

      // Fetch active hourly forecast safely with professional browser headers
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m&hourly=weather_code,precipitation_probability,snowfall&timezone=auto`;
      const weatherResponse = await fetch(weatherUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/337.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/337.36',
          'Accept': 'application/json',
        }
      });
      if (!weatherResponse.ok) {
        continue;
      }

      const weatherData = await weatherResponse.json();
      const current = weatherData.current || {};
      const hourly = weatherData.hourly || {};

      // Analyze next 12 hours
      const next12Codes = (hourly.weather_code || []).slice(0, 12);
      const next12Prob = (hourly.precipitation_probability || []).slice(0, 12);
      const next12Snow = (hourly.snowfall || []).slice(0, 12);

      let alertTitle = '';
      let alertMsg = '';

      // Check thunderstorm
      const hasStormEnabled = fields.alertThunderstormEnabled?.booleanValue ?? false;
      const hasStormForecast = next12Codes.some((code: number) => code === 95 || code === 96 || code === 99);
      
      // Check severe weather
      const hasSevereEnabled = fields.alertSevereEnabled?.booleanValue ?? false;
      const currentWind = current.wind_speed_10m || 0;
      const currentTemp = current.temperature_2m || 0;

      // Check rain threshold
      const hasRainEnabled = fields.alertRainEnabled?.booleanValue ?? false;
      const rainThreshold = parseInt(fields.rainThreshold?.integerValue || '30', 10);
      const maxRainProb = Math.max(...next12Prob, 0);

      // Check snow threshold
      const hasSnowEnabled = fields.alertSnowEnabled?.booleanValue ?? false;
      const snowThreshold = parseInt(fields.snowThreshold?.integerValue || '30', 10);
      const maxSnowfall = Math.max(...next12Snow, 0);

      if (hasStormEnabled && hasStormForecast) {
        alertTitle = 'Thunderstorm Alert ⛈️';
        alertMsg = `A thunderstorm is forecast in ${cityName} within the next 12 hours. Please seek indoor shelter.`;
      } 
      else if (hasSevereEnabled && (currentWind > 75 || currentTemp > 41 || currentTemp < -15)) {
        alertTitle = 'Severe Weather Warning ⚠️';
        if (currentWind > 75) {
          alertMsg = `Extreme wind gusts detected in ${cityName} (${currentWind} km/h). Secure loose outdoor items.`;
        } else {
          alertMsg = `Extreme temperature registered in ${cityName} (${currentTemp}°C). Take proper safety precautions.`;
        }
      }
      else if (hasRainEnabled && maxRainProb >= rainThreshold) {
        alertTitle = 'Rain Trigger Alert 🌧️';
        alertMsg = `Precipitation probability in ${cityName} has reached ${maxRainProb}%, crossing your custom ${rainThreshold}% notify threshold.`;
      }
      else if (hasSnowEnabled && maxSnowfall > 0 && maxRainProb >= snowThreshold) {
        alertTitle = 'Snow Trigger Alert ❄️';
        alertMsg = `Snowfall of ${maxSnowfall} cm with ${maxRainProb}% probability expected soon in ${cityName}.`;
      }

      if (alertTitle && alertMsg) {
        // Send OneSignal Alert immediately!
        const onesignalUrl = 'https://onesignal.com/api/v1/notifications';
        const onesignalBody = {
          app_id: ONESIGNAL_APP_ID,
          include_subscription_ids: [playerId],
          include_player_ids: [playerId],
          headings: { en: alertTitle },
          contents: { en: alertMsg }
        };

        const pushResponse = await fetch(onesignalUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${process.env.ONESIGNAL_REST_API_KEY}`
          },
          body: JSON.stringify(onesignalBody)
        });

        if (pushResponse.ok) {
          alertsSent++;
          console.log(`[CronAlerts] Sent warning push directly to player ${playerId}`);
        } else {
          const pushErr = await pushResponse.text();
          console.warn(`[CronAlerts] Alert push error for ${playerId}:`, pushErr);
        }
      }
    }

    response.status(200).json({
      success: true,
      processed: processedCount,
      alerts_fired: alertsSent
    });
  } catch (error: any) {
    console.error('[CronAlerts] Fatal trigger error:', error);
    response.status(500).json({ error: error.message });
  }
}
