import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const known=new Set(['/premium-sovereign-lab.html','/premium-sovereign-mesh.js','/premium-sovereign-viewer.js','/premium-sovereign.css','/premium-preview.html','/art/royal/cinematic/car-showroom.webp']);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(!known.has(url.pathname)){res.statusCode=404;res.end('missing');return}
 const ext=path.extname(url.pathname);
 const types={'.html':'text/html;charset=utf-8','.js':'application/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.webp':'image/webp'};
 const file=path.join(root,'public',url.pathname);
 res.setHeader('Content-Type',types[ext]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
let realWebGL=0;
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch(name==='chromium'?{args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
  try{
   for(const width of [360,390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:830},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(url+'/premium-sovereign-lab.html',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.JunjaSovereignLab?.snapshot(),null,{timeout:7000});
    const before=await page.evaluate(()=>window.JunjaSovereignLab.snapshot());
    assert.equal(before.paid,false);assert.equal(before.owned,false);assert.equal(before.entitlement,false);
    assert.equal(await page.locator('button[data-purchase]').count(),0);
    const bounds=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
    assert(bounds.scroll<=bounds.width+2,name+' '+width+' horizontal overflow: '+JSON.stringify(bounds));
    if(before.supported){
     realWebGL++;
     assert(before.renderCount>=1,'WebGL submitted a draw before returning');
     assert(before.pixels>0,'Backbuffer physically sized');
     await page.locator('#sovDoor').click();
     assert.equal(await page.evaluate(()=>window.JunjaSovereignLab.snapshot().doorsOpen),true);
     assert.equal(await page.locator('#sovDoor').getAttribute('aria-pressed'),'true');
     await page.locator('#sovLight').click();
     assert.equal(await page.evaluate(()=>window.JunjaSovereignLab.snapshot().lightsOn),true);
     await page.locator('#sovColor').selectOption('champagne');
     assert.equal(await page.evaluate(()=>window.JunjaSovereignLab.snapshot().color),'champagne');
     await page.locator('#sovView').click();
     assert.equal(await page.evaluate(()=>window.JunjaSovereignLab.snapshot().view),'side');
     for(const expected of ['front','rear','cockpit','wheel','threeQuarter']){
      await page.locator('#sovView').click();
      assert.equal(await page.evaluate(()=>window.JunjaSovereignLab.snapshot().view),expected,'3D camera must support '+expected);
     }
     const zoom=await page.evaluate(()=>window.JunjaSovereignLab.snapshot().zoom);
     await page.locator('#sovZoomIn').click();
     assert((await page.evaluate(()=>window.JunjaSovereignLab.snapshot().zoom))<zoom);
     await page.locator('#sovereignCanvas').focus();
     const yaw=await page.evaluate(()=>window.JunjaSovereignLab.snapshot().rotation);
     await page.keyboard.press('ArrowLeft');
     assert((await page.evaluate(()=>window.JunjaSovereignLab.snapshot().rotation))<yaw);
     await page.locator('#sovReset').click();
     assert.equal(await page.evaluate(()=>window.JunjaSovereignLab.snapshot().doorsOpen),false);
     assert.equal(await page.evaluate(()=>window.JunjaSovereignLab.snapshot().lightsOn),false);
     assert.equal(await page.evaluate(()=>window.JunjaSovereignLab.snapshot().color),'platinum');
     assert((await page.locator('#sovereignStatus').innerText()).includes('복구'));
     if(width===390)await page.screenshot({path:'/tmp/junja-sovereign-3d-'+name+'.png',fullPage:false});
    }else{
     assert(await page.locator('#sovereignFallback').isVisible(),'Fallback must be truthful if WebGL is unavailable');
     assert(await page.locator('#sovereignControls').isHidden());
     assert((await page.locator('#sovereignStatus').innerText()).includes('정적'));
    }
    assert.deepEqual(errors,[],'No execution errors in browser');
    await page.close();
    console.log('SOVEREIGN_3D_BROWSER_OK '+name+' '+width+'px realWebGL='+before.supported+' payment=false');
   }
  }finally{await browser.close();}
 }
 assert(realWebGL>=1,'At least one browser must demonstrate actual GPU rendering, not image-only fallback');
 // Deterministic failure mode must clearly say it is static, not fake ownership.
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:390,height:830}});
  await page.addInitScript(()=>{
   const original=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,...args){
    if(type==='webgl'||type==='experimental-webgl')return null;
    return original.call(this,type,...args);
   };
  });
  await page.goto(url+'/premium-sovereign-lab.html');
  await page.waitForFunction(()=>!!window.JunjaSovereignLab);
  assert.equal(await page.evaluate(()=>window.JunjaSovereignLab.snapshot().supported),false);
  assert(await page.locator('#sovereignFallback').isVisible());
  assert(await page.locator('#sovereignControls').isHidden());
  assert((await page.locator('#sovereignFallback').innerText()).includes('정적'));
  console.log('SOVEREIGN_3D_FALLBACK_OK explicit static label on WebGL failure');
 }finally{await browser.close()}
}finally{await new Promise(resolve=>server.close(resolve))}
