'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const exactWallet=require('../exact-wallet');
const {settleSlotRound}=require('../slot-round-settlement');
const native=new DatabaseSync(':memory:');
native.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,balance INTEGER,balance_exact TEXT,balance_base TEXT,rank_free_slot_used INTEGER DEFAULT 0);
CREATE TABLE stats(user_id INTEGER PRIMARY KEY,slot_spins INTEGER DEFAULT 0,slot_wins INTEGER DEFAULT 0,slot_profit INTEGER DEFAULT 0);
CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER);
CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);`);
const db={exec:s=>native.exec(s),prepare:s=>{const stmt=native.prepare(s);stmt.setReadBigInts(true);return stmt}};
db.prepare('INSERT INTO users(id,balance,balance_exact,balance_base) VALUES(1,1000000,?,?)').run('1000000','1000000');
db.prepare('INSERT INTO stats(user_id) VALUES(1)').run();
const val=(k)=>{const row=db.prepare('SELECT value FROM game_state WHERE key=?').get(k);return row?JSON.parse(row.value):null};
const set=(k,v)=>{db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,JSON.stringify(v));return v};
const balance=()=>exactWallet.read(db.prepare('SELECT balance,balance_exact,balance_base FROM users WHERE id=1').get());
const count=()=>Number(db.prepare('SELECT COUNT(*) AS n FROM ledger').get().n);
const spins=()=>Number(db.prepare('SELECT slot_spins FROM stats WHERE user_id=1').get().slot_spins);
const used=()=>Number(db.prepare('SELECT rank_free_slot_used FROM users WHERE id=1').get().rank_free_slot_used);
set('pool','1000000000000');
function play({bet=1000,multiplier=0,sevenJackpot=false,free=false,failAt=null}={}){
 return settleSlotRound({db,exactWallet,userId:1,bet,multiplier,sevenJackpot,eventTriggered:sevenJackpot,
  consumeFree:()=>{if(!free)return {free:false};db.prepare('UPDATE users SET rank_free_slot_used=rank_free_slot_used+1 WHERE id=1').run();return {free:true}},
  readPool:()=>BigInt(val('pool')),writePool:x=>{if(failAt==='pool')throw Error('injected pool storage failure');return set('pool',String(x))},
  basePool:1000000000000n,isEventActive:()=>true,disableEvent:()=>set('event',false),
  recordJackpot:()=>{if(failAt==='history')throw Error('injected jackpot history failure');return set('history',{winner:1})},now:()=>1000});
}
const b0=balance();
const lost=play();
assert.equal(balance(),b0-1000n);assert.equal(spins(),1);assert.equal(count(),1);
assert.equal(val('pool'),'1000000000130');
const won=play({bet:1000,multiplier:5});
assert.equal(won.payout,5000);assert.equal(balance(),b0+3000n);
assert.equal(spins(),2);assert.equal(count(),3);
assert.doesNotThrow(()=>JSON.stringify(won),'winning slot round without pool contribution has JSON-safe response');
const beforeFailure={balance:balance(),spins:spins(),count:count(),pool:val('pool'),used:used()};
assert.throws(()=>play({bet:1000,multiplier:0,failAt:'pool'}),/injected/);
assert.deepEqual({balance:balance(),spins:spins(),count:count(),pool:val('pool'),used:used()},beforeFailure,
 'pool write failure rolls back free play, payout, stats and wager together');
assert.throws(()=>play({bet:1000,multiplier:1000,sevenJackpot:true,free:true,failAt:'history'}),/injected/);
assert.deepEqual({balance:balance(),spins:spins(),count:count(),pool:val('pool'),used:used()},beforeFailure,
 'history failure must rollback a 777 payout and jackpot deduction');
const jackpot=play({bet:1000,multiplier:1000,sevenJackpot:true});
assert.equal(jackpot.jackpotAward,1000000000130);
assert.doesNotThrow(()=>JSON.stringify(jackpot),'jackpot must also be JSON-safe');
assert.equal(val('pool'),'1000000000000');
assert.equal(val('history').winner,1);
assert.equal(count(),6,'jackpot payout records wager, 1000x and pool credit');
assert.equal(spins(),3);
const freeBefore=balance();
const freeRound=play({bet:1000,multiplier:0,free:true});
assert.doesNotThrow(()=>JSON.stringify(freeRound),'free spin with zero contribution has JSON-safe response');
assert.equal(balance(),freeBefore,'free ticket without win cannot reduce balance');
assert.equal(used(),1);
assert.equal(spins(),4);
assert.ok(db.prepare('SELECT count(*) AS n FROM ledger WHERE type=?').get('slot_jackpot_pool').n===1n);
console.log('SLOT_ATOMIC_SETTLEMENT_OK: loss, win, jackpot, free play and injected rollback');
