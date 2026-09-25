'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

(async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'junja-big-money-'));
  const port=18177,base='http://127.0.0.1:'+port;
  const child=spawn(process.execPath,['slot-50pct-until-win-start.js'],{
    env:{...process.env,PORT:String(port),DATA_DIR:data,DATABASE_URL:'',RESTORE_DATABASE_URL:'',ADMIN_USERNAME:'admintest',ADMIN_PASSWORD:'test12345'},
    stdio:['ignore','pipe','pipe']
  });
  let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  const wait=async()=>{for(let i=0;i<60;i++){try{const r=await fetch(base+'/healthz');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,150));}throw new Error('server start failed\n'+log)};
  const call=async(method,p,body,cookie)=>{
    const r=await fetch(base+p,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});
    const text=await r.text();let dataOut={};try{dataOut=text?JSON.parse(text):{}}catch{dataOut={raw:text}}
    return {status:r.status,data:dataOut,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};
  };
  try{
    await wait();
    const reg=await call('POST','/api/register',{username:'biguser',nickname:'큰손테스터',password:'test1234'});
    assert.equal(reg.status,201,JSON.stringify(reg.data));
    const userCookie=reg.cookie;assert.ok(userCookie.startsWith('sid='));

    const login=await call('POST','/api/login',{username:'admintest',password:'test12345'});
    assert.equal(login.status,200,JSON.stringify(login.data));
    const adminCookie=login.cookie;assert.ok(adminCookie.startsWith('sid='));

    const users=await call('GET','/api/admin/users',null,adminCookie);
    assert.equal(users.status,200,JSON.stringify(users.data));
    const target=users.data.rows.find(x=>x.username==='biguser');assert.ok(target);

    const oneHae='100000000000000000000';
    const grant=await call('POST','/api/admin/wallet',{userId:target.id,amount:oneHae,direction:'credit',memo:'big money test'},adminCookie);
    assert.equal(grant.status,200,JSON.stringify(grant.data));
    assert.equal(String(grant.data.balance),'100000000000001000000');

    const me1=await call('GET','/api/me',null,userCookie);
    assert.equal(String(me1.data.user.balance),'100000000000001000000');

    const spin=await call('POST','/api/roulette/spin',{bets:[{kind:'red',target:null,amount:oneHae}]},userCookie);
    assert.equal(spin.status,200,JSON.stringify(spin.data));
    assert.equal(String(spin.data.result.totalBet),oneHae);
    assert.match(String(spin.data.result.payout),/^\d+$/);
    assert.match(String(spin.data.result.profit),/^-?\d+$/);

    const me2=await call('GET','/api/me',null,userCookie);
    assert.equal(me2.status,200);
    assert.ok(BigInt(String(me2.data.user.balance))>=0n);
    console.log('BIG_MONEY_HTTP_OK: 1해 admin grant + exact wallet + roulette settlement');
  }finally{
    child.kill('SIGTERM');
    await new Promise(r=>setTimeout(r,150));
    fs.rmSync(data,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
