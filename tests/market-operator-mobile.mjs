import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const style=fs.readFileSync(path.join(root,'public/owner-market.css'),'utf8');
const script=fs.readFileSync(path.join(root,'public/owner-market-ui.js'),'utf8');
const a=index.indexOf('<section id="ownerMarketPanel"'),firstClose=index.indexOf('</section>',a),b=index.indexOf('</section>',firstClose+10);
assert(a>=0&&b>a,'Owner market admin UI missing');
const markup=index.slice(a,b+'</section>'.length);
const pageHtml='<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#090b12;color:white;margin:0;font:14px system-ui}#view-admin{padding:8px;max-width:1200px;margin:auto}'+style+'</style></head><body><main id="view-admin" class="view active">'+markup+'</main><script defer src="/owner-market-ui.js"></script></body></html>';
const makeData=()=>({ok:true,kind:'FICTIONAL_GAME_ONLY',limits:{stock:{minPercent:-30,maxPercent:30},coin:{minPercent:-95,maxPercent:200}},markets:{
 stock:[{id:'A',name:'준자반도체',sector:'AI',icon:'💻',price:'100000',changeBp:0,volatilityPct:100},{id:'B',name:'준자물산',sector:'물산',icon:'🏢',price:'75000',changeBp:50,volatilityPct:100}],
 coin:[{id:'JJC',name:'준자코인',sector:'대표 코인',icon:'👑',price:'1000000',changeBp:0,volatilityPct:100},{id:'MOON',name:'문코인',sector:'밈',icon:'🚀',price:'10000',changeBp:-50,volatilityPct:100}]
 },schedules:{stock:{},coin:{}},history:[{type:'stock',symbol:'A',name:'<img src=x onerror=alert(1)>',previousPrice:'100',price:'200',actorId:1,mode:'price',at:1793800000000}]});
let posts=[],lastScheduledId=null;
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/preview'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(pageHtml);return;}
 if(u.pathname==='/owner-market-ui.js'){res.setHeader('Content-Type','application/javascript');res.end(script);return;}
 if(u.pathname==='/api/admin/market-control'){
  res.setHeader('Content-Type','application/json');
  if(req.method==='GET'){res.end(JSON.stringify(makeData()));return;}
  let body='';for await(const chunk of req)body+=chunk;
  const x=JSON.parse(body);posts.push(x);
  const snapshot=makeData();
  const quote=snapshot.markets[x.type].find(z=>z.id===x.symbol);
  const original=quote.price;
  if(x.mode==='price'){
   const bp=Math.round(Number(x.deltaPercent)*100);
   quote.price=String((BigInt(original)*BigInt(10000+bp)+5000n)/10000n);
   quote.changeBp=bp;
  }else if(x.mode==='volatility')quote.volatilityPct=x.volatilityPct;
  else if(x.mode==='schedule'){
   const target=String((BigInt(original)*BigInt(10000+Math.round(Number(x.deltaPercent)*100))+5000n)/10000n);
   lastScheduledId=x.requestId;
   snapshot.schedules[x.type][x.symbol]={id:x.requestId,startedAt:1793800000000,endsAt:1793800000000+x.durationMinutes*60000,status:'RUNNING',step:0,totalSteps:x.durationMinutes/5,durationMinutes:x.durationMinutes,startPrice:original,targetPrice:target};
  }else if(x.mode==='cancel'){
   snapshot.schedules[x.type][x.symbol]={id:x.targetEventId,status:'CANCELED'};
  }
  const result={ok:true,mode:x.mode,symbol:x.symbol,type:x.type,previousPrice:original,price:quote.price,
   schedule:snapshot.schedules?.[x.type]?.[x.symbol]||null,
   volatilityPct:quote.volatilityPct,market:snapshot};
  res.end(JSON.stringify(result));return;
 }
 res.statusCode=404;res.end('not found');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let scenarios=0;
try{
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch();
  try{
   for(const width of [360,390,768,1280]){
    posts=[];lastScheduledId=null;
    const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    page.on('dialog',d=>d.accept());
    await page.goto(base+'/preview',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelector('#ownerMarketCurrent')?.textContent.includes('100,000'));
    assert.equal(await page.locator('#ownerMarketAsset option').count(),2);
    await page.locator('#ownerMarketType').selectOption('coin');
    await page.locator('#ownerMarketAsset').selectOption('JJC');
    await page.locator('#ownerMarketPercent').fill('12.50');
    assert((await page.locator('#ownerMarketPreview').innerText()).includes('1,125,000'));
    await page.locator('#ownerMarketApplyPrice').click();
    await page.waitForFunction(()=>document.querySelector('#ownerMarketStatus')?.textContent.includes('서버 반영 완료'));
    assert.equal(posts.length,1);
    assert.equal(posts[0].type,'coin');
    assert.equal(posts[0].symbol,'JJC');
    assert.equal(posts[0].deltaPercent,'12.50');
    assert.equal(posts[0].expectedPrice,'1000000');
    assert.equal(posts[0].mode,'price');
    assert((await page.locator('#ownerMarketCurrent').innerText()).includes('1,125,000'));
    await page.locator('#ownerMarketVolSelect').selectOption('200');
    await page.locator('#ownerMarketApplyVol').click();
    await page.waitForFunction(()=>document.querySelector('#ownerMarketStatus')?.textContent.includes('변동폭 200%'));
    assert.equal(posts.length,2);
    assert.equal(posts[1].mode,'volatility');
    assert.equal(posts[1].volatilityPct,200);
    await page.locator('#ownerMarketSchedulePercent').fill('-12.5');
    await page.locator('#ownerMarketDuration').selectOption('60');
    assert((await page.locator('#ownerMarketSchedulePreview').innerText()).includes('875,000'));
    await page.locator('#ownerMarketScheduleStart').click();
    await page.waitForFunction(()=>document.querySelector('#ownerMarketStatus')?.textContent.includes('예약 시작'));
    assert.equal(posts.length,3);
    assert.equal(posts[2].mode,'schedule');
    assert.equal(posts[2].durationMinutes,60);
    assert.equal(posts[2].deltaPercent,'-12.5');
    assert.equal(posts[2].expectedPrice,'1000000');
    assert(await page.locator('#ownerMarketScheduleCancel').isVisible());
    assert((await page.locator('#ownerMarketScheduleProgress').innerText()).includes('0 / 12'));
    await page.locator('#ownerMarketScheduleCancel').click();
    await page.waitForFunction(()=>document.querySelector('#ownerMarketStatus')?.textContent.includes('예약 취소'));
    assert.equal(posts.length,4);
    assert.equal(posts[3].mode,'cancel');
    assert.equal(posts[3].targetEventId,lastScheduledId);
    assert(await page.locator('#ownerMarketScheduleCancel').isHidden());
    assert.equal(await page.locator('#ownerMarketHistory img').count(),0,'Malicious history cannot inject markup');
    const bounds=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth}));
    assert(bounds.scroll<=bounds.inner+2,engine+' '+width+' horizontal overflow '+JSON.stringify(bounds));
    assert.deepEqual(errors,[],'No browser execution errors');
    if(width===390)await page.screenshot({path:'/tmp/junja-owner-market-'+engine+'.png',fullPage:false});
    await page.close();scenarios++;
    console.log('OWNER_MARKET_BROWSER_OK '+engine+' '+width+'px, percent preview, confirmation, volatility, safe audit UI');
   }
  }finally{await browser.close();}
 }
 assert.equal(scenarios,8);
}finally{await new Promise(resolve=>server.close(resolve));}
