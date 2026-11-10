import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const styles=fs.readFileSync(path.join(root,'public/commerce-readiness.css'),'utf8');
const script=fs.readFileSync(path.join(root,'public/commerce-readiness-ui.js'),'utf8');
const checklist=JSON.parse(fs.readFileSync(path.join(root,'docs/COMMERCE_GO_LIVE_GATE.json'),'utf8'));
const begin=index.indexOf('<section class="panel commerce-gates"');
const end=index.indexOf('</section>',begin);
assert(begin>=0&&end>begin);
const html='<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0d1020;color:#eee;font:14px system-ui}#view-admin{margin:0 auto;max-width:1080px;padding:10px}'+styles+'</style></head><body><main id="view-admin" class="view active">'+index.slice(begin,end+10)+'</main><script src="/commerce-readiness-ui.js" defer></script></body></html>';
let calls=0;
const api={ok:true,kind:'PRE_COMMERCIAL_OWNER_REVIEW',goLive:false,checkoutBlocked:true,livePaymentsEnabled:false,decision:'NOT_APPROVED_FOR_REAL_MONEY',totals:{required:12,blocked:10,prototypeTested:2,verified:0},requirements:checklist.required.map(x=>({...x})),outstanding:[]};
api.requirements[0].evidence='<svg onload=alert(1)> injected reviewer text';
const server=http.createServer((req,res)=>{
 if(req.url==='/preview'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return}
 if(req.url==='/commerce-readiness-ui.js'){res.setHeader('Content-Type','application/javascript');res.end(script);return}
 if(req.url==='/api/admin/commerce-readiness'){
  calls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(api));return;
 }
 res.statusCode=404;res.end('not found');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
try{
 for(const [name,browserEngine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await browserEngine.launch();
  try{
   for(const width of [360,390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(base+'/preview');
    await page.waitForFunction(()=>document.querySelectorAll('.cg-item').length===12,null,{timeout:4000});
    assert.equal(await page.locator('.cg-item').count(),12);
    assert.equal(await page.locator('.cg-stat strong').first().innerText(),'10');
    assert(await page.locator('#commerceReadinessWarning').innerText().then(x=>x.includes('비활성화')));
    assert.equal(await page.locator('.cg-item svg').count(),0,'Untrusted evidence must be safe text');
    assert((await page.locator('.cg-items').innerText()).includes('<svg onload=alert(1)>'));
    const bounds=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,inner:innerWidth}));
    assert(bounds.doc<=bounds.inner+2,name+' '+width+' horizontal overflow '+JSON.stringify(bounds));
    await page.locator('#commerceReadinessRefresh').click();
    assert(calls>=2);
    assert.deepEqual(errors,[],'No JS page errors');
    if(width===390)await page.screenshot({path:'/tmp/junja-commerce-'+name+'.png',fullPage:false});
    await page.close();
    console.log('COMMERCE_V10_BROWSER_OK '+name+' '+width+'px, 12 gates, safe evidence, read-only refresh, no overflow');
   }
  }finally{await browser.close()}
 }
}finally{await new Promise(resolve=>server.close(resolve))}
