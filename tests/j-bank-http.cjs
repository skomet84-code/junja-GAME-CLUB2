'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
(async()=>{
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jbank-http-')),child=spawn(process.execPath,['admin-unlimited-start.js'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',RESTORE_DATABASE_URL:'',ADMIN_USERNAME:'',ADMIN_PASSWORD:''},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;let cookie;
 async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {r,d:await r.json()};}
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
  assert.equal((await api('/api/jbank/deposit',{amount:'100',requestId:'unauthorized_123'})).r.status,401);
  const account=await api('/api/register',{username:'savingsqa',nickname:'저축테스트',password:'local-only-test'});assert.equal(account.r.status,201);cookie=account.r.headers.get('set-cookie').split(';')[0];
  const before=(await api('/api/jbank')).d;
  const deposit=await api('/api/jbank/deposit',{amount:'100',requestId:'deposit_http_123'});assert.equal(deposit.r.status,200);assert.equal(deposit.d.status.savings.principal,'100');assert.equal(BigInt(deposit.d.status.wallet),BigInt(before.wallet)-100n);
  assert.equal((await api('/api/jbank/deposit',{amount:'100',requestId:'deposit_http_123'})).d.duplicate,true);
  const withdrawal=await api('/api/jbank/withdraw',{amount:'all',requestId:'withdraw_http_123'});assert.equal(withdrawal.r.status,400);assert.match(withdrawal.d.error,/24시간/);assert.equal((await api('/api/jbank')).d.savings.canWithdraw,false);
  const opened=await api('/api/jbank/installmentOpen',{amount:{days:7,amount:'1000'},requestId:'installment_http_open'});assert.equal(opened.r.status,200);assert.equal(opened.d.status.installment.paidCount,1);
  const repeated=await api('/api/jbank/installmentPay',{amount:'installment_http_open',requestId:'installment_http_pay'});assert.equal(repeated.r.status,400);
  const early=await api('/api/jbank/installmentClaim',{amount:'installment_http_open',requestId:'installment_http_claim'});assert.equal(early.r.status,400);
  const cancelled=await api('/api/jbank/installmentCancel',{amount:'installment_http_open',requestId:'installment_http_cancel'});assert.equal(cancelled.r.status,400);assert.match(cancelled.d.error,/24시간/);assert.equal((await api('/api/jbank')).d.installment.paidCount,1);
  const js=await (await fetch(base+'/j-bank.js')).text();assert.ok(js.includes('자유저축'));assert.ok(js.includes('차곡차곡 적금'));assert.ok(js.includes('jbankMarketOpen'),'existing stock access preserved');
  console.log('JBANK_HTTP_OK: production launcher, auth, deposit/withdraw, replay, exact balance, savings UI and stock entry');
 }finally{child.kill();await new Promise(r=>child.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
