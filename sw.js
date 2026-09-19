const CACHE = 'hisab-khata-v2';
const FILES = [
  './', './index.html', './style.css', './manifest.json',
  './icon-192.png', './icon-512.png',
  './i18n.js', './settings.js', './backup.js', './state.js', './recurring.js',
  './render.js', './entries.js', './notes-plans.js', './loans.js', './init.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// নেটওয়ার্ক আগে, না পেলে ক্যাশ (অফলাইনে চলবে, অনলাইনে সবসময় নতুন ভার্সন)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
