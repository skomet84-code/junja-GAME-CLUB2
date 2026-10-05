'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..');
let server;
class CaptureModule{static _nodeModulePaths(){return []}_compile(s){server=s}}
vm.runInNewContext(fs.readFileSync(path.join(root,'admin-unlimited-start.js'),'utf8'),{
  require:n=>n==='node:module'?CaptureModule:n==='node:fs'?{...fs}:require(n),__dirname:root,module:{},console,Buffer
});
function fn(name){const start=server.indexOf('function '+name+'(');assert.ok(start>=0,name);const end=server.indexOf('\n}',start);const lineEnd=server.indexOf('\n',start);return server.slice(start,server.slice(start,lineEnd).endsWith('}')?lineEnd:end+2)}
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,balance INTEGER);CREATE TABLE ledger(user_id INTEGER,amount INTEGER,balance_after INTEGER,type TEXT,memo TEXT,created_at INTEGER);CREATE TABLE stats(user_id INTEGER,seven_games INTEGER,seven_wins INTEGER);CREATE TABLE room_escrow(room_id TEXT,user_id INTEGER,amount INTEGER);INSERT INTO users VALUES(1,100000000000);INSERT INTO stats VALUES(1,0,0);`);
const soloSeven=new Map();
const ctx=vm.createContext({db:{exec:s=>db.exec(s),prepare:s=>{const q=db.prepare(s);q.setReadBigInts(true);return q}},soloSeven,now:()=>1,sevenKey:id=>'SEVEN'+id,
  escrowDelete:(key,id)=>db.prepare('DELETE FROM room_escrow WHERE room_id=? AND user_id=?').run(key,id),
  escrowSet:(key,id,n)=>{db.prepare('DELETE FROM room_escrow WHERE user_id=?').run(id);db.prepare('INSERT INTO room_escrow VALUES(?,?,?)').run(key,id,n)}
});
for(const name of ['walletInt','walletOut','walletChange','sevenExactStack','sevenFinishFold','sevenCashout'])vm.runInContext(fn(name),ctx);
const balance=()=>BigInt(db.prepare('SELECT CAST(balance AS TEXT) b FROM users').get().b);
const chips=9114855859269293000n;
const s={userId:1,complete:false,stack:{user:Number(chips),bot:10000},exactStack:{user:String(chips),bot:'10000'},exactPot:'12345',pot:12345,handStartStack:Number(chips),buyIn:Number(chips)};
soloSeven.set(1,s);ctx.escrowSet('SEVEN1',1,chips+1000n);
assert.throws(()=>ctx.sevenCashout(1),/진행 중/,'legacy requests must not silently forfeit');
assert.equal(s.complete,false);
db.exec("CREATE TRIGGER fail_payout BEFORE INSERT ON ledger BEGIN SELECT RAISE(ABORT,'test failure'); END");
assert.throws(()=>ctx.sevenCashout(1,true),/test failure/);
assert.equal(balance(),100000000000n,'failed credit rolls back');assert.ok(soloSeven.has(1),'failed payout retains table');
assert.equal(s.complete,true);assert.equal(s.exactStack.bot,'22345');
assert.equal(db.prepare('SELECT seven_games n FROM stats').get().n,1,'fold processed once');
db.exec('DROP TRIGGER fail_payout');
assert.equal(BigInt(ctx.sevenCashout(1,true)),chips,'cash out exact screenshot-sized stack above old cap');
assert.equal(balance(),chips+100000000000n);assert.equal(soloSeven.has(1),false);
assert.equal(ctx.sevenCashout(1,true),0);assert.equal(db.prepare('SELECT count(*) n FROM ledger').get().n,1,'duplicate leave never credits twice');
assert.equal(db.prepare('SELECT count(*) n FROM room_escrow').get().n,0);
const before=balance();assert.throws(()=>ctx.walletChange(1,9223372036854775807n,'seven_cashout',''),/한도/);assert.equal(balance(),before,'true int64 overflow is rejected');
ctx.walletChange(1,-1000n,'test_debit','');assert.equal(balance(),before-1000n,'returned chips remain spendable');
db.close();
// UI: cashout waits for an in-flight next-hand request and blocks repeat actions.
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const calls=[],storage={},elements={};let release;
const pending=new Promise(r=>release=r);
const ui=vm.createContext({sevenLeaving:false,sevenRequestPending:pending,sevenViewEpoch:0,sevenAutoTimer:1,sevenAutoRound:4,
  clearTimeout:()=>{},confirm:()=>true,storageSet:(k,v)=>storage[k]=v,$$:()=>[],
  $:key=>elements[key]??=( {classList:{add(){},remove(){}}} ),
  api:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {user:{balance:'100'},cashout:'100'}},
  updateHeader:()=>{},toast:()=>{},money:String
});
vm.runInContext(app.slice(app.indexOf('async function nextSevenPoker('),app.indexOf('function sevenMultiActions(')),ui);
(async()=>{
 const leaving=ui.cashoutSevenPoker();assert.equal(ui.sevenLeaving,true);assert.equal(calls.length,0);
 await ui.nextSevenPoker(true);await ui.cashoutSevenPoker();assert.equal(calls.length,0);
 release();await leaving;
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/solo/seven/leave');assert.equal(calls[0].body.foldActive,true);
 assert.equal(storage.seven_auto,'0');assert.equal(ui.sevenLeaving,false);assert.equal(ui.sevenAutoRound,-1);
 const button=app.match(/<button class="secondary seven-cashout"[^>]*>정산 후 나가기/)[0];
 assert.ok(!button.includes('!g.complete'),'cashout must be available during a hand');
 console.log('SEVEN_EXIT_ACTIVE_FOLD_EXACT_HIGH_BALANCE_RETRY_DUPLICATE_AND_UI_RACE_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
