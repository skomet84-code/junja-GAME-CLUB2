import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp'};
const defaults={paint:'platinum',doorsOpen:false,lightsOn:false,rotation:-.44,pitch:.22,zoom:9.1};
let saved={version:0,design:defaults,published:false,shareToken:null,owned:false,purchased:false},writes=0;
const publicToken='A'.repeat(24),paths=new Set(['/premium-sovereign-lab.html','/premium-sovereign-mesh.js','/premium-sovereign-viewer.js','/premium-sovereign.css','/premium-motor-studio.js','/art/royal/cinematic/car-showroom.webp']);
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/api/premium/motor-studio'&&req.method==='GET'){
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...saved,ok:true}));return;
 }
 if(url.pathname==='/api/premium/motor-studio'&&req.method==='POST'){
  const chunks=[];for await(const p of req)chunks.push(p);
  const b=JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(b.expectedVersion,saved.version,'Client must supply optimistic concurrency');
  writes++;
  saved={ok:true,version:saved.version+1,design:b.design,published:b.published,shareToken:b.published?publicToken:null,owned:false,purchased:false};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(saved));return;
 }
 if(url.pathname.startsWith('/api/premium/motor-studio/share/')){
  const token=url.pathname.split('/').pop();
  if(token!==publicToken||!saved.published){res.statusCode=404;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'not found'}));return}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...saved,shareToken:null,designerNickname:'로얄 디자이너'}));return;
 }
 if(!paths.has(url.pathname)){res.statusCode=404;res.end('missing');return}
 const file=path.resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+path.sep)){res.statusCode=400;res.end('bad path');return}
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch(name==='chromium'?{args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
  try{
   for(const width of [360,390,768,1280]){
    saved={version:0,design:defaults,published:false,shareToken:null,owned:false,purchased:false};writes=0;
    const page=await browser.newPage({viewport:{width,height:844}});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',dialog=>dialog.accept());
    await page.goto(base+'/premium-sovereign-lab.html',{waitUntil:'networkidle'});
    await page.locator('#motorDesignMember').waitFor({state:'visible'});
    assert.equal(await page.locator('#motorDesignShareBox').isVisible(),false);
    let state=await page.evaluate(()=>window.JunjaSovereignLab?.snapshot());
    const webgl=state?.supported===true;
    assert(webgl,name+' WebGL must render for design save demonstration');
    await page.locator('#sovColor').selectOption('champagne');
    await page.locator('#sovDoor').click();
    await page.locator('#sovLight').click();
    await page.locator('#motorDesignSave').click();
    await page.waitForFunction(()=>document.querySelector('#motorDesignStatus')?.textContent.includes('1번째'));
    assert.equal(saved.version,1);assert.equal(saved.published,false);
    assert.equal(saved.design.paint,'champagne');assert.equal(saved.design.doorsOpen,true);assert.equal(saved.design.lightsOn,true);
    await page.reload({waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.JunjaSovereignLab?.snapshot()?.color==='champagne');
    assert.equal((await page.evaluate(()=>window.JunjaSovereignLab.snapshot())).doorsOpen,true,'Saved doors restored');
    await page.locator('#motorDesignPublish').click();
    await page.waitForFunction(()=>document.querySelector('#motorDesignShareBox')?.hidden===false);
    assert.equal(saved.published,true);
    const sharedLink=await page.locator('#motorDesignShareUrl').inputValue();
    assert(sharedLink.endsWith('?design='+publicToken),'User can copy optional visitor URL');
    await page.goto(sharedLink,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelector('#motorDesignVisitorNote')?.textContent.includes('로얄 디자이너'));
    assert.equal(await page.locator('#motorDesignMember').isVisible(),false);
    assert.equal((await page.evaluate(()=>window.JunjaSovereignLab.snapshot())).color,'champagne');
    assert((await page.locator('#motorDesignVisitorNote').innerText()).includes('소유권'));
    const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
    assert(size.scroll<=size.width+2,name+' '+width+' horizontal overflow '+JSON.stringify(size));
    await page.goto(base+'/premium-sovereign-lab.html',{waitUntil:'networkidle'});
    await page.locator('#motorDesignMember').waitFor({state:'visible'});
    await page.locator('#motorDesignPublish').click();
    await page.waitForFunction(()=>document.querySelector('#motorDesignShareBox')?.hidden===true);
    assert.equal(saved.published,false);
    await page.goto(sharedLink,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelector('#motorDesignVisitorNote')?.textContent.includes('해제됐거나'));
    assert.equal(await page.locator('#motorDesignMember').isVisible(),false,'Invalid public link cannot show owner tools');
    assert.equal(writes,3);
    assert.equal(saved.owned,false);assert.equal(saved.purchased,false);
    assert.deepEqual(errors,[],'No client script errors');
    if(width===390)await page.screenshot({path:'/tmp/junja-motor-design-'+name+'.png',fullPage:false});
    await page.close();
    console.log('MOTOR_DESIGN_BROWSER_V1_OK '+name+' '+width+'px: save, reload, opt-in sharing, readonly visitor and immediate revocation');
   }
  }finally{await browser.close()}
 }
}finally{await new Promise(resolve=>server.close(resolve))}
