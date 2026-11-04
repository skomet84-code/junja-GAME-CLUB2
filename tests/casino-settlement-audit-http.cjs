'use strict';
// Real HTTP authentication regression against a disposable local JUNJA LAND database.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'junja-casino-audit-'));
const port=18477,base='http://127.0.0.1:'+port;
const password='LOCAL_AUDIT_TEST_ONLY_2026!';
let child;
const guest={cookie:''},regular={cookie:''},admin={cookie:''};
async function start(){
 let log='';
 child=spawn(process.execPath,['admin-unlimited-start.js'],{
  env:{...process.env,ADMIN_USERNAME:'admin_junja',ADMIN_PASSWORD:password,PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',RESTORE_DATABASE_URL:''},stdio:['ignore','pipe','pipe']
 });
 child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
 for(let k=0;k<160;k++){try{if((await fetch(base+'/healthz')).ok)return;}catch{}await new Promise(r=>setTimeout(r,45));}
 throw Error('Local server did not boot '+log.slice(-2500));
}
async function stop(){if(child&&child.exitCode===null){const p=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await p;child=null;}}
async function request(session,url,body){
 const res=await fetch(base+url,{
  method:body?'POST':'GET',
  headers:{'Content-Type':'application/json',Cookie:session.cookie},
  body:body?JSON.stringify(body):undefined
 });
 const set=res.headers.get('set-cookie');
 if(set)session.cookie=set.split(';')[0];
 const data=await res.json();
 return {status:res.status,data};
}
(async()=>{try{
 await start();
 const created=await request(regular,'/api/register',{username:'audit_sample_user',nickname:'정산검증회원',password:'LocalTest#2026'});
 assert.equal(created.status,201);
 const uid=created.data.user.id;
 const originalBalance=created.data.user.balance;
 await stop();
 const local=new DatabaseSync(path.join(dir,'club.db'));
 const stmt=local.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)');
 stmt.run(uid,-1000,999000,'-1000','999000','roulette_bet','유럽식 룰렛 1개 · 1,000G | black:-:1000G',123456);
 stmt.run(uid,2000,1001000,'2000','1001000','roulette_win','룰렛 2 BLACK · 지급 2,000G',123456);
 const before=local.prepare('SELECT COUNT(*) AS n FROM ledger').get().n;
 local.close();
 regular.cookie='';await start();
 const guestCheck=await request(guest,'/api/admin/casino-settlements');
 assert.equal(guestCheck.status,401);
 const userLogin=await request(regular,'/api/login',{username:'audit_sample_user',password:'LocalTest#2026'});
 assert.equal(userLogin.status,200);
 const userCheck=await request(regular,'/api/admin/casino-settlements');
 assert.equal(userCheck.status,403);
 const ownerLogin=await request(admin,'/api/login',{username:'admin_junja',password});
 assert.equal(ownerLogin.status,200);
 assert.equal(ownerLogin.data.user.jpl_access,true,'Only the lead operator may use this private endpoint');
 const report=await request(admin,'/api/admin/casino-settlements?member='+encodeURIComponent('정산검증회원')+'&game=roulette&limit=10');
 assert.equal(report.status,200,JSON.stringify(report.data));
 assert.equal(report.data.kind,'READ_ONLY_LEDGER_REVIEW');
 assert.equal(report.data.events.length,1);
 assert.equal(report.data.events[0].status,'matched');
 assert.equal(report.data.events[0].betG,'1000');
 assert.equal(report.data.events[0].payoutG,'2000');
 assert.equal(report.data.events[0].nickname,'정산검증회원');
 const invalid=await request(admin,'/api/admin/casino-settlements?game=holdem');
 assert.equal(invalid.status,400);
 const notfound=await request(admin,'/api/admin/casino-settlements?member=not_an_account');
 assert.equal(notfound.status,404);
 const html=await fetch(base+'/casino-audit-ui.js');
 assert.equal(html.status,200);
 const css=await fetch(base+'/casino-audit.css');
 assert.equal(css.status,200);
 await stop();
 const db=new DatabaseSync(path.join(dir,'club.db'));
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ledger').get().n,before,'Audit GET must not write ledger rows');
 assert.equal(db.prepare('SELECT balance FROM users WHERE id=?').get(uid).balance,originalBalance,'Audit GET must not change user money');
 db.close();
 console.log('CASINO_AUDIT_HTTP_OK: guest 401, player 403, owner 200, filters, no ledger/wallet writes, static panel assets');
}finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
