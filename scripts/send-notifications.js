const APP_ID = process.env.ONESIGNAL_APP_ID;
const REST_KEY = process.env.ONESIGNAL_REST_KEY;

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Key ${REST_KEY}`,
};

async function getDevices() {
  const res = await fetch(
    `https://api.onesignal.com/players?app_id=${APP_ID}&limit=300`,
    { headers }
  );

  console.log("API status:", res.status);

  if (!res.ok) {
    const err = await res.text();
    console.error("Failed to fetch devices:", res.status, err);
    return [];
  }

  const data = await res.json();
  console.log("Total devices returned:", data.players?.length || 0);

  const tagged = (data.players || []).filter(p => p.tags?.city);
  console.log("Devices with city tag:", tagged.length);

  if (data.players?.length > 0 && tagged.length === 0) {
    console.log("Sample device tags (first device):", 
      JSON.stringify(data.players[0].tags));
  }

  return tagged;
}