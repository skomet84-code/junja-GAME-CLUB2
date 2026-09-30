'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const index=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
assert.ok(app.includes('ROYAL CHARACTER TREE'));
assert.ok(app.includes("royalclub:'♔ JUNJA ROYAL+'"));
assert.ok(index.includes('/royal-plus-shop.css?v=1'));

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'junja-royal-plus-'));
const port=18341,base='http://127.0.0.1:'+port;
let child,cookie='';
async function start(){
  child=spawn(process.execPath,['admin-unlimited-start.js'],{cwd:root,env:{...process.env,ADMIN_USERNAME:'',ADMIN_PASSWORD:'',PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',RESTORE_DATABASE_URL:''},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
  for(let i=0;i<150;i++){try{if((await fetch(base+'/healthz')).ok)return;}catch{}await new Promise(r=>setTimeout(r,35));}
  throw Error('startup failed '+logs);
}
async function stop(){if(child){const p=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await p;child=null;}}
async function api(url,body){
  const r=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
  const d=await r.json();assert.equal(r.ok,true,url+' '+JSON.stringify(d));return d;
}
(async()=>{try{
  await start();
  const login={username:'royal_plus_fixture',nickname:'로얄검증',password:'local-test-only'};
  const u=(await api('/api/register',login)).user;
  let shop=await api('/api/shop');
  let royal=shop.items.filter(x=>x.collection==='royalclub');
  assert.equal(royal.length,6);
  assert.ok(royal.every(x=>x.rankTier===5&&!x.rankShopUnlocked));
  assert.deepEqual(royal.map(x=>x.price).sort((a,b)=>a-b),[30000000000000,30000000000000,50000000000000,50000000000000,80000000000000,80000000000000]);

  await stop();
  const original=118925832869123457n;
  const db=new DatabaseSync(path.join(dir,'club.db'));
  db.prepare('UPDATE users SET balance=?,rank_level=11 WHERE id=?').run(original,u.id);db.close();

  cookie='';await start();await api('/api/login',login);
  shop=await api('/api/shop');royal=shop.items.filter(x=>x.collection==='royalclub');
  assert.ok(royal.every(x=>x.rankShopUnlocked));
  const first=royal.find(x=>x.id==='char_royalclub_m1');assert.ok(first);
  const bought=await api('/api/shop/buy',{itemId:first.id});
  const expected=original-BigInt(first.price);
  assert.equal(String(bought.user.balance),expected.toString());
  assert.equal(bought.user.cosmetics.character.id,first.id);
  assert.equal(bought.state.items.find(x=>x.id===first.id).owned,true);
  console.log('ROYAL_PLUS_SHOP_OK: rank gate, 3-step character tree, exact high-wallet purchase, auto-equip');
}finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
