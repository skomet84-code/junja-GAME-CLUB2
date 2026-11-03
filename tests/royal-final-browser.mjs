import {chromium,webkit} from 'playwright';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {ROYAL_ITEMS}=require('../royal-economy');
const base=process.env.BASE_URL||'http://127.0.0.1:18080';
const car=ROYAL_ITEMS.find(x=>x.id==='car_royalboutique_rr_phantom');
if(!car)throw Error('Rolls-Royce Phantom SKU missing');
for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',err=>errors.push(err.message));
 try{
  const result=await page.goto(base,{waitUntil:'domcontentloaded'});
  const csp=result.headers()['content-security-policy']||'';
  if(!csp.includes('https://upload.wikimedia.org'))throw Error('Remote licensed-photo CSP fallback missing');
  const nickname='royal'+engineName+Date.now().toString().slice(-6);
  const register=await page.evaluate(async nickname=>{
    const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:nickname,nickname,password:'test1234'})});
    return {status:r.status,ok:r.ok,error:!r.ok?await r.text():''};
  },nickname);
  if(!register.ok)throw Error(engineName+' isolated register failed '+JSON.stringify(register));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#mainApp:not(.hidden)',{timeout:12000});
  await page.evaluate(()=>go('shop'));
  await page.waitForSelector('#view-shop.active',{timeout:8000});
  await page.waitForSelector('#royalBoutiqueRoot .jrp-motors-photo img',{timeout:10000});
  await page.waitForFunction(()=>[...document.querySelectorAll('#royalBoutiqueRoot .jrp-motors-photo img')].length===3 &&
    [...document.querySelectorAll('#royalBoutiqueRoot .jrp-motors-photo img')].every(im=>im.complete&&im.naturalWidth>=100),null,{timeout:10000});
  const store=await page.evaluate(()=>({
    photos:[...document.querySelectorAll('#royalBoutiqueRoot .jrp-motors-photo img')].map(i=>({src:i.currentSrc,complete:i.complete,width:i.naturalWidth})),
    labels:[...document.querySelectorAll('#royalBoutiqueRoot .jrp-brand-nav button')].map(b=>b.textContent.trim()),
    hud:document.querySelector('.topbar')?.getBoundingClientRect().height,
    shopHeight:document.querySelector('.jrp-motors-hero')?.getBoundingClientRect().height,
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
  }));
  if(store.photos.some(p=>!p.src.includes('/art/royal/photos/')||p.width<300))throw Error('CSP/local luxury photos not rendered: '+JSON.stringify(store));
  if(!store.labels.some(x=>x.includes('ROLLS-ROYCE'))||!store.labels.some(x=>x.includes('BENTLEY'))||!store.labels.some(x=>x.includes('ASTON MARTIN')))throw Error('brand selector not rendered');
  if(store.hud>100)throw Error('luxury-screen mobile game HUD too tall: '+store.hud);
  if(store.overflow>10)throw Error('luxury-screen horizontal overflow: '+JSON.stringify(store));
  await page.screenshot({path:'/tmp/junja-royal-final-store-'+engineName+'.png',fullPage:true});
  const owned={...car,owned:true,photoBy:car.photoBy,photoLicense:car.photoLicense,inscription:{ownerNickname:nickname,purchasedAt:Date.now(),paid:String(car.price)}};
  const mock={nickname,items:[owned],collector:{tier:'ROYAL',tierIcon:'♛',spent:String(car.price),ownedCount:1,totalItems:40,showcase:[{...owned}]},public:true};
  await page.route('**/api/royal-economy',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(mock)}));
  await page.evaluate(()=>go('gallery'));
  await page.waitForSelector('#view-gallery.active',{timeout:7000});
  await page.waitForSelector('#view-gallery .jrg-cinematic-entrance.has-owned-photo',{timeout:10000});
  await page.waitForFunction(()=>{
    const img=document.querySelector('#view-gallery .jrg-cinematic-entrance>img');
    return img?.complete&&img?.naturalWidth>=300;
  },null,{timeout:10000});
  const gallery=await page.evaluate(()=>({
    hero:document.querySelector('#view-gallery .jrg-cinematic-entrance')?.getBoundingClientRect().height,
    photo:document.querySelector('#view-gallery .jrg-cinematic-entrance>img')?.currentSrc,
    owner:document.querySelector('#view-gallery .jrg-owner-name strong')?.textContent,
    inventory:document.querySelectorAll('#view-gallery .jrg-collection-card').length,
    hud:document.querySelector('.topbar')?.getBoundingClientRect().height,
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
  }));
  if(gallery.hud>100||gallery.hero<200||gallery.overflow>10||!gallery.photo?.includes('/art/royal/photos/')||gallery.inventory!==1)throw Error('cinematic owner museum failed '+JSON.stringify(gallery));
  if(!gallery.owner?.includes(nickname))throw Error('actual owner not shown');
  await page.screenshot({path:'/tmp/junja-royal-final-gallery-'+engineName+'.png',fullPage:true});
  if(errors.length)throw Error(engineName+' page errors: '+errors.join('\n'));
  console.log('PASS ROYAL_FINAL_BROWSER',engineName,JSON.stringify({storePhotos:store.photos.length,storeHUD:store.hud,galleryHUD:gallery.hud,grandHero:gallery.hero}));
 }finally{await browser.close();}
}
