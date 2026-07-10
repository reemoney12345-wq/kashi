const CACHE_NAME = 'kashi-v2';
const ASSETS = [
    '/',
    '/feed.html',
    '/landing.html',
    '/signup.html',
    '/leftsidebar.html',
    '/rightsidebar.html',
    '/feed-content.html',
    '/earn.html',
    '/history.html',
    '/dashboard.html',
    '/wallet.html',
    '/settings.html',
    '/upload.html',
    '/profile.html',
    '/upgrade.html',
    '/404.html',
    '/offline.html',
    '/terms.html',
    '/privacy.html',
    '/manifest.json',
    '/assets/icons/icon-192.png',
    '/assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch((err) => console.warn('Cache addAll:', err)))
        .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
        .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('/api/')) return;
    if (event.request.url.includes('fonts.googleapis.com')) return;
    if (event.request.url.includes('fonts.gstatic.com')) return;
    if (event.request.url.includes('cdnjs.cloudflare.com')) return;

    event.respondWith(
        fetch(event.request).then((response) => {
            if (response.status === 200) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
        }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/offline.html')))
    );
});