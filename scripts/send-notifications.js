const APP_ID = process.env.ONESIGNAL_APP_ID;
const REST_KEY = process.env.ONESIGNAL_REST_KEY;
const NOTIF_TYPE = process.argv[2]; // "morning" | "night" | "severe"

const FIREBASE_PROJECT_ID = 'nimbus-8e720';
const FIREBASE_DB_ID = 'ai-studio-42655dd6-4763-475c-a28c-d0f99b200092';
const FIREBASE_API_KEY = 'AIzaSyDhGKcNiaBmNTO0U6JSBo5mu5n0_vSevPM';

// ─── Fetch all users from Firestore ───────────────────────────────────────────
async function getUsers() {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DB_ID}/documents/users?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    console.error('Firestore fetch failed:', res.status, err);
    return [];
  }
  const data = await res.json();
  const docs = data.documents || [];
  console.log(`Firestore returned ${docs.length} user document(s)`);

  return docs.map(doc => {
    const f = doc.fields || {};
    return {
      playerId:                    f.playerId?.stringValue,
      lat:                         parseFloat(f.latitude?.doubleValue  ?? '0'),
      lon:                         parseFloat(f.longitude?.doubleValue ?? '0'),
      cityName:                    f.cityName?.stringValue || 'your location',
      timezone:                    f.timezone?.stringValue || 'UTC',
      alertSevereEnabled:          f.alertSevereEnabled?.booleanValue          ?? false,
      alertRainEnabled:            f.alertRainEnabled?.booleanValue            ?? false,
      alertThunderstormEnabled:    f.alertThunderstormEnabled?.booleanValue    ?? false,
      alertMorningSummaryEnabled:  f.alertMorningSummaryEnabled?.booleanValue  ?? false,
      alertNightSummaryEnabled:    f.alertNightSummaryEnabled?.booleanValue    ?? false,
      rainThreshold:               parseInt(f.rainThreshold?.integerValue     || '30', 10),
    };
  }).filter(u => u.playerId && u.lat !== 0 && u.lon !== 0);
}

