/* Hagah service worker — STAGING PREVIEW copy (round 6, 2026-11-03).
   The preview road serves THIS file from the staging tree; the live
   app keeps its own worker. Two rules keep a fix from stranding
   returning visitors on old code:
   1. Bump CACHE whenever the shell or the modules change. On
      activate, this worker deletes the preview scope's entries from
      every older cache (Cache Storage is shared per origin, so the
      purge is scoped to this worker's own registration scope — the
      live app's entries under /hagah/ are never touched).
   2. Code is network-first: the shell and /js/ come from the
      network whenever it answers, and the cache is the offline
      fallback. Data files are stale-while-revalidate (fast offline
      opens, self-refreshing). Media and everything else pass
      through untouched. */
var CACHE = 'hagah-split-v9-r8';
var PRECACHE = [
  'Hagah.html',
  'js/s02.js', 'js/s03.js', 'js/s04.js', 'js/s05.js', 'js/s06.js', 'js/s07.js',
  'js/s08.js', 'js/s09.js', 'js/s10.js', 'js/s11.js', 'js/s12.js', 'js/s13.js',
  'js/s16.js', 'js/s17-helper.js', 'js/s18-topic-suggest.js',
  'js/s19-topic-engine.js', 'js/s20-builder-helper.js',
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
        if (k === CACHE) { return null; }
        return caches.open(k).then(function (c) {
          return c.keys().then(function (reqs) {
            return Promise.all(reqs.map(function (r) {
              return r.url.indexOf(self.registration.scope) === 0 ? c.delete(r) : null;
            })).then(function () {
              return c.keys().then(function (left) {
                return left.length === 0 ? caches.delete(k) : null;
              });
            });
          });
        });
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

  if (url.pathname.endsWith('/Hagah.html') || url.pathname.indexOf('/js/') !== -1) {
    // network-first for the shell and all code; cache is the offline fallback
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  if (url.pathname.indexOf('/data/') !== -1) {
    // stale-while-revalidate for data: instant offline opens, and the
    // cached copy refreshes itself from the network in the background
    e.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
  }
  // everything else (help videos, api, ...): default network behavior
});
