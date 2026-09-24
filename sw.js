const CACHE = 'hisab-khata-v59';
const FILES = [
  './', './index.html', './style.css', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './i18n.js', './settings.js', './privacy-lock.js', './backup.js', './state.js', './recurring.js',
  './render.js', './entries.js', './notes-plans.js', './loans.js', './reminders.js', './init.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(FILES))
      .then(() => self.skipWaiting())
      // T11 #১৪: addAll ফেল করলে আগে কিছুই দেখা যেত না। এখন কনসোলে লগ হয়; আবার throw করি যাতে ইনস্টল আগের মতোই ফেল থাকে
      // (এরর গিলে ফেললে অর্ধেক-ক্যাশ নিয়ে নতুন SW সক্রিয় হয়ে পুরনো ভালো ক্যাশ মুছে দিত)
      .catch(err => { console.error('SW install failed', err); throw err; })
  );
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
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        // T11 #১৫: Response.error() সব ব্রাউজারে নেই — সাধারণ Response দিয়ে ফলব্যাক
        return caches.match(e.request).then(r => r || new Response('', { status: 503, statusText: 'Offline' }));
      })
  );
});

// R5: নোটিফিকেশনে ট্যাপ → খোলা উইন্ডো ফোকাস, নইলে অ্যাপ খোলা
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow('./');
    })
  );
});
