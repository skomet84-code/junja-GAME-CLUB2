'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'junja-seven-large-'));
const port=18349,base='http://127.0.0.1:'+port;
let child,cookie='';
async function start(){
  child=spawn(process.execPath,['admin-unlimited-start.js'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',RESTORE_DATABASE_URL:''},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
  for(let i=0;i<140;i++){try{if((await fetch(base+'/healthz')).ok)return;}catch{}await new Promise(r=>setTimeout(r,35));}
  throw Error('startup failed '+logs);
}
async function stop(){if(child&&child.exitCode===null){const p=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await p;child=null;}}
async function api(url,body){
  const r=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
  const d=await r.json();assert.equal(r.ok,true,url+' '+JSON.stringify(d));return d;
}
(async()=>{try{
 await start();
 const login={username:'roulette_exact_fixture',nickname:'룰렛고액검증',password:'local-test-only'};
 const u=(await api('/api/register',login)).user;
 await stop();
 const original=29020401790482531n;
 const db=new DatabaseSync(path.join(dir,'club.db'));
 db.prepare('UPDATE users SET balance=? WHERE id=?').run(original,u.id);db.close();
 cookie='';await start();await api('/api/login',login);
 const spin=await api('/api/roulette/spin',{bets:[{kind:'red',amount:original.toString()}]});
 assert.equal(spin.result.totalBet,original.toString());
 const expected=spin.result.color==='red'?original*2n:0n;
 assert.equal(BigInt(spin.result.payout),expected);
 assert.equal(BigInt(spin.user.balance),expected);
 assert.equal(BigInt((await api('/api/me')).user.balance),expected);
 console.log('ROULETTE_PRODUCTION_ENTRY_HTTP_EXACT_ALLIN_OK');
}finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
