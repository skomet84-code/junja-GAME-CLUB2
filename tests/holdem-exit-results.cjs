'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const server=fs.readFileSync('server.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,balance INTEGER);
CREATE TABLE room_escrow(room_id TEXT,user_id INTEGER,amount INTEGER);
CREATE TABLE ledger(user_id INTEGER,amount INTEGER,balance_after INTEGER,type TEXT,memo TEXT,created_at INTEGER);
CREATE TABLE stats(user_id INTEGER,poker_hands INTEGER,poker_wins INTEGER);
INSERT INTO users VALUES(1,100),(2,100);INSERT INTO stats VALUES(1,0,0),(2,0,0);
INSERT INTO room_escrow VALUES('A',1,500),('A',2,500);`);
let clock=100000;
const r={id:'A',game:'holdem',name:'test',hostId:1,players:[
  {userId:1,nickname:'A',stack:400,leaveAfterHand:true,ready:false,joinedAt:10000},
  {userId:2,nickname:'B',stack:600,ready:true,joinedAt:10000}],
  hand:{phase:'river',p:{1:{totalBet:100},2:{totalBet:100}}}};
const ctx={db,rooms:new Map([['A',r]]),sseClients:new Map(),now:()=>clock,
  roomStatus:r=>r.hand?.phase!=='complete'?'PLAYING':'WAITING',
  touchRoom:r=>r.version=(r.version||0)+1,pushRefresh:()=>{},
  escrowDelete:(id,uid)=>db.prepare('DELETE FROM room_escrow WHERE room_id=? AND user_id=?').run(id,uid),
  escrowSet:(id,uid,amount)=>db.prepare('UPDATE room_escrow SET amount=? WHERE room_id=? AND user_id=?').run(amount,id,uid),
  pokerHandPlayers:r=>r.players};
vm.createContext(ctx);
vm.runInContext(server.slice(server.indexOf('function sweepHoldemDepartures'),server.indexOf('function roomSummary')),ctx);
vm.runInContext(server.slice(server.indexOf('function pokerAfterHand'),server.indexOf('function pokerAction')),ctx);
ctx.settleHoldemDepartures(r);
assert.equal(r.players.length,2,'pending exit must retain hand contributions');
assert.equal(db.prepare('SELECT balance FROM users WHERE id=1').get().balance,100);
r.hand.phase='complete';r.hand.result={type:'showdown',awards:{2:200},ranks:{2:{name:'플러시'}},pot:200};
ctx.pokerAfterHand(r,[2]);
ctx.settleHoldemDepartures(r);
assert.equal(r.players.length,1);assert.equal(r.hostId,2);
assert.equal(db.prepare('SELECT balance FROM users WHERE id=1').get().balance,500);
ctx.settleHoldemDepartures(r);
assert.equal(db.prepare('SELECT count(*) n FROM ledger').get().n,1,'no duplicate refund');
assert.equal(r.hand.result.payouts[1].reason,'플러시');
assert.equal(r.hand.result.payouts[1].net,100);
assert.equal(r.hand.result.payouts[0].nickname,'A','result survives departure');
// A live tab preserves the seat; disconnect grace is reset on reconnect.
ctx.sseClients.set('tab',{userId:2});ctx.sweepHoldemDepartures(r);
ctx.sseClients.clear();clock+=89999;ctx.sweepHoldemDepartures(r);assert.equal(r.players[0].leaveAfterHand,undefined);
clock++;ctx.sweepHoldemDepartures(r);assert.equal(r.players[0].leaveAfterHand,true);
// A failed ledger write must roll back the credit and keep the seat/escrow for retry.
db.exec("CREATE TRIGGER fail_cashout BEFORE INSERT ON ledger BEGIN SELECT RAISE(ABORT,'test failure'); END;");
assert.throws(()=>ctx.settleHoldemDepartures(r),/test failure/);
assert.equal(db.prepare('SELECT balance FROM users WHERE id=2').get().balance,100);
assert.equal(r.players.length,1);
db.exec('DROP TRIGGER fail_cashout');ctx.settleHoldemDepartures(r);
assert.equal(ctx.rooms.has('A'),false);
const ui={me:{id:2},html:s=>String(s).replaceAll('<','&lt;'),money:n=>String(n),cardHtml:()=>'',reactionBubble:()=>'',pokerFaceHtml:()=>''};
vm.createContext(ui);
vm.runInContext(app.slice(app.indexOf('function pokerTableHtml'),app.indexOf('function bindPokerPresets')),ui);
const result={pot:600,payouts:[{nickname:'A',award:200,net:100,reason:'스트레이트'},{nickname:'B',award:400,net:200,reason:'플러시'}],winners:[2]};
const markup=ui.pokerTableHtml({players:[],maxPlayers:2},{phase:'complete',board:[],result});
for(const s of ['WINNER','스트레이트','플러시','받은 금액 200','받은 금액 400','순이익 +100','순이익 +200'])assert.ok(markup.includes(s),s);
console.log('HOLDEM_EXIT_RESULTS_TESTS_OK');
// Pending entrants have a seat and escrow, but no contribution to the live hand.
db.exec("INSERT INTO users VALUES(3,0); INSERT INTO room_escrow VALUES('Q',3,1000)");
const q={id:'Q',game:'holdem',name:'queue',hostId:1,hand:{phase:'flop',p:{1:{totalBet:100},2:{totalBet:100}}},players:[{userId:1},{userId:2},{userId:3,stack:1000,joinNextHand:true,leaveAfterHand:true}]};
ctx.rooms.set('Q',q);ctx.settleHoldemDepartures(q);
assert.equal(q.players.length,2);assert.equal(db.prepare('SELECT balance FROM users WHERE id=3').get().balance,1000);
assert.equal(q.hand.p[3],undefined);
ctx.crypto=crypto;
vm.runInContext(server.slice(server.indexOf('function cardDeck'),server.indexOf('// ---------- Yut engine')),ctx);
const next={game:'holdem',id:'N',smallBlind:10,bigBlind:20,players:[{userId:1,seat:0,stack:1000},{userId:2,seat:1,stack:1000},{userId:3,seat:2,stack:1000,joinNextHand:true}]};
ctx.pokerStart(next);
assert.equal(Object.keys(next.hand.p).length,3);
assert.equal(next.players[2].joinNextHand,false);
assert.equal(Object.values(next.hand.p).reduce((sum,p)=>sum+p.totalBet,0),30);
assert.match(app,/참가 대기 취소/);
console.log('HOLDEM_JOIN_QUEUE_TESTS_OK');
