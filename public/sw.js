const CACHE='junja-club-v270-visual';
const ASSETS=['/','/style.css?v=270','/app.js?v=270','/manifest.webmanifest?v=270','/v25-overhaul.css?v=270','/v26-visual.css?v=270','/v25-overhaul.js?v=270','/art/v26/games/host.webp','/art/v26/games/holdem.webp','/art/v26/games/sevenpoker.webp','/art/v26/games/baccarat.webp','/art/v26/games/slot.webp','/art/v26/games/yut.webp','/art/v26/games/seotda.webp','/art/v26/games/gostop.webp','/art/v26/games/horse.webp','/art/v26/games/bigwheel.webp','/art/v26/games/sicbo.webp','/art/v26/games/roulette.webp'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.pathname.startsWith('/api/'))return;
  if(u.pathname==='/'||u.pathname.endsWith('.html')||u.pathname.endsWith('.js')||u.pathname.endsWith('.css')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));return r}).catch(()=>caches.match(e.request)));return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,x));return r})));
});
