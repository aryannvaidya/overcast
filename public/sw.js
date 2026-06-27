const CACHE = "nimbus-v2";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/assest/static/day.svg",
  "/assest/static/night.svg",
  "/assest/static/cloudy-day-1.svg",
  "/assest/static/cloudy-day-2.svg",
  "/assest/static/cloudy-day-3.svg",
  "/assest/static/cloudy-night-1.svg",
  "/assest/static/cloudy-night-2.svg",
  "/assest/static/cloudy-night-3.svg",
  "/assest/static/cloudy.svg",
  "/assest/static/rainy-1.svg",
  "/assest/static/rainy-2.svg",
  "/assest/static/rainy-3.svg",
  "/assest/static/rainy-4.svg",
  "/assest/static/rainy-5.svg",
  "/assest/static/rainy-6.svg",
  "/assest/static/rainy-7.svg",
  "/assest/static/snowy-1.svg",
  "/assest/static/snowy-2.svg",
  "/assest/static/snowy-3.svg",
  "/assest/static/snowy-4.svg",
  "/assest/static/snowy-5.svg",
  "/assest/static/snowy-6.svg",
  "/assest/animated/day.svg",
  "/assest/animated/night.svg",
  "/assest/animated/cloudy-day-1.svg",
  "/assest/animated/cloudy-day-2.svg",
  "/assest/animated/cloudy-day-3.svg",
  "/assest/animated/cloudy-night-1.svg",
  "/assest/animated/cloudy-night-2.svg",
  "/assest/animated/cloudy-night-3.svg",
  "/assest/animated/cloudy.svg",
  "/assest/animated/rainy-1.svg",
  "/assest/animated/rainy-2.svg",
  "/assest/animated/rainy-3.svg",
  "/assest/animated/rainy-4.svg",
  "/assest/animated/rainy-5.svg",
  "/assest/animated/rainy-6.svg",
  "/assest/animated/rainy-7.svg",
  "/assest/animated/snowy-1.svg",
  "/assest/animated/snowy-2.svg",
  "/assest/animated/snowy-3.svg",
  "/assest/animated/snowy-4.svg",
  "/assest/animated/snowy-5.svg",
  "/assest/animated/snowy-6.svg",
  "/assest/animated/thunder.svg",
  "/assest/animated/weather-sprite.svg",
  "/assest/animated/weather.svg",
  "/assest/animated/weather_sagittarius.svg",
  "/assest/animated/weather_sunset.svg"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // API calls — network first, cache fallback
  if (
    url.hostname.includes("open-meteo.com") ||
    url.hostname.includes("waqi.info") ||
    url.hostname.includes("geocoding-api.open-meteo.com")
  ) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE)
              .then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell — Network first, falling back to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache local origin files or fonts on the fly
        if (url.origin === location.origin || url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => {
        return caches.match(e.request).then(cached => {
          if (cached) return cached;
          if (e.request.mode === "navigate" || (e.request.headers.get("accept") && e.request.headers.get("accept").includes("text/html"))) {
            return caches.match("/index.html");
          }
          return new Response("Resource offline", { status: 503, statusText: "Offline" });
        });
      })
  );
});

// Service Worker pre-fetching strategy for next/previous cities in the swipe sequence
self.addEventListener("message", e => {
  if (e.data && e.data.type === "PREFETCH_WEATHER") {
    const urls = e.data.urls || [];
    urls.forEach(url => {
      caches.open(CACHE).then(cache => {
        cache.match(url).then(cachedResponse => {
          // If not cached, fetch it from network and store in cache
          if (!cachedResponse) {
            console.log("[SW] Pre-fetching adjacent city resource:", url);
            fetch(url).then(res => {
              if (res.ok) {
                cache.put(url, res);
              }
            }).catch(err => {
              console.warn("[SW] SW Pre-fetch failed for URL:", url, err);
            });
          }
        });
      });
    });
  }
});

// --- PWA WIDGET EVENTS SUPPORT ---
self.addEventListener("widgetinstall", e => {
  console.log("[SW] Widget installed:", e.widget);
  e.waitUntil(
    // Prefetch cached weather data for the active city
    caches.open(CACHE).then(cache => {
      return cache.addAll([
        "/index.html",
        "/manifest.json"
      ]);
    })
  );
});

self.addEventListener("widgetuninstall", e => {
  console.log("[SW] Widget uninstalled:", e.widget);
});

self.addEventListener("widgetresume", e => {
  console.log("[SW] Widget resumed, updating payload:", e.widget);
  // Optional: trigger widget payload refresh
});

self.addEventListener("widgetclick", e => {
  console.log("[SW] Widget click action received:", e.action, e.widget);
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then(clients => {
      // Direct clicks open/navigate to the app main window
      for (const client of clients) {
        if (client.url === "/" && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("/");
      }
    })
  );
});

