'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'junja-account-'));
const port=18267,base=`http://127.0.0.1:${port}`;
let child,cookie='';
async function start(){
  child=spawn(process.execPath,['admin-unlimited-start.js'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',RESTORE_DATABASE_URL:''},stdio:'ignore'});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return;}catch{}await new Promise(r=>setTimeout(r,30));}
  throw Error('startup failed');
}
async function stop(){if(child){const p=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await p;child=null;}}
async function api(url,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const d=await r.json();assert.equal(r.ok,true,JSON.stringify(d));return d;}
(async()=>{try{
  await start();
  const login={username:'restore_fixture',nickname:'복구테스트',password:'local-test-only'};
  const u=(await api('/api/register',login)).user;
  await stop();
  const db=new DatabaseSync(path.join(dir,'club.db'));
  db.prepare('UPDATE users SET balance=? WHERE id=?').run(40000000000000,u.id);
  db.prepare('DELETE FROM stats WHERE user_id=?').run(u.id);db.close();
  await start();
  const restored=(await api('/api/login',login)).user;
  assert.ok(restored);assert.equal(restored.balance,40000000000000);
  assert.equal((await api('/api/me')).user.id,u.id);
  const shop=await api('/api/shop');const items=shop.items.filter(x=>x.collection==='ultimate');
  assert.equal(items.length,3);assert.ok(items.every(x=>x.price===10000000000000));
  const purchase=await api('/api/shop/buy',{itemId:items[0].id});
  assert.equal(purchase.user.balance,30000000000000);
  assert.equal(purchase.user.cosmetics.frame.id,items[0].id);
  await stop();await start();
  assert.equal((await api('/api/me')).user.balance,30000000000000);
  assert.equal((await api('/api/me')).user.cosmetics.frame.id,items[0].id);
  console.log('RESTORE_ACCOUNT_LOGIN_SHOP_BALANCE_RESTART_OK');
}finally{await stop();}})().catch(e=>{console.error(e);process.exitCode=1;});
