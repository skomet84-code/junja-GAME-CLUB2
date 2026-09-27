'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite'),E=require('../public/sichuan/engine');
const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,balance INTEGER);CREATE TABLE ledger(id INTEGER PRIMARY KEY,user_id INTEGER,amount INTEGER,balance_after INTEGER,type TEXT,memo TEXT,created_at INTEGER);CREATE TABLE room_escrow(room_id TEXT,user_id INTEGER,amount INTEGER,game TEXT,created_at INTEGER,PRIMARY KEY(room_id,user_id));`);
for(let id=1;id<=9;id++)db.prepare('INSERT INTO users VALUES(?,?)').run(id,1000000);
const originalNow=Date.now;let clock=originalNow();Date.now=()=>clock;
const factory=require('../sichuan-battle-server'),deps={db,crypto,readBody:async r=>r.body,requireAuth:r=>({id:r.id,nickname:'플레이어'+r.id}),json:(r,status,body)=>Object.assign(r,{status,body}),rateLimit:()=>true};let game=factory(deps);
async function call(id,path,body){const res={};await game.handle({id,method:body===undefined?'GET':'POST',body},res,new URL('http://test/api/sichuan/battle'+path));return res;}
async function ok(id,path,body){const res=await call(id,path,body);assert.ok(res.status<300,JSON.stringify(res));return res.body.room;}
const balance=id=>db.prepare('SELECT balance FROM users WHERE id=?').get(id).balance;
async function make(n=4,bet=1000,level=6){let r=await ok(1,'/create',{maxPlayers:n,bet,level});for(let id=2;id<=n;id++)r=await ok(id,'/'+r.code+'/join',{});for(let id=1;id<=n;id++)r=await ok(id,'/'+r.code+'/ready',{roundId:r.roundId,ready:true});return r;}
function actions(r,count=36,tools=false){const g=E.create(r.level,r.seed),out=[];let pairs=0,shuffles=2;if(tools){out.push({kind:'hint',t:0},{kind:'shuffle',t:0});shuffles--;g.board=E.reshuffle(g.board,g.cols,g.rows,E.rng(r.seed+pairs+shuffles+17));}while(pairs<count&&g.board.some(Boolean)){const m=E.moves(g.board,g.cols,g.rows,true)[0];out.push({kind:'match',a:m.a,b:m.b,t:(pairs+1)*300});g.board[m.a]=g.board[m.b]=0;pairs++;g.board=E.compact(g.board,g.cols,g.rows,g.gravity);if(g.board.some(Boolean)&&!E.moves(g.board,g.cols,g.rows,true).length)g.board=E.reshuffle(g.board,g.cols,g.rows,E.rng(r.seed+pairs+91));}return out;}
async function progress(id,r,a,done=true){clock+=100;return ok(id,'/'+r.code+'/progress',{roundId:r.roundId,actions:a,done});}
(async()=>{try{
 assert.equal((await call(1,'/create',{maxPlayers:9})).status,400);
 let r=await make();assert.equal((await call(9,'/rooms')).body.rooms.length,0,'playing rooms are not public join targets');assert.equal(r.status,'playing');assert.equal(balance(1),999000);assert.equal(db.prepare('SELECT COUNT(*) n FROM room_escrow').get().n,4);
 assert.equal((await call(1,'/'+r.code+'/progress',{roundId:r.roundId,actions:[],done:true})).status,400,'countdown cannot submit');
 clock=r.startedAt+15000;
 assert.equal((await call(1,'/'+r.code+'/progress',{roundId:r.roundId,actions:[{kind:'match',a:0,b:0,t:300}],done:true})).status,400);
 assert.equal((await call(1,'/'+r.code+'/progress',{roundId:'old',actions:[],done:true})).status,400);
 r=await progress(1,r,actions(r,36,true));assert.equal(r.status,'playing','first clear must not stop other players');
 r=await progress(2,r,actions(r));r=await progress(3,r,actions(r,10));r=await progress(4,r,actions(r,5));
 assert.equal(r.status,'complete');assert.deepEqual(r.players.map(p=>p.rank),[1,2,3,4]);assert.deepEqual(r.players.map(p=>p.payout),[2400,1200,400,0]);assert.equal(r.players.reduce((n,p)=>n+p.net,0),0);
 const paid=balance(1);await progress(1,r,actions(r));assert.equal(balance(1),paid,'no duplicate payout');assert.equal(db.prepare('SELECT COUNT(*) n FROM room_escrow').get().n,0);
 assert.equal((await call(2,'/'+r.code+'/rematch',{})).status,400,'host only');
 r=await ok(1,'/'+r.code+'/rematch',{});assert.equal(r.status,'waiting');assert.ok(r.players.every(p=>!p.ready));assert.equal(r.roundNo,2);assert.equal(r.seconds,228);
 await ok(1,'/'+r.code+'/leave',{});for(let i=2;i<=4;i++)await ok(i,'/'+r.code+'/leave',{});
 // Equal scores share occupied prize positions and conserve every G.
 r=await make(3);clock=r.startedAt+5000;for(let i=1;i<=3;i++)r=await progress(i,r,actions(r,1));assert.deepEqual(r.players.map(p=>p.rank),[1,1,1]);assert.deepEqual(r.players.map(p=>p.payout),[1000,1000,1000]);
 // Full capacity (8), forged scores ignored, deadline settles disconnected players.
 r=await make(8);clock=r.startedAt+5000;r=await ok(1,'/'+r.code+'/progress',{roundId:r.roundId,actions:actions(r,2),pairs:60,score:99999999});assert.equal(r.players[0].pairs,2);assert.equal(r.players[0].score,200);
 clock=r.startedAt+E.config(r.level).seconds*1000+6000;r=await ok(1,'/'+r.code);assert.equal(r.status,'complete');assert.equal(r.players.reduce((n,p)=>n+p.payout,0),8000);
 // Readiness failure rolls back ALL debits; funds are not reserved before start.
 r=await ok(1,'/create',{maxPlayers:2,bet:1000});r=await ok(2,'/'+r.code+'/join',{});r=await ok(1,'/'+r.code+'/ready',{roundId:r.roundId});const before=balance(1);db.prepare('UPDATE users SET balance=0 WHERE id=2').run();assert.equal((await call(2,'/'+r.code+'/ready',{roundId:r.roundId})).status,400);assert.equal(balance(1),before);assert.equal(db.prepare('SELECT COUNT(*) n FROM room_escrow').get().n,0);
 db.prepare('UPDATE users SET balance=1000000 WHERE id=2').run();for(let id=1;id<=2;id++)r=await ok(id,'/'+r.code+'/ready',{roundId:r.roundId});clock=r.startedAt+10000;
 await ok(2,'/'+r.code+'/leave',{});r=await ok(1,'/'+r.code);assert.equal(r.status,'complete');assert.equal(r.players.find(p=>p.userId===2).payout,0);
 // Gravity, shuffle and hint replay work for each host theme.
 for(const level of [6,12,18,24]){r=await make(2,1000,level);clock=r.startedAt+20000;r=await progress(1,r,actions(r,36,true));assert.ok(r.players.find(p=>p.userId===1).cleared);r=await progress(2,r,actions(r));assert.equal(r.status,'complete');}
 // Exact wallet arithmetic above JS safe integer, without changing any shared money representation.
 db.prepare('UPDATE users SET balance=? WHERE id=1').run(12345678901234567n);r=await make(2);assert.equal(db.prepare('SELECT CAST(balance AS TEXT) b FROM users WHERE id=1').get().b,'12345678901233567');await ok(2,'/'+r.code+'/leave',{});assert.equal(db.prepare('SELECT CAST(balance AS TEXT) b FROM users WHERE id=1').get().b,'12345678901235567');db.prepare('UPDATE users SET balance=1000000 WHERE id=1').run();
 // Interrupted stake recovery is one-time and atomic on restart.
 r=await make(2);const held1=balance(1);game.close();game=factory(deps);assert.equal(balance(1),held1+1000);game.close();game=factory(deps);assert.equal(balance(1),held1+1000);
 console.log('SICHUAN_BATTLE_OK: 2–8 players, 4 themes, legal-move replay, payouts/ties, no duplicate debit/payout, rollback, forfeit, timeout, rematch, restart refund');
}finally{Date.now=originalNow;game.close();db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
