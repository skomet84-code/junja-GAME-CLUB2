const CACHE='junja-club-v241';
const ASSETS=['/','/style.css?v=241','/app.js?v=241','/manifest.webmanifest?v=241','/art/club-host.svg','/art/poker-mascot.svg','/art/slot-mascot.svg','/art/yut-mascot.svg','/art/gostop-mascot.svg','/art/seotda-mascot.svg'];
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
