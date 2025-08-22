const CACHE_NAME = 'vita-mobile-v2'; // Bump the version number
const APP_SHELL_URLS = [
    './',
    './index.html',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// Install event: cache the app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL_URLS))
            .then(() => self.skipWaiting()) // Activate new worker immediately
    );
});

// Activate event: clear out old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        )
    );
});

// Fetch event: serve from cache, fallback to network, then cache the network response
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // If the file is in the cache, return it.
                if (cachedResponse) {
                    return cachedResponse;
                }

                // If not in cache, go to the network.
                return fetch(event.request).then((networkResponse) => {
                    // Save a copy of the network response in the cache for next time.
                    return caches.open(CACHE_NAME).then((cache) => {
                        // We need to clone the response because a response is a stream and can only be consumed once.
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
            .catch((error) => {
                // You could return a custom offline page here if you had one.
                console.error('Fetch failed:', error);
            })
    );
});
