'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'junja-support-v9-'));
const port=18780,base='http://127.0.0.1:'+port,adminPassword='SupportOwnerTest#2026';
const guest={cookie:''},member={cookie:''},other={cookie:''},owner={cookie:''};
let processRef=null;
async function start(){
 let log='';
 processRef=spawn(process.execPath,['admin-unlimited-start.js'],{env:{
  ...process.env,PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',RESTORE_DATABASE_URL:'',
  ADMIN_USERNAME:'admin_junja',ADMIN_PASSWORD:adminPassword},stdio:['ignore','pipe','pipe']});
 processRef.stdout.on('data',x=>log+=x);processRef.stderr.on('data',x=>log+=x);
 for(let n=0;n<150;n++){try{if((await fetch(base+'/healthz')).ok)return}catch{}await new Promise(r=>setTimeout(r,50))}
 throw Error('Local server failed '+log.slice(-1700));
}
async function stop(){if(processRef&&processRef.exitCode===null){const out=new Promise(resolve=>processRef.once('exit',resolve));processRef.kill('SIGTERM');await out;processRef=null}}
async function api(user,url,data){
 const res=await fetch(base+url,{method:data?'POST':'GET',
  headers:{Cookie:user.cookie,Accept:'application/json','Content-Type':'application/json',...(data?{Origin:base}:{})},
  body:data?JSON.stringify(data):undefined});
 const cookie=res.headers.get('set-cookie');if(cookie)user.cookie=cookie.split(';')[0];
 return {status:res.status,data:await res.json()};
}
(async()=>{try{
 await start();
 const create=await api(member,'/api/register',{username:'support_member',nickname:'문의회원',password:'SupportMember#2026'});
 assert.equal(create.status,201);
 const uid=create.data.user.id;
 const another=await api(other,'/api/register',{username:'support_other',nickname:'다른회원',password:'SupportOther#2026'});
 assert.equal(another.status,201);
 const otherId=another.data.user.id;
 assert.equal((await api(guest,'/api/support/cases')).status,401);
 assert.equal((await api(guest,'/api/support/cases',{category:'other'})).status,401);
 assert.equal((await api(member,'/api/login',{username:'support_member',password:'SupportMember#2026'})).status,200);
 assert.equal((await api(other,'/api/login',{username:'support_other',password:'SupportOther#2026'})).status,200);
 const init=await api(member,'/api/me');assert.equal(init.status,200);
 const wallet=init.data.user.balance;
 const input={category:'refund_inquiry',subject:'환불 문의 접수 확인',message:'미리보기 상품은 아직 결제 불가능한 상태인 것 같습니다.',requestId:'support_http_case_00001'};
 const created=await api(member,'/api/support/cases',input);
 assert.equal(created.status,201,JSON.stringify(created.data));
 assert.equal(created.data.item.status,'OPEN');assert(created.data.item.reference.startsWith('JCS-'));
 assert.equal((await api(member,'/api/support/cases',input)).status,200,'Duplicate inquiry must not generate a second case');
 const own=await api(member,'/api/support/cases');
 assert.equal(own.data.items.length,1);
 assert.equal(own.data.items[0].id,created.data.item.id);
 const otherList=await api(other,'/api/support/cases');assert.equal(otherList.data.items.length,0);
 assert.equal((await api(member,'/api/admin/support/cases')).status,403);
 assert.equal((await api(member,'/api/admin/support/cases',{id:1,status:'RESOLVED'})).status,403);
 const login=await api(owner,'/api/login',{username:'admin_junja',password:adminPassword});
 assert.equal(login.status,200);assert.equal(login.data.user.jpl_access,true);
 const cases=await api(owner,'/api/admin/support/cases');
 assert.equal(cases.status,200);assert.equal(cases.data.items.length,1);
 assert.equal(cases.data.items[0].userId,uid);
 const up={id:created.data.item.id,status:'REVIEWING',adminNote:'실결제 미운영, 상품 정보 확인 중',expectedVersion:1,requestId:'support_http_admin_00001'};
 const updated=await api(owner,'/api/admin/support/cases',up);
 assert.equal(updated.status,200,JSON.stringify(updated.data));
 assert.equal(updated.data.item.status,'REVIEWING');
 assert.equal((await api(owner,'/api/admin/support/cases',{...up,requestId:'support_http_admin_00002'})).status,409);
 assert.equal((await api(member,'/api/support/cases')).data.items[0].adminNote,'실결제 미운영, 상품 정보 확인 중');
 assert.equal((await api(member,'/api/me')).data.user.balance,wallet);
 const rendered=await fetch(base+'/support-center-ui.js');
 assert.equal(rendered.status,200);
 assert((await rendered.text()).includes('supportCenterModal'));
 await stop();
 const db=new DatabaseSync(path.join(dir,'club.db'));
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM game_state WHERE key LIKE 'support:case:v1:%'").get().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE user_id=? AND type LIKE 'premium_%'").get(uid).n,0);
 assert.equal(db.prepare('SELECT balance FROM users WHERE id=?').get(uid).balance,Number(wallet));
 db.close();
 owner.cookie='';member.cookie='';await start();
 assert.equal((await api(member,'/api/login',{username:'support_member',password:'SupportMember#2026'})).status,200);
 assert.equal((await api(member,'/api/support/cases')).data.items[0].status,'REVIEWING','Ticket state must survive a server restart');
 assert.equal((await api(owner,'/api/login',{username:'admin_junja',password:adminPassword})).status,200);
 assert.equal((await api(owner,'/api/admin/support/cases?status=REVIEWING')).data.items.length,1);
 console.log('SUPPORT_HTTP_V9_OK: protected member cases, owner-only status transitions, privacy, refund inquiry only, restart and no money edits');
}finally{await stop();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
