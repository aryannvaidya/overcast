const APP_ID = process.env.ONESIGNAL_APP_ID;
const REST_KEY = process.env.ONESIGNAL_REST_KEY;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const NOTIF_TYPE = process.argv[2];

console.log("Script started, type:", NOTIF_TYPE);

const osHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Key ${REST_KEY}`,
};

// Step 1 — Get all OneSignal subscribers
async function getSubscriberIds() {
  const res = await fetch(
    `https://onesignal.com/api/v1/players` +
    `?app_id=${APP_ID}&limit=300`,
    { headers: osHeaders }
  );

  if (!res.ok) {
    console.error("Failed to get subscribers:", res.status);
    return [];
  }

  const data = await res.json();
  console.log("Total subscribers:", data.players?.length || 0);
  return data.players || [];
}

// Step 2 — Get user location from Firestore by playerId
async function getUserFromFirestore(playerId) {
  const url =
    `https://firestore.googleapis.com/v1/projects/` +
    `${FIREBASE_PROJECT_ID}/databases/(default)/documents/` +
    `users/${playerId}?key=${FIREBASE_API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.fields) return null;

    const f = data.fields;
    return {
      playerId,
      cityName:  f.cityName?.stringValue || "your area",
      lat:       parseFloat(f.latitude?.doubleValue || 0),
      lon:       parseFloat(f.longitude?.doubleValue || 0),
      timezone:  f.timezone?.stringValue || "UTC",
      alertMorning: f.alertMorningSummaryEnabled?.booleanValue ?? true,
      alertNight:   f.alertNightSummaryEnabled?.booleanValue ?? true,
      alertSevere:  f.alertSevereEnabled?.booleanValue ?? true,
      alertRain:    f.alertRainEnabled?.booleanValue ?? true,
      alertStorm:   f.alertThunderstormEnabled?.booleanValue ?? true,
    };
  } catch (e) {
    return null;
  }
}

// Step 3 — Fetch weather for coordinates
async function getWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,` +
    `weather_code,precipitation_probability` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&timezone=auto`;
  const res = await fetch(url);
  return res.json();
}

function getCondition(code) {
  if (code === 0)  return "Clear sky";
  if (code <= 2)   return "Partly cloudy";
  if (code === 3)  return "Overcast";
  if (code <= 48)  return "Foggy";
  if (code <= 57)  return "Drizzle";
  if (code <= 67)  return "Rain";
  if (code <= 77)  return "Snow";
  if (code <= 82)  return "Rain showers";
  if (code <= 86)  return "Snow showers";
  if (code >= 95)  return "Thunderstorm";
  return "Cloudy";
}

// Step 4 — Send to specific player
async function sendToPlayer(playerId, title, body) {
  const res = await fetch(
    "https://api.onesignal.com/notifications",
    {
      method: "POST",
      headers: osHeaders,
      body: JSON.stringify({
        app_id: APP_ID,
        include_player_ids: [playerId],
        headings: { en: title },
        contents: { en: body },
      }),
    }
  );

  if (!res.ok) {
    console.error("Send failed for", playerId, res.status);
    return;
  }

  console.log("Sent to", playerId, ":", title);
}

// Step 5 — Main
async function run() {
  const subscribers = await getSubscriberIds();
  
  if (subscribers.length === 0) {
    console.log("No subscribers found.");
    return;
  }

  // Process each subscriber individually
  for (const sub of subscribers) {
    const user = await getUserFromFirestore(sub.id);

    // Fallback if no Firestore data
    const cityName = user?.cityName || "your area";
    const lat      = user?.lat || 28.6139;
    const lon      = user?.lon || 77.2090;

    if (!lat || !lon) {
      console.log("No location for:", sub.id, "skipping");
      continue;
    }

    const weather = await getWeather(lat, lon);
    const temp    = Math.round(weather.current.temperature_2m);
    const feels   = Math.round(weather.current.apparent_temperature);
    const code    = weather.current.weather_code;
    const high    = Math.round(weather.daily.temperature_2m_max[0]);
    const low     = Math.round(weather.daily.temperature_2m_min[0]);
    const tomorrowHigh = Math.round(weather.daily.temperature_2m_max[1]);
    const tomorrowCode = weather.daily.weather_code[1];

    console.log(`${cityName}: ${temp}° feels ${feels}° code ${code}`);

    if (NOTIF_TYPE === "morning" && 
        (user?.alertMorning ?? true)) {
      await sendToPlayer(
        sub.id,
        `${temp}° now · Good Morning ☀️`,
        `in ${cityName}\nfeels ${feels}°\nH:${high}° L:${low}°`
      );
    }

    if (NOTIF_TYPE === "night" && 
        (user?.alertNight ?? true)) {
      await sendToPlayer(
        sub.id,
        `${tomorrowHigh}° high tomorrow 🌙`,
        `in ${cityName}\n${getCondition(tomorrowCode)} overnight`
      );
    }

    if (NOTIF_TYPE === "severe" && 
        (user?.alertSevere ?? true)) {
      if (feels >= 42) {
        await sendToPlayer(
          sub.id,
          `🔥 Extreme Heat Alert`,
          `in ${cityName}\nFeels ${feels}°. Stay hydrated.`
        );
      } else if (temp <= 2) {
        await sendToPlayer(
          sub.id,
          `🥶 Extreme Cold Alert`,
          `in ${cityName}\n${temp}°. Bundle up.`
        );
      } else if (code >= 95) {
        await sendToPlayer(
          sub.id,
          `⛈ Storm Alert`,
          `in ${cityName}\nThunderstorm active. Stay indoors.`
        );
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  console.log("Script completed.");
}

run().catch(err => {
  console.error("Crashed:", err);
  process.exit(1);
});