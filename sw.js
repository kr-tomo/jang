/* 오프라인 캐시 서비스 워커. 파일을 고치면 VERSION 을 올려 주세요. */
const VERSION = 'janggi-v4';
const FILES = [
  './', 'index.html', 'style.css', 'theme.js', 'layout.js', 'engine.js', 'ai.js', 'game.js', 'app.js', 'worker.js',
  'manifest.webmanifest',
  'assets/board.svg', 'assets/pieces.svg', 'assets/markers.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // 캐시 우선, 없으면 네트워크 (성공하면 캐시에 보관)
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
