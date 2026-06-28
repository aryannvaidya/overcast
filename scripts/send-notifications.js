const APP_ID = process.env.ONESIGNAL_APP_ID;
const REST_KEY = process.env.ONESIGNAL_REST_KEY;
const NOTIF_TYPE = process.argv[2]; // "morning" | "night" | "severe"

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Basic ${REST_KEY}`,
};

// Fetch all subscribed devices with tags
async function getDevices() {
  const res = await fetch(
    `https://onesignal.com/api/v1/players?app_id=${APP_ID}&limit=300`,
    { headers }
  );
  const data = await res.json();
  return (data.players || []).filter(p => p.tags?.city);
}

// Group devices by city
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
    groups[city].playerIds.push(d.id);
  });
  return groups;
}

// Fetch weather for a city
async function getWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&timezone=auto`;
  const res = await fetch(url);
  return res.json();
}

function getCondition(code) {
  if (code === 0) return "Clear sky";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code >= 95) return "Thunderstorm";
  return "Cloudy";
}

// Send notification to specific devices
async function sendNotification(playerIds, title, body) {
  await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers,
    body: JSON.stringify({
      app_id: APP_ID,
      include_player_ids: playerIds,
      headings: { en: title },
      contents: { en: body },
    }),
  });
  console.log("Sent:", title, "to", playerIds.length, "devices");
}

async function run() {
  const devices = await getDevices();
  const cities = groupByCity(devices);

  for (const [cityName, info] of Object.entries(cities)) {
    const weather = await getWeather(info.lat, info.lon);
    const temp = Math.round(weather.current.temperature_2m);
    const feels = Math.round(weather.current.apparent_temperature);
    const code = weather.current.weather_code;
    const condition = getCondition(code);
    const high = Math.round(weather.daily.temperature_2m_max[0]);
    const low = Math.round(weather.daily.temperature_2m_min[0]);
    const tomorrowHigh = Math.round(weather.daily.temperature_2m_max[1]);
    const tomorrowCode = weather.daily.weather_code[1];

    if (NOTIF_TYPE === "morning") {
      await sendNotification(
        info.playerIds,
        `${temp}° now in ${cityName}`,
        `feels ${feels}° · ${condition} · H:${high}° L:${low}°`
      );
    }

    if (NOTIF_TYPE === "night") {
      await sendNotification(
        info.playerIds,
        `${tomorrowHigh}° high tomorrow`,
        `in ${cityName} · ${getCondition(tomorrowCode)} overnight`
      );
    }

    if (NOTIF_TYPE === "severe") {
      if (feels >= 42) {
        await sendNotification(
          info.playerIds,
          `🔥 Extreme heat in ${cityName}`,
          `Feels like ${feels}°. Stay hydrated, avoid sun.`
        );
      } else if (temp <= 2) {
        await sendNotification(
          info.playerIds,
          `🥶 Extreme cold in ${cityName}`,
          `${temp}° right now. Bundle up.`
        );
      } else if (code >= 95) {
        await sendNotification(
          info.playerIds,
          `⛈ Severe storm in ${cityName}`,
          `Thunderstorm active. Stay indoors.`
        );
      }
    }
  }
}

run().catch(err => {
  console.error("Notification job failed:", err);
  process.exit(1);
});
