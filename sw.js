self.addEventListener('install', event => {
    event.waitUntil(
        caches.open('zieltracker-v1').then(cache => {
            return cache.addAll([
                './',
                './index.html',
                './styles.css',
                './app.js',
                './manifest.json'
            ]);
        })
    );
    self.skipWaiting();
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : { title: 'ZielTracker', body: 'Erinnerung: Du hast noch offene Ziele!' };
    
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏆</text></svg>',
            vibrate: [200, 100, 200]
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
