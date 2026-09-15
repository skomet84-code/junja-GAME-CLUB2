const { chromium } = require('playwright');

(async()=>{
  const base=process.env.BASE_URL||'http://127.0.0.1:18080';
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const username=`matgo${Date.now().toString().slice(-8)}`;
  const registration=await page.evaluate(async username=>{const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,nickname:'야심찬테스터',password:'test1234'})});return {ok:r.ok,text:await r.text()};},username);
  if(!registration.ok)throw new Error(registration.text);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#mainApp:not(.hidden)');
  await page.click('[data-go="gostop"]');
  await page.waitForSelector('#view-gostop.active');
  await page.fill('#gostopBet','10000');
  await page.click('#startGostop');
  await page.waitForSelector('.yashimchan-table');
  for(let turn=0;turn<4;turn++){
    const choice=page.locator('[data-hwatu-choice]').first();
    if(await choice.count())await choice.click();
    else {const card=page.locator('.my-hand-row [data-hwatu]').first();if(!await card.count())break;await card.click();}
    await page.waitForTimeout(120);
    const decision=page.locator('[data-gdecision="go"]');if(await decision.count())await decision.click();
  }
  const state=await page.evaluate(()=>({title:document.querySelector('.matgo-titlebar b')?.textContent,hand:document.querySelectorAll('.my-hand-row .hwatu-card').length,floor:document.querySelectorAll('.floor-cards .hwatu-card').length,overflow:document.documentElement.scrollWidth-window.innerWidth}));
  if(state.title!=='야심찬 맞고')throw new Error(`wrong title: ${state.title}`);
  if(state.hand>=10)throw new Error(`turn did not advance: ${state.hand}`);
  if(state.overflow>4)throw new Error(`horizontal overflow: ${state.overflow}`);
  if(errors.length)throw new Error(errors.join('\n'));
  await page.screenshot({path:'/tmp/yashimchan-matgo-mobile.png',fullPage:true});
  console.log(JSON.stringify(state));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
