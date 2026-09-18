const CACHE='junja-club-v288-yut-horse';
const ASSETS=['/','/style.css?v=288','/app.js?v=288','/manifest.webmanifest?v=288','/v26-visual.css?v=288','/v28-yut-horse.css?v=288','/art/v28/horses/horse-1.webp','/art/v28/horses/horse-2.webp','/art/v28/horses/horse-3.webp','/art/v28/horses/horse-4.webp','/art/v28/horses/horse-5.webp','/art/v28/horses/horse-6.webp','/art/v28/horses/horse-7.webp','/art/v28/yut/stick-back.webp','/art/v28/yut/stick-marked.webp','/art/v28/yut/token-tiger.webp','/art/v28/yut/token-rabbit.webp','/art/v28/yut/token-fox.webp','/art/v28/yut/token-bear.webp'];
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
