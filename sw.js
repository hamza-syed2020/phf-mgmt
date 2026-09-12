/* PHF Management — offline support.

   Written from the lesson the production board taught the hard way: an earlier
   service worker stored whatever came back, including "file not found", and
   then served that same failure for ever. Here, only a successful reply is
   ever stored, and a stored reply is only used if it was successful.

   The page is fetched from the network first so an installed app is never a
   version behind. Everything else comes from the cache and is refreshed
   quietly behind you.

   No business data is cached. The board holds nothing; it asks the sheet each
   time, and those requests go to a different address, so they pass straight
   through untouched. */

const CACHE = 'phf-mgmt-v1';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function keep(req, res) {
  if (!res || !res.ok || res.status === 206) return res;
  const copy = res.clone();
  caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // the sheet — never touch it

  const isPage = req.mode === 'navigate' || /\/$/.test(url.pathname) || /\.html$/i.test(url.pathname);
  if (isPage) {
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => { keep('./index.html', res); return res; })
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match(req, { ignoreSearch: true })))
    );
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit && hit.ok) { fetch(req).then(res => keep(req, res)).catch(() => {}); return hit; }
      return fetch(req).then(res => keep(req, res))
        .catch(err => { if (hit) return hit; throw err; });
    })
  );
});
