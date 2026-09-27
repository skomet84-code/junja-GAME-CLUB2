'use strict';
// Optional browser gate: PLAYWRIGHT_MODULE and CHROMIUM_PATH can use an existing runtime.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const E=require('../public/sichuan/engine');
(async()=>{
 const server=http.createServer((req,res)=>{const name=path.join(__dirname,'../public',new URL(req.url,'http://local').pathname);try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp'})[path.extname(name)]||'text/plain');res.end(fs.readFileSync(name));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/sichuan/index.html?player=browser-qa`);await page.clock.install();
 assert.equal(await page.locator('[data-level]:enabled').count(),1);await page.click('#continue');
 const board=()=>page.locator('.tile').evaluateAll(ts=>ts.map(t=>Number(t.querySelector('.tile-mark')?.textContent||0)));
 const before=await board();const m=E.moves(before,6,8,true)[0];await page.locator(`[data-i="${m.a}"]`).click();await page.locator(`[data-i="${m.b}"]`).click();await page.clock.runFor(300);assert.equal((await board()).filter(Boolean).length,46);assert.equal(await page.locator('#score').textContent(),'100');
 await page.click('#pause');const time=await page.locator('#time').textContent();await page.clock.fastForward(10000);assert.equal(await page.locator('#time').textContent(),time);await page.click('[data-action="resume"]');
 for(let count=0;count<24;count++){const b=await board();if(!b.some(Boolean))break;const match=E.moves(b,6,8,true)[0];assert.ok(match);await page.locator(`[data-i="${match.a}"]`).click();await page.locator(`[data-i="${match.b}"]`).click();await page.clock.runFor(250);}
 assert.match(await page.locator('#modal-content').textContent(),/정원이 빛나기 시작합니다/);assert.ok(await page.locator('[data-action="next"]').isVisible());await page.click('[data-action="lobby"]');assert.equal(await page.locator('[data-level]:enabled').count(),2);
 await page.reload();await page.clock.install();assert.equal(await page.locator('[data-level]:enabled').count(),2);
 await page.click('#daily');const daily=await board();await page.click('#restart');await page.click('[data-action="retry"]');assert.deepEqual(await board(),daily);
 await page.click('#hint');assert.equal(await page.locator('.hinted').count(),2);assert.equal(await page.locator('#hint-count').textContent(),'2');await page.click('#shuffle');assert.equal(await page.locator('#shuffle-count').textContent(),'1');assert.deepEqual((await board()).filter(Boolean).sort(),daily.filter(Boolean).sort());
 await page.clock.fastForward(300000);assert.match(await page.locator('#modal-content').textContent(),/별빛이 잠시/);await page.click('[data-action="lobby"]');await page.click('#zen');await page.clock.fastForward(600000);assert.equal(await page.locator('#time').textContent(),'∞');assert.equal(await page.locator('#modal').isVisible(),false);
 await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window.parent,data:{type:'junja-sichuan-pause'}})));assert.ok(await page.locator('#modal').isVisible());await page.click('[data-action="lobby"]');
 for(const width of[360,390,768,1440]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);console.log('SICHUAN_BROWSER_OK: touch-sized layouts, full clear, progression reload, pause, timeout, zen, daily seed, hints and shuffle');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
