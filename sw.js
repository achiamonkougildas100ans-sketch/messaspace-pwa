// ============================================================
// MessaSpace PWA - Service Worker
// Version : 1.0.0
// ============================================================

const CACHE_NAME = 'messaspace-v1';
const OFFLINE_URL = '/offline.html';

// Ressources à mettre en cache lors de l'installation
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/offline.html'
];

// ---- Événement INSTALL ----
self.addEventListener('install', (event) => {
  console.log('[SW] Installation en cours...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Mise en cache des ressources principales');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      console.log('[SW] Installation terminée');
      return self.skipWaiting();
    }).catch((err) => {
      console.warn('[SW] Erreur lors du précache (non bloquant) :', err);
      return self.skipWaiting();
    })
  );
});

// ---- Événement ACTIVATE ----
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation en cours...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Suppression de l\'ancien cache :', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activation terminée');
      return self.clients.claim();
    })
  );
});

// ---- Événement FETCH ----
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET et les requêtes vers d'autres origines
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Stratégie : Network First pour les API, Cache First pour les assets statiques
  if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) {
    // Réseau d'abord pour les API
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // Cache First avec fallback réseau pour les assets statiques
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Mettre à jour le cache en arrière-plan (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {});
        
        return cachedResponse;
      }

      // Pas en cache : aller chercher sur le réseau
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }

        // Mettre en cache la nouvelle ressource
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // Hors ligne : retourner la page offline
        if (event.request.destination === 'document') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});

// ---- Notifications Push (préparé pour usage futur) ----
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'Nouveau message sur MessaSpace',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    },
    actions: [
      { action: 'open', title: 'Ouvrir' },
      { action: 'close', title: 'Fermer' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'MessaSpace', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'close') return;
  
  const url = event.notification.data.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
