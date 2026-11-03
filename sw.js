/* Hagah service worker — delivery rebuild v1.
   Policy: the app shell is network-first (updates land); code and data are
   cache-first (everything ever opened works offline afterwards); media and
   everything else pass through untouched (help videos were never part of
   the document; range-request caching is deliberately not attempted). */
var CACHE = 'hagah-split-v3-helper';
var PRECACHE = [
  'Hagah.html',
  'js/s02.js', 'js/s03.js', 'js/s04.js', 'js/s05.js', 'js/s06.js', 'js/s07.js',
  'js/s08.js', 'js/s09.js', 'js/s10.js', 'js/s11.js', 'js/s12.js', 'js/s13.js',
  'js/s16.js', 'js/s17-helper.js',
  'data/geneva/b43.json',
  'data/ws-sidecar.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') { return; }
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) { return; }

  if (url.pathname.endsWith('/Hagah.html')) {
    // network-first for the shell; cache is the offline fallback
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  if (url.pathname.indexOf('/data/') !== -1 || url.pathname.indexOf('/js/') !== -1) {
    // cache-first for code + data; populate on first fetch
    e.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) { return hit; }
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
  }
  // everything else (help videos, api, ...): default network behavior
});
