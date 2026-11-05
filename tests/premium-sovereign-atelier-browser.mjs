import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1'),pathname=decodeURIComponent(u.pathname);
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;res.end('missing');return;}
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
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
    assert.equal(state.clipCount,0,'New source has door pivots, not pre-exported animation clips');
    assert((await page.locator('#atelierInfo').innerText()).includes('3D 모델 로딩 완료'));
    await page.locator('[data-at-view="front"]').click();
    assert.equal((await page.evaluate(()=>window.JunjaSovereignAtelier.snapshot())).view,'front');
    await page.locator('[data-at-view="detail"]').click();
    assert.equal((await page.evaluate(()=>window.JunjaSovereignAtelier.snapshot())).view,'detail');
    await page.locator('#atelierPaint').selectOption('gold');
    assert.equal((await page.evaluate(()=>window.JunjaSovereignAtelier.snapshot())).paint,'gold');
    assert.equal(await page.locator('#atelierDoor').isDisabled(),true,'Do not present unimplemented door animation as complete');
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
    console.log('SOVEREIGN_ATELIER_BROWSER_OK '+name+' '+width+'px, mesh='+state.meshCount+' materials='+state.materialCount+' clips='+state.clipCount);
    await page.close();
   }
  }finally{await browser.close();}
 }
}finally{await new Promise(ok=>server.close(ok));}
