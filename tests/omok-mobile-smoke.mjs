
import { chromium, webkit } from 'playwright';
const base=process.env.BASE_URL||'http://127.0.0.1:18080';
for(const [browserName,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 try{
  const contexts=await Promise.all([0,1].map(()=>browser.newContext({
    viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2
  })));
  const [a,b]=await Promise.all(contexts.map(c=>c.newPage()));
  const id=Date.now().toString().slice(-7);
  async function register(page,number){
   await page.goto(base+'/omok/index.html',{waitUntil:'domcontentloaded'});
   const response=await page.evaluate(async(username)=>{
    const res=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username,nickname:username,password:'test1234'})});
    return {status:res.status,body:await res.text()};
   },`o${browserName.slice(0,2)}${id}${number}`);
   if(response.status!==201&&response.status!==200)throw Error(`omok registration failed ${response.body}`);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForSelector('#omkCreateForm',{timeout:10000});
  }
  await register(a,1);
  await register(b,2);
  await a.fill('#omkCreateForm input[name="name"]','오목실전테스트');
  await a.click('#omkCreateForm button[type="submit"]');
  await a.waitForSelector('.omk-waiting',{timeout:10000});
  const roomId=await a.evaluate(async()=>{
   const response=await fetch('/api/omok');
   return (await response.json()).room?.id;
  });
  if(!/^OM[a-f0-9]{14}$/.test(roomId))throw Error('omok room missing');
  await b.goto(base+'/omok/index.html?join='+roomId,{waitUntil:'domcontentloaded'});
  await b.waitForSelector('.omk-waiting',{timeout:10000});
  await a.waitForFunction(()=>document.querySelector('.omk-players-ready')?.textContent.includes('o'+('')),null,{timeout:1000}).catch(()=>{});
  await a.waitForFunction(()=>document.querySelectorAll('.omk-players-ready small').length===2&&
    !document.querySelector('.omk-players-ready')?.textContent.includes('친구 기다리는 중'),null,{timeout:15000});
  await a.click('[data-action="ready"]');
  await b.click('[data-action="ready"]');
  await a.waitForFunction(()=>{const start=document.querySelector('[data-action="start"]');return start&&!start.disabled;},null,{timeout:15000});
  await a.click('[data-action="start"]');
  await a.waitForSelector('.omk-board .omk-point',{timeout:10000});
  await b.waitForSelector('.omk-board .omk-point',{timeout:15000});
  const first=a.locator('.omk-point[data-x="7"][data-y="7"]');
  if(await first.isDisabled())throw Error('black center move unexpectedly disabled');
  if(!(await a.locator('.omk-point[data-x="6"][data-y="7"]').isDisabled()))throw Error('opening move must be at center');
  await first.click();
  await b.waitForSelector('.omk-point[data-x="7"][data-y="7"] .omk-stone.black',{timeout:15000});
  await b.click('.omk-point[data-x="8"][data-y="7"]');
  await a.waitForSelector('.omk-point[data-x="8"][data-y="7"] .omk-stone.white',{timeout:15000});
  a.once('dialog',dialog=>dialog.accept());
  await a.click('[data-action="resign"]');
  await b.waitForFunction(()=>document.querySelector('.omk-status')?.textContent.includes('승리!'),null,{timeout:15000});
  await a.waitForSelector('[data-action="rematch"]',{timeout:15000});
  await b.click('[data-action="rematch"]');
  await a.click('[data-action="rematch"]');
  await a.waitForFunction(()=>document.querySelector('.omk-room-top')?.textContent.includes('ROUND 2'),null,{timeout:15000});
  const color=await a.evaluate(async()=>{
    const r=await fetch('/api/omok');
    return (await r.json()).room.myColor;
  });
  if(color!==2)throw Error('black/white rematch not swapped');
  await b.waitForSelector('.omk-board .omk-point[data-x="7"][data-y="7"]:not([disabled])',{timeout:15000});
  console.log('OMOK_MOBILE_OK '+browserName+' head-to-head moves, UI events, resign and swapped-color rematch');
 }finally{await browser.close();}
}
