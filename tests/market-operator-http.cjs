'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'junja-owner-market-'));
const port=18659,base='http://127.0.0.1:'+port,adminPw='LocalMarketOwner#2026';
const guest={cookie:''},player={cookie:''},owner={cookie:''};
let child=null;
async function start(){
 let logs='';
 child=spawn(process.execPath,['admin-unlimited-start.js'],{env:{
  ...process.env,ADMIN_USERNAME:'admin_junja',ADMIN_PASSWORD:adminPw,
  PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',RESTORE_DATABASE_URL:''
 },stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 for(let j=0;j<130;j++){
  try{if((await fetch(base+'/healthz')).ok)return;}catch{}
  await new Promise(r=>setTimeout(r,50));
 }
 throw Error('Could not start test server '+logs.slice(-1900));
}
async function stop(){
 if(child&&child.exitCode===null){const p=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await p;child=null;}
}
async function request(client,url,body){
 const res=await fetch(base+url,{method:body===undefined?'GET':'POST',
  headers:{'Content-Type':'application/json',Cookie:client.cookie,Accept:'application/json',...(body===undefined?{}:{Origin:base})},
  body:body===undefined?undefined:JSON.stringify(body)});
 const cookie=res.headers.get('set-cookie');
 if(cookie)client.cookie=cookie.split(';')[0];
 return {status:res.status,data:await res.json()};
}
(async()=>{try{
 await start();
 const a=await request(player,'/api/register',{username:'market_v1_user',nickname:'시세검증',password:'TestMarket#2026'});
 assert.equal(a.status,201);
 const userId=a.data.user.id;
 const initialWallet=a.data.user.balance;
 assert.equal((await request(guest,'/api/admin/market-control')).status,401);
 assert.equal((await request(guest,'/api/admin/market-control',{type:'stock',symbol:'A'})).status,401);
 assert.equal((await request(player,'/api/admin/market-control')).status,403);
 assert.equal((await request(player,'/api/admin/market-control',{type:'coin',symbol:'JJC'})).status,403);
 const logged=await request(owner,'/api/login',{username:'admin_junja',password:adminPw});
 assert.equal(logged.status,200);assert.equal(logged.data.user.jpl_access,true);
 const get=await request(owner,'/api/admin/market-control');
 assert.equal(get.status,200);
 assert.equal(get.data.markets.stock.length,12);
 assert.deepEqual(get.data.markets.stock.slice(-2).map(x=>x.name),['첨지 식품','동동 유업']);
 assert.equal(get.data.markets.coin.length,8);
 assert.equal(get.data.kind,'FICTIONAL_GAME_ONLY');
 const oldK=get.data.markets.stock.find(x=>x.id==='K').price;
 const oldL=get.data.markets.stock.find(x=>x.id==='L').price;
 assert.equal(oldK,'34000');assert.equal(oldL,'27000');
 const oldA=get.data.markets.stock.find(x=>x.id==='A').price;
 const oldJJC=get.data.markets.coin.find(x=>x.id==='JJC').price;
 const p={type:'stock',symbol:'A',mode:'price',deltaPercent:'5',expectedPrice:oldA,requestId:'admin_owner_test_00001'};
 const changed=await request(owner,'/api/admin/market-control',p);
 assert.equal(changed.status,200,JSON.stringify(changed.data));
 const exactAfter=(BigInt(oldA)*10500n+5000n)/10000n;
 assert.equal(changed.data.price,String(exactAfter));
 const repeat=await request(owner,'/api/admin/market-control',p);
 assert.equal(repeat.status,200);assert.equal(repeat.data.duplicate,true);
 const stale=await request(owner,'/api/admin/market-control',{...p,requestId:'admin_owner_test_00002'});
 assert.equal(stale.status,409);
 const invalid=await request(owner,'/api/admin/market-control',{...p,deltaPercent:'40',requestId:'admin_owner_test_00003'});
 assert.equal(invalid.status,400);
 const v=await request(owner,'/api/admin/market-control',{type:'stock',symbol:'A',mode:'volatility',volatilityPct:200,requestId:'admin_owner_vol_00001'});
 assert.equal(v.status,200,JSON.stringify(v.data));assert.equal(v.data.volatilityPct,200);
 const j=await request(owner,'/api/admin/market-control',{type:'coin',symbol:'ROY',mode:'price',deltaPercent:'20',expectedPrice:get.data.markets.coin.find(x=>x.id==='ROY').price,requestId:'admin_owner_coin_00001'});
 assert.equal(j.status,200,JSON.stringify(j.data));
 const ipok=await request(owner,'/api/admin/market-control',{type:'stock',symbol:'K',mode:'price',deltaPercent:'10',expectedPrice:oldK,requestId:'admin_ipo_cheomji_001'});
 assert.equal(ipok.status,200,JSON.stringify(ipok.data));assert.equal(ipok.data.price,'37400');
 const ipol=await request(owner,'/api/admin/market-control',{type:'stock',symbol:'L',mode:'volatility',volatilityPct:200,requestId:'admin_ipo_dongdong_001'});
 assert.equal(ipol.status,200,JSON.stringify(ipol.data));assert.equal(ipol.data.volatilityPct,200);
 const checkStock=await request(player,'/api/jstock'),checkCoin=await request(player,'/api/jcoin');
 assert.equal(checkStock.status,200);assert.equal(checkCoin.status,200);
 assert.equal(checkStock.data.stocks.find(x=>x.id==='A').price,String(exactAfter));
 assert.equal(checkStock.data.stocks.find(x=>x.id==='K').price,'37400');
 assert.equal(checkStock.data.stocks.find(x=>x.id==='L').name,'동동 유업');
 assert.equal(checkCoin.data.stocks.find(x=>x.id==='ROY').price,j.data.price);
 assert.equal((await request(player,'/api/me')).data.user.balance,initialWallet);
 await stop();
 const db=new DatabaseSync(path.join(dir,'club.db'));
 const hold=db.prepare('SELECT balance FROM users WHERE id=?').get(userId);
 assert.equal(hold.balance,initialWallet);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE user_id=?").get(userId).n,1,'No trade/settlement ledger must be written by market changes');
 db.close();
 owner.cookie='';player.cookie='';await start();
 assert.equal((await request(owner,'/api/login',{username:'admin_junja',password:adminPw})).status,200);
 const persist=await request(owner,'/api/admin/market-control');
 assert.equal(persist.status,200);
 assert.equal(persist.data.markets.stock.find(x=>x.id==='A').volatilityPct,200);
 assert.equal(persist.data.markets.stock.find(x=>x.id==='A').price,String(exactAfter));
 assert.equal(persist.data.markets.stock.find(x=>x.id==='K').price,'37400');
 assert.equal(persist.data.markets.stock.find(x=>x.id==='L').volatilityPct,200);
 assert(persist.data.history.length>=3);
 const page=await fetch(base+'/owner-market-ui.js');
 assert.equal(page.status,200);
 const css=await fetch(base+'/owner-market.css');
 assert.equal(css.status,200);
 console.log('OWNER_MARKET_HTTP_OK: guest 401, user 403, owner 200, 409 stale, 8 crypto+12 stocks, replay, downstream prices, persistence, no wallet writes');
}finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
