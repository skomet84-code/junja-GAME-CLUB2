'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'junja-seven-large-'));
const appSource=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
assert.ok(appSource.includes("$$('[data-seven-action]',root).forEach"),'Seven Poker action buttons must bind as a NodeList collection');
const port=18329,base='http://127.0.0.1:'+port;
let child,cookie='';
async function start(){
  child=spawn(process.execPath,['admin-unlimited-start.js'],{env:{...process.env,ADMIN_USERNAME:'',ADMIN_PASSWORD:'',PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',RESTORE_DATABASE_URL:''},stdio:['ignore','pipe','pipe']});
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
  const login={username:'seven_large_fixture',nickname:'세븐고액검증',password:'local-test-only'};
  const u=(await api('/api/register',login)).user;
  await stop();
  const original=118925832869123457n;
  const db=new DatabaseSync(path.join(dir,'club.db'));
  db.prepare('UPDATE users SET balance=? WHERE id=?').run(original,u.id);db.close();
  cookie='';await start();await api('/api/login',login);
  const before=(await api('/api/me')).user;
  assert.equal(String(before.balance),original.toString());
  assert.ok(original>BigInt(Number.MAX_SAFE_INTEGER));

  let seven=await api('/api/solo/seven/start',{});
  assert.equal(String(seven.user.balance),'0','exact full-wallet debit at table entry');
  assert.ok(seven.game&&Number(seven.game.stack.user)>0,'table stack created');
  const firstAnte=original/100n;
  assert.equal(BigInt(seven.game.ante),firstAnte,'exact 1% ante without a 5,000G cap');
  assert.equal(BigInt(seven.game.handContrib.user),firstAnte,'current hand contribution excludes previous losses');
  assert.equal(BigInt(seven.game.pot),BigInt(seven.game.handContrib.user)+BigInt(seven.game.handContrib.bot),'pot equals exact contributions');

  if(!seven.game.complete){
    assert.equal(seven.game.turn,'user','bot drive must return control to the user');
    seven=await api('/api/solo/seven/action',{action:'fold'});
    assert.equal(seven.game.complete,true);
  }
  seven=await api('/api/solo/seven/next',{});
  const secondAnte=(original-firstAnte)/100n;
  assert.equal(BigInt(seven.game.ante),secondAnte,'next hand uses remaining stack, not original buy-in');
  assert.equal(BigInt(seven.game.handContrib.user),secondAnte,'new hand resets contribution');
  await api('/api/solo/seven/action',{action:'fold'});
  const cash=await api('/api/solo/seven/leave',{});
  assert.equal(BigInt(cash.cashout),original-firstAnte-secondAnte,'two folds lose exactly two antes');
  const afterSeven=(await api('/api/me')).user;
  assert.equal(String(afterSeven.balance),String(cash.cashout),'cashout and wallet must match exactly');
  assert.ok(BigInt(String(afterSeven.balance))>10000000000000n,'large wallet remains usable after one hand');

  const holdBefore=BigInt(String(afterSeven.balance));
  const holdem=await api('/api/solo/holdem/start',{});
  assert.equal(BigInt(String(holdem.user.balance)),holdBefore-10000000000000n,'holdem 10T buy-in remains unchanged');
  await api('/api/solo/holdem/leave',{});

  // Regression: a >MAX_SAFE_INTEGER ALL-IN must never round through browser/server Number math.
  const allInLogin={username:'seven_allin_fixture',nickname:'세븐올인검증',password:'local-test-only'};
  const allInUser=(await api('/api/register',allInLogin)).user;
  await stop();
  const allInOriginal=118925832869123457n;
  const db2=new DatabaseSync(path.join(dir,'club.db'));
  db2.prepare('UPDATE users SET balance=? WHERE id=?').run(allInOriginal,allInUser.id);db2.close();
  cookie='';await start();await api('/api/login',allInLogin);
  let allIn=await api('/api/solo/seven/start',{});
  assert.equal(String(allIn.user.balance),'0','all-in fixture enters with exact full-wallet debit');
  assert.equal(allIn.game.turn,'user','all-in fixture must return control to user');
  allIn=await api('/api/solo/seven/action',{action:'allin'});
  assert.equal(allIn.game.complete,true,'server-authoritative all-in must resolve the hand');
  assert.equal(BigInt(allIn.game.handContrib.user),allInOriginal,'all-in must commit the exact original stack without Number rounding');
  const allInPot=BigInt(allIn.game.pot);
  assert.ok(allInPot>BigInt(Number.MAX_SAFE_INTEGER),'all-in pot must remain above Number.MAX_SAFE_INTEGER');
  const allInWinner=allIn.game.result?.winner;
  const allInCash=await api('/api/solo/seven/leave',{});
  const expectedCash=allInWinner==='user'?allInPot:allInWinner==='tie'?allInPot/2n:0n;
  assert.equal(BigInt(allInCash.cashout),expectedCash,'all-in winner settlement must equal the exact pot share');
  const afterAllIn=(await api('/api/me')).user;
  assert.equal(BigInt(String(afterAllIn.balance)),expectedCash,'wallet after all-in cashout must exactly match table settlement');

  console.log('SEVEN_LARGE_WALLET_EXACT_ENTRY_CASHOUT_AND_HOLDEM_COMPAT_OK');
}finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
