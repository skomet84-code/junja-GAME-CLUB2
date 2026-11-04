'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'junja-commerce-gates-'));
const port=18840,base='http://127.0.0.1:'+port,password='CommerceReadinessTest#2026';
const guest={cookie:''},member={cookie:''},owner={cookie:''};
let child;
async function start(){
 let log='';
 child=spawn(process.execPath,['admin-unlimited-start.js'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',RESTORE_DATABASE_URL:'',ADMIN_USERNAME:'admin_junja',ADMIN_PASSWORD:password},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
 for(let n=0;n<135;n++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await new Promise(r=>setTimeout(r,55))}
 throw Error('Server boot failed '+log.slice(-1800));
}
async function stop(){if(child&&child.exitCode===null){const p=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await p;child=null}}
async function api(user,url,body){
 const res=await fetch(base+url,{method:body?'POST':'GET',headers:{Cookie:user.cookie,Accept:'application/json','Content-Type':'application/json',...(body?{Origin:base}:{})},body:body?JSON.stringify(body):undefined});
 const cookie=res.headers.get('set-cookie');if(cookie)user.cookie=cookie.split(';')[0];
 return {status:res.status,json:await res.json()};
}
(async()=>{try{
 await start();
 assert.equal((await api(guest,'/api/admin/commerce-readiness')).status,401);
 const registered=await api(member,'/api/register',{username:'gate_basic_user',nickname:'기본회원',password:'GateBasic#2026'});
 assert.equal(registered.status,201);
 assert.equal((await api(member,'/api/login',{username:'gate_basic_user',password:'GateBasic#2026'})).status,200);
 assert.equal((await api(member,'/api/admin/commerce-readiness')).status,403);
 const login=await api(owner,'/api/login',{username:'admin_junja',password});
 assert.equal(login.status,200);assert.equal(login.json.user.jpl_access,true);
 const r=await api(owner,'/api/admin/commerce-readiness');
 assert.equal(r.status,200,JSON.stringify(r.json));
 assert.equal(r.json.kind,'PRE_COMMERCIAL_OWNER_REVIEW');
 assert.equal(r.json.checkoutBlocked,true);
 assert.equal(r.json.livePaymentsEnabled,false);
 assert.equal(r.json.totals.required,12);
 assert.equal(r.json.totals.blocked,10);
 assert.equal(r.json.totals.prototypeTested,2);
 assert.equal(r.json.goLive,false);
 assert.equal(r.json.productionCheckoutAvailable,false);
 assert.equal(r.json.requirements.some(x=>x.id==='pg-contract'&&x.status==='blocked'),true);
 assert.equal(r.json.requirements.some(x=>x.id==='game-legal'&&x.status==='blocked'),true);
 const check=await fetch(base+'/commerce-readiness-ui.js');assert.equal(check.status,200);
 const style=await fetch(base+'/commerce-readiness.css');assert.equal(style.status,200);
 assert.equal((await api(guest,'/api/admin/commerce-readiness')).status,401);
 console.log('COMMERCE_V10_HTTP_OK: member 403, guest 401, owner 200, 10 blocked and no live payments');
}finally{await stop();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
