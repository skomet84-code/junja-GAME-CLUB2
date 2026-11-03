import {chromium,webkit} from 'playwright';

const base=process.env.BASE_URL||'http://127.0.0.1:18080';
const images=['car_royalboutique_rr_phantom','car_royalboutique_bentley_gt','car_royalboutique_aston_db12'];
const runs=[['chromium',chromium],['webkit',webkit]];
for(const [engineName,engine] of runs){
 const browser=await engine.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e?.stack||e)));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 const username=('museum'+engineName+Date.now().toString().slice(-6)).slice(0,20);
 const reg=await page.evaluate(async({username,engineName})=>{
  const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,nickname:'로얄검수'+engineName,password:'test1234'})});
  return {status:r.status,body:await r.text()};
 },{username,engineName});
 if(reg.status!==200&&reg.status!==201)throw Error(engineName+' registration failed '+JSON.stringify(reg));
 const catalogRes=await page.request.get(base+'/api/royal-economy');
 if(!catalogRes.ok())throw Error(engineName+' catalog unavailable '+catalogRes.status());
 const raw=await catalogRes.json();
 if(!Array.isArray(raw.items)||raw.items.length<40)throw Error('Catalog has fewer than 40 products');
 if(raw.items.some(i=>BigInt(i.price)<10n**16n))throw Error('Sub-1경 item in luxury shop');
 const demoItems=raw.items.map(i=>images.includes(i.id)?{...i,owned:true,equipped:false,inscription:{ownerNickname:'로얄검수',purchasedAt:Date.now(),paid:i.price}}:i);
 const demo={...raw,nickname:'로얄검수',items:demoItems,collector:{...(raw.collector||{}),showcase:images.map(id=>{const i=demoItems.find(x=>x.id===id);return {id:i.id,name:i.name,category:i.category,art:i.art,photoFile:i.photoFile,photoLicense:i.photoLicense,photoBy:i.photoBy,price:i.price}}),ownedCount:3,spent:'150000000000000000',totalItems:demoItems.length,tier:'EMPEROR',tierIcon:'💎'}};
 await page.route(/\/api\/royal-economy(?:\?.*)?$/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(demo)}));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForSelector('#mainApp:not(.hidden)',{timeout:12000});
 await page.evaluate(()=>go('shop'));
 await page.waitForSelector('#view-shop.active .jrp-motors-photo img',{timeout:12000});
 await page.locator('#view-shop .jrp-motors-photo img').first().scrollIntoViewIfNeeded();
 await page.waitForTimeout(6500);
 const result=await page.evaluate(()=>({
  viewport:window.innerWidth,
  overflow:document.documentElement.scrollWidth-window.innerWidth,
  photos:[...document.querySelectorAll('.jrp-motors-photo img')].map(x=>({src:x.currentSrc?.slice(0,130),loaded:x.complete&&x.naturalWidth>0,naturalWidth:x.naturalWidth,fallback:x.classList.contains('jrp-media-fallback')})),
  brandButtons:[...document.querySelectorAll('#royalBoutiqueRoot .jrp-brand-nav button')].map(x=>x.textContent.trim().slice(0,25)),
  errors:[...document.querySelectorAll('#royalBoutiqueRoot .jrp-error')].map(x=>x.textContent)
 }));
 console.log('REAL_LUXURY_SHOP_'+engineName.toUpperCase(),JSON.stringify(result));
 await page.screenshot({path:'/tmp/junja-royal-motors-'+engineName+'.png',fullPage:true});
 if(result.errors.length)throw Error(engineName+' boutique error '+JSON.stringify(result.errors));
 if(result.overflow>8)throw Error(engineName+' horizontal overflow '+result.overflow);
 if(result.photos.length!==3||result.photos.filter(x=>x.loaded).length<3)throw Error(engineName+' broken hero images '+JSON.stringify(result.photos));
 const photoCount=result.photos.filter(x=>!x.fallback).length;
 if(photoCount<2)throw Error(engineName+' fewer than two genuine automobile photos loaded '+JSON.stringify(result.photos));
 await page.evaluate(()=>go('gallery'));
 await page.waitForSelector('#view-gallery.active .jrg-object img',{timeout:12000});
 await page.waitForTimeout(1400);
 const gallery=await page.evaluate(()=>({
   title:document.querySelector('#view-gallery h1')?.textContent,
   photos:[...document.querySelectorAll('#view-gallery .jrg-object.occupied img')].map(x=>({loaded:x.complete&&x.naturalWidth>0,fallback:x.classList.contains('jrp-media-fallback')})),
   owned:document.querySelectorAll('#view-gallery .jrg-collection-card').length,
   overflow:document.documentElement.scrollWidth-window.innerWidth,
   errors:[...document.querySelectorAll('#view-gallery .jrg-load-error')].map(x=>x.textContent)
 }));
 console.log('REAL_LUXURY_MUSEUM_'+engineName.toUpperCase(),JSON.stringify(gallery));
 await page.screenshot({path:'/tmp/junja-royal-gallery-'+engineName+'.png',fullPage:true});
 if(gallery.errors.length||gallery.owned!==3||gallery.photos.length!==3||gallery.photos.some(x=>!x.loaded)||gallery.overflow>8)throw Error(engineName+' museum visual regression '+JSON.stringify(gallery));
 if(errors.length)throw Error(engineName+' browser errors '+errors.join('\n'));
 await browser.close();
}
console.log('PASS JUNJA ROYAL MOTORS VISUAL TEST');
