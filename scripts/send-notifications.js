const APP_ID = process.env.ONESIGNAL_APP_ID;
const REST_KEY = process.env.ONESIGNAL_REST_KEY;
const NOTIF_TYPE = process.argv[2];

console.log("Script started");
console.log("NOTIF_TYPE:", NOTIF_TYPE);
console.log("APP_ID present:", !!APP_ID);
console.log("REST_KEY present:", !!REST_KEY);

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Key ${REST_KEY}`,
};

async function getDevices() {
  console.log("Fetching devices from OneSignal...");

  const res = await fetch(
    `https://api.onesignal.com/apps/${APP_ID}/subscriptions`,
    { headers }
  );

  console.log("API status:", res.status);

  if (!res.ok) {
    const err = await res.text();
    console.error("Failed to fetch devices:", res.status, err);
    return [];
  }

  const data = await res.json();
  console.log("Raw response keys:", Object.keys(data));
  
  // New API returns subscriptions array
  const subscriptions = data.subscriptions || data.players || [];
  console.log("Total subscriptions returned:", subscriptions.length);

  const tagged = subscriptions.filter(p => p.tags?.city);
  console.log("Devices with city tag:", tagged.length);

  if (subscriptions.length > 0 && tagged.length === 0) {
    console.log("Sample device tags (first device):",
      JSON.stringify(subscriptions[0]?.tags));
  }

  return tagged;
}

function groupByCity(devices) {
  const groups = {};
  devices.forEach(d => {
    const city = d.tags.city;
    if (!groups[city]) {
      groups[city] = {
        lat: parseFloat(d.tags.lat),
        lon: parseFloat(d.tags.lon),
        playerIds: []
      };
    }
    // New API uses id or subscription_id
    groups[city].playerIds.push(d.id || d.subscription_id);
  });
  return groups;
}

async function getWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code` +
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

async function sendNotification(playerIds, title, body) {
  console.log("Sending to", playerIds.length, "devices:", title);

  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers,
    body: JSON.stringify({
      app_id: APP_ID,
      include_subscription_ids: playerIds,
      headings: { en: title },
      contents: { en: body },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Send failed:", res.status, err);
    return;
  }

  const result = await res.json();
  console.log("Send result:", JSON.stringify(result));
}

async function run() {
  const devices = await getDevices();

  if (devices.length === 0) {
    console.log("No tagged devices found. Exiting.");
    return;
  }

  const cities = groupByCity(devices);
  console.log("Cities to process:", Object.keys(cities));

  for (const [cityName, info] of Object.entries(cities)) {
    console.log("Processing city:", cityName);

    const weather = await getWeather(info.lat, info.lon);
    const temp      = Math.round(weather.current.temperature_2m);
    const feels     = Math.round(weather.current.apparent_temperature);
    const code      = weather.current.weather_code;
    const condition = getCondition(code);
    const high      = Math.round(weather.daily.temperature_2m_max[0]);
    const low       = Math.round(weather.daily.temperature_2m_min[0]);
    const tomorrowHigh = Math.round(weather.daily.temperature_2m_max[1]);
    const tomorrowCode = weather.daily.weather_code[1];

    if (NOTIF_TYPE === "morning") {
      await sendNotification(
        info.playerIds,
        `${temp}° now`,
        `in ${cityName}\nfeels ${feels}°\nH:${high}° L:${low}°`
      );
    }

    if (NOTIF_TYPE === "night") {
      await sendNotification(
        info.playerIds,
        `${tomorrowHigh}° high tomorrow`,
        `in ${cityName}\n${getCondition(tomorrowCode)} overnight`
      );
    }

    if (NOTIF_TYPE === "severe") {
      console.log("Checking severe conditions:", { feels, temp, code });

      if (feels >= 42) {
        await sendNotification(
          info.playerIds,
          `Extreme heat`,
          `in ${cityName}\nFeels like ${feels}°. Stay hydrated.`
        );
      } else if (temp <= 2) {
        await sendNotification(
          info.playerIds,
          `Extreme cold`,
          `in ${cityName}\n${temp}° right now. Bundle up.`
        );
      } else if (code >= 95) {
        await sendNotification(
          info.playerIds,
          `⛈ Severe storm`,
          `in ${cityName}\nThunderstorm active. Stay indoors.`
        );
      } else {
        console.log("No severe conditions detected.");
      }
    }
  }

  console.log("Script completed.");
}

run().catch(err => {
  console.error("Script crashed:", err);
  process.exit(1);
});