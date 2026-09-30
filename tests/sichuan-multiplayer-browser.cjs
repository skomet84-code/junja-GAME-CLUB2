'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),E=require('../public/sichuan/engine'),{DatabaseSync}=require('node:sqlite');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sichuan-browser-')),port=18317,base='http://127.0.0.1:'+port;let logs='';const child=spawn(process.execPath,['admin-unlimited-start.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,ADMIN_USERNAME:'',ADMIN_PASSWORD:'',PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',RESTORE_DATABASE_URL:''},stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);let browser;
 try{
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
  const cookies=[];async function api(id,url,body){const res=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookies[id]||''},body:body?JSON.stringify(body):undefined});if(res.headers.get('set-cookie'))cookies[id]=res.headers.get('set-cookie').split(';')[0];const d=await res.json();assert.ok(res.ok,JSON.stringify(d));return d;}
  for(let i=0;i<4;i++)await api(i,'/api/register',{username:'ranked_'+i,nickname:'테스트'+i,password:'local_test_only'});
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'sid',value:cookies[0].slice(4),url:base}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/sichuan/index.html');await page.click('#battle');await page.waitForSelector('#battle-public-rooms h3');assert.match(await page.locator('#battle-public-rooms').textContent(),/비밀번호 없음/);assert.equal(await page.locator('#battle-code-input').count(),0);
  await page.selectOption('#battle-level','6');await page.selectOption('#battle-size','4');await page.fill('#battle-bet','1000');await page.click('[data-action="battle-create"]');await page.waitForSelector('.battle-room-code');const code=await page.locator('.battle-room-code').textContent();
  const listed=await api(1,'/api/sichuan/battle/rooms');assert.equal(listed.rooms[0].code,code);let room;
  // One guest joins through the actual public-list button, without entering a code.
  const guestContext=await browser.newContext({viewport:{width:360,height:800}});await guestContext.addCookies([{name:'sid',value:cookies[1].slice(4),url:base}]);const guest=await guestContext.newPage();guest.on('pageerror',e=>errors.push(e.message));await guest.goto(base+'/sichuan/index.html');await guest.click('#battle');await guest.click('[data-join="'+code+'"]');await guest.waitForSelector('.battle-room-code');
  for(let i=2;i<4;i++)room=(await api(i,'/api/sichuan/battle/'+code+'/join',{})).room;
  await page.click('[data-action="battle-ready"]');for(let i=1;i<4;i++)room=(await api(i,'/api/sichuan/battle/'+code+'/ready',{roundId:room.roundId,ready:true})).room;
  assert.equal(room.status,'playing');await page.waitForSelector('#play:not([hidden])',{timeout:15000});await page.click('#hint');await page.click('#shuffle');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(let turn=0;turn<36;turn++){
   const move=await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('#board .tile')).map(t=>Number(t.querySelector('.tile-mark')?.textContent||0));return window.RoyalSichuan.moves(b,6,b.length/6,true)[0];});assert.ok(move);
   await page.evaluate(m=>{document.querySelector('[data-i="'+m.a+'"]').click();document.querySelector('[data-i="'+m.b+'"]').click();},move);await page.waitForTimeout(260);
  }
  await page.waitForTimeout(700);
  const meRoom=(await api(0,'/api/sichuan/battle/'+code)).room;assert.ok(meRoom.players.find(p=>p.userId===1).cleared,'server verified browser move transcript');
  function acts(n){const g=E.create(6,room.seed),a=[];for(let i=0;i<n;i++){const m=E.moves(g.board,6,g.rows,true)[0];a.push({kind:'match',a:m.a,b:m.b,t:(i+1)*300});g.board[m.a]=g.board[m.b]=0;if(g.board.some(Boolean)&&!E.moves(g.board,6,g.rows,true).length)g.board=E.reshuffle(g.board,6,g.rows,E.rng(room.seed+i+1+91));}return a;}
  for(let i=1;i<4;i++)room=(await api(i,'/api/sichuan/battle/'+code+'/progress',{roundId:room.roundId,actions:acts(20-i),done:true})).room;
  await page.waitForFunction(()=>document.querySelector('#modal h2')?.textContent==='최종 1위');assert.equal(await page.locator('#modal .battle-standing').count(),4);assert.match(await page.locator('#modal').textContent(),/2,400 G/);assert.equal((await api(0,'/api/me')).user.balance,1001400);
  await page.screenshot({path:'/tmp/sichuan-ranked-result.png',fullPage:true});
  await page.click('[data-action="battle-rematch"]');room=(await api(0,'/api/sichuan/battle/'+code)).room;assert.equal(room.roundNo,2);assert.equal(room.seconds,228);assert.ok(room.players.every(p=>!p.ready));await page.waitForFunction(()=>document.querySelector('#modal h2')?.textContent.includes('ROUND 2'));
  await page.click('[data-action="battle-theme"]');await page.selectOption('#battle-theme-select','24');await page.click('[data-action="battle-theme-apply"]');room=(await api(1,'/api/sichuan/battle/'+code)).room;assert.equal(room.level,24);assert.equal(room.roundNo,1);
  // Existing high balances stay exact when paying the revised rank prices.
  const db=new DatabaseSync(path.join(dir,'club.db'));const large=12345678901234567n;db.prepare('UPDATE users SET balance=?,rank_level=11 WHERE id=1').run(large);
  const ranks=(await api(0,'/api/rank')).ranks;assert.equal(ranks[11].cost,300000000000000);assert.equal(ranks[12].cost,1000000000000000);
  await api(0,'/api/rank/promote',{});assert.equal((await api(0,'/api/me')).user.balance,String(large-1000000000000000n));assert.equal((await api(0,'/api/me')).user.rank.level,12);db.close();
  assert.deepEqual(errors,[]);console.log('SICHUAN_MULTIPLAYER_BROWSER_OK: public tap-to-join, mobile layout, four-player legal move replay/payout, round 2 harder, host theme sync, exact 1000-trillion promotion');
 }finally{if(browser)await browser.close();if(child.exitCode===null){const exit=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exit;}fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
