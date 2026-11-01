'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const exactWallet=require('../exact-wallet');
const {createRoyalHulaCasino,STAKES,quote,stakeValue}=require('../royal-hula-casino');
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,is_disabled INTEGER DEFAULT 0,balance INTEGER,balance_exact TEXT,balance_base TEXT);
CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);
CREATE TABLE room_escrow(room_id TEXT,user_id INTEGER,amount INTEGER,amount_exact TEXT,game TEXT,created_at INTEGER,PRIMARY KEY(room_id,user_id));
CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER);`);
const db={exec:s=>sqlite.exec(s),prepare:s=>{const q=sqlite.prepare(s);q.setReadBigInts(true);return q;}};
const deposit=20000000000000000n;
for(const id of [1,2,3,4])db.prepare('INSERT INTO users(id,balance,balance_exact,balance_base) VALUES(?,?,?,?)').run(id,exactWallet.mirror(deposit),String(deposit),String(exactWallet.mirror(deposit)));
const wallet=id=>exactWallet.read(db.prepare('SELECT balance,balance_exact,balance_base FROM users WHERE id=?').get(id));
const casino=createRoyalHulaCasino({db,exactWallet,now:()=>1700000000000});
const who=(id,registered,hand=[])=>({id,name:'player'+id,registered,hand});
const room=(id,players,stake='1000000')=>({id,game:'hula',mode:'multi',stake,round:1,players,escrowed:false});
assert.deepEqual(STAKES,['0','1000000','10000000','100000000','1000000000','10000000000','1000000000000']);
assert.equal(stakeValue('1000000'),'1000000');
assert.throws(()=>stakeValue('1001'),/판돈/);
assert.equal(quote('1000000').reserve,'16000000');
const a=room('RC-casino-test-1',[who(1,true),who(2,false,['H7','S9'])]);
casino.reserve(a);
assert.equal(wallet(1),deposit-16000000n);
assert.equal(wallet(2),deposit-16000000n);
assert.equal(db.prepare('SELECT COUNT(*) AS c FROM room_escrow').get().c,2n);
const result=casino.settle(a,a.players[0],'훌라!');
assert.equal(result.length,2);
assert.equal(result[0].net,'16000000');
assert.equal(result[1].net,'-16000000');
assert.equal(result[1].multiplier,16);
assert.match(result[1].reason,/미등록 x2/);
assert.match(result[1].reason,/7 1장 x2/);
assert.equal(wallet(1),deposit+16000000n);
assert.equal(wallet(2),deposit-16000000n);
assert.equal(db.prepare('SELECT COUNT(*) AS c FROM room_escrow').get().c,0n);
assert.throws(()=>casino.settle(a,a.players[0],'훌라!'),/예치/);
assert.equal(wallet(1),deposit+16000000n,'duplicate settlement never credits twice');
const b=room('RC-casino-test-2',[who(1,true),who(2,true,['C3']),who(3,false,['H1'])]);
casino.reserve(b);
const records=casino.settle(b,b.players[0],'최저 점수');
assert.equal(records.reduce((n,r)=>n+BigInt(r.net),0n),0n,'three-player settlement is zero sum');
assert.equal(db.prepare('SELECT COUNT(*) AS c FROM room_escrow').get().c,0n);
db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=4').run(100n,'100','100');
const tooMuch=room('RC-casino-test-3',[who(1,true),who(4,true)],'1000000000000');
const cashBefore=wallet(1),otherBefore=wallet(4);
assert.throws(()=>casino.reserve(tooMuch),/부족/);
assert.equal(wallet(1),cashBefore,'failed reservation cannot debit first player');
assert.equal(wallet(4),otherBefore);
assert.equal(db.prepare('SELECT COUNT(*) AS c FROM room_escrow').get().c,0n);
// Solo AI wagering: the virtual bot has no wallet, the human alone escrows 16x.
const aiBot={id:'ai:solo',name:'J-BOT',bot:true,registered:false,hand:['H7','C4']};
const solo=room('RC-solo-win',[who(1,true,[]),aiBot]);
solo.mode='ai';
const soloBefore=wallet(1);
casino.reserve(solo);
assert.equal(wallet(1),soloBefore-16000000n);
assert.equal(db.prepare('SELECT COUNT(*) AS c FROM room_escrow').get().c,1n,'only human deposits in AI game');
const soloResult=casino.settle(solo,solo.players[0],'모두 등록하고 완주');
assert.equal(soloResult.length,1);
assert.equal(soloResult[0].net,'4000000','unregistered J-BOT with one 7 loses 4x stake');
assert.equal(wallet(1),soloBefore+4000000n);
assert.throws(()=>casino.settle(solo,solo.players[0],'retry'),/예치/);
const aiLose=room('RC-solo-loss',[who(1,false,['S7','H8']),{...aiBot,hand:[],registered:true}]);
aiLose.mode='ai';
const loseBefore=wallet(1);
casino.reserve(aiLose);
const loseResult=casino.settle(aiLose,aiLose.players[1],'AI 완주');
assert.equal(loseResult[0].net,'-4000000');
assert.equal(wallet(1),loseBefore-4000000n,'AI defeat costs its multiplier, no extra deductions');
assert.equal(db.prepare('SELECT COUNT(*) AS c FROM room_escrow').get().c,0n);
console.log('ROYAL_HULA_CASINO_OK: escrow, 2/4/16x multipliers, all-player atomicity, exact G, replay defence, zero-sum payout');

(async()=>{
 // End-to-end routed multiplayer session: room stakes must debit wallets at start,
 // settle on a player's departure, and keep balances exactly zero-sum.
 const createRoyalCards=require('../royal-cards-server');
 let current={id:1,nickname:'준자'},counter=0;
 const timers=[];
 const crypto={
  randomBytes(){const hex=(++counter).toString(16).padStart(14,'0');return {toString:()=>hex};},
  randomInt(n){return (++counter)%n;}
 };
 const engine=createRoyalCards({db,exactWallet,crypto,
  requireAuth:()=>current,readBody:async req=>req.body||{},
  json:(res,status,body)=>{res.status=status;res.body=body;},
  rateLimit:()=>true,otherBusy:()=>false,notify:()=>{},
  now:()=>1700000100000,
  setTimer:fn=>{const t={fn,active:true,unref(){}};timers.push(t);return t;},
  clearTimer:t=>{t.active=false;}
 });
 async function request(id,url,body){
  current={id,nickname:id===1?'준자':'키드'};const res={};
  await engine.handle({method:body===undefined?'GET':'POST',body},res,
   {pathname:'/api/royalcards'+url,searchParams:{get:()=>null}});
  return res;
 }
 const before1=wallet(1),before2=wallet(2);
 const created=await request(1,'/create',{game:'hula',mode:'multi',max:2,stake:'1000000'});
 assert.equal(created.status,201,JSON.stringify(created.body));
 const id=created.body.room.id;
 assert.equal(created.body.room.stake,'1000000');
 assert.equal(created.body.room.casino.reserve,'16000000');
 assert.equal((await request(2,'/'+id+'/join',{})).status,200);
 await request(1,'/'+id+'/ready',{ready:true});await request(2,'/'+id+'/ready',{ready:true});
 const started=await request(1,'/'+id+'/start',{});
 assert.equal(started.status,200,JSON.stringify(started.body));
 assert.equal(wallet(1),before1-16000000n);
 assert.equal(wallet(2),before2-16000000n);
 assert.equal(db.prepare('SELECT COUNT(*) AS c FROM room_escrow').get().c,2n);
 const resigned=await request(1,'/'+id+'/leave',{});
 assert.equal(resigned.status,200,JSON.stringify(resigned.body));
 const winner=await request(2,'/'+id);
 assert.equal(winner.status,200);
 assert.equal(winner.body.room.phase,'done');
 assert.equal(winner.body.room.finalPayouts.length,2);
 assert.equal(wallet(1)+wallet(2),before1+before2,'finished game preserves G across accounts');
 assert.equal(db.prepare('SELECT COUNT(*) AS c FROM room_escrow').get().c,0n,'settled game has no pending escrow');
 const aiBefore=wallet(1);
 const aiCreated=await request(1,'/create',{game:'hula',mode:'ai',stake:'1000000'});
 assert.equal(aiCreated.status,201,JSON.stringify(aiCreated.body));
 assert.equal(aiCreated.body.room.stake,'1000000');
 assert.equal(aiCreated.body.room.phase,'playing');
 assert.equal(wallet(1),aiBefore-16000000n,'AI table reserves before dealing');
 const aiExited=await request(1,'/'+aiCreated.body.room.id+'/leave',{});
 assert.equal(aiExited.status,200,JSON.stringify(aiExited.body));
 assert.ok(wallet(1)<aiBefore,'leaving a staked bot game is a loss');
 assert.equal(db.prepare('SELECT COUNT(*) AS c FROM room_escrow').get().c,0n,'AI exit settles');
 console.log('ROYAL_HULA_CASINO_API_OK: authenticated table, entry escrow, player leave, payout and zero-sum G');
})().catch(e=>{console.error(e);process.exitCode=1;});



// Regression: a conflicting replay key from a previously refunded room must
// neither block boot nor mint new chips. Preserve the disputed escrow for audit.
const fs=require('node:fs');
const startup=fs.readFileSync('server.js','utf8');
const start=startup.indexOf('const staleEscrows = ');
const end=startup.indexOf("db.exec('DELETE FROM sessions",start);
assert.ok(start>0&&end>start,'startup stale-escrow recovery located');
const recoveryCode=startup.slice(start,end);
assert.ok(!recoveryCode.includes("db.exec('DELETE FROM room_escrow')"),'never wholesale-delete unresolved escrows');
const toRecover=[
 {room_id:'ROOM_OK',user_id:1,amount:'100',game:'hula'},
 {room_id:'ROOM_CONFLICT',user_id:2,amount:'250',game:'hula'},
 {room_id:'ROOM_ZERO',user_id:3,amount:'0',game:'hula'}
];
const removed=[],paid=[],warnings=[];
const recoverDb={prepare:sql=>{
 if(sql.startsWith('SELECT room_id,user_id'))return {all:()=>toRecover};
 if(sql.startsWith('DELETE FROM room_escrow WHERE room_id'))return {run:(id,userId)=>removed.push([id,userId])};
 throw Error('Unexpected startup escrow SQL: '+sql);
}};
const recoveryWallet={
 integer:v=>BigInt(v),
 change:(_db,id,amount,type,memo,_now,options)=>{
  if(options.requestKey==='escrow_recovery_ROOM_CONFLICT')throw Error('이미 사용한 요청 번호입니다.');
  paid.push({id,amount,type,memo,requestKey:options.requestKey});
 }
};
new Function('db','exactWallet','now','console',recoveryCode)(recoverDb,recoveryWallet,Date.now,{error:(...args)=>warnings.push(args.join(' '))});
assert.deepEqual(removed,[['ROOM_OK',1],['ROOM_ZERO',3]],'conflicting escrow cannot be erased automatically');
assert.equal(paid.length,1,'conflicting refund never credits a wallet twice');
assert.equal(warnings.length,1,'quarantined conflicts are logged for reconciliation');
console.log('ESCROW_STARTUP_RECOVERY_OK: replay conflict preserved, wallet not double-credited, server can boot');
