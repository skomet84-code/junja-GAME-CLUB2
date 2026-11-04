'use strict';
// Browser proof for NONTRANSACTIONAL premium showroom. Uses no PG keys and no live web services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const type={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
 let location;
 try{location=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400);res.end();return;}
 const filepath=path.resolve(root,'.'+location);
 if(filepath!==root&&!filepath.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 if(req.method!=='GET'||!fs.existsSync(filepath)||!fs.statSync(filepath).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',type[path.extname(filepath)]||'application/octet-stream');
 fs.createReadStream(filepath).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const names=['watch','car','yacht','jet','estate','jewelry'];
let cases=0;
try{
 for(const [browserName,browserType] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await browserType.launch({headless:true});
  try{
   for(const width of [360,390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
    const problems=[],requests=[];
    page.on('pageerror',e=>problems.push(String(e)));
    page.on('request',r=>requests.push(r.url()));
    const res=await page.goto(base+'/premium-preview.html',{waitUntil:'networkidle',timeout:20000});
    assert.equal(res.status(),200);
    const ui=await page.evaluate(()=>{
     const imageNames=['watch','car','yacht','jet','estate','jewelry'];
     return {
      width:document.documentElement.scrollWidth,
      expectedWidth:window.innerWidth,
      buttons:[...document.querySelectorAll('.item-bottom button')].map(x=>x.disabled),
      productCount:document.querySelectorAll('.item').length,
      specCount:document.querySelectorAll('.item-spec').length,
      images:imageNames.map(x=>{
       const img=document.querySelector('.room-scene[data-room="'+x+'"] img');
       return !!img&&img.complete&&img.naturalWidth>200;
      }),
      noScript:document.scripts.length===0,
      previewOnly:document.body.innerText.includes('실제 판매/결제 불가')
     };
    });
    assert(ui.width<=ui.expectedWidth+2,browserName+' '+width+'px overflow '+JSON.stringify(ui));
    assert.equal(ui.productCount,6);assert.equal(ui.specCount,6);
    assert(ui.buttons.length===6&&ui.buttons.every(Boolean),'All buy buttons disabled');
    assert(ui.images.every(Boolean),'Every showroom asset must load');
    assert(ui.noScript&&ui.previewOnly,'No script-driven checkout or misleading active sale');
    const first=await page.locator('.item-spec summary').first();
    await first.click();
    assert(await page.locator('.item-spec').first().evaluate(x=>x.open),'Buyer-facing product details are expandable.');
    for(const name of names){
     await page.locator('label[for="look-'+name+'"]').click();
     assert(await page.locator('#look-'+name).evaluate(x=>x.checked),'Radio label did not change selection: '+name);
     await page.waitForFunction(name=>{
      const item=document.querySelector('.room-scene[data-room="'+name+'"]');
      return item&&Number.parseFloat(getComputedStyle(item).opacity)>0.99;
     },name,{timeout:2000});
    }
    const blocked=requests.filter(x=>/\/api\/|\/v1\/payments\/|checkout|tosspayments/.test(x));
    assert.deepEqual(blocked,[],'No checkout, API or provider requests allowed');
    assert.deepEqual(problems,[],'Client-side errors');
    if(width===390)await page.screenshot({path:'/tmp/junja-premium-'+browserName+'-mobile.png',fullPage:false});
    console.log('PREMIUM_SHOWROOM_BROWSER_OK '+browserName+' '+width+'px, all assets, six preview switches, no payment');
    cases++;await page.close();
   }
  }finally{await browser.close();}
 }
 assert.equal(cases,8);
}finally{await new Promise(r=>server.close(r));}
