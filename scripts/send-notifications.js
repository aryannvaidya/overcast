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

// Default city coordinates — Delhi as fallback
// This sends one notification to ALL subscribers
// with weather for a single representative city
const DEFAULT_LAT = 28.6139;
const DEFAULT_LON = 77.2090;
const DEFAULT_CITY = "your area";

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

async function sendToAll(title, body) {
  console.log("Sending to all subscribers:", title);

  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers,
    body: JSON.stringify({
      app_id: APP_ID,
      included_segments: ["All"],
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
  const weather = await getWeather(DEFAULT_LAT, DEFAULT_LON);
  const temp      = Math.round(weather.current.temperature_2m);
  const feels     = Math.round(weather.current.apparent_temperature);
  const code      = weather.current.weather_code;
  const condition = getCondition(code);
  const high      = Math.round(weather.daily.temperature_2m_max[0]);
  const low       = Math.round(weather.daily.temperature_2m_min[0]);
  const tomorrowHigh = Math.round(weather.daily.temperature_2m_max[1]);
  const tomorrowCode = weather.daily.weather_code[1];

  console.log("Weather fetched:", { temp, feels, code, condition });

  if (NOTIF_TYPE === "morning") {
    await sendToAll(
      `${temp}° · Good Morning ☀️`,
      `Feels ${feels}° · ${condition} · H:${high}° L:${low}°`
    );
  }

  if (NOTIF_TYPE === "night") {
    await sendToAll(
      `${tomorrowHigh}° high tomorrow 🌙`,
      `${getCondition(tomorrowCode)} overnight · Check your forecast`
    );
  }

  if (NOTIF_TYPE === "severe") {
    console.log("Checking severe:", { feels, temp, code });

    if (feels >= 42) {
      await sendToAll(
        `🔥 Extreme Heat Alert`,
        `Feels like ${feels}°. Stay hydrated. Avoid direct sun.`
      );
    } else if (temp <= 2) {
      await sendToAll(
        `🥶 Extreme Cold Alert`,
        `${temp}° right now. Bundle up and stay warm.`
      );
    } else if (code >= 95) {
      await sendToAll(
        `⛈ Severe Storm Alert`,
        `Thunderstorm conditions active. Stay indoors.`
      );
    } else {
      console.log("No severe conditions. No notification sent.");
    }
  }

  console.log("Script completed.");
}

run().catch(err => {
  console.error("Script crashed:", err);
  process.exit(1);
});