// ─── Fetch weather from Open-Meteo ────────────────────────────────────────────
async function getWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&hourly=weather_code,precipitation_probability` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum` +
    `&timezone=auto`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OvercastWeatherBot/2.0)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) {
      console.warn(`Weather fetch failed (${res.status}) for ${lat},${lon}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn(`Weather network error for ${lat},${lon}:`, err.message);
    return null;
  }
}

// ─── WMO weather code → human description ─────────────────────────────────────
function getCondition(code) {
  if (code === 0)                       return 'Clear sky';
  if (code <= 2)                        return 'Partly cloudy';
  if (code === 3)                       return 'Overcast';
  if (code >= 45 && code <= 48)         return 'Fog';
  if (code >= 51 && code <= 57)         return 'Drizzle';
  if (code >= 61 && code <= 67)         return 'Rain';
  if (code >= 71 && code <= 77)         return 'Snow';
  if (code >= 80 && code <= 82)         return 'Rain showers';
  if (code >= 85 && code <= 86)         return 'Snow showers';
  if (code >= 95)                       return 'Thunderstorm';
  return 'Cloudy';
}

// ─── Current local hour in a given IANA timezone ──────────────────────────────
function getLocalHour(timezone) {
  try {
    const str = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour:     'numeric',
      hour12:   false,
    }).format(new Date());
    return parseInt(str, 10);
  } catch {
    return new Date().getUTCHours();
  }
}

// ─── Send OneSignal push to a single player ───────────────────────────────────
async function sendToPlayer(playerId, title, body) {
  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${REST_KEY}`,
      },
      body: JSON.stringify({
        app_id:                    APP_ID,
        include_player_ids:        [playerId],
        include_subscription_ids:  [playerId],
        headings:                  { en: title },
        contents:                  { en: body  },
      }),
    });
    if (res.ok) {
      console.log(`✅ Sent "${title}" → ${playerId}`);
    } else {
      const err = await res.text();
      console.warn(`❌ Push failed for ${playerId}:`, err);
    }
  } catch (err) {
    console.warn(`❌ Network error sending to ${playerId}:`, err.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`[Overcast Notifs] type=${NOTIF_TYPE ?? 'undefined'}`);

  if (!NOTIF_TYPE || !['morning', 'night', 'severe'].includes(NOTIF_TYPE)) {
    console.error('Usage: node send-notifications.js <morning|night|severe>');
    process.exit(1);
  }

  const users = await getUsers();
  console.log(`Processing ${users.length} eligible user(s)...`);

  for (const user of users) {
    try {
      const weather = await getWeather(user.lat, user.lon);
      if (!weather || !weather.current) {
        console.warn(`Skipping ${user.cityName}: no weather data`);
        continue;
      }

      const temp       = Math.round(weather.current.temperature_2m);
      const feels      = Math.round(weather.current.apparent_temperature);
      const code       = weather.current.weather_code;
      const localHour  = getLocalHour(user.timezone);

      // ── MORNING SUMMARY (8 AM local) ──────────────────────────────────────
      if (NOTIF_TYPE === 'morning' && user.alertMorningSummaryEnabled) {
        if (localHour !== 8) continue;
        const high      = Math.round(weather.daily?.temperature_2m_max?.[0] ?? temp);
        const low       = Math.round(weather.daily?.temperature_2m_min?.[0] ?? temp);
        const condition = getCondition(code);
        const precip    = weather.daily?.precipitation_sum?.[0] ?? 0;
        let body = `${condition} · H:${high}° L:${low}°`;
        if (precip > 0) body += ` · ${precip.toFixed(1)}mm rain expected`;
        else            body += ` · Good conditions today`;
        await sendToPlayer(user.playerId, `☀️ Morning in ${user.cityName}: ${temp}°`, body);
      }

      // ── NIGHT SUMMARY (9 PM local) ────────────────────────────────────────
      if (NOTIF_TYPE === 'night' && user.alertNightSummaryEnabled) {
        if (localHour !== 21) continue;
        const tomorrowHigh = Math.round(weather.daily?.temperature_2m_max?.[1] ?? temp);
        const tomorrowCode = weather.daily?.weather_code?.[1] ?? 0;
        const condition    = getCondition(tomorrowCode);
        const precip       = weather.daily?.precipitation_sum?.[1] ?? 0;
        let body = `${condition} · High ${tomorrowHigh}°`;
        if (precip > 0) body += ` · Expect ${precip.toFixed(1)}mm rain`;
        await sendToPlayer(user.playerId, `🌙 Tomorrow in ${user.cityName}`, body);
      }

      // ── SEVERE WEATHER CHECK ──────────────────────────────────────────────
      if (NOTIF_TYPE === 'severe') {
        // Heat alert: feels-like ≥ 38°C (tropical safety threshold)
        if (user.alertSevereEnabled && feels >= 38) {
          await sendToPlayer(
            user.playerId,
            `🔥 Extreme Heat Alert`,
            `Feels like ${feels}° in ${user.cityName}. Stay hydrated. Avoid direct sun.`
          );
        }
        // Extreme cold
        else if (user.alertSevereEnabled && temp <= 2) {
          await sendToPlayer(
            user.playerId,
            `🥶 Extreme Cold Alert`,
            `${temp}° in ${user.cityName}. Bundle up and stay warm.`
          );
        }
        // Thunderstorm
        else if (user.alertThunderstormEnabled && code >= 95) {
          await sendToPlayer(
            user.playerId,
            `⛈️ Thunderstorm Alert`,
            `Active thunderstorm in ${user.cityName}. Stay indoors.`
          );
        }
        // Rain probability threshold
        else if (user.alertRainEnabled) {
          const hourlyProb = weather.hourly?.precipitation_probability ?? [];
          const maxRainProb = Math.max(...hourlyProb.slice(0, 12), 0);
          if (maxRainProb >= user.rainThreshold) {
            await sendToPlayer(
              user.playerId,
              `Rain Alert: Heading to ${user.cityName}? ☔`,
              `There is a ${maxRainProb}% chance of rain in ${user.cityName} today. Don't forget to bring an umbrella! 🌧️`
            );
          }
        }
      }
    } catch (err) {
      console.error(`Error processing user ${user.playerId}:`, err.message);
    }
  }

  console.log('[Overcast Notifs] Done.');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});