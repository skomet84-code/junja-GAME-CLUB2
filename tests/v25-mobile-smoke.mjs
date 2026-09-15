import { chromium, webkit } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:18080';
const engines = [['chromium',chromium],['webkit',webkit]];
const games = ['slot','holdem','sevenpoker','baccarat','yut','seotda','gostop','horse','bigwheel','sicbo','roulette'];

for (const [name,engine] of engines) {
  const browser = await engine.launch({headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page = await context.newPage();
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const username=`ci${name}${Date.now().toString().slice(-6)}`.slice(0,20);
  const register=await page.evaluate(async({username,name})=>{
    const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,nickname:`${name}모바일`,password:'test1234'})});
    return {ok:r.ok,status:r.status,text:await r.text()};
  },{username,name});
  if(!register.ok)throw new Error(`${name} register failed ${register.status}: ${register.text}`);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#mainApp:not(.hidden)',{timeout:10000});
  await page.waitForFunction(()=>document.body.classList.contains('junja-v25'),null,{timeout:5000});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  if(overflow>4)throw new Error(`${name} lobby horizontal overflow ${overflow}px`);
  for(const game of games){
    await page.click(`[data-go="${game}"]`);
    await page.waitForSelector(`#view-${game}.active`,{timeout:5000});
    const visible=await page.locator(`#view-${game}`).isVisible();
    if(!visible)throw new Error(`${name} ${game} view not visible`);
    await page.evaluate(()=>typeof go==='function'&&go('lobby'));
    await page.waitForSelector('#view-lobby.active',{timeout:5000});
  }
  await page.evaluate(()=>go('slot'));
  await page.waitForSelector('#view-slot.active');
  await page.fill('#slotBetInput','200000');
  await page.dispatchEvent('#slotBetInput','change');
  const slotValue=await page.inputValue('#slotBetInput');
  const slotMax=await page.getAttribute('#slotBetInput','max');
  if(slotValue!=='200000')throw new Error(`${name} slot wager re-clamped to ${slotValue}`);
  if(slotMax!==null)throw new Error(`${name} slot max attribute still present: ${slotMax}`);
  await page.evaluate(()=>go('yut'));
  await page.waitForSelector('#view-yut.active');
  await page.click('[data-mode-game="yut"][data-mode="solo"]');
  await page.fill('#soloYutBet','200000');
  await page.click('#startSoloYut');
  await page.waitForSelector('#yutSoloRoom:not(.hidden)',{timeout:8000});
  await page.waitForSelector('#yutSoloRoom .true-yut-board',{timeout:5000});
  const boardBox=await page.locator('#yutSoloRoom .true-yut-board').boundingBox();
  if(!boardBox||boardBox.width<280||boardBox.height<280)throw new Error(`${name} yut board too small or missing`);
  await page.evaluate(()=>{ window.__v25CenterChoice = yutRouteDialog({node:'CA',route:'A'}); });
  await page.waitForSelector('.v25-route-modal',{timeout:3000});
  const centerText=await page.textContent('.v25-route-modal');
  if(!centerText?.includes('결승 지름길'))throw new Error(`${name} center shortcut dialog missing`);
  await page.click('.v25-route-modal [data-route="shortcut"]');
  const centerChoice=await page.evaluate(async()=>await window.__v25CenterChoice);
  if(centerChoice!=='shortcut')throw new Error(`${name} center shortcut choice failed: ${centerChoice}`);
  const shot=`/tmp/junja-v25-${name}.png`;
  await page.screenshot({path:shot,fullPage:true});
  if(pageErrors.length)throw new Error(`${name} page errors:\n${pageErrors.join('\n')}`);
  await browser.close();
  console.log(`PASS ${name}`);
}
