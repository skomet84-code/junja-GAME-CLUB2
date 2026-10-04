'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),crypto=require('node:crypto');
const bank=require('../goldenbell-questions'),factory=require('../goldenbell-server');
for(const q of bank){assert.ok(q.text&&q.explanation);assert.ok([2,4].includes(q.options.length),q.text);assert.equal(new Set(q.options).size,q.options.length,q.text);assert.ok(q.options[q.answer]);assert.ok([1,2,3,4].includes(q.level));}
assert.equal(new Set(bank.map(q=>q.text)).size,bank.length);assert.ok(bank.length>=400);assert.equal(new Set(bank.map(q=>q.category)).size,15);assert.ok(bank.filter(q=>q.level===4).length>=50);
for(const q of bank.filter(q=>q.category==='수학·두뇌'&&(q.text.includes('×')||q.text.includes(' + ')))){const nums=q.text.match(/\d+/g).map(Number);assert.equal(Number(q.options[q.answer]),q.text.includes('+')?nums[0]+nums[1]*nums[2]:nums[0]*nums[1]);}
const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,balance INTEGER);CREATE TABLE ledger(id INTEGER PRIMARY KEY,user_id INTEGER,amount INTEGER,balance_after INTEGER,type TEXT,memo TEXT,created_at INTEGER);CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);CREATE TABLE room_escrow(room_id TEXT,user_id INTEGER,amount INTEGER,game TEXT,created_at INTEGER,PRIMARY KEY(room_id,user_id));`);
for(let i=1;i<=15;i++)db.prepare('INSERT INTO users VALUES(?,?)').run(i,10000000000000001n);
let time=Date.UTC(2026,9,4,0),busy=false;const pending=new Map();let timer=0;
const deps={db,crypto,now:()=>time,readBody:async req=>req.body,requireAuth:req=>({id:req.id,nickname:'유저'+req.id}),json:(res,status,body)=>Object.assign(res,{status,body}),rateLimit:()=>true,isUserBusy:()=>busy,setTimer:(fn,ms)=>{const id=++timer;pending.set(id,{fn,at:time+ms});return id;},clearTimer:id=>pending.delete(id)};
let game=factory(deps);
async function call(id,path='',body){const res={};await game.handle({id,method:body===undefined?'GET':'POST',body},res,new URL('http://local/api/goldenbell'+path));return res;}
async function ok(id,path,body){const res=await call(id,path,body);assert.ok(res.status<300,JSON.stringify(res));return res.body.room;}
const balance=id=>BigInt(db.prepare('SELECT CAST(balance AS TEXT) b FROM users WHERE id=?').get(id).b);
const answer=r=>{const q=bank.find(q=>q.text===r.question.text);return r.question.options.indexOf(q.options[q.answer]);};
async function submit(id,r,correct=true){const a=answer(r);return ok(id,'/'+r.id+'/answer',{token:r.question.token,choice:correct?a:(a+1)%r.question.options.length});}
async function next(id,r){time=r.deadline+1;return ok(id,'/'+r.id);}
async function leaveAll(r){r=await ok(r.players.find(p=>!p.left).id,'/'+r.id);for(const p of r.players)if(!p.left)await ok(p.id,'/'+r.id+'/leave',{});}
async function multiplayer(mode='score',n=3,entry=1000){let r=await ok(1,'/create',{mode,maxPlayers:n,entry});for(let i=2;i<=n;i++)await ok(i,'/'+r.id+'/join',{});for(let i=1;i<=n;i++)await ok(i,'/'+r.id+'/ready',{ready:true});return ok(1,'/'+r.id+'/start',{});}
(async()=>{try{
 busy=true;assert.equal((await call(1,'/create',{mode:'solo'})).status,400);busy=false;
 const concurrent=await Promise.all([call(1,'/create',{mode:'solo'}),call(1,'/create',{mode:'solo'})]);assert.equal(concurrent.filter(x=>x.status===201).length,1,'one active game per user');let r=concurrent.find(x=>x.status===201).body.room;
 assert.equal(r.total,30);assert.equal(r.question.answer,undefined);assert.equal(r.questions,undefined);assert.equal(r.result,null);
 assert.equal((await call(2,'/'+r.id)).status,403);
 assert.equal((await call(1,'/'+r.id+'/answer',{token:'old',choice:0})).status,400);
 assert.equal((await call(1,'/'+r.id+'/answer',{token:r.question.token,choice:NaN})).status,400);
 const start=balance(1),seen=new Set();
 while(r.phase!=='complete'){
  if(r.phase==='question'){assert.ok(!seen.has(r.question.text));seen.add(r.question.text);r=await submit(1,r);assert.equal(r.phase,'reveal');}
  else r=await next(1,r);
 }
 assert.equal(r.players[0].correct,30);assert.equal(r.players[0].payout,950000);assert.equal(balance(1)-start,950000n);
 await ok(1,'/'+r.id);assert.equal(balance(1)-start,950000n,'read cannot pay twice');await leaveAll(r);
 for(let n=0;n<3;n++){r=await ok(1,'/create',{mode:'solo'});assert.equal(r.rewarded,n<2);await submit(1,r);await ok(1,'/'+r.id+'/leave',{});}
 assert.equal((await call(1)).body.dailyRemaining,0,'daily rewarded attempts capped');
 r=await ok(2,'/create',{mode:'solo'});for(let n=0;n<3;n++){r=await next(2,r);assert.equal(r.phase,'reveal');r=await next(2,r);}assert.equal(r.phase,'complete');assert.equal(r.players[0].lives,0);await leaveAll(r);
 // Equal answer counts and equal elapsed times split occupied prizes exactly.
 const before=[1,2,3].map(balance);r=await multiplayer();const gameId=r.id;
 for(let round=0;round<30;round++){const token=r.question.token;await submit(1,r);const repeated=await ok(1,'/'+r.id+'/answer',{token,choice:(answer(r)+1)%4});assert.equal(repeated.myAnswer,answer(r),'first answer is locked');await submit(2,r);r=await submit(3,r);assert.equal(r.phase,'reveal');r=await next(1,r);}
 assert.equal(r.phase,'complete');assert.deepEqual(r.players.map(p=>p.payout),[1000,1000,1000]);assert.deepEqual([1,2,3].map(balance),before);assert.equal(db.prepare('SELECT COUNT(*) n FROM room_escrow').get().n,0);await leaveAll(r);
 assert.equal((await call(1,'/'+gameId)).status,404);
 // All incorrect gets grace; eliminated players cannot answer until revival.
 r=await multiplayer('survival',2,0);await submit(1,r,false);r=await submit(2,r,false);assert.equal(r.result.grace,true);assert.ok(r.players.every(p=>p.alive));r=await next(1,r);
 await submit(1,r);r=await submit(2,r,false);assert.equal(r.players.find(p=>p.id===2).alive,false);r=await next(1,r);
 assert.equal((await call(2,'/'+r.id+'/answer',{token:r.question.token,choice:answer(r)})).status,400);
 while(r.index<9){r=await submit(1,r);r=await next(1,r);}
 assert.equal(r.revival,true);await submit(1,r);r=await submit(2,r);assert.equal(r.players.find(p=>p.id===2).alive,true);await leaveAll(r);
 // Atomic funding failure: nobody loses funds when one account is short.
 r=await ok(1,'/create',{mode:'score',entry:1000});await ok(2,'/'+r.id+'/join',{});for(const id of [1,2])await ok(id,'/'+r.id+'/ready',{ready:true});db.prepare('UPDATE users SET balance=0 WHERE id=2').run();const held=balance(1);assert.equal((await call(1,'/'+r.id+'/start',{})).status,400);assert.equal(balance(1),held);assert.equal(db.prepare('SELECT COUNT(*) n FROM room_escrow').get().n,0);await leaveAll(r);db.prepare('UPDATE users SET balance=1000000 WHERE id=2').run();
 // Mid-round departures forfeit; only remaining player receives the pot.
 const base=[1,2,3].map(balance);r=await multiplayer('score',3);await ok(2,'/'+r.id+'/leave',{});await ok(3,'/'+r.id+'/leave',{});
 while(r.phase!=='complete'){r=await ok(1,'/'+r.id);if(r.phase==='question')r=await submit(1,r);else if(r.phase==='reveal')r=await next(1,r);}
 assert.equal(balance(1)-base[0],2000n);assert.equal(balance(2)-base[1],-1000n);assert.equal(balance(3)-base[2],-1000n);await leaveAll(r);
 // Interrupted games refund once, including balances beyond Number.MAX_SAFE_INTEGER.
 const balances=[1,2,3].map(balance);r=await multiplayer();game.close();game=factory(deps);assert.deepEqual([1,2,3].map(balance),balances);game.close();game=factory(deps);assert.deepEqual([1,2,3].map(balance),balances);
 assert.ok((await call(1)).body.stats.games>=4,'records survive module recreation');
 time+=24*3600000;assert.equal((await call(1)).body.dailyRemaining,3,'KST day rollover');
 // Twelve players, ready gate and unauthorized start.
 r=await ok(1,'/create',{mode:'score',maxPlayers:12});for(let id=2;id<=12;id++)await ok(id,'/'+r.id+'/join',{});assert.equal((await call(13,'/'+r.id+'/join',{})).status,400);assert.equal((await call(1,'/'+r.id+'/start',{})).status,400);assert.equal((await call(2,'/'+r.id+'/start',{})).status,400);
 await ok(1,'/'+r.id+'/leave',{});r=await ok(2,'/'+r.id);assert.equal(r.hostId,2);await leaveAll(r);
 console.log('GOLDENBELL_OK: 440 questions including level-4 expansion, solo, 12 seats, survival revival, deadlines, answer locking, atomic funding, exact payouts, restart refunds, daily cap and persistent records');
 }finally{game.close();db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
