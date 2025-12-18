const CACHE_NAME = 'genogram-cache-v1';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './js/canvas.js',
    './js/history.js',
    './js/person.js',
    './js/relationship.js',
    './js/storage.js',
    './manifest.json',
    './icon-512.png'
];

// 安裝 Service Worker 並快取資源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// 啟動時清除舊快取
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
});

// 攔截請求並優先從快取中讀取 (Offline-first)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        })
    );
});
