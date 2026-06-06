const MATBAGY_CACHE_VERSION = '2026-06-06-v95';
const MATBAGY_CACHE_NAME = 'matbagy-banha-' + MATBAGY_CACHE_VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './app.js',
  './manifest.webmanifest'
];

self.addEventListener('message', (event) => {
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(MATBAGY_CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .catch(() => null)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => {
        if(key !== MATBAGY_CACHE_NAME) return caches.delete(key);
        return null;
      })))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request){
  const cache = await caches.open(MATBAGY_CACHE_NAME);
  try{
    const response = await fetch(request, { cache: 'no-store' });
    if(response && response.ok){
      cache.put(request, response.clone()).catch(() => null);
    }
    return response;
  }catch(err){
    const cached = await cache.match(request);
    if(cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);

  // صفحات وملفات التطبيق لازم تتحقق من الشبكة أولًا عشان كل العملاء ياخدوا آخر تحديث.
  if(request.mode === 'navigate'){
    event.respondWith(networkFirst(new Request('./index.html', { cache: 'no-store' })));
    return;
  }

  if(url.origin === self.location.origin){
    event.respondWith(networkFirst(request));
    return;
  }

  // مكتبات CDN: شبكة أولًا ثم كاش احتياطي.
  if(url.hostname.includes('cdnjs.cloudflare.com')){
    event.respondWith(networkFirst(request));
  }
});
