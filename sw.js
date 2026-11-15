// Service worker : garde une copie de l'appli sur le téléphone pour qu'elle marche hors ligne.
// Stratégie « réseau d'abord » : en ligne, on récupère toujours la dernière version publiée ;
// hors ligne, on sert la copie enregistrée.
const CACHE = 'nutrition-v3';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/calc.js', 'js/db.js', 'js/state.js', 'js/ui.js', 'js/label.js', 'js/scan.js', 'js/starter.js',
  'js/views/jour.js', 'js/views/seance.js', 'js/views/composer.js', 'js/views/aliments.js', 'js/views/recettes.js', 'js/views/reglages.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }) // revalide auprès du serveur : jamais de vieux fichier mélangé à des nouveaux
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
