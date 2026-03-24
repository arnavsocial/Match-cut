const CACHE_NAME = 'match-cut-ai-cache-v2';

self.addEventListener('install', (event) => {
    // Skip waiting ensures the new worker activates immediately
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Take control of the page immediately upon activation
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Dynamically cache ALL MediaPipe and AI Model files as they are requested
    if (event.request.url.includes('mediapipe') || event.request.url.includes('cdn.jsdelivr.net')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    // Serve lightning fast from the local cache
                    console.log('[Service Worker] Serving from cache:', event.request.url);
                    return cachedResponse; 
                }
                
                // If not in cache, fetch it from the internet and save it for next time
                return fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
    }
});
