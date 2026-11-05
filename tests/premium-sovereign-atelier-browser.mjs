import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {atelierImportMapCsp}=require('../premium-atelier-csp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1'),pathname=decodeURIComponent(u.pathname);
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;res.end('missing');return;}
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
 // Reproduce production's restrictive CSP, previously absent in all browser QA.
 const baseCsp="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'";
 if(pathname==='/premium-sovereign-atelier.html'){
  res.setHeader('Content-Security-Policy',atelierImportMapCsp(fs.readFileSync(file,'utf8'),baseCsp));
 }else res.setHeader('Content-Security-Policy',baseCsp);
 fs.createReadStream(file).pipe(res);
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base='http://127.0.0.1:'+server.address().port;
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch(name==='chromium'?{args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
  try{
   for(const width of [390,1280]){
    const page=await browser.newPage({viewport:{width,height:860},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    const response=await page.goto(base+'/premium-sovereign-atelier.html',{waitUntil:'domcontentloaded'});
    assert.equal(response?.status(),200);
    await page.waitForFunction(()=>!!window.JunjaSovereignAtelier?.snapshot()?.ready||!!window.JunjaSovereignAtelier?.snapshot()?.failed,null,{timeout:30000});
    const state=await page.evaluate(()=>window.JunjaSovereignAtelier.snapshot());
    assert.equal(state.failed,false,'Pro GLB loader failed '+name+' '+width+': '+state.lastError);
    assert.equal(state.ready,true);assert.equal(state.owned,false);assert.equal(state.paid,false);
    assert(state.meshCount>80,'Expected detailed Khronos model mesh hierarchy');
    assert(state.materialCount>20,'Expected advanced PBR variants');
    assert.equal(state.clipCount,0,'Source has actual door pivots, not pre-exported animation clips');
    assert.equal(state.hingeCount,0,'Exterior preview must not activate unused interior mechanics');
    assert.equal(state.doorsOpen,false);
    assert.equal(state.hoodOpen,false);
    assert(await page.locator('#atelierDoor').isHidden(),'Hide unnecessary door interaction');
    assert(await page.locator('#atelierHood').isHidden(),'Hide unnecessary hood interaction');
    assert(state.modelSize?.length>state.modelSize?.height*2,'Z-up car must be leveled on Y-up showroom stage');
    assert(state.modelSize?.height<2,'Car must not be displayed standing on its nose');
    assert((await page.locator('#atelierInfo').innerText()).includes('GLB 외관 로딩 완료'));
    for(const mode of ['front','side','rear','wheel','hero']){
     await page.locator('[data-at-view="'+mode+'"]').click();
     assert.equal((await page.evaluate(()=>window.JunjaSovereignAtelier.snapshot())).view,mode);
     assert.equal(await page.locator('[data-at-view="'+mode+'"]').getAttribute('aria-pressed'),'true');
    }
    await page.locator('#atelierPaint').selectOption('gold');
    assert.equal((await page.evaluate(()=>window.JunjaSovereignAtelier.snapshot())).paint,'gold');
    await page.locator('#atelierLight').click();
    assert.equal((await page.evaluate(()=>window.JunjaSovereignAtelier.snapshot())).light,'night');
    await page.locator('#atelierLight').click();
    assert.equal((await page.evaluate(()=>window.JunjaSovereignAtelier.snapshot())).light,'studio');
    await page.locator('#atelierReset').click();
    assert.equal((await page.evaluate(()=>window.JunjaSovereignAtelier.snapshot())).view,'hero');
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert(layout.scroll<=layout.width+2,'Horizontal overflow '+name+' '+width+': '+JSON.stringify(layout));
    await page.waitForTimeout(350);
    if(width===390){
     // Screenshots are supplementary QA evidence. GPU repaints in software
     // Chromium can prevent Playwright's element-stability detector from settling.
     try{
      await page.evaluate(()=>document.getElementById('atelierStage').scrollIntoView({block:'center',behavior:'instant'}));
      await page.screenshot({path:'/tmp/junja-atelier-'+name+'.png',animations:'disabled',timeout:10000});
     }catch(err){console.log('SCREENSHOT_SKIPPED '+name+' '+String(err.message||err).slice(0,100));}
    }
    assert.deepEqual(errors,[],'Page script errors '+name+' '+width);
    console.log('SOVEREIGN_ATELIER_BROWSER_OK '+name+' '+width+'px, mesh='+state.meshCount+' materials='+state.materialCount+' clips='+state.clipCount+' physical hinges='+state.hingeCount);
    await page.close();
   }
   // Regression for the user's real failure: an imported module never loads.
   // The classic watchdog must still show retry without relying on module JS.
   if(name==='chromium'){
    const broken=await browser.newPage({viewport:{width:390,height:840}});
    await broken.route('**/vendor/three/build/three.module.js',route=>route.abort('failed'));
    await broken.goto(base+'/premium-sovereign-atelier.html',{waitUntil:'domcontentloaded'});
    await broken.locator('#atelierFallback:not([hidden])').waitFor({timeout:26000});
    assert(await broken.locator('#atelierRetry').isVisible(),'Infinite spinner must recover to a visible retry button');
    assert((await broken.locator('#atelierError').innerText()).length>10,'Recovery must explain the missing 3D engine');
    console.log('SOVEREIGN_CSP_RECOVERY_OK: missing runtime yields a usable iPhone retry');
    await broken.close();
   }
  }finally{await browser.close();}
 }
}finally{await new Promise(ok=>server.close(ok));}
