'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'junja-motor-studio-v1-'));
const port=18948,base='http://127.0.0.1:'+port,member={cookie:''},other={cookie:''},guest={cookie:''};
let child;
async function start(){
 let logs='';
 child=spawn(process.execPath,['admin-unlimited-start.js'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',RESTORE_DATABASE_URL:'',ADMIN_USERNAME:'admin_junja',ADMIN_PASSWORD:'MotorOwnerTest#2026'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 for(let n=0;n<130;n++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await new Promise(r=>setTimeout(r,65))}
 throw Error('Server boot failure: '+logs.slice(-1500));
}
async function stop(){if(child&&child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await done;child=null;}}
async function api(user,route,payload,origin=base){
 const res=await fetch(base+route,{method:payload?'POST':'GET',headers:{Cookie:user.cookie,Accept:'application/json','Content-Type':'application/json',...(payload?{Origin:origin}:{})},body:payload?JSON.stringify(payload):undefined});
 const cookie=res.headers.get('set-cookie');if(cookie)user.cookie=cookie.split(';')[0];
 return {status:res.status,data:await res.json()};
}
(async()=>{try{
 await start();
 const auth=await api(member,'/api/register',{username:'motor_member1',nickname:'차량 디자이너',password:'MotorMember#2026'});assert.equal(auth.status,201);
 const otherAuth=await api(other,'/api/register',{username:'motor_member2',nickname:'별도 회원',password:'MotorOther#2026'});assert.equal(otherAuth.status,201);
 assert.equal((await api(member,'/api/login',{username:'motor_member1',password:'MotorMember#2026'})).status,200);
 assert.equal((await api(other,'/api/login',{username:'motor_member2',password:'MotorOther#2026'})).status,200);
 assert.equal((await api(guest,'/api/premium/motor-studio')).status,401);
 assert.equal((await api(guest,'/api/premium/motor-studio',{design:{}})).status,401);
 const initial=(await api(member,'/api/premium/motor-studio'));assert.equal(initial.status,200);assert.equal(initial.data.version,0);
 assert.equal(initial.data.owned,false);assert.equal(initial.data.purchased,false);
 const wallet=(await api(member,'/api/me')).data.user.balance;
 const design={paint:'onyx',doorsOpen:true,lightsOn:true,rotation:-.55,pitch:.30,zoom:8.9};
 const payload={design,published:false,expectedVersion:0,requestId:'motor_http_draft_0001'};
 assert.equal((await api(member,'/api/premium/motor-studio',payload,'https://other.example')).status,403);
 const saved=await api(member,'/api/premium/motor-studio',payload);
 assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.version,1);
 assert.equal(saved.data.published,false);assert.equal(saved.data.shareToken,null);
 assert.equal((await api(member,'/api/premium/motor-studio',payload)).data.duplicate,true);
 assert.equal((await api(member,'/api/premium/motor-studio',{...payload,requestId:'motor_http_draft_0002'})).status,409);
 assert.equal((await api(other,'/api/premium/motor-studio')).data.version,0,'Other member sees only their own draft');
 const published=await api(member,'/api/premium/motor-studio',{...payload,published:true,expectedVersion:1,requestId:'motor_http_public_0001'});
 assert.equal(published.status,200);
 assert.match(published.data.shareToken,/^[A-Za-z0-9_-]{24}$/);
 const secret=published.data.shareToken;
 const publicView=await api(guest,'/api/premium/motor-studio/share/'+secret);
 assert.equal(publicView.status,200);assert.equal(publicView.data.designerNickname,'차량 디자이너');
 assert.deepEqual(publicView.data.design,design);
 assert.equal(publicView.data.shareToken,null);assert.equal(publicView.data.owned,false);
 assert(!JSON.stringify(publicView.data).includes('member1'));
 assert.equal((await api(guest,'/api/premium/motor-studio/share/'+'a'.repeat(24))).status,404);
 const freshSecret=await api(member,'/api/premium/motor-studio',{...payload,published:true,rotateShare:true,expectedVersion:2,requestId:'motor_http_rotate_001'});
 assert.equal(freshSecret.status,200);
 assert.notEqual(freshSecret.data.shareToken,secret);
 assert.equal((await api(guest,'/api/premium/motor-studio/share/'+secret)).status,404);
 assert.equal((await api(guest,'/api/premium/motor-studio/share/'+freshSecret.data.shareToken)).status,200);
 const off=await api(member,'/api/premium/motor-studio',{...payload,published:false,expectedVersion:3,requestId:'motor_http_cancel_0001'});
 assert.equal(off.status,200);
 assert.equal((await api(guest,'/api/premium/motor-studio/share/'+freshSecret.data.shareToken)).status,404);
 assert.equal((await api(member,'/api/me')).data.user.balance,wallet);
 const client=await fetch(base+'/premium-motor-studio.js');assert.equal(client.status,200);
 assert((await client.text()).includes('motorDesignPublish'));
 await stop();
 const db=new DatabaseSync(path.join(dir,'club.db'));
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM game_state WHERE key LIKE 'premium:motor-design:v1:%'").get().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM game_state WHERE key LIKE 'premium:motor-share:v1:%'").get().n,0);
 assert.equal(db.prepare('SELECT balance FROM users WHERE id=?').get(auth.data.user.id).balance,Number(wallet));
 db.close();
 member.cookie='';await start();
 assert.equal((await api(member,'/api/login',{username:'motor_member1',password:'MotorMember#2026'})).status,200);
 const restored=await api(member,'/api/premium/motor-studio');
 assert.equal(restored.status,200);assert.equal(restored.data.version,4);
 assert.equal(restored.data.published,false);
 assert.deepEqual(restored.data.design,design);
 console.log('MOTOR_DESIGN_HTTP_V1_OK: private auth, origin guard, save/restart, secret visitor links and revocation, no wallet edits');
}finally{await stop();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
