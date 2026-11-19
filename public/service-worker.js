/* Static-shell cache only. Never cache API, authentication, quotes, candles or financial signals. */
const CACHE_NAME = 'taiwan-stock-hunter-shell-v1';
const SHELL = ['/manifest.webmanifest', '/icons/app-icon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/auth') || url.pathname.includes('/market/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => new Response('<!doctype html><html lang="zh-TW"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>目前離線</title><body style="background:#080d18;color:#e5e7eb;font:16px sans-serif;padding:2rem"><h1>目前無法連線</h1><p>行情與分析資料不會使用離線快取冒充即時資料。請恢復網路後重新整理。</p></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
    return;
  }
  if (SHELL.includes(url.pathname)) event.respondWith(caches.match(request).then(hit => hit || fetch(request)));
});
