// 離線快取：第一次打開時把所有檔案存進手機，之後沒網路也能用。
// 有網路時優先拿最新版（所以改程式後不用手動清快取），沒網路時用存好的版本。
const CACHE = 'aicoach-v11';
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css', './css/pages.css', './css/ai.css', './css/food.css', './css/exercise.css',
  './js/main.js', './js/store.js', './js/ui.js', './js/icons.js', './js/mascot.js', './js/quicklog.js', './js/activities.js', './js/health.js', './js/foods.js',
  './js/sensor/index.js', './js/sensor/SensorSource.js', './js/sensor/MockSensor.js', './js/sensor/exercises.js',
  './js/ai/index.js', './js/ai/claude.js', './js/ai/openai.js', './js/ai/gemini.js',
  './js/pages/coach.js', './js/pages/body.js', './js/pages/food.js', './js/pages/exercise.js',
  './js/pages/score.js', './js/pages/settings.js', './js/pages/teacher.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) =>
    // 一個一個加，某個檔案不存在也不會讓整個安裝失敗
    Promise.all(FILES.map((f) => c.add(f).catch(() => console.warn('沒快取到', f))))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 只處理自己網站的 GET；AI 公司的網址不快取
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then((r) => r || caches.match('./index.html')))
  );
});
